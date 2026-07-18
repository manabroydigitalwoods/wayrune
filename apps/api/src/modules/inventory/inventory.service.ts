import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AllocateInventoryInput,
  CreateAssetAllotmentInput,
  CreateAssetCalendarBlockInput,
  CreateAssetFleetUnitInput,
  CreateAssetRoomProductInput,
  CreateAssetServiceOfferInput,
  EnsureShadowAssetInput,
  UpdateAssetAllotmentInput,
  UpdateAssetFleetUnitInput,
  UpdateAssetRoomProductInput,
  UpdateAssetServiceOfferInput,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/helpers';

const STAY_KINDS = new Set(['hotel', 'homestay', 'farmstay']);
const FLEET_KINDS = new Set(['vehicle', 'car_rental']);
const ACTIVE_ALLOC = new Set(['hold', 'confirmed']);

function dayStart(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
  return d;
}

function datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function supplierTypeToAssetKind(type: string) {
  if (STAY_KINDS.has(type)) return type;
  if (type === 'car_rental' || type === 'transfer') return 'vehicle';
  if (type === 'driver') return 'driver';
  if (type === 'restaurant') return 'restaurant';
  return 'other';
}

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private isAgency(user: AuthUser) {
    return !user.organizationKind || user.organizationKind === 'travel_agency';
  }

  /** Load asset and decide whether user may write inventory. */
  async resolveAssetAccess(
    user: AuthUser,
    assetId: string,
    write: boolean | 'manage' | 'allocate',
  ) {
    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Partner asset not found');

    if (asset.organizationId === user.organizationId) {
      // Property/branch scope (RBAC Integrity 1.0 / P1-3): when a membership is
      // scoped to specific PartnerAssets, deny access to assets outside that
      // set. An empty scope means org-wide, so single-property partners and
      // legacy tokens are unaffected.
      const scopes = user.propertyScopes ?? [];
      if (scopes.length && !scopes.includes(asset.id)) {
        throw new ForbiddenException('You are not assigned to this property');
      }
      return { asset, canWrite: true };
    }

    if (this.isAgency(user)) {
      const linked = await this.prisma.supplier.findFirst({
        where: {
          organizationId: user.organizationId,
          linkedAssetId: assetId,
          deletedAt: null,
        },
      });
      if (!linked) throw new ForbiddenException('Asset is not linked to your agency');
      if (write === 'allocate') {
        return { asset, canWrite: true };
      }
      if (write === true || write === 'manage') {
        throw new ForbiddenException(
          'This inventory is managed by the partner. Switch to their workspace or request a hold.',
        );
      }
      return { asset, canWrite: false };
    }

    throw new ForbiddenException('Not allowed to access this asset');
  }

  async ensureShadowAsset(user: AuthUser, input: EnsureShadowAssetInput) {
    if (!this.isAgency(user)) {
      throw new ForbiddenException('Only agencies create local shadow assets');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (supplier.linkedAssetId) {
      const existing = await this.prisma.partnerAsset.findFirst({
        where: { id: supplier.linkedAssetId, deletedAt: null },
      });
      if (existing) return existing;
    }

    const asset = await this.prisma.partnerAsset.create({
      data: {
        organizationId: user.organizationId,
        name: supplier.name,
        assetKind: supplierTypeToAssetKind(supplier.type),
        placeId: supplier.placeId,
        profileJson: supplier.profileJson ?? undefined,
        isActive: true,
        createdBy: user.sub,
      },
    });

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { linkedAssetId: asset.id },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'inventory.shadow_asset',
      entityType: 'partner_asset',
      entityId: asset.id,
      metadata: { supplierId: supplier.id },
    });

    return asset;
  }

  async listRoomProducts(user: AuthUser, assetId: string) {
    await this.resolveAssetAccess(user, assetId, false);
    return this.prisma.assetRoomProduct.findMany({
      where: { assetId, deletedAt: null },
      include: { allotments: { orderBy: { startDate: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createRoomProduct(user: AuthUser, input: CreateAssetRoomProductInput) {
    await this.resolveAssetAccess(user, input.assetId, true);
    return this.prisma.assetRoomProduct.create({
      data: {
        assetId: input.assetId,
        name: input.name.trim(),
        roomTypeKey: input.roomTypeKey || null,
        maxOccupancy: input.maxOccupancy ?? 2,
        bedConfig: input.bedConfig || null,
        baseQuantity: input.baseQuantity ?? 1,
        rateHint:
          input.rateHint == null ? null : new Prisma.Decimal(input.rateHint),
        isActive: input.isActive ?? true,
      },
      include: { allotments: true },
    });
  }

  async updateRoomProduct(
    user: AuthUser,
    id: string,
    input: UpdateAssetRoomProductInput,
  ) {
    const product = await this.prisma.assetRoomProduct.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Room product not found');
    await this.resolveAssetAccess(user, product.assetId, true);
    return this.prisma.assetRoomProduct.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.roomTypeKey !== undefined ? { roomTypeKey: input.roomTypeKey } : {}),
        ...(input.maxOccupancy !== undefined ? { maxOccupancy: input.maxOccupancy } : {}),
        ...(input.bedConfig !== undefined ? { bedConfig: input.bedConfig } : {}),
        ...(input.baseQuantity !== undefined ? { baseQuantity: input.baseQuantity } : {}),
        ...(input.rateHint !== undefined
          ? { rateHint: input.rateHint == null ? null : new Prisma.Decimal(input.rateHint) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { allotments: { orderBy: { startDate: 'asc' } } },
    });
  }

  async createAllotment(user: AuthUser, input: CreateAssetAllotmentInput) {
    const product = await this.prisma.assetRoomProduct.findFirst({
      where: { id: input.roomProductId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Room product not found');
    await this.resolveAssetAccess(user, product.assetId, true);
    const startDate = dayStart(input.startDate);
    const endDate = dayStart(input.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this.prisma.assetAllotment.create({
      data: {
        roomProductId: product.id,
        startDate,
        endDate,
        availableCount: input.availableCount,
        stopSell: input.stopSell ?? false,
      },
    });
  }

  async updateAllotment(user: AuthUser, id: string, input: UpdateAssetAllotmentInput) {
    const allotment = await this.prisma.assetAllotment.findFirst({
      where: { id },
      include: { roomProduct: true },
    });
    if (!allotment) throw new NotFoundException('Allotment not found');
    await this.resolveAssetAccess(user, allotment.roomProduct.assetId, true);
    const startDate = input.startDate ? dayStart(input.startDate) : allotment.startDate;
    const endDate = input.endDate ? dayStart(input.endDate) : allotment.endDate;
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this.prisma.assetAllotment.update({
      where: { id },
      data: {
        startDate,
        endDate,
        ...(input.availableCount !== undefined
          ? { availableCount: input.availableCount }
          : {}),
        ...(input.stopSell !== undefined ? { stopSell: input.stopSell } : {}),
      },
    });
  }

  async deleteAllotment(user: AuthUser, id: string) {
    const allotment = await this.prisma.assetAllotment.findFirst({
      where: { id },
      include: { roomProduct: true },
    });
    if (!allotment) throw new NotFoundException('Allotment not found');
    await this.resolveAssetAccess(user, allotment.roomProduct.assetId, true);
    await this.prisma.assetAllotment.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveAssetIdFromQuery(
    user: AuthUser,
    assetId?: string,
    supplierId?: string,
  ) {
    if (assetId) {
      await this.resolveAssetAccess(user, assetId, false);
      return assetId;
    }
    if (!supplierId) {
      throw new BadRequestException('assetId or supplierId is required');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        ...(this.isAgency(user)
          ? { organizationId: user.organizationId }
          : {}),
        deletedAt: null,
      },
    });
    if (!supplier?.linkedAssetId) {
      return null;
    }
    await this.resolveAssetAccess(user, supplier.linkedAssetId, false);
    return supplier.linkedAssetId;
  }

  /**
   * Remaining rooms per product for [from, to) stay nights.
   * remaining = min covering allotment availableCount − active allocations overlapping, floored at 0.
   * Products without covering allotment fall back to baseQuantity − allocations.
   */
  async availability(
    user: AuthUser,
    query: { assetId?: string; supplierId?: string; from: string; to: string; guests?: number },
  ) {
    const assetId = await this.resolveAssetIdFromQuery(
      user,
      query.assetId,
      query.supplierId,
    );
    if (!assetId) {
      return { assetId: null, products: [], message: 'No linked inventory asset' };
    }
    const from = dayStart(query.from);
    const to = dayStart(query.to);
    if (to <= from) throw new BadRequestException('to must be after from');

    const products = await this.prisma.assetRoomProduct.findMany({
      where: {
        assetId,
        deletedAt: null,
        isActive: true,
        ...(query.guests ? { maxOccupancy: { gte: query.guests } } : {}),
      },
      include: { allotments: true },
      orderBy: { name: 'asc' },
    });

    const allocations = await this.prisma.inventoryAllocation.findMany({
      where: {
        assetId,
        roomProductId: { not: null },
        status: { in: [...ACTIVE_ALLOC] },
        checkIn: { not: null },
        checkOut: { not: null },
      },
    });

    const rows = products.map((p) => {
      const covering = p.allotments.filter(
        (a) => !a.stopSell && a.startDate <= from && a.endDate >= to,
      );
      const capacity =
        covering.length > 0
          ? Math.min(...covering.map((a) => a.availableCount))
          : p.baseQuantity;

      const used = allocations
        .filter(
          (al) =>
            al.roomProductId === p.id &&
            al.checkIn &&
            al.checkOut &&
            datesOverlap(from, to, al.checkIn, al.checkOut),
        )
        .reduce((s, al) => s + al.quantity, 0);

      const remaining = Math.max(0, capacity - used);
      return {
        roomProductId: p.id,
        name: p.name,
        maxOccupancy: p.maxOccupancy,
        rateHint: p.rateHint,
        capacity,
        used,
        remaining,
        stopSell: covering.some((a) => a.stopSell) || remaining === 0,
      };
    });

    return { assetId, from, to, products: rows };
  }

  async allocate(user: AuthUser, input: AllocateInventoryInput) {
    const assetId = await this.resolveAssetIdFromQuery(
      user,
      input.assetId,
      input.supplierId,
    );
    if (!assetId) throw new BadRequestException('No inventory asset to allocate');
    const { asset } = await this.resolveAssetAccess(user, assetId, 'allocate');

    const quantity = input.quantity ?? 1;
    const status = input.status ?? 'hold';

    if (STAY_KINDS.has(asset.assetKind) || input.roomProductId || input.checkIn) {
      const checkIn = input.checkIn ? dayStart(input.checkIn) : null;
      const checkOut = input.checkOut ? dayStart(input.checkOut) : null;
      if (!checkIn || !checkOut) {
        throw new BadRequestException('checkIn and checkOut are required for stay allocation');
      }
      if (checkOut <= checkIn) {
        throw new BadRequestException('checkOut must be after checkIn');
      }

      let roomProductId = input.roomProductId;
      if (!roomProductId) {
        const avail = await this.availability(user, {
          assetId,
          from: checkIn.toISOString().slice(0, 10),
          to: checkOut.toISOString().slice(0, 10),
        });
        const pick = avail.products.find((p) => p.remaining >= quantity);
        if (!pick && !input.allowOverride) {
          throw new ConflictException('No room availability for these dates');
        }
        roomProductId = pick?.roomProductId;
      } else if (!input.allowOverride) {
        const avail = await this.availability(user, {
          assetId,
          from: checkIn.toISOString().slice(0, 10),
          to: checkOut.toISOString().slice(0, 10),
        });
        const row = avail.products.find((p) => p.roomProductId === roomProductId);
        if (!row || row.remaining < quantity) {
          throw new ConflictException('Insufficient room availability');
        }
      }

      if (!roomProductId) {
        throw new BadRequestException('roomProductId required when overriding without stock');
      }

      return this.prisma.inventoryAllocation.create({
        data: {
          assetId,
          roomProductId,
          bookingComponentId: input.bookingComponentId || null,
          checkIn,
          checkOut,
          quantity,
          status,
          notes: input.notes || null,
          createdBy: user.sub,
        },
      });
    }

    // Fleet / driver calendar allocation
    const startAt = input.startAt ? new Date(input.startAt) : null;
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (!startAt || !endAt || !(endAt > startAt)) {
      throw new BadRequestException('startAt and endAt are required for fleet/driver allocation');
    }

    let fleetUnitId = input.fleetUnitId || null;
    if (FLEET_KINDS.has(asset.assetKind) || asset.assetKind === 'vehicle') {
      if (!fleetUnitId) {
        const units = await this.prisma.assetFleetUnit.findMany({
          where: { assetId, deletedAt: null, isActive: true },
        });
        for (const unit of units) {
          const conflict = await this.hasFleetConflict(unit.id, startAt, endAt);
          if (!conflict) {
            fleetUnitId = unit.id;
            break;
          }
        }
        if (!fleetUnitId && !input.allowOverride) {
          throw new ConflictException('No fleet unit available for this window');
        }
      } else if (!input.allowOverride) {
        if (await this.hasFleetConflict(fleetUnitId, startAt, endAt)) {
          throw new ConflictException('Fleet unit is not available for this window');
        }
      }
    } else if (asset.assetKind === 'driver') {
      if (!input.allowOverride && (await this.hasAssetConflict(assetId, startAt, endAt))) {
        throw new ConflictException('Driver is not available for this window');
      }
    }

    const allocation = await this.prisma.inventoryAllocation.create({
      data: {
        assetId,
        fleetUnitId,
        bookingComponentId: input.bookingComponentId || null,
        startAt,
        endAt,
        quantity: 1,
        status,
        notes: input.notes || null,
        createdBy: user.sub,
      },
    });

    await this.prisma.assetCalendarBlock.create({
      data: {
        assetId,
        fleetUnitId,
        startAt,
        endAt,
        kind: 'booked',
        allocationId: allocation.id,
      },
    });

    return allocation;
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

  private async hasAssetConflict(assetId: string, startAt: Date, endAt: Date) {
    const blocks = await this.prisma.assetCalendarBlock.findMany({
      where: {
        assetId,
        fleetUnitId: null,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      take: 1,
    });
    return blocks.length > 0;
  }

  async releaseForBooking(bookingComponentId: string) {
    const allocations = await this.prisma.inventoryAllocation.findMany({
      where: {
        bookingComponentId,
        status: { in: [...ACTIVE_ALLOC] },
      },
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
    return { released: allocations.length };
  }

  /**
   * Best-effort allocate when a booking is confirmed.
   * Soft-skip if no dates / no linked asset / no products.
   */
  async syncBookingInventory(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      supplierId: string | null;
      partnerAssetId: string | null;
      startAt: Date | null;
      endAt: Date | null;
    },
  ) {
    if (booking.status === 'cancelled') {
      return this.releaseForBooking(booking.id);
    }
    if (booking.status !== 'confirmed' && booking.status !== 'requested') {
      return null;
    }

    const existing = await this.prisma.inventoryAllocation.count({
      where: {
        bookingComponentId: booking.id,
        status: { in: [...ACTIVE_ALLOC] },
      },
    });
    if (existing > 0) return null;

    let assetId = booking.partnerAssetId;
    if (!assetId && booking.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: booking.supplierId },
      });
      assetId = supplier?.linkedAssetId || null;
    }
    if (!assetId || !booking.startAt || !booking.endAt) return null;

    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!asset) return null;

    try {
      if (STAY_KINDS.has(asset.assetKind) || booking.type === 'hotel') {
        return await this.allocate(user, {
          assetId,
          bookingComponentId: booking.id,
          checkIn: booking.startAt.toISOString().slice(0, 10),
          checkOut: booking.endAt.toISOString().slice(0, 10),
          quantity: 1,
          status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
          allowOverride: false,
        });
      }
      if (
        asset.assetKind === 'vehicle' ||
        asset.assetKind === 'driver' ||
        booking.type === 'transfer'
      ) {
        return await this.allocate(user, {
          assetId,
          bookingComponentId: booking.id,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
          allowOverride: false,
        });
      }
    } catch {
      // Soft: confirmation still succeeds; ops can override later
      return null;
    }
    return null;
  }

  // ── Fleet ───────────────────────────────────────────────────────────

  async listFleetUnits(user: AuthUser, assetId: string) {
    await this.resolveAssetAccess(user, assetId, false);
    return this.prisma.assetFleetUnit.findMany({
      where: { assetId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createFleetUnit(user: AuthUser, input: CreateAssetFleetUnitInput) {
    await this.resolveAssetAccess(user, input.assetId, true);
    return this.prisma.assetFleetUnit.create({
      data: {
        assetId: input.assetId,
        name: input.name.trim(),
        plateNumber: input.plateNumber || null,
        seats: input.seats ?? null,
        vehicleTypeKey: input.vehicleTypeKey || null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateFleetUnit(user: AuthUser, id: string, input: UpdateAssetFleetUnitInput) {
    const unit = await this.prisma.assetFleetUnit.findFirst({
      where: { id, deletedAt: null },
    });
    if (!unit) throw new NotFoundException('Fleet unit not found');
    await this.resolveAssetAccess(user, unit.assetId, true);
    return this.prisma.assetFleetUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber } : {}),
        ...(input.seats !== undefined ? { seats: input.seats } : {}),
        ...(input.vehicleTypeKey !== undefined
          ? { vehicleTypeKey: input.vehicleTypeKey }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async listCalendar(user: AuthUser, assetId: string, from?: string, to?: string) {
    await this.resolveAssetAccess(user, assetId, false);
    return this.prisma.assetCalendarBlock.findMany({
      where: {
        assetId,
        ...(from && to
          ? {
              startAt: { lt: dayStart(to) },
              endAt: { gt: dayStart(from) },
            }
          : {}),
      },
      include: { fleetUnit: { select: { id: true, name: true, plateNumber: true } } },
      orderBy: { startAt: 'asc' },
    });
  }

  async createCalendarBlock(user: AuthUser, input: CreateAssetCalendarBlockInput) {
    await this.resolveAssetAccess(user, input.assetId, true);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(endAt > startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    const kind = input.kind || 'blocked';
    if (
      (kind === 'blocked' || kind === 'booked') &&
      input.fleetUnitId &&
      (await this.hasFleetConflict(input.fleetUnitId, startAt, endAt))
    ) {
      throw new ConflictException('Overlaps an existing busy window');
    }
    if (
      (kind === 'blocked' || kind === 'booked') &&
      !input.fleetUnitId &&
      (await this.hasAssetConflict(input.assetId, startAt, endAt))
    ) {
      throw new ConflictException('Overlaps an existing busy window');
    }
    return this.prisma.assetCalendarBlock.create({
      data: {
        assetId: input.assetId,
        fleetUnitId: input.fleetUnitId || null,
        startAt,
        endAt,
        kind,
        notes: input.notes || null,
      },
    });
  }

  async deleteCalendarBlock(user: AuthUser, id: string) {
    const block = await this.prisma.assetCalendarBlock.findFirst({ where: { id } });
    if (!block) throw new NotFoundException('Calendar block not found');
    await this.resolveAssetAccess(user, block.assetId, true);
    await this.prisma.assetCalendarBlock.delete({ where: { id } });
    return { ok: true };
  }

  // ── Restaurant offers ───────────────────────────────────────────────

  async listServiceOffers(user: AuthUser, assetId: string) {
    await this.resolveAssetAccess(user, assetId, false);
    return this.prisma.assetServiceOffer.findMany({
      where: { assetId, deletedAt: null },
      orderBy: [{ serviceDate: 'asc' }, { name: 'asc' }],
    });
  }

  async createServiceOffer(user: AuthUser, input: CreateAssetServiceOfferInput) {
    await this.resolveAssetAccess(user, input.assetId, true);
    return this.prisma.assetServiceOffer.create({
      data: {
        assetId: input.assetId,
        name: input.name.trim(),
        description: input.description || null,
        capacity: input.capacity ?? null,
        serviceDate: input.serviceDate ? dayStart(input.serviceDate) : null,
        serviceWindow: input.serviceWindow || null,
        rateHint:
          input.rateHint == null ? null : new Prisma.Decimal(input.rateHint),
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateServiceOffer(
    user: AuthUser,
    id: string,
    input: UpdateAssetServiceOfferInput,
  ) {
    const offer = await this.prisma.assetServiceOffer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!offer) throw new NotFoundException('Service offer not found');
    await this.resolveAssetAccess(user, offer.assetId, true);
    return this.prisma.assetServiceOffer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.serviceDate !== undefined
          ? { serviceDate: input.serviceDate ? dayStart(input.serviceDate) : null }
          : {}),
        ...(input.serviceWindow !== undefined
          ? { serviceWindow: input.serviceWindow }
          : {}),
        ...(input.rateHint !== undefined
          ? {
              rateHint:
                input.rateHint == null ? null : new Prisma.Decimal(input.rateHint),
            }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async softDeleteServiceOffer(user: AuthUser, id: string) {
    const offer = await this.prisma.assetServiceOffer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!offer) throw new NotFoundException('Service offer not found');
    await this.resolveAssetAccess(user, offer.assetId, true);
    return this.prisma.assetServiceOffer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async listAllocations(user: AuthUser, assetId: string) {
    await this.resolveAssetAccess(user, assetId, false);
    return this.prisma.inventoryAllocation.findMany({
      where: { assetId },
      include: {
        roomProduct: { select: { id: true, name: true } },
        fleetUnit: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
