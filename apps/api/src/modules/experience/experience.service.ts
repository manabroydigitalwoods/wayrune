import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AckExperienceWaiverInput,
  AddExperienceParticipantInput,
  CreateExperienceReservationInput,
} from '@wayrune/contracts';
import type { AuthUser } from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  applyInventoryMode,
  type TxClient,
} from '../commerce/inventory-adapters';
import { assertTransition } from '../commerce/lifecycle-transitions';

const DEFAULT_WAIVER =
  'I understand the risks of this farm experience, confirm I meet age/safety requirements, and accept house rules.';

@Injectable()
export class ExperienceService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  private async requireAsset(organizationId: string, assetId: string) {
    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  private async timeline(
    organizationId: string,
    eventType: string,
    entityId: string,
    summary: string,
    actorUserId?: string,
  ) {
    await this.prisma.businessTimelineEvent.create({
      data: {
        organizationId,
        eventType,
        entityType: 'experience_reservation',
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType: 'experience_reservation', entityId, summary },
    });
  }

  private async applySlot(
    tx: TxClient,
    organizationId: string,
    slotId: string,
    quantity: number,
    mode: 'hold' | 'confirm' | 'release',
  ) {
    try {
      await applyInventoryMode(tx, mode, {
        organizationId,
        resourceType: 'experience_slot',
        resourceId: slotId,
        quantity,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Insufficient')) throw new ConflictException(msg);
      throw e;
    }
  }

  async listCatalog(user: AuthUser, assetId: string) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.experienceProduct.findMany({
      where: { assetId, deletedAt: null },
      include: {
        slots: { orderBy: { startAt: 'asc' } },
        reservations: {
          where: { status: { notIn: ['cancelled'] } },
          select: { id: true, status: true, guestCount: true },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  async listReservations(user: AuthUser, assetId: string) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.experienceReservation.findMany({
      where: { assetId },
      include: {
        experienceProduct: { select: { id: true, title: true } },
        experienceSlot: true,
        participants: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createReservation(user: AuthUser, input: CreateExperienceReservationInput) {
    await this.requireAsset(user.organizationId, input.assetId);
    const slot = await this.prisma.experienceSlot.findFirst({
      where: {
        id: input.experienceSlotId,
        experienceProduct: { assetId: input.assetId, deletedAt: null },
      },
      include: { experienceProduct: true },
    });
    if (!slot) throw new NotFoundException('Experience slot not found');

    const confirmNow = Boolean(input.confirmImmediately);
    const rate =
      input.rateAmount ??
      (slot.experienceProduct.price != null
        ? Number(slot.experienceProduct.price) * input.guestCount
        : null);

    const row = await this.prisma.$transaction(async (tx) => {
      const hold = await tx.inventoryHold.create({
        data: {
          organizationId: user.organizationId,
          resourceType: 'experience_slot',
          resourceId: slot.id,
          quantity: input.guestCount,
          windowStart: slot.startAt,
          windowEnd: slot.endAt,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'active',
        },
      });
      await this.applySlot(
        tx,
        user.organizationId,
        slot.id,
        input.guestCount,
        'hold',
      );

      let status = 'held';
      if (confirmNow) {
        assertTransition('experience_reservation', 'held', 'confirmed');
        assertTransition('inventory_hold', 'active', 'confirmed');
        await tx.inventoryHold.update({
          where: { id: hold.id },
          data: { status: 'confirmed', releasedAt: new Date() },
        });
        await this.applySlot(
          tx,
          user.organizationId,
          slot.id,
          input.guestCount,
          'confirm',
        );
        status = 'confirmed';
      }

      const reservation = await tx.experienceReservation.create({
        data: {
          assetId: input.assetId,
          experienceProductId: slot.experienceProductId,
          experienceSlotId: slot.id,
          inventoryHoldId: hold.id,
          partyId: input.partyId ?? null,
          bookerName: input.bookerName,
          bookerPhone: input.bookerPhone ?? null,
          guestCount: input.guestCount,
          status,
          rateAmount: rate,
          currency: input.currency || slot.experienceProduct.currency || 'INR',
          notes: input.notes ?? null,
          createdBy: user.sub,
          participants: input.participants?.length
            ? {
                create: input.participants.map((p) => ({
                  fullName: p.fullName,
                  age: p.age ?? null,
                })),
              }
            : undefined,
        },
        include: { participants: true, experienceSlot: true, experienceProduct: true },
      });
      return reservation;
    });

    await this.timeline(
      user.organizationId,
      confirmNow ? 'ExperienceBooked' : 'ExperienceHoldCreated',
      row.id,
      `${row.bookerName} × ${row.guestCount} on ${slot.experienceProduct.title}`,
      user.sub,
    );
    return row;
  }

  async confirm(user: AuthUser, id: string) {
    const row = await this.prisma.experienceReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Experience reservation not found');
    assertTransition('experience_reservation', row.status, 'confirmed');

    await this.prisma.$transaction(async (tx) => {
      if (row.inventoryHoldId) {
        const hold = await tx.inventoryHold.findUnique({
          where: { id: row.inventoryHoldId },
        });
        if (hold?.status === 'active') {
          assertTransition('inventory_hold', 'active', 'confirmed');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'confirmed', releasedAt: new Date() },
          });
          await this.applySlot(
            tx,
            user.organizationId,
            row.experienceSlotId,
            row.guestCount,
            'confirm',
          );
        }
      }
      await tx.experienceReservation.update({
        where: { id },
        data: { status: 'confirmed' },
      });
    });

    await this.timeline(
      user.organizationId,
      'ExperienceBooked',
      id,
      row.bookerName,
      user.sub,
    );
    return this.getReservation(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.prisma.experienceReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Experience reservation not found');
    assertTransition('experience_reservation', row.status, 'cancelled');

    await this.prisma.$transaction(async (tx) => {
      if (row.inventoryHoldId) {
        const hold = await tx.inventoryHold.findUnique({
          where: { id: row.inventoryHoldId },
        });
        if (hold?.status === 'active') {
          assertTransition('inventory_hold', 'active', 'released');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'released', releasedAt: new Date() },
          });
          await this.applySlot(
            tx,
            user.organizationId,
            row.experienceSlotId,
            row.guestCount,
            'release',
          );
        } else if (hold?.status === 'confirmed') {
          await tx.experienceSlot.update({
            where: { id: row.experienceSlotId },
            data: { reserved: { decrement: row.guestCount } },
          });
        }
      }
      await tx.experienceReservation.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });

    await this.timeline(
      user.organizationId,
      'ExperienceCancelled',
      id,
      row.bookerName,
      user.sub,
    );
    return this.getReservation(user, id);
  }

  async checkIn(user: AuthUser, id: string) {
    const row = await this.prisma.experienceReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Experience reservation not found');
    assertTransition('experience_reservation', row.status, 'checked_in');
    return this.prisma.experienceReservation.update({
      where: { id },
      data: { status: 'checked_in' },
      include: { participants: true, experienceProduct: true, experienceSlot: true },
    });
  }

  async complete(user: AuthUser, id: string) {
    const row = await this.prisma.experienceReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Experience reservation not found');
    assertTransition('experience_reservation', row.status, 'completed');
    return this.prisma.experienceReservation.update({
      where: { id },
      data: { status: 'completed' },
      include: { participants: true },
    });
  }

  async getReservation(user: AuthUser, id: string) {
    const row = await this.prisma.experienceReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: {
        participants: true,
        experienceProduct: true,
        experienceSlot: true,
      },
    });
    if (!row) throw new NotFoundException('Experience reservation not found');
    return row;
  }

  async addParticipant(
    user: AuthUser,
    reservationId: string,
    input: AddExperienceParticipantInput,
  ) {
    await this.getReservation(user, reservationId);
    return this.prisma.experienceParticipant.create({
      data: {
        experienceReservationId: reservationId,
        fullName: input.fullName,
        age: input.age ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  async markAttendance(
    user: AuthUser,
    reservationId: string,
    participantId: string,
    attended: boolean,
  ) {
    await this.getReservation(user, reservationId);
    const p = await this.prisma.experienceParticipant.findFirst({
      where: { id: participantId, experienceReservationId: reservationId },
    });
    if (!p) throw new NotFoundException('Participant not found');
    return this.prisma.experienceParticipant.update({
      where: { id: participantId },
      data: {
        attended,
        attendedAt: attended ? new Date() : null,
      },
    });
  }

  async ackWaiver(
    user: AuthUser,
    reservationId: string,
    input: AckExperienceWaiverInput,
  ) {
    const res = await this.getReservation(user, reservationId);
    const text = input.waiverText || DEFAULT_WAIVER;
    const now = new Date();

    if (input.participantId) {
      const p = await this.prisma.experienceParticipant.findFirst({
        where: {
          id: input.participantId,
          experienceReservationId: reservationId,
        },
      });
      if (!p) throw new NotFoundException('Participant not found');
      return this.prisma.experienceParticipant.update({
        where: { id: p.id },
        data: { waiverAckAt: now },
      });
    }

    if (!res.waiverAckAt) {
      await this.prisma.experienceReservation.update({
        where: { id: reservationId },
        data: {
          waiverAckAt: now,
          waiverTextSnapshot: text,
        },
      });
    }
    return this.getReservation(user, reservationId);
  }

  /** A-XP-05: resource scheduling deferred — instructors/equipment not modeled in v1. */
  resourceSchedulingPolicy() {
    return {
      version: 'experience-os-1.0',
      resourceScheduling: 'n/a',
      note:
        'Guide/equipment calendars are out of scope for Experience OS 1.0. Use ExperienceProduct.instructorRequired as a sell flag only.',
    };
  }
}
