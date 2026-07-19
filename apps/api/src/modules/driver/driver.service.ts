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
import { agencyTransferJobWindow, agencyTransferCalendarNotes, agencyTransferAllocationNotes } from './agency-transfer-job';
import { bookingStatusFromDriverJob } from './driver-job-booking-sync';

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

  private async hasFleetUnitConflict(
    fleetUnitId: string,
    startAt: Date,
    endAt: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const blocks = await db.assetCalendarBlock.findMany({
      where: {
        fleetUnitId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    if (blocks.length) return true;
    const jobs = await db.driverJob.findMany({
      where: {
        fleetUnitId,
        status: { notIn: ['cancelled', 'completed', 'no_show'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    return jobs.length > 0;
  }

  private async resolveFleetUnitForAsset(
    assetId: string,
    fleetUnitId: string | null | undefined,
  ): Promise<string | null> {
    if (!fleetUnitId?.trim()) return null;
    const unit = await this.prisma.assetFleetUnit.findFirst({
      where: {
        id: fleetUnitId.trim(),
        assetId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (!unit) throw new BadRequestException('Fleet unit not found on this asset');
    return unit.id;
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
      include: {
        fleetUnit: { select: { id: true, name: true, plateNumber: true } },
        bookingComponent: {
          select: {
            id: true,
            title: true,
            trip: { select: { tripNumber: true, title: true } },
          },
        },
      },
    });
  }

  async getJob(user: AuthUser, id: string) {
    const row = await this.prisma.driverJob.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: {
        asset: { select: { id: true, name: true, assetKind: true } },
        serviceRequest: { select: { id: true, title: true, status: true } },
        fleetUnit: { select: { id: true, name: true, plateNumber: true } },
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

    const fleetUnitId = await this.resolveFleetUnitForAsset(
      input.assetId,
      input.fleetUnitId,
    );

    const assignNow = input.assignImmediately !== false;
    if (assignNow && (await this.hasAssetConflict(input.assetId, startAt, endAt))) {
      throw new ConflictException('Driver is not available for that window');
    }
    if (
      assignNow &&
      fleetUnitId &&
      (await this.hasFleetUnitConflict(fleetUnitId, startAt, endAt))
    ) {
      throw new ConflictException('Fleet unit is not available for that window');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (assignNow && (await this.hasAssetConflict(input.assetId, startAt, endAt, tx))) {
        throw new ConflictException('Driver is not available for that window');
      }
      if (
        assignNow &&
        fleetUnitId &&
        (await this.hasFleetUnitConflict(fleetUnitId, startAt, endAt, tx))
      ) {
        throw new ConflictException('Fleet unit is not available for that window');
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
            fleetUnitId,
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
            fleetUnitId,
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
          fleetUnitId,
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
        include: {
          fleetUnit: { select: { id: true, name: true, plateNumber: true } },
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
    if (
      row.fleetUnitId &&
      (await this.hasFleetUnitConflict(row.fleetUnitId, row.startAt, row.endAt))
    ) {
      throw new ConflictException('Fleet unit is not available for that window');
    }

    await this.prisma.$transaction(async (tx) => {
      if (await this.hasAssetConflict(row.assetId, row.startAt, row.endAt, tx)) {
        throw new ConflictException('Driver is not available for that window');
      }
      if (
        row.fleetUnitId &&
        (await this.hasFleetUnitConflict(
          row.fleetUnitId,
          row.startAt,
          row.endAt,
          tx,
        ))
      ) {
        throw new ConflictException('Fleet unit is not available for that window');
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
          fleetUnitId: row.fleetUnitId,
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
          fleetUnitId: row.fleetUnitId,
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
    const job = await this.getJob(user, id);
    await this.writebackAgencyBooking(job);
    return job;
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
    await this.writebackAgencyBooking(updated);
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
    const job = await this.getJob(user, id);
    await this.writebackAgencyBooking(job);
    return job;
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
    const job = await this.getJob(user, id);
    await this.writebackAgencyBooking(job);
    return job;
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

  /**
   * Partner job status → agency transfer booking (direct Prisma; avoids ops softSync loop).
   */
  private async writebackAgencyBooking(job: {
    id: string;
    status: string;
    assetId: string;
    bookingComponentId?: string | null;
  }) {
    if (!job.bookingComponentId) return;
    try {
      const booking = await this.prisma.bookingComponent.findFirst({
        where: { id: job.bookingComponentId },
        select: {
          id: true,
          status: true,
          confirmationRef: true,
          partnerAssetId: true,
          type: true,
        },
      });
      if (!booking || booking.type !== 'transfer') return;

      const nextStatus = bookingStatusFromDriverJob(job.status, booking.status);
      const patch: {
        status?: string;
        partnerAssetId?: string;
        confirmationRef?: string | null;
        updatedAt?: Date;
      } = {};

      if (nextStatus) patch.status = nextStatus;

      if (
        (job.status === 'assigned' ||
          job.status === 'en_route' ||
          job.status === 'completed') &&
        booking.partnerAssetId !== job.assetId
      ) {
        patch.partnerAssetId = job.assetId;
      }

      if (
        (job.status === 'assigned' ||
          job.status === 'en_route' ||
          job.status === 'completed') &&
        !booking.confirmationRef?.trim()
      ) {
        patch.confirmationRef = `DRV-${job.id.slice(-8).toUpperCase()}`;
      }

      if (job.status === 'cancelled' || job.status === 'no_show') {
        if (booking.confirmationRef?.startsWith('DRV-')) {
          patch.confirmationRef = null;
        }
        await this.releaseAgencyTransferHold(job.bookingComponentId);
      }

      if (Object.keys(patch).length === 0 && job.status !== 'cancelled' && job.status !== 'no_show') {
        return;
      }

      if (Object.keys(patch).length > 0) {
        await this.prisma.bookingComponent.update({
          where: { id: booking.id },
          data: patch,
        });
      }
    } catch {
      /* reverse sync must not fail partner actions */
    }
  }

  /**
   * Agency movement assign/reschedule → upsert DriverJob on supplier.linkedAssetId.
   * Soft-skips when no linked driver asset; never blocks agency PATCH.
   * Upserts booking-linked InventoryAllocation + allocation calendar (partner ledger).
   */
  async syncFromAgencyTransfer(input: {
    agencyOrganizationId: string;
    actorUserId: string;
    booking: {
      id: string;
      type: string;
      title: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
      costAmount: Prisma.Decimal | number | null;
      currency: string;
      tripNumber?: string | null;
      tripTitle?: string | null;
      tripStartDate?: Date | null;
    };
    driverSupplierId: string | null;
    vehicleLabel?: string | null;
    fleetUnitId?: string | null;
  }): Promise<
    | { id: string; status: string; softConflict?: boolean; allocationId?: string }
    | { skipped: string }
    | null
  > {
    const bookingId = input.booking.id;
    const existing = await this.prisma.driverJob.findFirst({
      where: { bookingComponentId: bookingId },
      orderBy: { createdAt: 'desc' },
    });

    const driverSupplierId = input.driverSupplierId?.trim() || null;
    const clear =
      input.booking.type !== 'transfer' ||
      input.booking.status === 'cancelled' ||
      input.booking.status === 'rejected' ||
      !driverSupplierId;

    if (clear) {
      await this.releaseAgencyTransferHold(bookingId, existing?.assetId);
      if (
        existing &&
        existing.status !== 'cancelled' &&
        existing.status !== 'completed'
      ) {
        await this.prisma.driverJob.update({
          where: { id: existing.id },
          data: {
            status: 'cancelled',
            fleetUnitId: null,
            inventoryAllocationId: null,
          },
        });
        return { id: existing.id, status: 'cancelled' };
      }
      return existing ? { id: existing.id, status: existing.status } : null;
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: driverSupplierId,
        organizationId: input.agencyOrganizationId,
        deletedAt: null,
      },
      select: { id: true, name: true, linkedAssetId: true, type: true },
    });
    if (!supplier?.linkedAssetId) {
      return { skipped: 'no_linked_asset' };
    }

    const asset = await this.prisma.partnerAsset.findFirst({
      where: {
        id: supplier.linkedAssetId,
        deletedAt: null,
        assetKind: { in: ['driver', 'vehicle'] },
      },
      select: { id: true, organizationId: true, name: true },
    });
    if (!asset) {
      return { skipped: 'linked_asset_missing' };
    }

    const window = agencyTransferJobWindow({
      startAt: input.booking.startAt,
      endAt: input.booking.endAt,
      tripStartDate: input.booking.tripStartDate,
    });
    if (!window) {
      return { skipped: 'no_start_date' };
    }

    let fleetUnitId: string | null = null;
    if (input.fleetUnitId?.trim()) {
      const unit = await this.prisma.assetFleetUnit.findFirst({
        where: {
          id: input.fleetUnitId.trim(),
          assetId: asset.id,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      fleetUnitId = unit?.id ?? null;
    }

    const guestName =
      (input.booking.tripTitle || input.booking.title || 'Agency transfer').slice(
        0,
        120,
      );
    const notes = [
      'agency_transfer',
      input.booking.tripNumber,
      input.vehicleLabel,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);
    const rateAmount =
      input.booking.costAmount == null
        ? null
        : new Prisma.Decimal(Number(input.booking.costAmount));

    if (existing) {
      if (
        existing.assetId !== asset.id &&
        existing.status !== 'cancelled' &&
        existing.status !== 'completed'
      ) {
        await this.releaseAgencyTransferHold(bookingId, existing.assetId);
        await this.prisma.driverJob.update({
          where: { id: existing.id },
          data: {
            status: 'cancelled',
            fleetUnitId: null,
            inventoryAllocationId: null,
          },
        });
      } else if (existing.assetId === asset.id) {
        const allocationId = await this.upsertAgencyTransferAllocation({
          assetId: asset.id,
          bookingId,
          startAt: window.startAt,
          endAt: window.endAt,
          fleetUnitId,
          actorUserId: input.actorUserId,
          notes,
        });
        const updated = await this.prisma.driverJob.update({
          where: { id: existing.id },
          data: {
            guestName,
            pickupLocation: input.booking.title.slice(0, 160) || null,
            startAt: window.startAt,
            endAt: window.endAt,
            rateAmount,
            currency: input.booking.currency || 'INR',
            notes: notes || existing.notes,
            fleetUnitId,
            inventoryAllocationId: allocationId,
            status:
              existing.status === 'cancelled' || existing.status === 'completed'
                ? 'assigned'
                : existing.status === 'offered'
                  ? 'assigned'
                  : existing.status,
          },
        });
        return {
          id: updated.id,
          status: updated.status,
          allocationId,
        };
      }
    }

    const conflict = await this.hasAssetConflictExcludingBooking(
      asset.id,
      window.startAt,
      window.endAt,
      bookingId,
    );

    const allocationId = await this.upsertAgencyTransferAllocation({
      assetId: asset.id,
      bookingId,
      startAt: window.startAt,
      endAt: window.endAt,
      fleetUnitId,
      actorUserId: input.actorUserId,
      notes,
    });

    const row = await this.prisma.driverJob.create({
      data: {
        assetId: asset.id,
        bookingComponentId: bookingId,
        inventoryAllocationId: allocationId,
        fleetUnitId,
        guestName,
        pickupLocation: input.booking.title.slice(0, 160) || null,
        dropLocation: null,
        startAt: window.startAt,
        endAt: window.endAt,
        status: 'assigned',
        rateAmount,
        currency: input.booking.currency || 'INR',
        notes: conflict
          ? `${notes || 'agency_transfer'} · soft_conflict`
          : notes || 'agency_transfer',
        createdBy: input.actorUserId,
      },
    });

    await this.timeline(
      asset.organizationId,
      'DriverJobAssigned',
      row.id,
      `${guestName} · agency transfer`,
      input.actorUserId,
    );

    return {
      id: row.id,
      status: row.status,
      softConflict: conflict || undefined,
      allocationId,
    };
  }

  /** Conflict scan that ignores this booking's own ledger/legacy calendar rows. */
  private async hasAssetConflictExcludingBooking(
    assetId: string,
    startAt: Date,
    endAt: Date,
    bookingId: string,
  ) {
    const notes = agencyTransferCalendarNotes(bookingId);
    const blocks = await this.prisma.assetCalendarBlock.findMany({
      where: {
        assetId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        NOT: {
          OR: [
            { notes },
            {
              allocation: {
                bookingComponentId: bookingId,
              },
            },
          ],
        },
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  private async releaseAgencyTransferHold(
    bookingId: string,
    assetId?: string | null,
  ) {
    const allocations = await this.prisma.inventoryAllocation.findMany({
      where: {
        bookingComponentId: bookingId,
        status: { in: ['hold', 'confirmed'] },
      },
      select: { id: true },
    });
    for (const al of allocations) {
      await this.prisma.inventoryAllocation.update({
        where: { id: al.id },
        data: { status: 'released' },
      });
      await this.prisma.assetCalendarBlock.deleteMany({
        where: { allocationId: al.id },
      });
    }
    if (assetId) {
      await this.prisma.assetCalendarBlock.deleteMany({
        where: {
          assetId,
          notes: agencyTransferCalendarNotes(bookingId),
        },
      });
    } else {
      await this.prisma.assetCalendarBlock.deleteMany({
        where: { notes: agencyTransferCalendarNotes(bookingId) },
      });
    }
  }

  /** Upsert booking-linked fleet allocation + calendar (partner Holds ledger). */
  private async upsertAgencyTransferAllocation(input: {
    assetId: string;
    bookingId: string;
    startAt: Date;
    endAt: Date;
    fleetUnitId: string | null;
    actorUserId: string;
    notes: string;
  }): Promise<string> {
    const notes = agencyTransferAllocationNotes(input.bookingId);
    let allocation = await this.prisma.inventoryAllocation.findFirst({
      where: {
        bookingComponentId: input.bookingId,
        status: { in: ['hold', 'confirmed'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (allocation) {
      allocation = await this.prisma.inventoryAllocation.update({
        where: { id: allocation.id },
        data: {
          assetId: input.assetId,
          fleetUnitId: input.fleetUnitId,
          startAt: input.startAt,
          endAt: input.endAt,
          status: 'confirmed',
          notes,
        },
      });
    } else {
      allocation = await this.prisma.inventoryAllocation.create({
        data: {
          assetId: input.assetId,
          fleetUnitId: input.fleetUnitId,
          bookingComponentId: input.bookingId,
          startAt: input.startAt,
          endAt: input.endAt,
          quantity: 1,
          status: 'confirmed',
          notes,
          createdBy: input.actorUserId,
        },
      });
    }

    // Drop legacy notes-only blocks for this booking.
    await this.prisma.assetCalendarBlock.deleteMany({
      where: {
        assetId: input.assetId,
        notes: agencyTransferCalendarNotes(input.bookingId),
      },
    });

    const existingBlock = await this.prisma.assetCalendarBlock.findFirst({
      where: { allocationId: allocation.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existingBlock) {
      await this.prisma.assetCalendarBlock.update({
        where: { id: existingBlock.id },
        data: {
          startAt: input.startAt,
          endAt: input.endAt,
          fleetUnitId: input.fleetUnitId,
          kind: 'booked',
          notes,
        },
      });
    } else {
      await this.prisma.assetCalendarBlock.create({
        data: {
          assetId: input.assetId,
          fleetUnitId: input.fleetUnitId,
          startAt: input.startAt,
          endAt: input.endAt,
          kind: 'booked',
          allocationId: allocation.id,
          notes,
        },
      });
    }

    return allocation.id;
  }
}

