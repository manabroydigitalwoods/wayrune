import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CompleteDriverJobInput,
  CreateDriverJobInput,
  RecordDriverPaymentInput,
} from '@wayrune/contracts';
import type { AuthUser } from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { assertTransition } from '../commerce/lifecycle-transitions';

@Injectable()
export class DriverService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  private async requireDriverAsset(organizationId: string, assetId: string) {
    const asset = await this.prisma.partnerAsset.findFirst({
      where: {
        id: assetId,
        organizationId,
        deletedAt: null,
        assetKind: 'driver',
      },
    });
    if (!asset) throw new NotFoundException('Driver asset not found');
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
        entityType: 'driver_job',
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType: 'driver_job', entityId, summary },
    });
  }

  private async hasAssetConflict(
    assetId: string,
    startAt: Date,
    endAt: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const blocks = await db.assetCalendarBlock.findMany({
      where: {
        assetId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  async availability(
    user: AuthUser,
    assetId: string,
    startAtIso: string,
    endAtIso: string,
  ) {
    await this.requireDriverAsset(user.organizationId, assetId);
    const startAt = new Date(startAtIso);
    const endAt = new Date(endAtIso);
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    const conflict = await this.hasAssetConflict(assetId, startAt, endAt);
    return { startAt, endAt, available: !conflict };
  }

  async listJobs(user: AuthUser, assetId: string, day?: string) {
    await this.requireDriverAsset(user.organizationId, assetId);
    const where: Prisma.DriverJobWhereInput = { assetId };
    if (day) {
      const start = new Date(`${day}T00:00:00.000Z`);
      const end = new Date(`${day}T23:59:59.999Z`);
      where.startAt = { lte: end };
      where.endAt = { gte: start };
    }
    return this.prisma.driverJob.findMany({
      where,
      orderBy: { startAt: 'asc' },
      take: 100,
    });
  }

  async getJob(user: AuthUser, id: string) {
    const row = await this.prisma.driverJob.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: {
        asset: { select: { id: true, name: true, assetKind: true } },
        serviceRequest: { select: { id: true, title: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException('Driver job not found');
    return row;
  }

  async createJob(user: AuthUser, input: CreateDriverJobInput) {
    await this.requireDriverAsset(user.organizationId, input.assetId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt < endAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }

    if (input.serviceRequestId) {
      const sr = await this.prisma.serviceRequest.findFirst({
        where: {
          id: input.serviceRequestId,
          OR: [
            { sellerOrganizationId: user.organizationId },
            { partnerAssetId: input.assetId },
          ],
        },
      });
      if (!sr) throw new NotFoundException('Service request not found');
    }

    const assignNow = input.assignImmediately !== false;
    if (assignNow && (await this.hasAssetConflict(input.assetId, startAt, endAt))) {
      throw new ConflictException('Driver is not available for that window');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (assignNow && (await this.hasAssetConflict(input.assetId, startAt, endAt, tx))) {
        throw new ConflictException('Driver is not available for that window');
      }

      let holdId: string | null = null;
      let allocationId: string | null = null;

      if (assignNow) {
        const hold = await tx.inventoryHold.create({
          data: {
            organizationId: user.organizationId,
            resourceType: 'driver_asset',
            resourceId: input.assetId,
            quantity: 1,
            windowStart: startAt,
            windowEnd: endAt,
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'confirmed',
            releasedAt: new Date(),
          },
        });
        holdId = hold.id;

        const allocation = await tx.inventoryAllocation.create({
          data: {
            assetId: input.assetId,
            startAt,
            endAt,
            quantity: 1,
            status: 'confirmed',
            createdBy: user.sub,
          },
        });
        allocationId = allocation.id;

        await tx.assetCalendarBlock.create({
          data: {
            assetId: input.assetId,
            startAt,
            endAt,
            kind: 'booked',
            allocationId: allocation.id,
            notes: 'driver job',
          },
        });
      }

      return tx.driverJob.create({
        data: {
          assetId: input.assetId,
          inventoryAllocationId: allocationId,
          inventoryHoldId: holdId,
          serviceRequestId: input.serviceRequestId ?? null,
          partyId: input.partyId ?? null,
          guestName: input.guestName,
          guestPhone: input.guestPhone ?? null,
          pickupLocation: input.pickupLocation ?? null,
          dropLocation: input.dropLocation ?? null,
          startAt,
          endAt,
          status: assignNow ? 'assigned' : 'offered',
          rateAmount: input.rateAmount ?? null,
          currency: input.currency || 'INR',
          notes: input.notes ?? null,
          createdBy: user.sub,
        },
      });
    });

    await this.timeline(
      user.organizationId,
      assignNow ? 'DriverJobAssigned' : 'DriverJobOffered',
      row.id,
      `${row.guestName} · ${row.pickupLocation || 'duty'}`,
      user.sub,
    );
    return row;
  }

  async accept(user: AuthUser, id: string) {
    const row = await this.getJob(user, id);
    assertTransition('driver_job', row.status, 'assigned');

    if (await this.hasAssetConflict(row.assetId, row.startAt, row.endAt)) {
      throw new ConflictException('Driver is not available for that window');
    }

    await this.prisma.$transaction(async (tx) => {
      if (await this.hasAssetConflict(row.assetId, row.startAt, row.endAt, tx)) {
        throw new ConflictException('Driver is not available for that window');
      }
      const hold = await tx.inventoryHold.create({
        data: {
          organizationId: user.organizationId,
          resourceType: 'driver_asset',
          resourceId: row.assetId,
          quantity: 1,
          windowStart: row.startAt,
          windowEnd: row.endAt,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: 'confirmed',
          releasedAt: new Date(),
        },
      });
      const allocation = await tx.inventoryAllocation.create({
        data: {
          assetId: row.assetId,
          startAt: row.startAt,
          endAt: row.endAt,
          quantity: 1,
          status: 'confirmed',
          createdBy: user.sub,
        },
      });
      await tx.assetCalendarBlock.create({
        data: {
          assetId: row.assetId,
          startAt: row.startAt,
          endAt: row.endAt,
          kind: 'booked',
          allocationId: allocation.id,
          notes: 'driver job accepted',
        },
      });
      await tx.driverJob.update({
        where: { id },
        data: {
          status: 'assigned',
          inventoryHoldId: hold.id,
          inventoryAllocationId: allocation.id,
        },
      });
    });

    await this.timeline(
      user.organizationId,
      'DriverJobAssigned',
      id,
      row.guestName,
      user.sub,
    );
    return this.getJob(user, id);
  }

  async start(user: AuthUser, id: string) {
    const row = await this.getJob(user, id);
    assertTransition('driver_job', row.status, 'en_route');
    const updated = await this.prisma.driverJob.update({
      where: { id },
      data: { status: 'en_route' },
    });
    await this.timeline(
      user.organizationId,
      'DriverJobStarted',
      id,
      row.guestName,
      user.sub,
    );
    return updated;
  }

  async complete(user: AuthUser, id: string, input: CompleteDriverJobInput) {
    const row = await this.getJob(user, id);
    assertTransition('driver_job', row.status, 'completed');

    await this.prisma.$transaction(async (tx) => {
      if (row.inventoryAllocationId) {
        await tx.inventoryAllocation.update({
          where: { id: row.inventoryAllocationId },
          data: { status: 'released' },
        });
        await tx.assetCalendarBlock.deleteMany({
          where: { allocationId: row.inventoryAllocationId },
        });
      }
      await tx.driverJob.update({
        where: { id },
        data: {
          status: 'completed',
          completionNote: input.completionNote ?? row.completionNote,
          notes: input.notes
            ? [row.notes, input.notes].filter(Boolean).join('\n')
            : row.notes,
        },
      });
    });

    await this.timeline(
      user.organizationId,
      'DriverJobCompleted',
      id,
      row.guestName,
      user.sub,
    );
    return this.getJob(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.getJob(user, id);
    assertTransition('driver_job', row.status, 'cancelled');

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
      await tx.driverJob.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });

    await this.timeline(
      user.organizationId,
      'DriverJobCancelled',
      id,
      row.guestName,
      user.sub,
    );
    return this.getJob(user, id);
  }

  async issueInvoice(user: AuthUser, id: string) {
    const row = await this.getJob(user, id);
    const amount = Number(row.rateAmount || 0);
    return this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'invoice',
        direction: 'receivable',
        counterpartyPartyId: row.partyId,
        linkedEntityType: 'driver_job',
        linkedEntityId: id,
        label: `Driver duty — ${row.guestName}`,
        amount,
        currency: row.currency,
        createdBy: user.sub,
      },
    });
  }

  async recordPayment(
    user: AuthUser,
    id: string,
    input: RecordDriverPaymentInput,
  ) {
    const row = await this.getJob(user, id);
    if (input.amount <= 0) throw new BadRequestException('amount must be positive');

    await this.prisma.paymentRecord.create({
      data: {
        organizationId: user.organizationId,
        direction: 'inbound',
        amount: input.amount,
        currency: row.currency,
        method: input.method ?? null,
        reference: input.reference ?? null,
        paidAt: new Date(),
        linkedEntityType: 'driver_job',
        linkedEntityId: id,
        createdBy: user.sub,
      },
    });

    const updated = await this.prisma.driverJob.update({
      where: { id },
      data: { amountPaid: { increment: input.amount } },
    });

    await this.timeline(
      user.organizationId,
      'DriverPaymentReceived',
      id,
      String(input.amount),
      user.sub,
    );

    const rate = Number(updated.rateAmount || 0);
    const paid = Number(updated.amountPaid);
    return {
      job: updated,
      outstanding: Math.max(0, rate - paid),
    };
  }
}
