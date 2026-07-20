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
import { buildFleetUnitBoard } from './fleet-unit-board';
import {
  allocationAssetNeedsRebind,
  allocationDatesNeedResync,
  allocationFleetWindowNeedsResync,
  allocationNeedsOrphanRelease,
  allocationQuantityNeedsResync,
  allocationRoomProductNeedsRematch,
  bookingFleetUnitId,
  bookingRoomProductId,
  bookingRoomTypeLabel,
  canResyncAllocationAsset,
  canResyncAllocationDates,
  canResyncAllocationQuantity,
  hotelAllocationQuantity,
  matchRoomProductIdByTypeName,
  shouldUpgradeAllotmentHoldOnConfirm,
} from './hotel-allocation-quantity';

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
        customerFacingName: input.customerFacingName?.trim() || null,
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
        ...(input.customerFacingName !== undefined
          ? {
              customerFacingName: input.customerFacingName?.trim() || null,
            }
          : {}),
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
    if (input.availableCount > product.baseQuantity) {
      throw new BadRequestException(
        `Available count cannot exceed physical units (${product.baseQuantity})`,
      );
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
    const nextAvailable =
      input.availableCount !== undefined
        ? input.availableCount
        : allotment.availableCount;
    if (nextAvailable > allotment.roomProduct.baseQuantity) {
      throw new BadRequestException(
        `Available count cannot exceed physical units (${allotment.roomProduct.baseQuantity})`,
      );
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

  private async hasFleetConflict(
    fleetUnitId: string,
    startAt: Date,
    endAt: Date,
    excludeAllocationId?: string | null,
  ) {
    const blocks = await this.prisma.assetCalendarBlock.findMany({
      where: {
        fleetUnitId,
        kind: { in: ['blocked', 'booked'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeAllocationId
          ? { allocationId: { not: excludeAllocationId } }
          : {}),
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
   * Soft conflict check + release/reallocate transfer onto a new fleet asset.
   * Does not carry fleetUnitId across assets unless booking stamps one.
   */
  private async resyncFleetAllocationAsset(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
    },
    existing: {
      id: string;
      status: string;
      assetId: string;
      fleetUnitId: string | null;
      startAt: Date | null;
      endAt: Date | null;
    },
    targetAssetId: string,
    fleetUnitId: string | null,
  ): Promise<
    | {
        ok: true;
        allocationId: string;
        assetRebound: true;
        fleetWindowResynced?: boolean;
        upgraded?: boolean;
      }
    | { ok: false; failed: string }
  > {
    if (!booking.startAt || !booking.endAt) {
      return {
        ok: false,
        failed: 'Booking dates required to rebind transfer inventory',
      };
    }
    const startAt = booking.startAt;
    const endAt = booking.endAt;
    if (!(endAt > startAt)) {
      return { ok: false, failed: 'Transfer end must be after start' };
    }

    try {
      if (fleetUnitId) {
        const unit = await this.prisma.assetFleetUnit.findFirst({
          where: {
            id: fleetUnitId,
            assetId: targetAssetId,
            deletedAt: null,
            isActive: true,
          },
          select: { id: true },
        });
        if (!unit) {
          return {
            ok: false,
            failed: 'Fleet unit is not on the new driver/fleet asset',
          };
        }
        const conflict = await this.hasFleetConflict(
          fleetUnitId,
          startAt,
          endAt,
          existing.id,
        );
        if (conflict) {
          return {
            ok: false,
            failed: 'Fleet unit is not available on the new asset for this window',
          };
        }
      }

      await this.releaseForBooking(booking.id);
      const row = await this.allocate(user, {
        assetId: targetAssetId,
        bookingComponentId: booking.id,
        ...(fleetUnitId ? { fleetUnitId } : {}),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
        allowOverride: false,
      });
      const windowMoved = allocationFleetWindowNeedsResync({
        allocationStartAt: existing.startAt,
        allocationEndAt: existing.endAt,
        allocationFleetUnitId: existing.fleetUnitId,
        bookingStartAt: booking.startAt,
        bookingEndAt: booking.endAt,
        bookingFleetUnitId: fleetUnitId,
      });
      return {
        ok: true,
        allocationId: row.id,
        assetRebound: true,
        ...(windowMoved ? { fleetWindowResynced: true } : {}),
        ...(booking.status === 'confirmed' && existing.status === 'hold'
          ? { upgraded: true }
          : {}),
      };
    } catch (e) {
      return {
        ok: false,
        failed:
          e instanceof Error
            ? e.message
            : 'Could not rebind transfer inventory to new fleet',
      };
    }
  }

  /**
   * Soft capacity + release/reallocate onto a stamped room product (same asset).
   */
  private async resyncStayAllocationRoomProduct(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
      requiredQuantity?: number | string | { toString(): string } | null;
      travellerRequirementsJson?: unknown;
    },
    existing: {
      id: string;
      status: string;
      quantity: number;
      assetId: string;
      roomProductId: string | null;
      checkIn: Date | null;
      checkOut: Date | null;
    },
    wantedProductId?: string | null,
  ): Promise<
    | {
        ok: true;
        allocationId: string;
        roomProductRematched: true;
        quantityResynced?: boolean;
        upgraded?: boolean;
      }
    | { ok: false; failed: string }
  > {
    const wanted =
      (typeof wantedProductId === 'string' && wantedProductId.trim()
        ? wantedProductId.trim()
        : null) || bookingRoomProductId(booking.travellerRequirementsJson);
    if (!wanted) {
      return { ok: false, failed: 'Booking room product required to rematch' };
    }
    if (!booking.startAt || !booking.endAt) {
      return {
        ok: false,
        failed: 'Booking dates required to rematch room product',
      };
    }
    const checkIn = booking.startAt.toISOString().slice(0, 10);
    const checkOut = booking.endAt.toISOString().slice(0, 10);
    const roomsQty = hotelAllocationQuantity({
      requiredQuantity: booking.requiredQuantity,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });

    try {
      const avail = await this.availability(user, {
        assetId: existing.assetId,
        from: checkIn,
        to: checkOut,
      });
      const row = avail.products.find((p) => p.roomProductId === wanted);
      const remaining = row?.remaining ?? 0;
      const sameProduct = existing.roomProductId === wanted;
      if (
        !canResyncAllocationDates({
          remaining,
          allocationQuantity: existing.quantity,
          neededQuantity: roomsQty,
          allocationOverlapsNewWindow: sameProduct,
        })
      ) {
        return {
          ok: false,
          failed: `Insufficient room availability to rematch allotment to selected room product`,
        };
      }

      await this.releaseForBooking(booking.id);
      const created = await this.allocate(user, {
        assetId: existing.assetId,
        bookingComponentId: booking.id,
        roomProductId: wanted,
        checkIn,
        checkOut,
        quantity: roomsQty,
        status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
        allowOverride: false,
      });
      return {
        ok: true,
        allocationId: created.id,
        roomProductRematched: true,
        ...(roomsQty !== existing.quantity ? { quantityResynced: true } : {}),
        ...(booking.status === 'confirmed' && existing.status === 'hold'
          ? { upgraded: true }
          : {}),
      };
    } catch (e) {
      return {
        ok: false,
        failed:
          e instanceof Error ? e.message : 'Could not rematch room product',
      };
    }
  }

  /**
   * Soft conflict check + release/reallocate transfer fleet window / unit.
   */
  private async resyncFleetAllocationWindow(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
    },
    existing: {
      id: string;
      status: string;
      assetId: string;
      fleetUnitId: string | null;
      startAt: Date | null;
      endAt: Date | null;
    },
    targetAssetId: string,
    fleetUnitId: string | null,
  ): Promise<
    | {
        ok: true;
        allocationId: string;
        fleetWindowResynced: true;
        upgraded?: boolean;
      }
    | { ok: false; failed: string }
  > {
    if (!booking.startAt || !booking.endAt) {
      return { ok: false, failed: 'Booking dates required to move transfer window' };
    }
    const startAt = booking.startAt;
    const endAt = booking.endAt;
    if (!(endAt > startAt)) {
      return { ok: false, failed: 'Transfer end must be after start' };
    }

    try {
      if (fleetUnitId) {
        const conflict = await this.hasFleetConflict(
          fleetUnitId,
          startAt,
          endAt,
          existing.id,
        );
        if (conflict) {
          return {
            ok: false,
            failed: 'Fleet unit is not available for the new transfer window',
          };
        }
      }

      await this.releaseForBooking(booking.id);
      const row = await this.allocate(user, {
        assetId: targetAssetId,
        bookingComponentId: booking.id,
        ...(fleetUnitId ? { fleetUnitId } : {}),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
        allowOverride: false,
      });
      return {
        ok: true,
        allocationId: row.id,
        fleetWindowResynced: true,
        ...(booking.status === 'confirmed' && existing.status === 'hold'
          ? { upgraded: true }
          : {}),
      };
    } catch (e) {
      return {
        ok: false,
        failed:
          e instanceof Error
            ? e.message
            : 'Could not move transfer inventory window',
      };
    }
  }

  /**
   * Soft capacity + release/reallocate onto a new stay asset (supplier rebind).
   * Leaves existing allotment untouched when capacity soft-fails.
   * Does not carry roomProductId across assets — allocate picks product on target.
   */
  private async resyncStayAllocationAsset(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
      requiredQuantity?: number | string | { toString(): string } | null;
      travellerRequirementsJson?: unknown;
    },
    existing: {
      id: string;
      status: string;
      quantity: number;
      assetId: string;
      roomProductId: string | null;
      checkIn: Date | null;
      checkOut: Date | null;
    },
    targetAssetId: string,
  ): Promise<
    | {
        ok: true;
        allocationId: string;
        assetRebound: true;
        datesResynced?: boolean;
        quantityResynced?: boolean;
        upgraded?: boolean;
      }
    | { ok: false; failed: string }
  > {
    if (!booking.startAt || !booking.endAt) {
      return { ok: false, failed: 'Booking dates required to rebind allotment' };
    }
    const checkIn = booking.startAt.toISOString().slice(0, 10);
    const checkOut = booking.endAt.toISOString().slice(0, 10);
    if (checkOut <= checkIn) {
      return { ok: false, failed: 'checkOut must be after checkIn' };
    }
    const roomsQty = hotelAllocationQuantity({
      requiredQuantity: booking.requiredQuantity,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });

    try {
      const avail = await this.availability(user, {
        assetId: targetAssetId,
        from: checkIn,
        to: checkOut,
      });
      const remaining = avail.products.reduce(
        (m, p) => Math.max(m, p.remaining),
        0,
      );
      if (
        !canResyncAllocationAsset({
          remaining,
          neededQuantity: roomsQty,
        })
      ) {
        return {
          ok: false,
          failed: `Insufficient room availability on new property for ${checkIn} → ${checkOut}`,
        };
      }

      await this.releaseForBooking(booking.id);
      const row = await this.allocate(user, {
        assetId: targetAssetId,
        bookingComponentId: booking.id,
        checkIn,
        checkOut,
        quantity: roomsQty,
        status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
        allowOverride: false,
      });
      const datesMoved = allocationDatesNeedResync({
        allocationCheckIn: existing.checkIn,
        allocationCheckOut: existing.checkOut,
        bookingStartAt: booking.startAt,
        bookingEndAt: booking.endAt,
      });
      return {
        ok: true,
        allocationId: row.id,
        assetRebound: true,
        ...(datesMoved ? { datesResynced: true } : {}),
        ...(roomsQty !== existing.quantity ? { quantityResynced: true } : {}),
        ...(booking.status === 'confirmed' && existing.status === 'hold'
          ? { upgraded: true }
          : {}),
      };
    } catch (e) {
      return {
        ok: false,
        failed:
          e instanceof Error ? e.message : 'Could not rebind allotment to new property',
      };
    }
  }

  /**
   * Soft capacity + release/reallocate when stay dates no longer match booking.
   * Leaves existing allotment untouched when capacity soft-fails.
   */
  private async resyncStayAllocationDates(
    user: AuthUser,
    booking: {
      id: string;
      type: string;
      status: string;
      startAt: Date | null;
      endAt: Date | null;
      requiredQuantity?: number | string | { toString(): string } | null;
      travellerRequirementsJson?: unknown;
    },
    existing: {
      id: string;
      status: string;
      quantity: number;
      assetId: string;
      roomProductId: string | null;
      checkIn: Date | null;
      checkOut: Date | null;
    },
  ): Promise<
    | {
        ok: true;
        allocationId: string;
        datesResynced: true;
        quantityResynced?: boolean;
        upgraded?: boolean;
      }
    | { ok: false; failed: string }
  > {
    if (!booking.startAt || !booking.endAt) {
      return { ok: false, failed: 'Booking dates required to move allotment' };
    }
    const checkIn = booking.startAt.toISOString().slice(0, 10);
    const checkOut = booking.endAt.toISOString().slice(0, 10);
    if (checkOut <= checkIn) {
      return { ok: false, failed: 'checkOut must be after checkIn' };
    }
    const roomsQty = hotelAllocationQuantity({
      requiredQuantity: booking.requiredQuantity,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });
    const newFrom = dayStart(checkIn);
    const newTo = dayStart(checkOut);
    const overlaps =
      Boolean(existing.checkIn && existing.checkOut) &&
      datesOverlap(newFrom, newTo, existing.checkIn!, existing.checkOut!);

    try {
      const avail = await this.availability(user, {
        assetId: existing.assetId,
        from: checkIn,
        to: checkOut,
      });
      let remaining = 0;
      if (existing.roomProductId) {
        const row = avail.products.find(
          (p) => p.roomProductId === existing.roomProductId,
        );
        remaining = row?.remaining ?? 0;
      } else {
        remaining = avail.products.reduce((m, p) => Math.max(m, p.remaining), 0);
      }
      if (
        !canResyncAllocationDates({
          remaining,
          allocationQuantity: existing.quantity,
          neededQuantity: roomsQty,
          allocationOverlapsNewWindow: overlaps,
        })
      ) {
        return {
          ok: false,
          failed: `Insufficient room availability to move allotment to ${checkIn} → ${checkOut}`,
        };
      }

      await this.releaseForBooking(booking.id);
      const row = await this.allocate(user, {
        assetId: existing.assetId,
        bookingComponentId: booking.id,
        ...(existing.roomProductId
          ? { roomProductId: existing.roomProductId }
          : {}),
        checkIn,
        checkOut,
        quantity: roomsQty,
        status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
        allowOverride: false,
      });
      return {
        ok: true,
        allocationId: row.id,
        datesResynced: true,
        ...(roomsQty !== existing.quantity ? { quantityResynced: true } : {}),
        ...(booking.status === 'confirmed' && existing.status === 'hold'
          ? { upgraded: true }
          : {}),
      };
    } catch (e) {
      return {
        ok: false,
        failed:
          e instanceof Error ? e.message : 'Could not move allotment dates',
      };
    }
  }

  /**
   * Soft capacity check + whether stay allotment qty should bump to booking rooms.
   * Does not write — caller updates allocation.
   */
  private async resyncStayAllocationQuantity(
    user: AuthUser,
    booking: {
      type: string;
      requiredQuantity?: number | string | { toString(): string } | null;
      travellerRequirementsJson?: unknown;
    },
    existing: {
      quantity: number;
      assetId: string;
      roomProductId: string | null;
      checkIn: Date | null;
      checkOut: Date | null;
    },
  ): Promise<
    | { ok: true; quantityResynced: boolean; roomsQty: number }
    | { ok: false; failed: string }
  > {
    const isStay =
      booking.type === 'hotel' || Boolean(existing.checkIn && existing.checkOut);
    const roomsQty = hotelAllocationQuantity({
      requiredQuantity: booking.requiredQuantity,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });
    if (
      !isStay ||
      !allocationQuantityNeedsResync({
        allocationQuantity: existing.quantity,
        requiredQuantity: booking.requiredQuantity,
        travellerRequirementsJson: booking.travellerRequirementsJson,
      })
    ) {
      return { ok: true, quantityResynced: false, roomsQty };
    }

    if (existing.roomProductId && existing.checkIn && existing.checkOut) {
      try {
        const avail = await this.availability(user, {
          assetId: existing.assetId,
          from: existing.checkIn.toISOString().slice(0, 10),
          to: existing.checkOut.toISOString().slice(0, 10),
        });
        const row = avail.products.find(
          (p) => p.roomProductId === existing.roomProductId,
        );
        const remaining = row?.remaining ?? 0;
        if (
          !canResyncAllocationQuantity({
            remaining,
            allocationQuantity: existing.quantity,
            neededQuantity: roomsQty,
          })
        ) {
          return {
            ok: false,
            failed: `Insufficient room availability to sync allotment to ${roomsQty} room${roomsQty === 1 ? '' : 's'}`,
          };
        }
      } catch (e) {
        return {
          ok: false,
          failed:
            e instanceof Error
              ? e.message
              : 'Could not check allotment capacity for qty sync',
        };
      }
    }

    return { ok: true, quantityResynced: true, roomsQty };
  }

  /**
   * Best-effort allocate when a booking is confirmed.
   * Returns status for UI honesty (never throws).
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
      requiredQuantity?: number | string | { toString(): string } | null;
      travellerRequirementsJson?: unknown;
    },
  ): Promise<
    | {
        ok: true;
        allocationId?: string;
        released?: number;
        upgraded?: boolean;
        quantityResynced?: boolean;
        datesResynced?: boolean;
        assetRebound?: boolean;
        roomProductRematched?: boolean;
        fleetWindowResynced?: boolean;
        orphanReleased?: boolean;
      }
    | { ok: false; skipped?: string; failed?: string }
    | null
  > {
    if (booking.status === 'cancelled') {
      const released = await this.releaseForBooking(booking.id);
      return { ok: true, released: released.released };
    }
    if (booking.status !== 'confirmed' && booking.status !== 'requested') {
      return { ok: false, skipped: 'status_not_allocatable' };
    }

    const existing = await this.prisma.inventoryAllocation.findFirst({
      where: {
        bookingComponentId: booking.id,
        status: { in: [...ACTIVE_ALLOC] },
      },
      select: {
        id: true,
        status: true,
        quantity: true,
        assetId: true,
        roomProductId: true,
        fleetUnitId: true,
        checkIn: true,
        checkOut: true,
        startAt: true,
        endAt: true,
      },
    });
    if (existing) {
      const isStay =
        booking.type === 'hotel' ||
        Boolean(existing.checkIn && existing.checkOut);
      const isFleet =
        booking.type === 'transfer' ||
        Boolean(existing.startAt && existing.endAt && !existing.checkIn);
      const target = await this.resolveBookingTargetAsset(booking);

      if (
        allocationNeedsOrphanRelease({
          allocationAssetId: existing.assetId,
          targetAssetId: target.assetId,
        })
      ) {
        const released = await this.releaseForBooking(booking.id);
        return {
          ok: true,
          released: released.released,
          orphanReleased: true,
        };
      }

      if (
        isStay &&
        target.assetId &&
        allocationAssetNeedsRebind({
          allocationAssetId: existing.assetId,
          targetAssetId: target.assetId,
        })
      ) {
        return this.resyncStayAllocationAsset(
          user,
          booking,
          existing,
          target.assetId,
        );
      }

      if (
        isFleet &&
        target.assetId &&
        booking.startAt &&
        booking.endAt &&
        allocationAssetNeedsRebind({
          allocationAssetId: existing.assetId,
          targetAssetId: target.assetId,
        })
      ) {
        return this.resyncFleetAllocationAsset(
          user,
          booking,
          existing,
          target.assetId,
          target.fleetUnitId ||
            bookingFleetUnitId(booking.travellerRequirementsJson),
        );
      }

      if (
        isStay &&
        booking.startAt &&
        booking.endAt &&
        allocationDatesNeedResync({
          allocationCheckIn: existing.checkIn,
          allocationCheckOut: existing.checkOut,
          bookingStartAt: booking.startAt,
          bookingEndAt: booking.endAt,
        })
      ) {
        return this.resyncStayAllocationDates(user, booking, existing);
      }

      if (isStay) {
        let wantedProductId = bookingRoomProductId(
          booking.travellerRequirementsJson,
        );
        if (!wantedProductId) {
          const roomType = bookingRoomTypeLabel(
            booking.travellerRequirementsJson,
          );
          if (roomType) {
            const products = await this.prisma.assetRoomProduct.findMany({
              where: {
                assetId: existing.assetId,
                deletedAt: null,
                isActive: true,
              },
              select: { id: true, name: true },
            });
            wantedProductId = matchRoomProductIdByTypeName({
              roomType,
              products,
            });
          }
        }
        if (
          allocationRoomProductNeedsRematch({
            allocationRoomProductId: existing.roomProductId,
            bookingRoomProductId: wantedProductId,
          })
        ) {
          return this.resyncStayAllocationRoomProduct(
            user,
            booking,
            existing,
            wantedProductId!,
          );
        }
      }

      if (
        isFleet &&
        booking.startAt &&
        booking.endAt &&
        target.assetId &&
        allocationFleetWindowNeedsResync({
          allocationStartAt: existing.startAt,
          allocationEndAt: existing.endAt,
          allocationFleetUnitId: existing.fleetUnitId,
          bookingStartAt: booking.startAt,
          bookingEndAt: booking.endAt,
          bookingFleetUnitId:
            target.fleetUnitId ||
            bookingFleetUnitId(booking.travellerRequirementsJson),
        })
      ) {
        return this.resyncFleetAllocationWindow(
          user,
          booking,
          existing,
          target.assetId,
          target.fleetUnitId ||
            bookingFleetUnitId(booking.travellerRequirementsJson) ||
            existing.fleetUnitId,
        );
      }

      if (
        shouldUpgradeAllotmentHoldOnConfirm({
          allocationStatus: existing.status,
          bookingStatus: booking.status,
        })
      ) {
        const resync = await this.resyncStayAllocationQuantity(user, booking, existing);
        if (!resync.ok) return resync;
        try {
          await this.prisma.inventoryAllocation.update({
            where: { id: existing.id },
            data: {
              status: 'confirmed',
              ...(resync.quantityResynced ? { quantity: resync.roomsQty } : {}),
            },
          });
          return {
            ok: true,
            allocationId: existing.id,
            upgraded: true,
            ...(resync.quantityResynced ? { quantityResynced: true } : {}),
          };
        } catch (e) {
          return {
            ok: false,
            failed: e instanceof Error ? e.message : 'Could not confirm allotment hold',
          };
        }
      }

      // Already-confirmed: qty-only resync when booking rooms changed.
      if (existing.status === 'confirmed' && booking.status === 'confirmed') {
        const resync = await this.resyncStayAllocationQuantity(user, booking, existing);
        if (!resync.ok) return resync;
        if (resync.quantityResynced) {
          try {
            await this.prisma.inventoryAllocation.update({
              where: { id: existing.id },
              data: { quantity: resync.roomsQty },
            });
            return {
              ok: true,
              allocationId: existing.id,
              quantityResynced: true,
            };
          } catch (e) {
            return {
              ok: false,
              failed:
                e instanceof Error ? e.message : 'Could not sync allotment quantity',
            };
          }
        }
      }

      return { ok: true, allocationId: existing.id };
    }

    const target = await this.resolveBookingTargetAsset(booking);
    const assetId = target.assetId;
    const fleetUnitId = target.fleetUnitId;
    if (!assetId || !booking.startAt || !booking.endAt) {
      return { ok: false, skipped: 'missing_asset_or_dates' };
    }

    const asset = await this.prisma.partnerAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!asset) return { ok: false, skipped: 'asset_missing' };

    const roomsQty = hotelAllocationQuantity({
      requiredQuantity: booking.requiredQuantity,
      travellerRequirementsJson: booking.travellerRequirementsJson,
    });

    try {
      if (STAY_KINDS.has(asset.assetKind) || booking.type === 'hotel') {
        const row = await this.allocate(user, {
          assetId,
          bookingComponentId: booking.id,
          checkIn: booking.startAt.toISOString().slice(0, 10),
          checkOut: booking.endAt.toISOString().slice(0, 10),
          quantity: roomsQty,
          status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
          allowOverride: false,
        });
        return { ok: true, allocationId: row.id };
      }
      if (
        asset.assetKind === 'vehicle' ||
        asset.assetKind === 'driver' ||
        booking.type === 'transfer'
      ) {
        const row = await this.allocate(user, {
          assetId,
          bookingComponentId: booking.id,
          fleetUnitId: fleetUnitId || undefined,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          status: booking.status === 'confirmed' ? 'confirmed' : 'hold',
          allowOverride: false,
        });
        return { ok: true, allocationId: row.id };
      }
    } catch (e) {
      return {
        ok: false,
        failed: e instanceof Error ? e.message : 'Inventory allocate failed',
      };
    }
    return { ok: false, skipped: 'asset_kind_unsupported' };
  }

  /** Resolve partner asset (+ optional fleet unit) for a booking inventory sync. */
  private async resolveBookingTargetAsset(booking: {
    type: string;
    supplierId: string | null;
    partnerAssetId: string | null;
    travellerRequirementsJson?: unknown;
  }): Promise<{ assetId: string | null; fleetUnitId: string | null }> {
    let assetId = booking.partnerAssetId;
    let fleetUnitId: string | null = null;
    if (booking.type === 'transfer' && booking.travellerRequirementsJson) {
      const root =
        booking.travellerRequirementsJson &&
        typeof booking.travellerRequirementsJson === 'object' &&
        !Array.isArray(booking.travellerRequirementsJson)
          ? (booking.travellerRequirementsJson as Record<string, unknown>)
          : {};
      if (typeof root.fleetUnitId === 'string' && root.fleetUnitId.trim()) {
        fleetUnitId = root.fleetUnitId.trim();
      }
      // Prefer assigned driver/fleet supplier link over booking.partnerAssetId
      // (Ops can reassign driver without changing booking.supplierId).
      if (typeof root.driverSupplierId === 'string' && root.driverSupplierId.trim()) {
        const supplier = await this.prisma.supplier.findFirst({
          where: { id: root.driverSupplierId.trim(), deletedAt: null },
          select: { linkedAssetId: true },
        });
        if (supplier?.linkedAssetId) {
          assetId = supplier.linkedAssetId;
        }
      }
    }
    if (!assetId && booking.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: booking.supplierId },
      });
      assetId = supplier?.linkedAssetId || null;
    }
    return { assetId, fleetUnitId };
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

  /** Read-only unit board: lanes per plate with calendar + alloc + job + rental busy. */
  async getFleetUnitBoard(
    user: AuthUser,
    assetId: string,
    from?: string,
    to?: string,
  ) {
    await this.resolveAssetAccess(user, assetId, false);
    const rangeTo = to ? dayStart(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rangeFrom = from
      ? dayStart(from)
      : new Date(rangeTo.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (!(rangeTo > rangeFrom)) {
      throw new BadRequestException('to must be after from');
    }

    const [units, calendarBlocks, allocations, driverJobs, rentals] =
      await Promise.all([
        this.prisma.assetFleetUnit.findMany({
          where: { assetId, deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, plateNumber: true },
        }),
        this.prisma.assetCalendarBlock.findMany({
          where: {
            assetId,
            startAt: { lt: rangeTo },
            endAt: { gt: rangeFrom },
          },
          select: {
            id: true,
            fleetUnitId: true,
            startAt: true,
            endAt: true,
            kind: true,
          },
        }),
        this.prisma.inventoryAllocation.findMany({
          where: {
            assetId,
            fleetUnitId: { not: null },
            status: { not: 'released' },
            OR: [
              { startAt: { lt: rangeTo }, endAt: { gt: rangeFrom } },
              {
                startAt: null,
                checkIn: { lt: rangeTo },
                checkOut: { gt: rangeFrom },
              },
            ],
          },
          select: {
            id: true,
            fleetUnitId: true,
            startAt: true,
            endAt: true,
            checkIn: true,
            checkOut: true,
            status: true,
            notes: true,
          },
        }),
        this.prisma.driverJob.findMany({
          where: {
            assetId,
            fleetUnitId: { not: null },
            status: { notIn: ['cancelled', 'no_show'] },
            startAt: { lt: rangeTo },
            endAt: { gt: rangeFrom },
          },
          select: {
            id: true,
            fleetUnitId: true,
            startAt: true,
            endAt: true,
            status: true,
            guestName: true,
          },
        }),
        this.prisma.rentalReservation.findMany({
          where: {
            assetId,
            status: { notIn: ['cancelled', 'no_show'] },
            startAt: { lt: rangeTo },
            endAt: { gt: rangeFrom },
          },
          select: {
            id: true,
            fleetUnitId: true,
            startAt: true,
            endAt: true,
            status: true,
            guestName: true,
          },
        }),
      ]);

    return buildFleetUnitBoard({
      from: rangeFrom,
      to: rangeTo,
      units,
      calendarBlocks,
      allocations: allocations.map((a) => ({
        id: a.id,
        fleetUnitId: a.fleetUnitId,
        startAt: a.startAt ?? a.checkIn,
        endAt: a.endAt ?? a.checkOut,
        status: a.status,
        notes: a.notes,
      })),
      driverJobs,
      rentals,
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
        fleetUnit: { select: { id: true, name: true, plateNumber: true } },
        bookingComponent: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            trip: { select: { tripNumber: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Confirm or release an allocation. Release clears linked calendar blocks.
   */
  async updateAllocation(
    user: AuthUser,
    allocationId: string,
    input: { status: 'confirmed' | 'released'; notes?: string | null },
  ) {
    const existing = await this.prisma.inventoryAllocation.findFirst({
      where: { id: allocationId },
    });
    if (!existing) throw new NotFoundException('Allocation not found');
    await this.resolveAssetAccess(user, existing.assetId, 'allocate');

    if (existing.status === 'released') {
      throw new BadRequestException('Allocation is already released');
    }
    if (input.status === 'confirmed' && existing.status === 'confirmed') {
      return this.prisma.inventoryAllocation.findFirstOrThrow({
        where: { id: allocationId },
        include: {
          roomProduct: { select: { id: true, name: true } },
          fleetUnit: { select: { id: true, name: true, plateNumber: true } },
        },
      });
    }
    if (input.status === 'confirmed' && existing.status !== 'hold') {
      throw new BadRequestException('Only holds can be confirmed');
    }

    if (input.status === 'released') {
      await this.prisma.$transaction(async (tx) => {
        await tx.inventoryAllocation.update({
          where: { id: allocationId },
          data: {
            status: 'released',
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
        await tx.assetCalendarBlock.deleteMany({
          where: { allocationId },
        });
      });
    } else {
      await this.prisma.inventoryAllocation.update({
        where: { id: allocationId },
        data: {
          status: 'confirmed',
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
    }

    return this.prisma.inventoryAllocation.findFirstOrThrow({
      where: { id: allocationId },
      include: {
        roomProduct: { select: { id: true, name: true } },
        fleetUnit: { select: { id: true, name: true, plateNumber: true } },
      },
    });
  }
}
