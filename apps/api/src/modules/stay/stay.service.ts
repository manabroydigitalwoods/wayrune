import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChangeMealPlanInput,
  ChangeOccupancyInput,
  ChangeRoomProductInput,
  CreateAssetRatePlanInput,
  CreateAssetRoomUnitInput,
  CreateStayReservationInput,
  EarlyDepartureInput,
  ExtendStayInput,
  HomestayAttrsInput,
  MoveUnitInput,
  PartialCancelRoomInput,
  RecordStayPaymentInput,
  StayAvailabilityCalendarQuery,
  StayCheckInInput,
  StayDashboardQuery,
  UpdateAssetRatePlanInput,
  UpdateAssetRoomUnitInput,
  UpdateStayReservationInput,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CommerceService } from '../commerce/commerce.service';
import { InventoryService } from '../inventory/inventory.service';
import type { AuthUser } from '../../common/helpers';
import { assertTransition, canTransition } from '../commerce/lifecycle-transitions';

const ACTIVE_RES = new Set(['inquiry', 'confirmed', 'checked_in']);
const OCCUPYING = new Set(['confirmed', 'checked_in']);
const MODIFIABLE = new Set(['confirmed', 'checked_in']);

function dayStart(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date) {
  const days: string[] = [];
  const cur = new Date(from);
  while (cur < to) {
    days.push(isoDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

@Injectable()
export class StayService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private inventory: InventoryService,
    private commerce: CommerceService,
  ) {}

  private reservationInclude() {
    return {
      roomProduct: { select: { id: true, name: true } },
      roomUnit: { select: { id: true, name: true, status: true, floor: true } },
    } as const;
  }

  // ── Dashboard ──────────────────────────────────────────────────────

  async dashboard(user: AuthUser, query: StayDashboardQuery) {
    const assets = await this.prisma.partnerAsset.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        isActive: true,
        ...(query.assetId ? { id: query.assetId } : {}),
      },
      orderBy: { name: 'asc' },
    });
    if (!assets.length) {
      return {
        assets: [],
        occupancyTonight: { occupied: 0, capacity: 0, percent: 0 },
        arrivalsNext7d: 0,
        departuresNext7d: 0,
        pendingInbound: 0,
        stopSellCount: 0,
        bookingsBySource: { agency_inbound: 0, manual: 0, walk_in: 0 },
        occupancyTrend: [] as Array<{ date: string; percent: number }>,
      };
    }

    const assetIds = assets.map((a) => a.id);
    const today = dayStart(isoDate(new Date()));
    const in7 = new Date(today);
    in7.setUTCDate(in7.getUTCDate() + 7);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const roomProducts = await this.prisma.assetRoomProduct.findMany({
      where: { assetId: { in: assetIds }, deletedAt: null, isActive: true },
      include: { allotments: true },
    });

    let capacity = 0;
    let stopSellCount = 0;
    for (const rp of roomProducts) {
      const allot = rp.allotments.find(
        (a) => a.startDate <= today && a.endDate > today,
      );
      if (allot?.stopSell) stopSellCount += 1;
      capacity += allot?.availableCount ?? rp.baseQuantity;
    }

    const stayingTonight = await this.prisma.stayReservation.count({
      where: {
        assetId: { in: assetIds },
        status: { in: [...OCCUPYING] },
        checkIn: { lte: today },
        checkOut: { gt: today },
      },
    });

    const arrivalsNext7d = await this.prisma.stayReservation.count({
      where: {
        assetId: { in: assetIds },
        status: { in: ['confirmed', 'inquiry', 'checked_in'] },
        checkIn: { gte: today, lt: in7 },
      },
    });

    const departuresNext7d = await this.prisma.stayReservation.count({
      where: {
        assetId: { in: assetIds },
        status: { in: ['confirmed', 'checked_in'] },
        checkOut: { gte: today, lt: in7 },
      },
    });

    const mirrors = await this.prisma.supplier.findMany({
      where: { linkedOrganizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    const pendingInbound = mirrors.length
      ? await this.prisma.bookingComponent.count({
          where: {
            supplierId: { in: mirrors.map((m) => m.id) },
            status: { in: ['pending', 'requested'] },
          },
        })
      : 0;

    const sourceGroups = await this.prisma.stayReservation.groupBy({
      by: ['source'],
      where: {
        assetId: { in: assetIds },
        status: { not: 'cancelled' },
        checkIn: { gte: new Date(today.getTime() - 30 * 86400000) },
      },
      _count: true,
    });
    const bookingsBySource = {
      agency_inbound: 0,
      manual: 0,
      walk_in: 0,
    };
    for (const g of sourceGroups) {
      if (g.source in bookingsBySource) {
        bookingsBySource[g.source as keyof typeof bookingsBySource] = g._count;
      }
    }

    const trendDays = eachDay(new Date(today.getTime() - 6 * 86400000), tomorrow);
    const occupancyTrend: Array<{ date: string; percent: number }> = [];
    for (const date of trendDays) {
      const d = dayStart(date);
      const occ = await this.prisma.stayReservation.count({
        where: {
          assetId: { in: assetIds },
          status: { in: [...OCCUPYING] },
          checkIn: { lte: d },
          checkOut: { gt: d },
        },
      });
      occupancyTrend.push({
        date,
        percent: capacity > 0 ? Math.round((occ / capacity) * 100) : 0,
      });
    }

    const percent =
      capacity > 0 ? Math.round((stayingTonight / capacity) * 100) : 0;

    return {
      assets: assets.map((a) => ({ id: a.id, name: a.name, assetKind: a.assetKind })),
      occupancyTonight: {
        occupied: stayingTonight,
        capacity,
        percent,
      },
      arrivalsNext7d,
      departuresNext7d,
      pendingInbound,
      stopSellCount,
      bookingsBySource,
      occupancyTrend,
    };
  }

  // ── Availability calendar ──────────────────────────────────────────

  async availabilityCalendar(user: AuthUser, query: StayAvailabilityCalendarQuery) {
    await this.inventory.resolveAssetAccess(user, query.assetId, false);
    const from = dayStart(query.from);
    const to = dayStart(query.to);
    if (to <= from) throw new BadRequestException('to must be after from');

    const products = await this.prisma.assetRoomProduct.findMany({
      where: {
        assetId: query.assetId,
        deletedAt: null,
        isActive: true,
        ...(query.roomProductId ? { id: query.roomProductId } : {}),
      },
      include: {
        allotments: true,
        units: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    const allocations = await this.prisma.inventoryAllocation.findMany({
      where: {
        assetId: query.assetId,
        status: { in: ['hold', 'confirmed'] },
        checkIn: { not: null, lt: to },
        checkOut: { not: null, gt: from },
        ...(query.roomProductId ? { roomProductId: query.roomProductId } : {}),
      },
    });

    const days = eachDay(from, to);
    const productsOut = products.map((rp) => {
      const dayRows = days.map((date) => {
        const d = dayStart(date);
        const allot = rp.allotments.find((a) => a.startDate <= d && a.endDate > d);
        const base = allot?.availableCount ?? rp.baseQuantity;
        const stopSell = allot?.stopSell ?? false;
        const used = allocations
          .filter(
            (al) =>
              al.roomProductId === rp.id &&
              al.checkIn &&
              al.checkOut &&
              al.checkIn <= d &&
              al.checkOut > d,
          )
          .reduce((sum, al) => sum + al.quantity, 0);
        const remaining = Math.max(0, base - used);
        return {
          date,
          base,
          used,
          remaining,
          stopSell,
          overbooked: used > base,
        };
      });
      return {
        id: rp.id,
        name: rp.name,
        baseQuantity: rp.baseQuantity,
        units: rp.units,
        days: dayRows,
      };
    });

    return { assetId: query.assetId, from: query.from, to: query.to, products: productsOut };
  }

  // ── Room units ─────────────────────────────────────────────────────

  async listRoomUnits(user: AuthUser, assetId: string, roomProductId?: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    const products = await this.prisma.assetRoomProduct.findMany({
      where: {
        assetId,
        deletedAt: null,
        ...(roomProductId ? { id: roomProductId } : {}),
      },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    if (!ids.length) return [];
    return this.prisma.assetRoomUnit.findMany({
      where: { roomProductId: { in: ids }, deletedAt: null },
      include: { roomProduct: { select: { id: true, name: true } } },
      orderBy: [{ roomProductId: 'asc' }, { name: 'asc' }],
    });
  }

  async createRoomUnit(user: AuthUser, input: CreateAssetRoomUnitInput) {
    const product = await this.prisma.assetRoomProduct.findFirst({
      where: { id: input.roomProductId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Room product not found');
    await this.inventory.resolveAssetAccess(user, product.assetId, true);
    const unit = await this.prisma.assetRoomUnit.create({
      data: {
        roomProductId: input.roomProductId,
        name: input.name.trim(),
        floor: input.floor || null,
        status: input.status || 'vacant_clean',
        isActive: input.isActive ?? true,
      },
      include: { roomProduct: { select: { id: true, name: true } } },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.room_unit.create',
      entityType: 'asset_room_unit',
      entityId: unit.id,
    });
    return unit;
  }

  async updateRoomUnit(user: AuthUser, id: string, input: UpdateAssetRoomUnitInput) {
    const unit = await this.prisma.assetRoomUnit.findFirst({
      where: { id, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!unit) throw new NotFoundException('Room unit not found');
    await this.inventory.resolveAssetAccess(user, unit.roomProduct.assetId, true);
    return this.prisma.assetRoomUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.floor !== undefined ? { floor: input.floor } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { roomProduct: { select: { id: true, name: true } } },
    });
  }

  async deleteRoomUnit(user: AuthUser, id: string) {
    const unit = await this.prisma.assetRoomUnit.findFirst({
      where: { id, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!unit) throw new NotFoundException('Room unit not found');
    await this.inventory.resolveAssetAccess(user, unit.roomProduct.assetId, true);
    return this.prisma.assetRoomUnit.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ── Rate plans ─────────────────────────────────────────────────────

  async listRatePlans(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    const products = await this.prisma.assetRoomProduct.findMany({
      where: { assetId, deletedAt: null },
      select: { id: true },
    });
    return this.prisma.assetRatePlan.findMany({
      where: {
        roomProductId: { in: products.map((p) => p.id) },
        deletedAt: null,
      },
      include: { roomProduct: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createRatePlan(user: AuthUser, input: CreateAssetRatePlanInput) {
    const product = await this.prisma.assetRoomProduct.findFirst({
      where: { id: input.roomProductId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Room product not found');
    await this.inventory.resolveAssetAccess(user, product.assetId, true);
    return this.prisma.assetRatePlan.create({
      data: {
        roomProductId: input.roomProductId,
        name: input.name.trim(),
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency || 'INR',
        startDate: input.startDate ? dayStart(input.startDate) : null,
        endDate: input.endDate ? dayStart(input.endDate) : null,
        isActive: input.isActive ?? true,
        mealPlan: input.mealPlan ?? null,
        refundable: input.refundable ?? true,
        minStayNights: input.minStayNights ?? null,
        maxStayNights: input.maxStayNights ?? null,
        closedToArrival: input.closedToArrival ?? false,
        closedToDeparture: input.closedToDeparture ?? false,
        extraAdultAmount:
          input.extraAdultAmount != null
            ? new Prisma.Decimal(input.extraAdultAmount)
            : null,
        childWithBedAmount:
          input.childWithBedAmount != null
            ? new Prisma.Decimal(input.childWithBedAmount)
            : null,
        childWithoutBedAmount:
          input.childWithoutBedAmount != null
            ? new Prisma.Decimal(input.childWithoutBedAmount)
            : null,
      },
      include: { roomProduct: { select: { id: true, name: true } } },
    });
  }

  async updateRatePlan(user: AuthUser, id: string, input: UpdateAssetRatePlanInput) {
    const plan = await this.prisma.assetRatePlan.findFirst({
      where: { id, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!plan) throw new NotFoundException('Rate plan not found');
    await this.inventory.resolveAssetAccess(user, plan.roomProduct.assetId, true);
    return this.prisma.assetRatePlan.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.amount !== undefined
          ? { amount: new Prisma.Decimal(input.amount) }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? dayStart(input.startDate) : null }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? dayStart(input.endDate) : null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { roomProduct: { select: { id: true, name: true } } },
    });
  }

  async deleteRatePlan(user: AuthUser, id: string) {
    const plan = await this.prisma.assetRatePlan.findFirst({
      where: { id, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!plan) throw new NotFoundException('Rate plan not found');
    await this.inventory.resolveAssetAccess(user, plan.roomProduct.assetId, true);
    return this.prisma.assetRatePlan.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ── Reservations ───────────────────────────────────────────────────

  async listReservations(
    user: AuthUser,
    assetId: string,
    opts?: { status?: string; from?: string; to?: string },
  ) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    return this.prisma.stayReservation.findMany({
      where: {
        assetId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.from || opts?.to
          ? {
              checkIn: {
                ...(opts.from ? { gte: dayStart(opts.from) } : {}),
                ...(opts.to ? { lt: dayStart(opts.to) } : {}),
              },
            }
          : {}),
      },
      include: this.reservationInclude(),
      orderBy: [{ checkIn: 'asc' }, { guestName: 'asc' }],
    });
  }

  async createReservation(user: AuthUser, input: CreateStayReservationInput) {
    await this.inventory.resolveAssetAccess(user, input.assetId, true);
    const checkIn = dayStart(input.checkIn);
    const checkOut = dayStart(input.checkOut);
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    if (!input.guestName.trim()) {
      throw new BadRequestException('Guest name is required');
    }

    let roomProductId = input.roomProductId || null;
    let assignmentHistoryJson: Prisma.InputJsonValue | undefined;
    if (input.roomUnitId) {
      const unit = await this.prisma.assetRoomUnit.findFirst({
        where: { id: input.roomUnitId, deletedAt: null },
        include: { roomProduct: true },
      });
      if (!unit || unit.roomProduct.assetId !== input.assetId) {
        throw new BadRequestException('Room unit does not belong to this property');
      }
      if (unit.status === 'ooo') {
        throw new ConflictException('Room unit is out of order');
      }
      await this.assertUnitFreeForDates(unit.id, checkIn, checkOut);
      roomProductId = unit.roomProductId;
      assignmentHistoryJson = [
        {
          from: null,
          to: unit.id,
          at: new Date().toISOString(),
          by: user.sub,
          note: 'initial',
        },
      ];
    }

    const status = input.status || 'confirmed';
    let inventoryAllocationId: string | null = null;

    if (input.allocate !== false && ACTIVE_RES.has(status) && status !== 'inquiry') {
      try {
        const alloc = await this.inventory.allocate(user, {
          assetId: input.assetId,
          roomProductId: roomProductId || undefined,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          quantity: 1,
          status: 'confirmed',
          allowOverride: false,
        });
        inventoryAllocationId = alloc.id;
        if (!roomProductId && alloc.roomProductId) {
          roomProductId = alloc.roomProductId;
        }
      } catch (e) {
        if (status === 'confirmed') throw e;
      }
    }

    const reservation = await this.prisma.stayReservation.create({
      data: {
        assetId: input.assetId,
        roomProductId,
        roomUnitId: input.roomUnitId || null,
        checkIn,
        checkOut,
        status,
        guestName: input.guestName.trim(),
        guestPhone: input.guestPhone || null,
        guestEmail: input.guestEmail || null,
        partyId: input.partyId || null,
        source: input.source || 'manual',
        inventoryAllocationId,
        rateAmount:
          input.rateAmount != null ? new Prisma.Decimal(input.rateAmount) : null,
        currency: input.currency || 'INR',
        mealPlan: input.mealPlan || null,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        rateSnapshotJson:
          status !== 'inquiry'
            ? {
                rateAmount: input.rateAmount ?? null,
                mealPlan: input.mealPlan ?? null,
                currency: input.currency || 'INR',
                capturedAt: new Date().toISOString(),
              }
            : undefined,
        policySnapshotJson:
          status !== 'inquiry'
            ? {
                policyText: 'Property confirmation terms at booking',
                capturedAt: new Date().toISOString(),
              }
            : undefined,
        notes: input.notes || null,
        confirmationRef: input.confirmationRef || null,
        inventoryMode: input.inventoryMode || null,
        hostPresent: input.hostPresent ?? null,
        houseRulesAckAt: input.houseRulesAckAt ? new Date(input.houseRulesAckAt) : null,
        mealCutoffHours: input.mealCutoffHours ?? null,
        flexibleCheckIn: input.flexibleCheckIn ?? null,
        assignmentHistoryJson,
        createdBy: user.sub,
      },
      include: this.reservationInclude(),
    });

    if (status === 'checked_in' && reservation.roomUnitId) {
      await this.prisma.assetRoomUnit.update({
        where: { id: reservation.roomUnitId },
        data: { status: 'occupied' },
      });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.reservation.create',
      entityType: 'stay_reservation',
      entityId: reservation.id,
      metadata: { source: reservation.source, status: reservation.status },
    });

    return reservation;
  }

  async updateReservation(
    user: AuthUser,
    id: string,
    input: UpdateStayReservationInput,
  ) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);

    if (input.roomUnitId) {
      const unit = await this.prisma.assetRoomUnit.findFirst({
        where: { id: input.roomUnitId, deletedAt: null },
        include: { roomProduct: true },
      });
      if (!unit || unit.roomProduct.assetId !== existing.assetId) {
        throw new BadRequestException('Room unit does not belong to this property');
      }
      if (unit.status === 'ooo') {
        throw new ConflictException('Room unit is out of order');
      }
      const checkIn =
        input.checkIn !== undefined ? dayStart(input.checkIn) : existing.checkIn;
      const checkOut =
        input.checkOut !== undefined ? dayStart(input.checkOut) : existing.checkOut;
      await this.assertUnitFreeForDates(unit.id, checkIn, checkOut, existing.id);
    }

    if (input.status !== undefined && input.status !== existing.status) {
      assertTransition('stay_reservation', existing.status, input.status);
    }

    const unitChanging =
      input.roomUnitId !== undefined && input.roomUnitId !== existing.roomUnitId;
    let assignmentHistoryJson: Prisma.InputJsonValue | undefined;
    if (unitChanging && input.roomUnitId) {
      const history = Array.isArray(existing.assignmentHistoryJson)
        ? ([...(existing.assignmentHistoryJson as unknown[])] as unknown[])
        : [];
      history.push({
        from: existing.roomUnitId,
        to: input.roomUnitId,
        at: new Date().toISOString(),
        by: user.sub,
        note: existing.roomUnitId ? 'reassign' : 'initial',
      });
      assignmentHistoryJson = history as Prisma.InputJsonValue;
    }

    return this.prisma.stayReservation.update({
      where: { id },
      data: {
        ...(input.roomProductId !== undefined
          ? { roomProductId: input.roomProductId }
          : {}),
        ...(input.roomUnitId !== undefined ? { roomUnitId: input.roomUnitId } : {}),
        ...(assignmentHistoryJson !== undefined ? { assignmentHistoryJson } : {}),
        ...(input.checkIn !== undefined ? { checkIn: dayStart(input.checkIn) } : {}),
        ...(input.checkOut !== undefined
          ? { checkOut: dayStart(input.checkOut) }
          : {}),
        ...(input.guestName !== undefined
          ? { guestName: input.guestName.trim() }
          : {}),
        ...(input.guestPhone !== undefined ? { guestPhone: input.guestPhone } : {}),
        ...(input.guestEmail !== undefined ? { guestEmail: input.guestEmail } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rateAmount !== undefined
          ? {
              rateAmount:
                input.rateAmount != null
                  ? new Prisma.Decimal(input.rateAmount)
                  : null,
            }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.confirmationRef !== undefined
          ? { confirmationRef: input.confirmationRef }
          : {}),
        ...(input.inventoryMode !== undefined
          ? { inventoryMode: input.inventoryMode }
          : {}),
        ...(input.hostPresent !== undefined ? { hostPresent: input.hostPresent } : {}),
        ...(input.houseRulesAckAt !== undefined
          ? {
              houseRulesAckAt: input.houseRulesAckAt
                ? new Date(input.houseRulesAckAt)
                : null,
            }
          : {}),
        ...(input.mealCutoffHours !== undefined
          ? { mealCutoffHours: input.mealCutoffHours }
          : {}),
        ...(input.flexibleCheckIn !== undefined
          ? { flexibleCheckIn: input.flexibleCheckIn }
          : {}),
      },
      include: this.reservationInclude(),
    });
  }

  /** Business timeline entry for stay entities. */
  private async timeline(
    organizationId: string,
    eventType: string,
    entityType: string,
    entityId: string,
    summary: string,
    actorUserId?: string,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.businessTimelineEvent.create({
      data: {
        organizationId,
        eventType,
        entityType,
        entityId,
        summary,
        actorUserId: actorUserId ?? null,
        payloadJson: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** True if [aFrom, aTo) overlaps [bFrom, bTo). */
  private overlaps(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) {
    return aFrom < bTo && bFrom < aTo;
  }

  private async assertUnitFreeForDates(
    roomUnitId: string,
    checkIn: Date,
    checkOut: Date,
    excludeReservationId?: string,
  ) {
    const clashes = await this.prisma.stayReservation.findMany({
      where: {
        roomUnitId,
        status: { in: [...OCCUPYING] },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { id: true, checkIn: true, checkOut: true },
    });
    const clash = clashes.find((c) => this.overlaps(checkIn, checkOut, c.checkIn, c.checkOut));
    if (clash) {
      throw new ConflictException('Room unit already assigned for overlapping dates');
    }
  }

  /**
   * Verify a room product has stock for [from, to) at +1 quantity beyond what's
   * already allocated, optionally excluding the reservation's own allocation.
   */
  private async assertRoomProductAvailable(
    assetId: string,
    roomProductId: string,
    from: Date,
    to: Date,
    excludeAllocationId?: string,
  ) {
    const product = await this.prisma.assetRoomProduct.findFirst({
      where: { id: roomProductId, assetId, deletedAt: null },
      include: { allotments: true },
    });
    if (!product) throw new BadRequestException('Room product does not belong to this property');

    for (const date of eachDay(from, to)) {
      const d = dayStart(date);
      const allot = product.allotments.find((a) => a.startDate <= d && a.endDate > d);
      if (allot?.stopSell) {
        throw new ConflictException(`Stop-sell in effect on ${date}`);
      }
      const base = allot?.availableCount ?? product.baseQuantity;
      const used = await this.prisma.inventoryAllocation.aggregate({
        _sum: { quantity: true },
        where: {
          roomProductId,
          status: { in: ['hold', 'confirmed'] },
          checkIn: { lte: d },
          checkOut: { gt: d },
          ...(excludeAllocationId ? { id: { not: excludeAllocationId } } : {}),
        },
      });
      if ((used._sum.quantity ?? 0) >= base) {
        throw new ConflictException(`No room availability on ${date}`);
      }
    }
    return product;
  }

  async checkIn(user: AuthUser, id: string, input: StayCheckInInput = {}) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);

    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: existing.assetId },
      select: { profileJson: true },
    });
    const homestay =
      asset?.profileJson &&
      typeof asset.profileJson === 'object' &&
      (asset.profileJson as Record<string, unknown>).homestay &&
      typeof (asset.profileJson as Record<string, unknown>).homestay === 'object'
        ? ((asset.profileJson as { homestay: Record<string, unknown> }).homestay)
        : null;
    const houseRules =
      typeof homestay?.houseRules === 'string' ? homestay.houseRules.trim() : '';
    const requireAck = Boolean(homestay?.requireRulesAck) || houseRules.length > 0;
    let houseRulesAckAt = existing.houseRulesAckAt;
    if (requireAck && !houseRulesAckAt) {
      if (!input.houseRulesAck) {
        throw new BadRequestException({
          code: 'HOUSE_RULES_ACK_REQUIRED',
          message: 'Guest must acknowledge house rules before check-in',
          houseRules: houseRules || null,
        });
      }
      houseRulesAckAt = new Date();
    }

    let unitId = input.roomUnitId || existing.roomUnitId;
    if (!unitId) {
      throw new BadRequestException('Assign a room unit before check-in');
    }
    const unit = await this.prisma.assetRoomUnit.findFirst({
      where: { id: unitId, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!unit || unit.roomProduct.assetId !== existing.assetId) {
      throw new BadRequestException('Invalid room unit');
    }
    if (unit.status === 'ooo') {
      throw new ConflictException('Room unit is out of order');
    }
    await this.assertUnitFreeForDates(unitId, existing.checkIn, existing.checkOut, existing.id);

    assertTransition('stay_reservation', existing.status, 'checked_in');

    const unitChanging = unitId !== existing.roomUnitId;
    let assignmentHistoryJson: Prisma.InputJsonValue | undefined;
    if (unitChanging) {
      const history = Array.isArray(existing.assignmentHistoryJson)
        ? ([...(existing.assignmentHistoryJson as unknown[])] as unknown[])
        : [];
      history.push({
        from: existing.roomUnitId,
        to: unitId,
        at: new Date().toISOString(),
        by: user.sub,
        note: existing.roomUnitId ? 'check_in_reassign' : 'check_in',
      });
      assignmentHistoryJson = history as Prisma.InputJsonValue;
    }

    await this.prisma.assetRoomUnit.update({
      where: { id: unitId },
      data: { status: 'occupied' },
    });

    const roomServicePin =
      existing.roomServicePin ||
      String(1000 + Math.floor(Math.random() * 9000));

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: {
        status: 'checked_in',
        roomUnitId: unitId,
        roomProductId: unit.roomProductId,
        houseRulesAckAt,
        roomServicePin,
        ...(assignmentHistoryJson !== undefined ? { assignmentHistoryJson } : {}),
      },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayCheckedIn',
      'stay_reservation',
      id,
      `${updated.guestName} checked in to ${unit.name} · room PIN ${roomServicePin}`,
      user.sub,
    );

    return updated;
  }

  async checkOut(user: AuthUser, id: string, force = false) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);
    if (existing.status !== 'checked_in' && existing.status !== 'confirmed') {
      throw new BadRequestException('Reservation is not eligible for check-out');
    }

    if (!force) {
      const { blockers } = await this.getCheckoutBlockers(user, id);
      if (blockers.length) {
        throw new BadRequestException({
          code: 'CHECKOUT_BLOCKED',
          message: 'Resolve checkout blockers before checking out',
          blockers,
        });
      }
    }

    assertTransition('stay_reservation', existing.status, 'checked_out');

    if (existing.roomUnitId) {
      await this.prisma.assetRoomUnit.update({
        where: { id: existing.roomUnitId },
        data: { status: 'vacant_dirty' },
      });
    }

    if (existing.inventoryAllocationId) {
      if (existing.bookingComponentId) {
        await this.inventory.releaseForBooking(existing.bookingComponentId);
      } else {
        await this.prisma.inventoryAllocation.update({
          where: { id: existing.inventoryAllocationId },
          data: { status: 'released' },
        });
      }
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: { status: 'checked_out' },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayCheckedOut',
      'stay_reservation',
      id,
      `${updated.guestName} checked out`,
      user.sub,
    );

    return updated;
  }

  /**
   * Blockers/warnings that should be surfaced before a reservation can check out.
   */
  async getCheckoutBlockers(user: AuthUser, id: string) {
    const res = await this.prisma.stayReservation.findFirst({
      where: { id },
      include: { folioCharges: true, roomUnit: true },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, res.assetId, false);

    const blockers: Array<{ code: string; message: string; severity: 'blocker' }> = [];
    const warnings: Array<{ code: string; message: string; severity: 'warning' }> = [];

    const charges = res.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const paid = Number(res.amountPaid);
    const outstanding = Math.max(0, charges - paid);
    if (outstanding > 0.001) {
      blockers.push({
        code: 'OUTSTANDING_BALANCE',
        message: `Outstanding folio balance of ${outstanding.toFixed(2)} ${res.currency}`,
        severity: 'blocker',
      });
    }

    if (!res.roomUnitId) {
      blockers.push({
        code: 'MISSING_UNIT',
        message: 'No room unit assigned to this reservation',
        severity: 'blocker',
      });
    }

    if (!res.guestName || !res.guestName.trim()) {
      blockers.push({
        code: 'MISSING_GUEST_NAME',
        message: 'Guest name is required',
        severity: 'blocker',
      });
    }

    if (res.roomUnitId) {
      const openMaintenance = await this.prisma.maintenanceWorkOrder.findFirst({
        where: {
          roomUnitId: res.roomUnitId,
          blockInventory: true,
          status: { in: ['open', 'assigned', 'in_progress'] },
        },
      });
      if (openMaintenance) {
        blockers.push({
          code: 'OPEN_MAINTENANCE',
          message: `Open maintenance blocking unit: ${openMaintenance.title}`,
          severity: 'blocker',
        });
      }
    }

    if (!res.guestPhone && !res.guestEmail) {
      warnings.push({
        code: 'MISSING_CONTACT',
        message: 'No guest phone or email on file',
        severity: 'warning',
      });
    }

    return { blockers, warnings };
  }

  async cancelReservation(user: AuthUser, id: string) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);
    assertTransition('stay_reservation', existing.status, 'cancelled');

    if (existing.inventoryAllocationId) {
      if (existing.bookingComponentId) {
        await this.inventory.releaseForBooking(existing.bookingComponentId);
      } else {
        await this.prisma.inventoryAllocation.update({
          where: { id: existing.inventoryAllocationId },
          data: { status: 'released' },
        });
      }
    }

    if (existing.roomUnitId && existing.status === 'checked_in') {
      await this.prisma.assetRoomUnit.update({
        where: { id: existing.roomUnitId },
        data: { status: 'vacant_dirty' },
      });
    }

    return this.prisma.stayReservation.update({
      where: { id },
      data: { status: 'cancelled' },
      include: this.reservationInclude(),
    });
  }

  // ── Named modify ops (Independent OS Phase 1) ──────────────────────

  private async loadModifiable(user: AuthUser, id: string) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);
    if (!MODIFIABLE.has(existing.status)) {
      throw new BadRequestException(
        `Reservation in status "${existing.status}" cannot be modified`,
      );
    }
    return existing;
  }

  private appendNote(existing: string | null, addition?: string | null) {
    if (!addition) return existing;
    const stamp = new Date().toISOString();
    const line = `[${stamp}] ${addition}`;
    return existing ? `${existing}\n${line}` : line;
  }

  /** Push extra nights onto checkOut; adjusts inventory allocation + folio room charge. */
  async extendStay(user: AuthUser, id: string, input: ExtendStayInput) {
    const existing = await this.loadModifiable(user, id);
    const newCheckOut = dayStart(input.newCheckOut);
    if (newCheckOut <= existing.checkOut) {
      throw new BadRequestException('newCheckOut must be after the current check-out date');
    }
    const addedNights = eachDay(existing.checkOut, newCheckOut).length;

    if (existing.roomProductId) {
      await this.assertRoomProductAvailable(
        existing.assetId,
        existing.roomProductId,
        existing.checkOut,
        newCheckOut,
        existing.inventoryAllocationId || undefined,
      );
    }
    if (existing.roomUnitId) {
      await this.assertUnitFreeForDates(
        existing.roomUnitId,
        existing.checkOut,
        newCheckOut,
        existing.id,
      );
    }

    if (existing.inventoryAllocationId) {
      await this.prisma.inventoryAllocation.update({
        where: { id: existing.inventoryAllocationId },
        data: { checkOut: newCheckOut },
      });
    }

    if (existing.rateAmount) {
      await this.prisma.folioCharge.create({
        data: {
          stayReservationId: id,
          description: `Stay extended: +${addedNights} night(s) to ${isoDate(newCheckOut)}`,
          category: 'room',
          amount: new Prisma.Decimal(Number(existing.rateAmount) * addedNights),
          taxAmount: 0,
          currency: existing.currency,
          createdBy: user.sub,
        },
      });
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: {
        checkOut: newCheckOut,
        notes: this.appendNote(existing.notes, input.note),
      },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayExtended',
      'stay_reservation',
      id,
      `Stay extended by ${addedNights} night(s) to ${isoDate(newCheckOut)}`,
      user.sub,
      { addedNights, newCheckOut: isoDate(newCheckOut) },
    );
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.reservation.extend',
      entityType: 'stay_reservation',
      entityId: id,
      metadata: { addedNights, newCheckOut: isoDate(newCheckOut) },
    });

    return updated;
  }

  /** Pull checkOut earlier than planned; credits unused room nights on the folio. */
  async earlyDeparture(user: AuthUser, id: string, input: EarlyDepartureInput) {
    const existing = await this.loadModifiable(user, id);
    const newCheckOut = dayStart(input.newCheckOut);
    if (newCheckOut <= existing.checkIn) {
      throw new BadRequestException('newCheckOut must be after check-in');
    }
    if (newCheckOut >= existing.checkOut) {
      throw new BadRequestException('newCheckOut must be before the current check-out date');
    }
    const droppedNights = eachDay(newCheckOut, existing.checkOut).length;

    if (existing.inventoryAllocationId) {
      await this.prisma.inventoryAllocation.update({
        where: { id: existing.inventoryAllocationId },
        data: { checkOut: newCheckOut },
      });
    }

    if (existing.rateAmount) {
      await this.prisma.folioCharge.create({
        data: {
          stayReservationId: id,
          description: `Early departure: -${droppedNights} night(s) from ${isoDate(newCheckOut)}${
            input.note ? ` (${input.note})` : ''
          }`,
          category: 'room',
          amount: new Prisma.Decimal(-(Number(existing.rateAmount) * droppedNights)),
          taxAmount: 0,
          currency: existing.currency,
          createdBy: user.sub,
        },
      });
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: {
        checkOut: newCheckOut,
        notes: this.appendNote(existing.notes, input.note),
      },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayEarlyDeparture',
      'stay_reservation',
      id,
      `Early departure — ${droppedNights} night(s) dropped, new check-out ${isoDate(newCheckOut)}`,
      user.sub,
      { droppedNights, newCheckOut: isoDate(newCheckOut), note: input.note ?? null },
    );
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.reservation.early_departure',
      entityType: 'stay_reservation',
      entityId: id,
      metadata: { droppedNights, newCheckOut: isoDate(newCheckOut) },
    });

    return updated;
  }

  /** Move the reservation to a different sellable room product (rate/allotment change). */
  async changeRoomProduct(user: AuthUser, id: string, input: ChangeRoomProductInput) {
    const existing = await this.loadModifiable(user, id);
    if (existing.roomProductId === input.roomProductId) {
      throw new BadRequestException('Reservation is already on this room product');
    }
    const newProduct = await this.assertRoomProductAvailable(
      existing.assetId,
      input.roomProductId,
      existing.checkIn,
      existing.checkOut,
    );

    const oldProductId = existing.roomProductId;
    let nextUnitId = existing.roomUnitId;
    if (existing.roomUnitId) {
      const unit = await this.prisma.assetRoomUnit.findFirst({
        where: { id: existing.roomUnitId },
      });
      if (!unit || unit.roomProductId !== input.roomProductId) {
        nextUnitId = null;
        if (existing.status === 'checked_in' && unit) {
          await this.prisma.assetRoomUnit.update({
            where: { id: unit.id },
            data: { status: 'vacant_dirty' },
          });
        }
      }
    }

    if (existing.inventoryAllocationId) {
      await this.prisma.inventoryAllocation.update({
        where: { id: existing.inventoryAllocationId },
        data: { roomProductId: input.roomProductId },
      });
    }

    const nights = eachDay(existing.checkIn, existing.checkOut).length;
    if (newProduct.rateHint != null && existing.rateAmount != null) {
      const diff = Number(newProduct.rateHint) - Number(existing.rateAmount);
      if (diff !== 0) {
        await this.prisma.folioCharge.create({
          data: {
            stayReservationId: id,
            description: `Room type change adjustment (${nights} night(s))`,
            category: 'room',
            amount: new Prisma.Decimal(diff * nights),
            taxAmount: 0,
            currency: existing.currency,
            createdBy: user.sub,
          },
        });
      }
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: {
        roomProductId: input.roomProductId,
        roomUnitId: nextUnitId,
        rateAmount: newProduct.rateHint != null ? newProduct.rateHint : existing.rateAmount,
        notes: this.appendNote(existing.notes, input.note),
      },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayRoomProductChanged',
      'stay_reservation',
      id,
      `Room type changed to ${newProduct.name}`,
      user.sub,
      { fromRoomProductId: oldProductId, toRoomProductId: input.roomProductId },
    );
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.reservation.change_room_product',
      entityType: 'stay_reservation',
      entityId: id,
      metadata: { fromRoomProductId: oldProductId, toRoomProductId: input.roomProductId },
    });

    return updated;
  }

  /**
   * Reassign the physical unit without changing the sold room product
   * (sell-vs-assign: e.g. moving a guest to another room of the same type).
   */
  async moveUnit(user: AuthUser, id: string, input: MoveUnitInput) {
    const existing = await this.loadModifiable(user, id);
    const unit = await this.prisma.assetRoomUnit.findFirst({
      where: { id: input.roomUnitId, deletedAt: null },
      include: { roomProduct: true },
    });
    if (!unit || unit.roomProduct.assetId !== existing.assetId) {
      throw new BadRequestException('Room unit does not belong to this property');
    }
    if (existing.roomProductId && unit.roomProductId !== existing.roomProductId) {
      throw new BadRequestException(
        'Target unit is on a different room product — use changeRoomProduct instead',
      );
    }
    if (unit.status === 'ooo') {
      throw new ConflictException('Room unit is out of order');
    }
    if (unit.id === existing.roomUnitId) {
      throw new BadRequestException('Reservation is already on this unit');
    }
    await this.assertUnitFreeForDates(unit.id, existing.checkIn, existing.checkOut, existing.id);

    const fromUnitId = existing.roomUnitId;
    const history = Array.isArray(existing.assignmentHistoryJson)
      ? (existing.assignmentHistoryJson as unknown[])
      : [];
    history.push({
      from: fromUnitId,
      to: unit.id,
      at: new Date().toISOString(),
      by: user.sub,
      note: input.note ?? null,
    });

    if (existing.status === 'checked_in') {
      if (fromUnitId) {
        await this.prisma.assetRoomUnit.update({
          where: { id: fromUnitId },
          data: { status: 'vacant_dirty' },
        });
      }
      await this.prisma.assetRoomUnit.update({
        where: { id: unit.id },
        data: { status: 'occupied' },
      });
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: {
        roomUnitId: unit.id,
        roomProductId: existing.roomProductId || unit.roomProductId,
        assignmentHistoryJson: history as Prisma.InputJsonValue,
        notes: this.appendNote(existing.notes, input.note),
      },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayUnitMoved',
      'stay_reservation',
      id,
      `Moved from unit ${fromUnitId ?? '(unassigned)'} to ${unit.name}`,
      user.sub,
      { fromUnitId, toUnitId: unit.id },
    );
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.reservation.move_unit',
      entityType: 'stay_reservation',
      entityId: id,
      metadata: { fromUnitId, toUnitId: unit.id },
    });

    return updated;
  }

  /** Update adults/children with a best-effort rate + folio delta from the active rate plan. */
  async changeOccupancy(user: AuthUser, id: string, input: ChangeOccupancyInput) {
    const existing = await this.loadModifiable(user, id);
    const nextAdults = input.adults ?? existing.adults;
    const nextChildren = input.children ?? existing.children;

    if (existing.roomProductId) {
      const product = await this.prisma.assetRoomProduct.findFirst({
        where: { id: existing.roomProductId },
      });
      if (product && nextAdults > product.maxOccupancy) {
        throw new BadRequestException(
          `Max occupancy for this room type is ${product.maxOccupancy}`,
        );
      }
    }

    const nights = eachDay(existing.checkIn, existing.checkOut).length;
    let delta = 0;
    if (existing.roomProductId) {
      const plan = await this.prisma.assetRatePlan.findFirst({
        where: {
          roomProductId: existing.roomProductId,
          isActive: true,
          ...(existing.mealPlan ? { mealPlan: existing.mealPlan } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (plan) {
        const extraAdultDelta = (nextAdults - existing.adults) * Number(plan.extraAdultAmount || 0);
        const extraChildDelta =
          (nextChildren - existing.children) * Number(plan.childWithBedAmount || 0);
        delta = (extraAdultDelta + extraChildDelta) * nights;
      }
    }

    if (delta !== 0) {
      await this.prisma.folioCharge.create({
        data: {
          stayReservationId: id,
          description: `Occupancy change: ${existing.adults}A/${existing.children}C → ${nextAdults}A/${nextChildren}C`,
          category: 'other',
          amount: new Prisma.Decimal(delta),
          taxAmount: 0,
          currency: existing.currency,
          createdBy: user.sub,
        },
      });
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: { adults: nextAdults, children: nextChildren },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayOccupancyChanged',
      'stay_reservation',
      id,
      `Occupancy changed to ${nextAdults} adult(s), ${nextChildren} child(ren)`,
      user.sub,
      { adults: nextAdults, children: nextChildren, folioDelta: delta },
    );

    return updated;
  }

  /** Change meal plan with a best-effort rate + folio delta from a matching rate plan. */
  async changeMealPlan(user: AuthUser, id: string, input: ChangeMealPlanInput) {
    const existing = await this.loadModifiable(user, id);
    if (existing.mealPlan === input.mealPlan) {
      throw new BadRequestException('Reservation is already on this meal plan');
    }
    const nights = eachDay(existing.checkIn, existing.checkOut).length;

    let nextRateAmount = existing.rateAmount;
    if (existing.roomProductId) {
      const plan = await this.prisma.assetRatePlan.findFirst({
        where: {
          roomProductId: existing.roomProductId,
          mealPlan: input.mealPlan,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (plan) {
        const diff = Number(plan.amount) - Number(existing.rateAmount || 0);
        if (diff !== 0) {
          await this.prisma.folioCharge.create({
            data: {
              stayReservationId: id,
              description: `Meal plan changed to ${input.mealPlan} (${nights} night(s))`,
              category: 'meal',
              amount: new Prisma.Decimal(diff * nights),
              taxAmount: 0,
              currency: existing.currency,
              createdBy: user.sub,
            },
          });
        }
        nextRateAmount = plan.amount;
      }
    }

    const updated = await this.prisma.stayReservation.update({
      where: { id },
      data: { mealPlan: input.mealPlan, rateAmount: nextRateAmount },
      include: this.reservationInclude(),
    });

    await this.timeline(
      user.organizationId,
      'StayMealPlanChanged',
      'stay_reservation',
      id,
      `Meal plan changed from ${existing.mealPlan ?? 'none'} to ${input.mealPlan}`,
      user.sub,
      { fromMealPlan: existing.mealPlan, toMealPlan: input.mealPlan },
    );

    return updated;
  }

  /**
   * Cancel a single room out of a (potentially multi-room) stay, bridging a
   * CancellationCase so downstream commerce/finance can apply policy.
   */
  async partialCancelRoom(user: AuthUser, id: string, input: PartialCancelRoomInput) {
    const existing = await this.prisma.stayReservation.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, existing.assetId, true);

    const cancellationCase = await this.prisma.cancellationCase.create({
      data: {
        organizationId: user.organizationId,
        scope: 'stay_room',
        requestedBy: user.sub,
        reason: input.reason || null,
        affectedEntitiesJson: { stayReservationId: id, assetId: existing.assetId },
        approvalStatus: 'approved',
        executionStatus: 'applied',
        createdBy: user.sub,
      },
    });

    const cancelled = await this.cancelReservation(user, id);

    await this.timeline(
      user.organizationId,
      'StayRoomPartiallyCancelled',
      'stay_reservation',
      id,
      `Room cancelled${input.reason ? `: ${input.reason}` : ''}`,
      user.sub,
      { cancellationCaseId: cancellationCase.id, reason: input.reason ?? null },
    );

    return { reservation: cancelled, cancellationCase };
  }

  async getFolio(user: AuthUser, stayReservationId: string) {
    const res = await this.prisma.stayReservation.findFirst({
      where: { id: stayReservationId, asset: { organizationId: user.organizationId } },
      include: { folioCharges: true, roomUnit: true, roomProduct: true },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    await this.inventory.resolveAssetAccess(user, res.assetId, false);

    const roomCharge = Number(res.rateAmount || 0);
    const extras = res.folioCharges.reduce(
      (s, c) => s + Number(c.amount) + Number(c.taxAmount),
      0,
    );
    const charges = extras;
    const paid = Number(res.amountPaid);
    return {
      reservation: res,
      roomCharge,
      extras,
      charges,
      paid,
      outstanding: Math.max(0, charges - paid),
      total: roomCharge + extras,
      currency: res.currency,
    };
  }

  async issueInvoice(user: AuthUser, id: string) {
    const folio = await this.getFolio(user, id);
    const res = folio.reservation;
    const amount = folio.charges > 0 ? folio.charges : folio.total;
    return this.prisma.commercialDocument.create({
      data: {
        organizationId: user.organizationId,
        docType: 'invoice',
        direction: 'receivable',
        counterpartyPartyId: res.partyId,
        linkedEntityType: 'stay_reservation',
        linkedEntityId: id,
        label: `Stay invoice — ${res.guestName}`,
        amount,
        currency: res.currency,
        createdBy: user.sub,
      },
    });
  }

  async recordPayment(user: AuthUser, id: string, input: RecordStayPaymentInput) {
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
        linkedEntityType: 'stay_reservation',
        linkedEntityId: id,
        createdBy: user.sub,
      },
    });

    await this.prisma.stayReservation.update({
      where: { id },
      data: { amountPaid: { increment: input.amount } },
    });

    const openInvoice = await this.prisma.commercialDocument.findFirst({
      where: {
        organizationId: user.organizationId,
        linkedEntityType: 'stay_reservation',
        linkedEntityId: id,
        docType: 'invoice',
        status: { in: ['open', 'partial'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (openInvoice) {
      const docOpen =
        Number(openInvoice.amount) +
        Number(openInvoice.taxAmount) -
        Number(openInvoice.amountPaid);
      const allocAmount = Math.min(input.amount, Math.max(0, docOpen));
      if (allocAmount > 0.001) {
        try {
          await this.commerce.allocatePayment(user.organizationId, {
            paymentId: payment.id,
            commercialDocumentId: openInvoice.id,
            amount: allocAmount,
          });
        } catch {
          // Soft folio payment still recorded if document allocation is rejected
        }
      }
    }

    await this.timeline(
      user.organizationId,
      'StayPaymentReceived',
      'stay_reservation',
      id,
      `Payment ${input.amount}`,
      user.sub,
    );

    return { payment, folio: await this.getFolio(user, id) };
  }

  async listDayCloses(user: AuthUser, assetId: string) {
    await this.inventory.resolveAssetAccess(user, assetId, false);
    return this.prisma.propertyDayClose.findMany({
      where: { assetId },
      orderBy: { businessDate: 'desc' },
      take: 14,
    });
  }

  /**
   * Merge homestay/farmstay attributes into the asset's profileJson
   * (house rules, host presence defaults, meal cutoff, etc.).
   */
  async updateHomestayAttrs(user: AuthUser, assetId: string, input: HomestayAttrsInput) {
    const { asset } = await this.inventory.resolveAssetAccess(user, assetId, true);
    const profile = (asset.profileJson as Record<string, unknown> | null) || {};
    const homestay = {
      ...(typeof profile.homestay === 'object' && profile.homestay ? profile.homestay : {}),
      ...input,
    };
    const nextProfile = { ...profile, homestay };
    return this.prisma.partnerAsset.update({
      where: { id: assetId },
      data: { profileJson: nextProfile as Prisma.InputJsonValue },
    });
  }

  // ── PropertyDayClose ─────────────────────────────────────────────────

  /**
   * End-of-day close-out for a property's front office:
   *  1. Posts night room charges for in-house (checked_in) reservations
   *  2. Marks no-shows for confirmed arrivals that never checked in
   *  3. Records unresolved arrivals / unpaid departures for the day
   */
  async closePropertyDay(user: AuthUser, assetId: string, businessDate: string) {
    await this.inventory.resolveAssetAccess(user, assetId, true);
    const day = dayStart(businessDate);

    const already = await this.prisma.propertyDayClose.findUnique({
      where: { assetId_businessDate: { assetId, businessDate: day } },
    });
    if (already) {
      throw new BadRequestException(`Business date ${isoDate(day)} is already closed`);
    }

    const inHouse = await this.prisma.stayReservation.findMany({
      where: {
        assetId,
        status: 'checked_in',
        checkIn: { lte: day },
        checkOut: { gt: day },
      },
    });

    let postedRoomCharges = 0;
    const marker = `night of ${isoDate(day)}`;
    for (const res of inHouse) {
      if (!res.rateAmount) continue;
      const already = await this.prisma.folioCharge.findFirst({
        where: { stayReservationId: res.id, category: 'room', description: { contains: marker } },
      });
      if (already) continue;
      await this.prisma.folioCharge.create({
        data: {
          stayReservationId: res.id,
          description: `Room charge — ${marker}`,
          category: 'room',
          amount: res.rateAmount,
          taxAmount: 0,
          currency: res.currency,
          createdBy: user.sub,
        },
      });
      postedRoomCharges += 1;
    }

    const noShowCandidates = await this.prisma.stayReservation.findMany({
      where: { assetId, status: 'confirmed', checkIn: day },
    });
    let noShowsMarked = 0;
    for (const res of noShowCandidates) {
      if (!canTransition('stay_reservation', res.status, 'no_show')) continue;
      await this.prisma.stayReservation.update({
        where: { id: res.id },
        data: { status: 'no_show' },
      });
      if (res.inventoryAllocationId) {
        await this.prisma.inventoryAllocation.update({
          where: { id: res.inventoryAllocationId },
          data: { status: 'released' },
        });
      }
      noShowsMarked += 1;
    }

    const unresolvedArrivals = await this.prisma.stayReservation.findMany({
      where: {
        assetId,
        checkIn: day,
        status: { in: ['inquiry', 'tentative', 'held', 'confirmed'] },
      },
      select: { id: true, guestName: true, status: true },
    });

    const departuresToday = await this.prisma.stayReservation.findMany({
      where: { assetId, checkOut: day, status: { in: ['checked_out', 'checked_in'] } },
      include: { folioCharges: true },
    });
    const unpaidDepartures = departuresToday
      .map((r) => {
        const charges = r.folioCharges.reduce(
          (s, c) => s + Number(c.amount) + Number(c.taxAmount),
          0,
        );
        const outstanding = Math.max(0, charges - Number(r.amountPaid));
        return { id: r.id, guestName: r.guestName, outstanding };
      })
      .filter((r) => r.outstanding > 0.001);

    const summary = {
      inHouseCount: inHouse.length,
      postedRoomCharges,
      noShowsMarked,
      unresolvedArrivalsCount: unresolvedArrivals.length,
      unpaidDeparturesCount: unpaidDepartures.length,
    };

    const dayClose = await this.prisma.propertyDayClose.create({
      data: {
        assetId,
        businessDate: day,
        postedRoomCharges,
        noShowsMarked,
        unresolvedArrivalsJson: unresolvedArrivals as unknown as Prisma.InputJsonValue,
        unpaidDeparturesJson: unpaidDepartures as unknown as Prisma.InputJsonValue,
        summaryJson: summary as Prisma.InputJsonValue,
        closedBy: user.sub,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'stay.property_day.close',
      entityType: 'property_day_close',
      entityId: dayClose.id,
      metadata: { assetId, businessDate: isoDate(day), ...summary },
    });
    await this.timeline(
      user.organizationId,
      'PropertyDayClosed',
      'partner_asset',
      assetId,
      `Business date ${isoDate(day)} closed`,
      user.sub,
      summary,
    );

    return dayClose;
  }

  /**
   * After inbound confirm allocates inventory, upsert partner StayReservation.
   */
  async syncFromInboundBooking(
    user: AuthUser,
    booking: {
      id: string;
      title: string;
      status: string;
      confirmationRef: string | null;
      partnerAssetId: string | null;
      startAt: Date | null;
      endAt: Date | null;
    },
  ) {
    if (booking.status === 'cancelled') {
      const existing = await this.prisma.stayReservation.findFirst({
        where: { bookingComponentId: booking.id },
      });
      if (existing && canTransition('stay_reservation', existing.status, 'cancelled')) {
        return this.cancelReservation(user, existing.id);
      }
      return null;
    }
    if (booking.status !== 'confirmed') return null;

    const assetId = booking.partnerAssetId;
    if (!assetId || !booking.startAt || !booking.endAt) return null;

    const allocation = await this.prisma.inventoryAllocation.findFirst({
      where: {
        bookingComponentId: booking.id,
        status: { in: ['hold', 'confirmed'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const existing = await this.prisma.stayReservation.findFirst({
      where: { bookingComponentId: booking.id },
    });

    const data = {
      assetId,
      roomProductId: allocation?.roomProductId || null,
      checkIn: dayStart(isoDate(booking.startAt)),
      checkOut: dayStart(isoDate(booking.endAt)),
      status: 'confirmed' as const,
      guestName: booking.title.slice(0, 120) || 'Agency guest',
      source: 'agency_inbound' as const,
      bookingComponentId: booking.id,
      inventoryAllocationId: allocation?.id || null,
      confirmationRef: booking.confirmationRef,
      createdBy: user.sub,
    };

    if (existing) {
      return this.prisma.stayReservation.update({
        where: { id: existing.id },
        data: {
          ...data,
          guestName: existing.guestName || data.guestName,
        },
        include: this.reservationInclude(),
      });
    }

    return this.prisma.stayReservation.create({
      data,
      include: this.reservationInclude(),
    });
  }
}
