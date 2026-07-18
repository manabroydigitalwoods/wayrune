import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConfirmMealReservationSchema,
  ConvertMealInquiryInput,
  CreateMealInquiryInput,
  CreateMealReservationSchema,
  QuoteMealInquiryInput,
  UpdateMealReservationSchema,
} from '@wayrune/contracts';
import type { z } from 'zod';
import type { AuthUser } from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  applyInventoryMode,
  type TxClient,
} from '../commerce/inventory-adapters';
import { assertTransition } from '../commerce/lifecycle-transitions';

type CreateMealReservationInput = z.infer<typeof CreateMealReservationSchema>;
type UpdateMealReservationInput = z.infer<typeof UpdateMealReservationSchema>;
type ConfirmMealReservationInput = z.infer<typeof ConfirmMealReservationSchema>;

@Injectable()
export class RestaurantService {
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
    entityType: string,
    entityId: string,
    summary: string,
    actorUserId?: string,
  ) {
    await this.prisma.businessTimelineEvent.create({
      data: {
        organizationId,
        eventType,
        entityType,
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
      },
    });
    await this.outbox.enqueue({
      organizationId,
      eventType,
      payload: { entityType, entityId, summary },
    });
  }

  private async applyCapacity(
    tx: TxClient,
    organizationId: string,
    diningCapacityId: string,
    quantity: number,
    mode: 'hold' | 'confirm' | 'release',
  ) {
    try {
      await applyInventoryMode(tx, mode, {
        organizationId,
        resourceType: 'dining_capacity',
        resourceId: diningCapacityId,
        quantity,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Insufficient')) throw new ConflictException(msg);
      throw e;
    }
  }

  // ─── Inquiries ─────────────────────────────────────────────────────

  async listInquiries(user: AuthUser, assetId: string, status?: string) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.mealInquiry.findMany({
      where: {
        assetId,
        ...(status ? { status } : { status: { notIn: ['cancelled'] } }),
      },
      include: {
        mealPackage: { select: { id: true, name: true, pricePerPerson: true } },
        party: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createInquiry(user: AuthUser, input: CreateMealInquiryInput) {
    await this.requireAsset(user.organizationId, input.assetId);
    if (input.partyId) {
      const party = await this.prisma.party.findFirst({
        where: { id: input.partyId, organizationId: user.organizationId, deletedAt: null },
      });
      if (!party) throw new NotFoundException('Party not found');
    }
    const row = await this.prisma.mealInquiry.create({
      data: {
        assetId: input.assetId,
        partyId: input.partyId ?? null,
        contactName: input.contactName,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        guestCount: input.guestCount,
        preferredServiceAt: input.preferredServiceAt
          ? new Date(input.preferredServiceAt)
          : null,
        mealPackageId: input.mealPackageId ?? null,
        notes: input.notes ?? null,
        status: 'open',
        createdBy: user.sub,
      },
    });
    await this.timeline(
      user.organizationId,
      'MealInquiryCreated',
      'meal_inquiry',
      row.id,
      `Inquiry from ${row.contactName}`,
      user.sub,
    );
    return row;
  }

  async quoteInquiry(user: AuthUser, id: string, input: QuoteMealInquiryInput) {
    const inquiry = await this.prisma.mealInquiry.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: { mealPackage: true },
    });
    if (!inquiry) throw new NotFoundException('Meal inquiry not found');
    assertTransition('meal_inquiry', inquiry.status, 'quoted');

    const packageId = input.mealPackageId ?? inquiry.mealPackageId;
    const pkg = packageId
      ? await this.prisma.mealPackage.findFirst({
          where: { id: packageId, assetId: inquiry.assetId },
        })
      : inquiry.mealPackage;
    const quotedAmount =
      input.quotedAmount ??
      (pkg ? Number(pkg.pricePerPerson) * inquiry.guestCount : null);
    if (quotedAmount == null) {
      throw new BadRequestException('quotedAmount or mealPackage required');
    }

    const doc = await this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'quotation',
        direction: 'receivable',
        counterpartyPartyId: inquiry.partyId,
        linkedEntityType: 'meal_inquiry',
        linkedEntityId: inquiry.id,
        label: `Meal quote — ${inquiry.contactName}`,
        amount: quotedAmount,
        currency: input.currency || pkg?.currency || inquiry.currency,
        notes: input.notes ?? inquiry.notes,
        createdBy: user.sub,
        lines: {
          create: [
            {
              description: pkg?.name || 'Group meal',
              quantity: inquiry.guestCount,
              unitAmount: quotedAmount / Math.max(1, inquiry.guestCount),
            },
          ],
        },
      },
    });

    const updated = await this.prisma.mealInquiry.update({
      where: { id },
      data: {
        status: 'quoted',
        quotedAmount,
        mealPackageId: packageId ?? null,
        currency: doc.currency,
        commercialDocumentId: doc.id,
        notes: input.notes ?? inquiry.notes,
      },
      include: { commercialDocument: true, mealPackage: true },
    });
    await this.timeline(
      user.organizationId,
      'MealInquiryQuoted',
      'meal_inquiry',
      id,
      `Quoted ${quotedAmount}`,
      user.sub,
    );
    return updated;
  }

  async convertInquiry(user: AuthUser, id: string, input: ConvertMealInquiryInput) {
    const inquiry = await this.prisma.mealInquiry.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: { mealPackage: true },
    });
    if (!inquiry) throw new NotFoundException('Meal inquiry not found');
    if (!['open', 'quoted'].includes(inquiry.status)) {
      throw new BadRequestException('Inquiry cannot be converted in current status');
    }
    assertTransition('meal_inquiry', inquiry.status, 'converted');

    const reservation = await this.createReservation(user, {
      assetId: inquiry.assetId,
      mealPackageId: inquiry.mealPackageId ?? undefined,
      diningCapacityId: input.diningCapacityId ?? undefined,
      serviceAt: input.serviceAt,
      guestCount: input.guestCount ?? inquiry.guestCount,
      partyId: inquiry.partyId ?? undefined,
      guestName: input.guestName || inquiry.contactName,
      rateAmount: inquiry.quotedAmount != null ? Number(inquiry.quotedAmount) : undefined,
      currency: inquiry.currency,
      source: 'manual',
      notes: inquiry.notes ?? undefined,
      mealInquiryId: inquiry.id,
      confirmImmediately: input.confirmImmediately ?? false,
    });

    await this.prisma.mealInquiry.update({
      where: { id },
      data: { status: 'converted' },
    });
    return reservation;
  }

  // ─── Reservations ──────────────────────────────────────────────────

  async listReservations(
    user: AuthUser,
    assetId: string,
    query?: { from?: string; to?: string; status?: string },
  ) {
    await this.requireAsset(user.organizationId, assetId);
    return this.prisma.mealReservation.findMany({
      where: {
        assetId,
        ...(query?.status ? { status: query.status } : {}),
        ...(query?.from || query?.to
          ? {
              serviceAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        mealPackage: true,
        party: { select: { id: true, displayName: true } },
        diningCapacity: true,
      },
      orderBy: { serviceAt: 'desc' },
      take: 200,
    });
  }

  async createReservation(
    user: AuthUser,
    input: CreateMealReservationInput & {
      mealInquiryId?: string;
      confirmImmediately?: boolean;
    },
  ) {
    await this.requireAsset(user.organizationId, input.assetId);
    const pkg = input.mealPackageId
      ? await this.prisma.mealPackage.findFirst({
          where: { id: input.mealPackageId, assetId: input.assetId },
        })
      : null;
    const amount =
      input.rateAmount ??
      (pkg ? Number(pkg.pricePerPerson) * input.guestCount : null);
    const confirmNow = Boolean(input.confirmImmediately);
    const initialStatus = confirmNow ? 'confirmed' : 'requested';

    const reservation = await this.prisma.$transaction(async (tx) => {
      let holdId: string | null = null;
      if (input.diningCapacityId) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const hold = await tx.inventoryHold.create({
          data: {
            organizationId: user.organizationId,
            resourceType: 'dining_capacity',
            resourceId: input.diningCapacityId,
            quantity: input.guestCount,
            expiresAt,
            status: 'active',
          },
        });
        holdId = hold.id;
        await this.applyCapacity(
          tx,
          user.organizationId,
          input.diningCapacityId,
          input.guestCount,
          'hold',
        );
        if (confirmNow) {
          assertTransition('inventory_hold', 'active', 'confirmed');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'confirmed', releasedAt: new Date() },
          });
          await this.applyCapacity(
            tx,
            user.organizationId,
            input.diningCapacityId,
            input.guestCount,
            'confirm',
          );
        }
      }

      const row = await tx.mealReservation.create({
        data: {
          assetId: input.assetId,
          mealPackageId: input.mealPackageId ?? null,
          diningCapacityId: input.diningCapacityId ?? null,
          inventoryHoldId: holdId,
          mealInquiryId: input.mealInquiryId ?? null,
          serviceRequestId: input.serviceRequestId ?? null,
          partyId: input.partyId ?? null,
          serviceAt: new Date(input.serviceAt),
          guestCount: input.guestCount,
          guestName: input.guestName,
          source: input.source || 'manual',
          dietaryJson: (input.dietaryJson ?? undefined) as Prisma.InputJsonValue | undefined,
          rateAmount: amount,
          currency: input.currency || pkg?.currency || 'INR',
          rateSnapshotJson: {
            amount,
            mealPackageId: input.mealPackageId,
            capturedAt: new Date().toISOString(),
          },
          policySnapshotJson: {
            policyText: 'Standard group meal confirmation',
            capturedAt: new Date().toISOString(),
          },
          notes: input.notes ?? null,
          status: initialStatus,
          createdBy: user.sub,
        },
      });

      if (confirmNow && amount != null && amount > 0) {
        await tx.folioCharge.create({
          data: {
            mealReservationId: row.id,
            description: pkg?.name || 'Group meal',
            category: 'meal',
            amount,
            currency: row.currency,
            createdBy: user.sub,
          },
        });
      }
      return row;
    });

    await this.timeline(
      user.organizationId,
      confirmNow ? 'MealReservationConfirmed' : 'MealReservationCreated',
      'meal_reservation',
      reservation.id,
      `${reservation.guestName} × ${reservation.guestCount}`,
      user.sub,
    );
    return reservation;
  }

  async confirmReservation(
    user: AuthUser,
    id: string,
    _input?: ConfirmMealReservationInput,
  ) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: { mealPackage: true },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    assertTransition('meal_reservation', row.status, 'confirmed');

    await this.prisma.$transaction(async (tx) => {
      if (row.diningCapacityId && row.inventoryHoldId) {
        const hold = await tx.inventoryHold.findUnique({
          where: { id: row.inventoryHoldId },
        });
        if (hold && hold.status === 'active') {
          assertTransition('inventory_hold', hold.status, 'confirmed');
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'confirmed', releasedAt: new Date() },
          });
          await this.applyCapacity(
            tx,
            user.organizationId,
            row.diningCapacityId,
            row.guestCount,
            'confirm',
          );
        }
      } else if (row.diningCapacityId && !row.inventoryHoldId) {
        // Legacy rows: move seats into reserved if not already held
        await this.applyCapacity(
          tx,
          user.organizationId,
          row.diningCapacityId,
          row.guestCount,
          'hold',
        );
        await this.applyCapacity(
          tx,
          user.organizationId,
          row.diningCapacityId,
          row.guestCount,
          'confirm',
        );
      }

      await tx.mealReservation.update({
        where: { id },
        data: { status: 'confirmed' },
      });

      const existing = await tx.folioCharge.count({
        where: { mealReservationId: id, category: 'meal' },
      });
      const amount = Number(row.rateAmount || 0);
      if (existing === 0 && amount > 0) {
        await tx.folioCharge.create({
          data: {
            mealReservationId: id,
            description: row.mealPackage?.name || 'Group meal',
            category: 'meal',
            amount,
            currency: row.currency,
            createdBy: user.sub,
          },
        });
      }
    });

    await this.timeline(
      user.organizationId,
      'MealReservationConfirmed',
      'meal_reservation',
      id,
      row.guestName,
      user.sub,
    );
    return this.prisma.mealReservation.findUnique({ where: { id } });
  }

  private async transitionStatus(
    user: AuthUser,
    id: string,
    to: string,
    extra?: { preparationStatus?: string },
  ) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    assertTransition('meal_reservation', row.status, to);
    return this.prisma.mealReservation.update({
      where: { id },
      data: {
        status: to,
        ...(extra?.preparationStatus
          ? { preparationStatus: extra.preparationStatus }
          : {}),
      },
    });
  }

  seat(user: AuthUser, id: string) {
    return this.transitionStatus(user, id, 'seated');
  }

  arrive(user: AuthUser, id: string) {
    return this.transitionStatus(user, id, 'arrived');
  }

  serve(user: AuthUser, id: string) {
    return this.transitionStatus(user, id, 'served', {
      preparationStatus: 'served',
    }).then(async (row) => {
      await this.timeline(
        user.organizationId,
        'MealServiceCompleted',
        'meal_reservation',
        id,
        'Meal served',
        user.sub,
      );
      return row;
    });
  }

  async getBillBlockers(user: AuthUser, id: string) {
    const folio = await this.getFolio(user, id);
    const blockers: Array<{ code: string; message: string; severity: 'block' | 'warn' }> =
      [];
    const warnings: typeof blockers = [];
    if (folio.outstanding > 0.01) {
      blockers.push({
        code: 'outstanding_balance',
        message: `Outstanding bill ${folio.outstanding.toFixed(2)} ${folio.currency}`,
        severity: 'block',
      });
    }
    if (!folio.reservation.guestName?.trim()) {
      blockers.push({
        code: 'missing_guest',
        message: 'Guest / group name required',
        severity: 'block',
      });
    }
    if (!['served', 'seated', 'confirmed'].includes(folio.reservation.status)) {
      warnings.push({
        code: 'early_complete',
        message: `Completing from status ${folio.reservation.status}`,
        severity: 'warn',
      });
    }
    return { blockers, warnings, folio };
  }

  async complete(user: AuthUser, id: string, force = false) {
    const { blockers } = await this.getBillBlockers(user, id);
    if (blockers.length && !force) {
      throw new BadRequestException({
        code: 'BILL_BLOCKED',
        message: 'Cannot complete with outstanding blockers',
        blockers,
      });
    }
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    assertTransition('meal_reservation', row.status, 'completed');
    return this.prisma.mealReservation.update({
      where: { id },
      data: { status: 'completed' },
    });
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    assertTransition('meal_reservation', row.status, 'cancelled');

    await this.prisma.$transaction(async (tx) => {
      if (row.diningCapacityId) {
        if (row.inventoryHoldId) {
          const hold = await tx.inventoryHold.findUnique({
            where: { id: row.inventoryHoldId },
          });
          if (hold && hold.status === 'active') {
            assertTransition('inventory_hold', hold.status, 'released');
            await tx.inventoryHold.update({
              where: { id: hold.id },
              data: { status: 'released', releasedAt: new Date() },
            });
            await this.applyCapacity(
              tx,
              user.organizationId,
              row.diningCapacityId,
              row.guestCount,
              'release',
            );
          } else if (hold && hold.status === 'confirmed') {
            // Return reserved seats
            await tx.diningCapacity.update({
              where: { id: row.diningCapacityId },
              data: { reserved: { decrement: row.guestCount } },
            });
          }
        } else if (['confirmed', 'arrived', 'seated', 'served'].includes(row.status)) {
          await tx.diningCapacity.update({
            where: { id: row.diningCapacityId },
            data: { reserved: { decrement: row.guestCount } },
          });
        }
      }
      await tx.mealReservation.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });

    await this.timeline(
      user.organizationId,
      'MealReservationCancelled',
      'meal_reservation',
      id,
      row.guestName,
      user.sub,
    );
    return this.prisma.mealReservation.findUnique({ where: { id } });
  }

  async noShow(user: AuthUser, id: string) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    assertTransition('meal_reservation', row.status, 'no_show');
    await this.cancelCapacityIfHeld(user.organizationId, row);
    return this.prisma.mealReservation.update({
      where: { id },
      data: { status: 'no_show' },
    });
  }

  private async cancelCapacityIfHeld(
    organizationId: string,
    row: {
      id: string;
      diningCapacityId: string | null;
      inventoryHoldId: string | null;
      guestCount: number;
      status: string;
    },
  ) {
    if (!row.diningCapacityId) return;
    await this.prisma.$transaction(async (tx) => {
      if (row.inventoryHoldId) {
        const hold = await tx.inventoryHold.findUnique({
          where: { id: row.inventoryHoldId },
        });
        if (hold?.status === 'active') {
          await tx.inventoryHold.update({
            where: { id: hold.id },
            data: { status: 'released', releasedAt: new Date() },
          });
          await this.applyCapacity(
            tx,
            organizationId,
            row.diningCapacityId!,
            row.guestCount,
            'release',
          );
        } else if (hold?.status === 'confirmed') {
          await tx.diningCapacity.update({
            where: { id: row.diningCapacityId! },
            data: { reserved: { decrement: row.guestCount } },
          });
        }
      }
    });
  }

  async updateReservation(
    user: AuthUser,
    id: string,
    input: UpdateMealReservationInput,
  ) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    if (input.status && input.status !== row.status) {
      assertTransition('meal_reservation', row.status, input.status);
    }
    return this.prisma.mealReservation.update({
      where: { id },
      data: {
        status: input.status,
        preparationStatus: input.preparationStatus,
        guestCount: input.guestCount,
        notes: input.notes,
      },
    });
  }

  // ─── Folio / bill ──────────────────────────────────────────────────

  async getFolio(user: AuthUser, id: string) {
    const reservation = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
      include: { folioCharges: true, mealPackage: true },
    });
    if (!reservation) throw new NotFoundException('Meal reservation not found');
    const charges = reservation.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const paid = Number(reservation.amountPaid);
    return {
      reservation,
      charges,
      paid,
      outstanding: Math.max(0, charges - paid),
      currency: reservation.currency,
    };
  }

  async addFolioCharge(
    user: AuthUser,
    mealReservationId: string,
    input: { description: string; amount: number; taxAmount?: number; category?: string },
  ) {
    const res = await this.prisma.mealReservation.findFirst({
      where: { id: mealReservationId, asset: { organizationId: user.organizationId } },
    });
    if (!res) throw new NotFoundException('Meal reservation not found');
    return this.prisma.folioCharge.create({
      data: {
        mealReservationId,
        description: input.description,
        amount: input.amount,
        taxAmount: input.taxAmount ?? 0,
        category: input.category || 'meal',
        currency: res.currency,
        createdBy: user.sub,
      },
    });
  }

  async issueInvoice(user: AuthUser, id: string) {
    const folio = await this.getFolio(user, id);
    const res = folio.reservation;
    const doc = await this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'invoice',
        direction: 'receivable',
        counterpartyPartyId: res.partyId,
        linkedEntityType: 'meal_reservation',
        linkedEntityId: id,
        label: `Meal invoice — ${res.guestName}`,
        amount: folio.charges,
        currency: res.currency,
        createdBy: user.sub,
      },
    });
    return doc;
  }

  async recordPayment(
    user: AuthUser,
    id: string,
    input: { amount: number; method?: string; reference?: string },
  ) {
    const folio = await this.getFolio(user, id);
    if (input.amount <= 0) throw new BadRequestException('amount must be positive');
    const payment = await this.prisma.paymentRecord.create({
      data: {
        organizationId: user.organizationId,
        direction: 'inbound',
        amount: input.amount,
        currency: folio.currency,
        method: input.method ?? null,
        reference: input.reference ?? null,
        paidAt: new Date(),
        linkedEntityType: 'meal_reservation',
        linkedEntityId: id,
        createdBy: user.sub,
      },
    });
    await this.prisma.mealReservation.update({
      where: { id },
      data: { amountPaid: { increment: input.amount } },
    });
    await this.timeline(
      user.organizationId,
      'MealPaymentReceived',
      'meal_reservation',
      id,
      `Payment ${input.amount}`,
      user.sub,
    );
    return { payment, folio: await this.getFolio(user, id) };
  }

  // ─── Kitchen & care ────────────────────────────────────────────────

  async kitchenBoard(user: AuthUser, assetId: string) {
    await this.requireAsset(user.organizationId, assetId);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.prisma.mealReservation.findMany({
      where: {
        assetId,
        serviceAt: { gte: start, lte: end },
        status: { notIn: ['cancelled', 'no_show'] },
      },
      include: { mealPackage: true, party: { select: { id: true, displayName: true } } },
      orderBy: { serviceAt: 'asc' },
    });
  }

  async setPreparation(
    user: AuthUser,
    id: string,
    preparationStatus: 'pending' | 'prepping' | 'ready' | 'served',
  ) {
    const row = await this.prisma.mealReservation.findFirst({
      where: { id, asset: { organizationId: user.organizationId } },
    });
    if (!row) throw new NotFoundException('Meal reservation not found');
    const data: Prisma.MealReservationUpdateInput = { preparationStatus };
    // Ready food for confirmed party → promote toward seated/served ops
    if (preparationStatus === 'ready' && row.status === 'confirmed') {
      // keep status; kitchen ready is prep-only
    }
    if (preparationStatus === 'served' && ['seated', 'confirmed', 'arrived'].includes(row.status)) {
      assertTransition('meal_reservation', row.status, 'served');
      data.status = 'served';
    }
    return this.prisma.mealReservation.update({ where: { id }, data });
  }

  async partyHistory(user: AuthUser, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!party) throw new NotFoundException('Party not found');
    const [reservations, inquiries] = await Promise.all([
      this.prisma.mealReservation.findMany({
        where: { partyId, asset: { organizationId: user.organizationId } },
        include: { mealPackage: true, asset: { select: { id: true, name: true } } },
        orderBy: { serviceAt: 'desc' },
        take: 50,
      }),
      this.prisma.mealInquiry.findMany({
        where: { partyId, asset: { organizationId: user.organizationId } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { party, reservations, inquiries };
  }
}
