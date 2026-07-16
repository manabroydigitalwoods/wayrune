import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateAssetFleetRateInput,
  CreateRentalReservationInput,
  RecordRentalPaymentInput,
  RentalCheckoutInput,
  RentalReturnInput,
} from '@travel/contracts';
import type { AuthUser } from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { assertTransition } from '../commerce/lifecycle-transitions';

function rentalDays(startAt: Date, endAt: Date) {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

@Injectable()
export class MobilityService {
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
        entityType: 'rental_reservation',
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType: 'rental_reservation', entityId, summary },
    });
  }

  private async hasFleetConflict(fleetUnitId: string, startAt: Date, endAt: Date) {
    const blocks = await this.prisma.assetCalendarBlock.findMany({
      where: {
        fleetUnitId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  // ─── Rates ───────────────────────────────────────────────────────────

  async listRates(user: AuthUser, assetId: string) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.assetFleetRate.findMany({
      where: { assetId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createRate(user: AuthUser, input: CreateAssetFleetRateInput) {
    await this.requireAsset(user.organizationId, input.assetId);
    return this.prisma.assetFleetRate.create({
      data: {
        assetId: input.assetId,
        name: input.name,
        amountPerDay: input.amountPerDay,
        depositAmount: input.depositAmount ?? 0,
        currency: input.currency || 'INR',
      },
    });
  }

  // ─── Availability ────────────────────────────────────────────────────

  async availability(
    user: AuthUser,
    assetId: string,
    startAtIso: string,
    endAtIso: string,
  ) {
    await this.requireAsset(user.organizationId, assetId);
    const startAt = new Date(startAtIso);
    const endAt = new Date(endAtIso);
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    const units = await this.prisma.assetFleetUnit.findMany({
      where: { assetId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
    const result = [];
    for (const u of units) {
      const conflict = await this.hasFleetConflict(u.id, startAt, endAt);
      result.push({ ...u, available: !conflict });
    }
    return { startAt, endAt, units: result };
  }

  // ─── Reservations ────────────────────────────────────────────────────

  async listReservations(user: AuthUser, assetId: string) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.rentalReservation.findMany({
      where: { assetId },
      include: {
        fleetUnit: { select: { id: true, name: true, plateNumber: true } },
        fleetRate: { select: { id: true, name: true } },
        folioCharges: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getReservation(user: AuthUser, id: string) {
    const row = await this.prisma.rentalReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: {
        fleetUnit: true,
        fleetRate: true,
        folioCharges: true,
      },
    });
    if (!row) throw new NotFoundException('Rental reservation not found');
    return row;
  }

  async createReservation(user: AuthUser, input: CreateRentalReservationInput) {
    await this.requireAsset(user.organizationId, input.assetId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }

    const unit = await this.prisma.assetFleetUnit.findFirst({
      where: {
        id: input.fleetUnitId,
        assetId: input.assetId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!unit) throw new NotFoundException('Fleet unit not found');

    if (await this.hasFleetConflict(unit.id, startAt, endAt)) {
      throw new ConflictException('Vehicle is not available for that window');
    }

    let rate = null as Awaited<ReturnType<typeof this.prisma.assetFleetRate.findFirst>>;
    if (input.fleetRateId) {
      rate = await this.prisma.assetFleetRate.findFirst({
        where: { id: input.fleetRateId, assetId: input.assetId, deletedAt: null },
      });
      if (!rate) throw new NotFoundException('Fleet rate not found');
    }

    const days = rentalDays(startAt, endAt);
    const depositAmount =
      input.depositAmount ?? (rate ? Number(rate.depositAmount) : 0);
    const rateAmount =
      input.rateAmount ??
      (rate ? Number(rate.amountPerDay) * days : null);
    const currency = input.currency || rate?.currency || 'INR';
    const confirmNow = Boolean(input.confirmImmediately);

    const row = await this.prisma.$transaction(async (tx) => {
      if (await this.hasFleetConflictTx(tx, unit.id, startAt, endAt)) {
        throw new ConflictException('Vehicle is not available for that window');
      }

      const hold = await tx.inventoryHold.create({
        data: {
          organizationId: user.organizationId,
          resourceType: 'fleet_unit',
          resourceId: unit.id,
          quantity: 1,
          windowStart: startAt,
          windowEnd: endAt,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: confirmNow ? 'confirmed' : 'active',
          releasedAt: confirmNow ? new Date() : null,
        },
      });

      const allocation = await tx.inventoryAllocation.create({
        data: {
          assetId: input.assetId,
          fleetUnitId: unit.id,
          startAt,
          endAt,
          quantity: 1,
          status: confirmNow ? 'confirmed' : 'hold',
          createdBy: user.sub,
        },
      });

      await tx.assetCalendarBlock.create({
        data: {
          assetId: input.assetId,
          fleetUnitId: unit.id,
          startAt,
          endAt,
          kind: 'booked',
          allocationId: allocation.id,
          notes: confirmNow ? 'rental confirmed' : 'rental hold',
        },
      });

      return tx.rentalReservation.create({
        data: {
          assetId: input.assetId,
          fleetUnitId: unit.id,
          fleetRateId: rate?.id ?? null,
          inventoryAllocationId: allocation.id,
          inventoryHoldId: hold.id,
          partyId: input.partyId ?? null,
          guestName: input.guestName,
          guestPhone: input.guestPhone ?? null,
          startAt,
          endAt,
          status: confirmNow ? 'confirmed' : 'held',
          rateAmount,
          depositAmount,
          currency,
          notes: input.notes ?? null,
          rateSnapshotJson: rate
            ? {
                rateId: rate.id,
                name: rate.name,
                amountPerDay: Number(rate.amountPerDay),
                depositAmount: Number(rate.depositAmount),
                days,
                capturedAt: new Date().toISOString(),
              }
            : undefined,
          createdBy: user.sub,
        },
        include: {
          fleetUnit: true,
          fleetRate: true,
          folioCharges: true,
        },
      });
    });

    await this.timeline(
      user.organizationId,
      confirmNow ? 'RentalBooked' : 'RentalHoldCreated',
      row.id,
      `${row.guestName} · ${unit.name}`,
      user.sub,
    );
    return row;
  }

  private async hasFleetConflictTx(
    tx: Prisma.TransactionClient,
    fleetUnitId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const blocks = await tx.assetCalendarBlock.findMany({
      where: {
        fleetUnitId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  async confirm(user: AuthUser, id: string) {
    const row = await this.getReservation(user, id);
    assertTransition('rental_reservation', row.status, 'confirmed');

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
        }
      }
      if (row.inventoryAllocationId) {
        await tx.inventoryAllocation.update({
          where: { id: row.inventoryAllocationId },
          data: { status: 'confirmed' },
        });
      }
      await tx.rentalReservation.update({
        where: { id },
        data: { status: 'confirmed' },
      });
    });

    await this.timeline(
      user.organizationId,
      'RentalBooked',
      id,
      row.guestName,
      user.sub,
    );
    return this.getReservation(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.getReservation(user, id);
    assertTransition('rental_reservation', row.status, 'cancelled');

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
        }
      }
      if (row.inventoryAllocationId) {
        await tx.inventoryAllocation.update({
          where: { id: row.inventoryAllocationId },
          data: { status: 'released' },
        });
        await tx.assetCalendarBlock.deleteMany({
          where: { allocationId: row.inventoryAllocationId },
        });
      }
      await tx.rentalReservation.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });

    await this.timeline(
      user.organizationId,
      'RentalCancelled',
      id,
      row.guestName,
      user.sub,
    );
    return this.getReservation(user, id);
  }

  async checkout(user: AuthUser, id: string, input: RentalCheckoutInput) {
    const row = await this.getReservation(user, id);
    assertTransition('rental_reservation', row.status, 'checked_out');
    const updated = await this.prisma.rentalReservation.update({
      where: { id },
      data: {
        status: 'checked_out',
        checkoutChecklistJson: (input.checklist ?? {
          exterior: true,
          interior: true,
          keys: true,
          fuel: 'full_or_noted',
        }) as Prisma.InputJsonValue,
        notes: input.notes
          ? [row.notes, input.notes].filter(Boolean).join('\n')
          : row.notes,
      },
      include: { fleetUnit: true, folioCharges: true },
    });
    await this.timeline(
      user.organizationId,
      'RentalCheckedOut',
      id,
      `${row.guestName} vehicle out`,
      user.sub,
    );
    return updated;
  }

  async returnVehicle(user: AuthUser, id: string, input: RentalReturnInput) {
    const row = await this.getReservation(user, id);
    assertTransition('rental_reservation', row.status, 'returned');

    await this.prisma.$transaction(async (tx) => {
      if (input.damageAmount && input.damageAmount > 0) {
        await tx.folioCharge.create({
          data: {
            rentalReservationId: id,
            description: input.damageNote || 'Damage charge',
            category: 'damage',
            amount: input.damageAmount,
            currency: row.currency,
            createdBy: user.sub,
          },
        });
      }
      if (row.inventoryAllocationId) {
        await tx.inventoryAllocation.update({
          where: { id: row.inventoryAllocationId },
          data: { status: 'released' },
        });
        await tx.assetCalendarBlock.deleteMany({
          where: { allocationId: row.inventoryAllocationId },
        });
      }
      await tx.rentalReservation.update({
        where: { id },
        data: {
          status: 'returned',
          damageNote: input.damageNote ?? row.damageNote,
          returnChecklistJson: (input.checklist ?? {
            exterior: true,
            interior: true,
            keys: true,
          }) as Prisma.InputJsonValue,
          notes: input.notes
            ? [row.notes, input.notes].filter(Boolean).join('\n')
            : row.notes,
        },
      });
    });

    await this.timeline(
      user.organizationId,
      'RentalReturned',
      id,
      row.guestName,
      user.sub,
    );
    return this.getReservation(user, id);
  }

  async getFolio(user: AuthUser, id: string) {
    const reservation = await this.getReservation(user, id);
    const charges = reservation.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const rental = Number(reservation.rateAmount || 0);
    const totalDue = rental + charges;
    const paid = Number(reservation.amountPaid);
    const depositPaid = Number(reservation.depositPaid);
    return {
      reservation,
      rental,
      charges,
      depositAmount: Number(reservation.depositAmount),
      depositPaid,
      paid,
      outstanding: Math.max(0, totalDue - paid),
      depositOutstanding: Math.max(
        0,
        Number(reservation.depositAmount) - depositPaid,
      ),
      currency: reservation.currency,
    };
  }

  async issueDepositDoc(user: AuthUser, id: string) {
    const folio = await this.getFolio(user, id);
    const res = folio.reservation;
    return this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'invoice',
        direction: 'receivable',
        counterpartyPartyId: res.partyId,
        linkedEntityType: 'rental_reservation',
        linkedEntityId: id,
        label: `Rental deposit — ${res.guestName}`,
        amount: Number(res.depositAmount),
        currency: res.currency,
        notes: 'Security deposit',
        createdBy: user.sub,
      },
    });
  }

  async issueFinalInvoice(user: AuthUser, id: string) {
    const folio = await this.getFolio(user, id);
    const res = folio.reservation;
    const amount = folio.rental + folio.charges;
    return this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'invoice',
        direction: 'receivable',
        counterpartyPartyId: res.partyId,
        linkedEntityType: 'rental_reservation',
        linkedEntityId: id,
        label: `Rental invoice — ${res.guestName}`,
        amount,
        currency: res.currency,
        createdBy: user.sub,
      },
    });
  }

  async recordPayment(
    user: AuthUser,
    id: string,
    input: RecordRentalPaymentInput,
  ) {
    const folio = await this.getFolio(user, id);
    if (input.amount <= 0) throw new BadRequestException('amount must be positive');
    const toward = input.toward || 'charges';

    await this.prisma.paymentRecord.create({
      data: {
        organizationId: user.organizationId,
        direction: 'inbound',
        amount: input.amount,
        currency: folio.currency,
        method: input.method ?? null,
        reference: input.reference ?? null,
        paidAt: new Date(),
        linkedEntityType: 'rental_reservation',
        linkedEntityId: id,
        createdBy: user.sub,
      },
    });

    if (toward === 'deposit') {
      await this.prisma.rentalReservation.update({
        where: { id },
        data: { depositPaid: { increment: input.amount } },
      });
    } else {
      await this.prisma.rentalReservation.update({
        where: { id },
        data: { amountPaid: { increment: input.amount } },
      });
    }

    await this.timeline(
      user.organizationId,
      'RentalPaymentReceived',
      id,
      `${toward} ${input.amount}`,
      user.sub,
    );
    return { folio: await this.getFolio(user, id) };
  }
}
