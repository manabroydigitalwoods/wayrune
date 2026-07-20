import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission } from '@wayrune/auth';
import type {
  CreateSupplierActivityRateInput,
  CreateSupplierHotelRateInput,
  CreateTransferFareInput,
  GenerateTransferFareMatrixInput,
  ImportActivityRateCsvInput,
  ImportHotelRateCsvInput,
  ImportTransferFareCsvInput,
  ResolveRatesInput,
  ResolveRatesItemInput,
  SuggestTransferFareInput,
  UpdateSupplierActivityRateInput,
  UpdateSupplierHotelRateInput,
  UpdateTransferFareInput,
} from '@wayrune/contracts';
import { resolveOrgMarkupPercent } from '@wayrune/contracts';
import {
  SYSTEM_FARE_CLUSTERS,
  SYSTEM_VEHICLE_RATE_BANDS,
} from '@wayrune/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlacesService } from '../places/places.service';
import type { AuthUser } from '../../common/helpers';
import {
  hotelRateTipPendingActivation,
  hotelRateVersionRequiresPendingActivation,
  rateTipPendingActivation,
  rateTipVersionRequiresPendingActivation,
} from './hotel-rate-pending';
import {
  composeRatesImportAuditMetadata,
  mapAuditEventToImportBatch,
  RATES_IMPORT_AUDIT_ACTION,
  RATES_IMPORT_ENTITY_TYPE,
  type RatesImportKind,
} from './rates-import-audit';
import {
  eachStayNight,
  explainHotelRejects,
  explainTransferRejects,
  filterHotelByRoomAndMeal,
  hotelStayCalculation,
  parseBlackoutRanges,
  parseStopSaleRanges,
  supplierBlockedReason,
  transferMatchAccepted,
  type BlackoutRange,
  type DateWindow,
  type StopSaleRange,
} from './rate-resolve-guards';
import {
  blendedActivityUnitCost,
  classifyActivityPax,
  classifyTransferPax,
  normalizeActivityKey,
  pickBestActivityRate,
  type ActivityRateCandidate,
} from './activity-rate-match';
import {
  applyOccupancyPricing,
  classifyHotelOccupancyPax,
  occupancyMatchAccepted,
  occupancyPricingToJson,
  parseOccupancyPricing,
  pickAdultBand,
} from './occupancy-pricing';
import {
  applyDateSupplements,
  dateSupplementMatchAccepted,
  occupancyPricingJsonWithDateSupplements,
  parseDateSupplements,
} from './date-supplements';
import { summarizeCancellationForMatch } from './cancellation-policy';
import {
  evaluateHotelMinStay,
  hotelMinStayMatchAccepted,
} from './hotel-min-stay';
import {
  filterHotelByNationality,
  hotelNationalityMatchAccepted,
  nationalityFromOccupancy,
  normalizeHotelNationality,
  collectGuestNationalityBag,
  effectiveGuestNationality,
  guestNationalitiesAreMixed,
} from './hotel-nationality';
import {
  hotelPaxBuySplitMatchAccepted,
  tryHotelPaxBuySplit,
} from './hotel-pax-buy-split';
import {
  orderHotelRateVersionChain,
  planHotelRateNewVersion,
  hotelRateVersionLabel,
  type HotelRateVersionRef,
} from './hotel-rate-version';
import { diffHotelRateTips } from './hotel-rate-diff';
import {
  diffActivityRateTips,
  diffTransferFareTips,
} from './transfer-activity-rate-diff';
import {
  orderRateVersionChain,
  planRateNewVersion,
  type RateVersionRef,
} from './rate-version-chain';
import { backfillHotelRateRoomProducts as backfillHotelRateRoomProductsHelper } from './rates-backfill.helpers';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseDateOnly(iso?: string | null): Date | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

function dateInWindow(
  asOf: Date | null,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!asOf) return !start && !end;
  if (start && asOf < start) return false;
  if (end && asOf > end) return false;
  return true;
}

function windowScore(start: Date | null, end: Date | null): number {
  return start || end ? 2 : 1;
}

type FareRow = {
  id: string;
  organizationId: string | null;
  supplierId: string | null;
  isSystem: boolean;
  fromPlaceId: string;
  toPlaceId: string;
  vehicleTypeId: string;
  unitCost: Prisma.Decimal;
  childUnitCost: Prisma.Decimal | null;
  infantUnitCost: Prisma.Decimal | null;
  childAgeMin: number | null;
  childAgeMax: number | null;
  pricingMode: string;
  currency: string;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  versionNumber?: number;
  supersedesId?: string | null;
  vehicleType?: { seats: number | null; name: string } | null;
};

type HotelRow = {
  id: string;
  organizationId: string | null;
  isSystem: boolean;
  supplierId: string | null;
  placeId: string | null;
  roomType: string | null;
  roomProductId?: string | null;
  contractId?: string | null;
  mealPlan: string | null;
  unitCost: Prisma.Decimal;
  weekendUnitCost: Prisma.Decimal | null;
  occupancyPricingJson?: unknown;
  currency: string;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  versionNumber?: number;
  supersedesId?: string | null;
  contract?: {
    id: string;
    title: string;
    status: string;
    versionNumber: number | null;
  } | null;
};

type ActivityRow = {
  id: string;
  organizationId: string;
  supplierId: string | null;
  placeId: string | null;
  activityName: string;
  activityKey: string;
  privateOrSic: string | null;
  adultUnitCost: Prisma.Decimal;
  childUnitCost: Prisma.Decimal | null;
  childAgeMin: number | null;
  childAgeMax: number | null;
  currency: string;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
  versionNumber?: number;
  supersedesId?: string | null;
};

@Injectable()
export class RatesService {
  constructor(
    private prisma: PrismaService,
    private places: PlacesService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  /** Prefer org owner; else first membership with rates.approve via role key heuristics. */
  private async pickRateApproverUserId(
    organizationId: string,
    excludeUserId: string,
  ): Promise<string | null> {
    const owner = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        isOwner: true,
        userId: { not: excludeUserId },
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (owner?.userId) return owner.userId;

    const managers = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { not: excludeUserId },
        roles: {
          some: {
            role: { key: { in: ['sales_manager', 'admin', 'owner'] } },
          },
        },
      },
      select: { userId: true },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });
    return managers[0]?.userId ?? null;
  }

  private async enqueueHotelRateActivationTask(opts: {
    organizationId: string;
    actorUserId: string;
    tipId: string;
    supplierId: string | null;
    versionNumber: number;
    roomType: string | null;
  }) {
    const assigneeId =
      (await this.pickRateApproverUserId(
        opts.organizationId,
        opts.actorUserId,
      )) ?? opts.actorUserId;
    const room = opts.roomType?.trim() || 'Room';
    const title = `Activate hotel rate ${hotelRateVersionLabel(opts.versionNumber)} · ${room}`;
    const linkPath = opts.supplierId
      ? `/suppliers/${opts.supplierId}#supplier-rate-chart`
      : `/rates`;
    const task = await this.prisma.task.create({
      data: {
        organizationId: opts.organizationId,
        title,
        description: [
          'New tip is pending dual-control. Open History and Activate when buy is correct.',
          linkPath,
        ].join('\n'),
        priority: 'high',
        assigneeId,
        entityType: 'supplier_hotel_rate',
        entityId: opts.tipId,
        createdBy: opts.actorUserId,
        updatedBy: opts.actorUserId,
      },
    });
    if (assigneeId !== opts.actorUserId) {
      try {
        const flags = await this.notifications.orgNotifyFlags(
          opts.organizationId,
        );
        await this.notifications.notify({
          organizationId: opts.organizationId,
          userId: assigneeId,
          title: 'Rate tip needs activation',
          body: title,
          linkPath,
          channel: flags.notifyOnTask === false ? 'in_app' : 'both',
        });
      } catch {
        /* non-blocking */
      }
    }
    return { taskId: task.id, linkPath };
  }

  private async completeHotelRateActivationTasks(
    organizationId: string,
    tipId: string,
    actorUserId: string,
  ) {
    await this.prisma.task.updateMany({
      where: {
        organizationId,
        entityType: 'supplier_hotel_rate',
        entityId: tipId,
        status: { not: 'done' },
        deletedAt: null,
      },
      data: {
        status: 'done',
        updatedBy: actorUserId,
      },
    });
  }

  private async orgPricing(
    organizationId: string,
    opts?: { partyId?: string | null },
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { currency: true, settingsJson: true },
    });
    const settings =
      org?.settingsJson && typeof org.settingsJson === 'object'
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    let party: { businessType: string | null } | null = null;
    if (opts?.partyId) {
      party = await this.prisma.party.findFirst({
        where: { id: opts.partyId, organizationId, deletedAt: null },
        select: { businessType: true },
      });
    }
    const markup = resolveOrgMarkupPercent(settings, { party });
    const tax =
      typeof settings.defaultTaxPercent === 'number'
        ? settings.defaultTaxPercent
        : 5;
    const childFareFactor =
      typeof settings.childFareFactor === 'number'
        ? settings.childFareFactor
        : 0.7;
    const infantFareFactor =
      typeof settings.infantFareFactor === 'number'
        ? settings.infantFareFactor
        : 0.1;
    return {
      currency: org?.currency || 'INR',
      markupPercent: markup,
      taxPercent: tax,
      childFareFactor,
      infantFareFactor,
    };
  }

  private fareInclude = {
    fromPlace: { select: { id: true, name: true, kind: true, key: true } },
    toPlace: { select: { id: true, name: true, kind: true, key: true } },
    vehicleType: {
      select: { id: true, name: true, seats: true, key: true },
    },
    supplier: { select: { id: true, name: true, type: true } },
  } as const;

  private hotelInclude = {
    supplier: { select: { id: true, name: true, type: true } },
    place: { select: { id: true, name: true, kind: true, key: true } },
    roomProduct: { select: { id: true, name: true, maxOccupancy: true } },
    contract: {
      select: { id: true, title: true, status: true, versionNumber: true },
    },
  } as const;

  // ── Hotel rates ────────────────────────────────────────────────────

  async listHotelRates(
    organizationId: string | null,
    opts?: {
      supplierId?: string;
      placeId?: string;
      q?: string;
      includeSystem?: boolean;
      systemOnly?: boolean;
    },
  ) {
    const systemOnly = opts?.systemOnly === true;
    const includeSystem = opts?.includeSystem !== false;
    const items = await this.prisma.supplierHotelRate.findMany({
      where: {
        deletedAt: null,
        ...(systemOnly
          ? { isSystem: true, organizationId: null }
          : {
              OR: [
                ...(organizationId ? [{ organizationId }] : []),
                ...(includeSystem
                  ? [{ isSystem: true, organizationId: null as string | null }]
                  : []),
              ],
            }),
        ...(opts?.supplierId ? { supplierId: opts.supplierId } : {}),
        ...(opts?.placeId ? { placeId: opts.placeId } : {}),
        ...(opts?.q
          ? {
              AND: [
                {
                  OR: [
                    { roomType: { contains: opts.q } },
                    { supplier: { name: { contains: opts.q } } },
                    { place: { name: { contains: opts.q } } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: this.hotelInclude,
      orderBy: [{ isSystem: 'asc' }, { unitCost: 'asc' }],
      take: 400,
    });

    // Agency list: hide system rows that already have an org override.
    let result = items;
    if (organizationId && !systemOnly) {
      const overriddenPlaceRooms = new Set(
        items
          .filter((r) => !r.isSystem && r.placeId)
          .map(
            (r) =>
              `${r.placeId}|${(r.roomType || '').trim().toLowerCase()}`,
          ),
      );
      result = items.filter((r) => {
        if (!r.isSystem) return true;
        if (!r.placeId) return true;
        const key = `${r.placeId}|${(r.roomType || '').trim().toLowerCase()}`;
        return !overriddenPlaceRooms.has(key);
      });
    }

    return { items: result };
  }

  async createHotelRate(
    organizationId: string | null,
    userId: string,
    input: CreateSupplierHotelRateInput,
    opts?: { asSystem?: boolean },
  ) {
    const asSystem = opts?.asSystem === true || !organizationId;
    if (asSystem) {
      if (!input.placeId) {
        throw new BadRequestException('System hotel rates require placeId');
      }
      await this.assertPlace(input.placeId);
    } else {
      if (!input.supplierId && !input.placeId) {
        throw new BadRequestException('Provide supplierId or placeId');
      }
      if (input.supplierId) {
        const supplier = await this.prisma.supplier.findFirst({
          where: {
            id: input.supplierId,
            organizationId: organizationId!,
            deletedAt: null,
          },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        const stay = new Set(['hotel', 'homestay', 'farmstay']);
        if (!stay.has(supplier.type)) {
          throw new BadRequestException('Hotel rates require a stay supplier');
        }
      }
      if (input.placeId) await this.assertPlace(input.placeId);
    }
    const pricing =
      asSystem || !organizationId
        ? { currency: 'INR' }
        : await this.orgPricing(organizationId);

    let roomType = input.roomType?.trim() || null;
    let roomProductId = input.roomProductId || null;
    if (roomProductId) {
      const product = await this.prisma.assetRoomProduct.findFirst({
        where: { id: roomProductId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!product) throw new NotFoundException('Room product not found');
      if (!roomType) roomType = product.name;
    }

    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate);
    await this.assertNoHotelRateSeasonOverlap({
      organizationId: asSystem ? null : organizationId,
      isSystem: asSystem,
      supplierId: asSystem ? null : input.supplierId || null,
      placeId: input.placeId || null,
      contractId: input.contractId || null,
      roomProductId,
      roomType,
      mealPlan: input.mealPlan?.trim() || null,
      nationality:
        occupancyPricingToJson(input.occupancyPricing ?? null)?.nationality ??
        null,
      startDate,
      endDate,
    });

    return this.prisma.supplierHotelRate.create({
      data: {
        organizationId: asSystem ? null : organizationId,
        isSystem: asSystem,
        supplierId: asSystem ? null : input.supplierId || null,
        placeId: input.placeId || null,
        roomType,
        roomProductId,
        contractId: input.contractId || null,
        mealPlan: input.mealPlan?.trim() || null,
        unitCost: new Prisma.Decimal(input.unitCost),
        weekendUnitCost:
          input.weekendUnitCost != null
            ? new Prisma.Decimal(input.weekendUnitCost)
            : null,
        occupancyPricingJson: (() => {
          const occ = occupancyPricingToJson(input.occupancyPricing ?? null);
          const merged = occupancyPricingJsonWithDateSupplements(
            input.occupancyPricing ?? null,
            occ as Record<string, unknown> | null,
          );
          return merged == null
            ? Prisma.JsonNull
            : (merged as Prisma.InputJsonValue);
        })(),
        currency: input.currency || pricing.currency,
        startDate,
        endDate,
        isActive: input.isActive !== false,
        versionNumber: 1,
        createdBy: userId,
      },
      include: this.hotelInclude,
    });
  }

  async updateHotelRate(
    organizationId: string | null,
    rateId: string,
    input: UpdateSupplierHotelRateInput,
    opts?: { systemOnly?: boolean },
  ) {
    const existing = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: rateId,
        deletedAt: null,
        ...(opts?.systemOnly
          ? { isSystem: true, organizationId: null }
          : { organizationId, isSystem: false }),
      },
    });
    if (!existing) throw new NotFoundException('Hotel rate not found');
    if (input.supplierId && !opts?.systemOnly && organizationId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: {
          id: input.supplierId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }
    if (input.placeId) await this.assertPlace(input.placeId);

    let roomTypePatch:
      | { roomType: string | null }
      | Record<string, never> = {};
    let roomProductPatch:
      | { roomProductId: string | null }
      | Record<string, never> = {};
    if (input.roomProductId !== undefined) {
      const roomProductId = input.roomProductId || null;
      if (roomProductId) {
        const product = await this.prisma.assetRoomProduct.findFirst({
          where: { id: roomProductId, deletedAt: null },
          select: { id: true, name: true },
        });
        if (!product) throw new NotFoundException('Room product not found');
        roomProductPatch = { roomProductId };
        if (input.roomType === undefined || !input.roomType?.trim()) {
          roomTypePatch = { roomType: product.name };
        }
      } else {
        roomProductPatch = { roomProductId: null };
      }
    }
    if (input.roomType !== undefined && Object.keys(roomTypePatch).length === 0) {
      roomTypePatch = { roomType: input.roomType?.trim() || null };
    }

    const nextStart =
      input.startDate !== undefined
        ? parseDateOnly(input.startDate)
        : existing.startDate;
    const nextEnd =
      input.endDate !== undefined
        ? parseDateOnly(input.endDate)
        : existing.endDate;
    const nextRoomProductId =
      input.roomProductId !== undefined
        ? input.roomProductId || null
        : existing.roomProductId;
    const nextRoomType =
      'roomType' in roomTypePatch
        ? roomTypePatch.roomType
        : existing.roomType;
    const nextMeal =
      input.mealPlan !== undefined
        ? input.mealPlan?.trim() || null
        : existing.mealPlan;
    const nextContractId =
      input.contractId !== undefined
        ? input.contractId || null
        : existing.contractId;
    const nextSupplierId =
      input.supplierId !== undefined
        ? input.supplierId || null
        : existing.supplierId;
    const nextPlaceId =
      input.placeId !== undefined ? input.placeId || null : existing.placeId;
    const nextNationality =
      input.occupancyPricing !== undefined
        ? occupancyPricingToJson(input.occupancyPricing)?.nationality ?? null
        : nationalityFromOccupancy(existing.occupancyPricingJson);

    await this.assertNoHotelRateSeasonOverlap({
      organizationId: existing.organizationId,
      isSystem: existing.isSystem,
      supplierId: nextSupplierId,
      placeId: nextPlaceId,
      contractId: nextContractId,
      roomProductId: nextRoomProductId,
      roomType: nextRoomType,
      mealPlan: nextMeal,
      nationality: nextNationality,
      startDate: nextStart,
      endDate: nextEnd,
      excludeRateId: rateId,
    });

    return this.prisma.supplierHotelRate.update({
      where: { id: rateId },
      data: {
        ...(input.supplierId !== undefined
          ? { supplierId: input.supplierId || null }
          : {}),
        ...(input.placeId !== undefined
          ? { placeId: input.placeId || null }
          : {}),
        ...roomTypePatch,
        ...roomProductPatch,
        ...(input.contractId !== undefined
          ? { contractId: input.contractId || null }
          : {}),
        ...(input.mealPlan !== undefined
          ? { mealPlan: input.mealPlan?.trim() || null }
          : {}),
        ...(input.unitCost != null
          ? { unitCost: new Prisma.Decimal(input.unitCost) }
          : {}),
        ...(input.weekendUnitCost !== undefined
          ? {
              weekendUnitCost:
                input.weekendUnitCost != null
                  ? new Prisma.Decimal(input.weekendUnitCost)
                  : null,
            }
          : {}),
        ...(input.occupancyPricing !== undefined
          ? {
              occupancyPricingJson: (() => {
                const occ = occupancyPricingToJson(input.occupancyPricing);
                const merged = occupancyPricingJsonWithDateSupplements(
                  input.occupancyPricing,
                  occ as Record<string, unknown> | null,
                );
                return merged == null
                  ? Prisma.JsonNull
                  : (merged as Prisma.InputJsonValue);
              })(),
            }
          : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.startDate !== undefined
          ? { startDate: parseDateOnly(input.startDate) }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: parseDateOnly(input.endDate) }
          : {}),
        ...(input.isActive != null ? { isActive: input.isActive } : {}),
      },
      include: this.hotelInclude,
    });
  }

  async deleteHotelRate(
    organizationId: string | null,
    rateId: string,
    opts?: { systemOnly?: boolean },
  ) {
    const existing = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: rateId,
        deletedAt: null,
        ...(opts?.systemOnly
          ? { isSystem: true, organizationId: null }
          : { organizationId, isSystem: false }),
      },
    });
    if (!existing) throw new NotFoundException('Hotel rate not found');
    await this.prisma.supplierHotelRate.update({
      where: { id: rateId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  /**
   * Clone an active hotel rate as a new tip (vN+1), deactivate the source.
   * Same commercial dims + occupancy; Match uses the new tip only.
   */
  async createHotelRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
  ) {
    const source = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: rateId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
    });
    if (!source) throw new NotFoundException('Hotel rate not found');
    if (!source.isActive) {
      throw new BadRequestException(
        'Only the active tip can be versioned — open History and restore, or edit the active rate',
      );
    }

    const pendingChild = await this.prisma.supplierHotelRate.findFirst({
      where: {
        organizationId,
        supersedesId: source.id,
        isActive: false,
        deletedAt: null,
      },
      select: { id: true, versionNumber: true },
      orderBy: { versionNumber: 'desc' },
    });
    if (pendingChild) {
      throw new BadRequestException(
        `Tip v${pendingChild.versionNumber} is pending activation — Activate it before branching again`,
      );
    }

    const plan = planHotelRateNewVersion({
      id: source.id,
      versionNumber: source.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = hotelRateVersionRequiresPendingActivation(canActivate);

    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending) {
        await tx.supplierHotelRate.update({
          where: { id: source.id },
          data: { isActive: false },
        });
      }
      return tx.supplierHotelRate.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          placeId: source.placeId,
          isSystem: false,
          roomType: source.roomType,
          roomProductId: source.roomProductId,
          contractId: source.contractId,
          mealPlan: source.mealPlan,
          unitCost: source.unitCost,
          weekendUnitCost: source.weekendUnitCost,
          occupancyPricingJson:
            source.occupancyPricingJson === null
              ? Prisma.JsonNull
              : (source.occupancyPricingJson as Prisma.InputJsonValue),
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.hotelInclude,
      });
    });

    let activationTaskId: string | null = null;
    if (pending) {
      const queued = await this.enqueueHotelRateActivationTask({
        organizationId,
        actorUserId: user.sub,
        tipId: created.id,
        supplierId: created.supplierId,
        versionNumber: created.versionNumber,
        roomType: created.roomType,
      });
      activationTaskId = queued.taskId;
      await this.audit.record({
        organizationId,
        actorUserId: user.sub,
        action: 'rate.pending_activation',
        entityType: 'supplier_hotel_rate',
        entityId: created.id,
        metadata: {
          previousRateId: source.id,
          versionNumber: plan.versionNumber,
          taskId: activationTaskId,
        },
      });
    }

    return {
      ...created,
      pendingActivation: pending,
      versionMeta: {
        previousRateId: source.id,
        previousVersionNumber: plan.previousVersionNumber,
        versionNumber: plan.versionNumber,
        pendingActivation: pending,
        activationTaskId,
      },
    };
  }

  /** Manager activates a pending tip; deactivates the previous live tip. */
  async activateHotelRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
  ) {
    if (!hasPermission(user.permissions, 'rates.approve')) {
      throw new ForbiddenException('Missing rates.approve');
    }
    const tip = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: rateId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
      include: this.hotelInclude,
    });
    if (!tip) throw new NotFoundException('Hotel rate not found');
    if (tip.isActive) {
      return { ...tip, pendingActivation: false, alreadyActive: true };
    }
    if (!tip.supersedesId) {
      throw new BadRequestException('Only a branched tip can be activated');
    }

    const live = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: tip.supersedesId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, isActive: true },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      if (live?.isActive) {
        await tx.supplierHotelRate.update({
          where: { id: live.id },
          data: { isActive: false },
        });
      }
      // Deactivate any other active tips in the same supplier/room/meal window family
      // that somehow stayed live (thin safety).
      return tx.supplierHotelRate.update({
        where: { id: tip.id },
        data: { isActive: true },
        include: this.hotelInclude,
      });
    });

    await this.completeHotelRateActivationTasks(
      organizationId,
      tip.id,
      user.sub,
    );
    await this.audit.record({
      organizationId,
      actorUserId: user.sub,
      action: 'rate.activate',
      entityType: 'supplier_hotel_rate',
      entityId: tip.id,
      metadata: {
        previousRateId: tip.supersedesId,
        versionNumber: tip.versionNumber,
      },
    });

    return { ...updated, pendingActivation: false, alreadyActive: false };
  }

  /** Linear supersedes chain for a rate (any tip in the family). */
  async listHotelRateVersions(organizationId: string, rateId: string) {
    const tip = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: rateId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
      select: {
        id: true,
        versionNumber: true,
        supersedesId: true,
        isActive: true,
        unitCost: true,
        weekendUnitCost: true,
        mealPlan: true,
        roomType: true,
        occupancyPricingJson: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    });
    if (!tip) throw new NotFoundException('Hotel rate not found');

    type HotelTipRow = HotelRateVersionRef & {
      weekendUnitCost?: number | string | null;
      roomType?: string | null;
      occupancyPricingJson?: unknown;
    };

    // Walk to root, then collect descendants via BFS on supersedesId.
    const family: HotelTipRow[] = [];
    const byId = new Map<string, HotelTipRow>();
    let cur: typeof tip | null = tip;
    const seen = new Set<string>();
    const tipSelect = {
      id: true,
      versionNumber: true,
      supersedesId: true,
      isActive: true,
      unitCost: true,
      weekendUnitCost: true,
      mealPlan: true,
      roomType: true,
      occupancyPricingJson: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
    } as const;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const ref: HotelTipRow = {
        id: cur.id,
        versionNumber: cur.versionNumber,
        supersedesId: cur.supersedesId,
        isActive: cur.isActive,
        unitCost: Number(cur.unitCost),
        weekendUnitCost:
          cur.weekendUnitCost != null ? Number(cur.weekendUnitCost) : null,
        mealPlan: cur.mealPlan,
        roomType: cur.roomType,
        occupancyPricingJson: cur.occupancyPricingJson,
        startDate: cur.startDate,
        endDate: cur.endDate,
        updatedAt: cur.updatedAt,
      };
      family.push(ref);
      byId.set(ref.id, ref);
      if (!cur.supersedesId) break;
      cur = await this.prisma.supplierHotelRate.findFirst({
        where: {
          id: cur.supersedesId,
          organizationId,
          deletedAt: null,
        },
        select: tipSelect,
      });
    }

    // Also load newer tips that supersede members (forward walk).
    let frontier = family.map((r) => r.id);
    while (frontier.length) {
      const children = await this.prisma.supplierHotelRate.findMany({
        where: {
          organizationId,
          deletedAt: null,
          supersedesId: { in: frontier },
        },
        select: tipSelect,
      });
      frontier = [];
      for (const c of children) {
        if (byId.has(c.id)) continue;
        const ref: HotelTipRow = {
          id: c.id,
          versionNumber: c.versionNumber,
          supersedesId: c.supersedesId,
          isActive: c.isActive,
          unitCost: Number(c.unitCost),
          weekendUnitCost:
            c.weekendUnitCost != null ? Number(c.weekendUnitCost) : null,
          mealPlan: c.mealPlan,
          roomType: c.roomType,
          occupancyPricingJson: c.occupancyPricingJson,
          startDate: c.startDate,
          endDate: c.endDate,
          updatedAt: c.updatedAt,
        };
        byId.set(ref.id, ref);
        family.push(ref);
        frontier.push(c.id);
      }
    }

    const liveTip =
      [...byId.values()].find((r) => r.isActive) ?? null;
    const newestTip =
      [...byId.values()].sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
    const chainRoot = newestTip;
    const versions = orderHotelRateVersionChain(chainRoot, byId).map((v) => {
      const pendingActivation = hotelRateTipPendingActivation({
        isActive: v.isActive,
        isNewestInFamily: v.id === newestTip.id,
      });
      const base = { ...v, pendingActivation };
      if (!liveTip || v.id === liveTip.id) {
        return {
          ...base,
          diffVsActive: null as ReturnType<typeof diffHotelRateTips> | null,
        };
      }
      return {
        ...base,
        diffVsActive: diffHotelRateTips(v, liveTip),
      };
    });

    return {
      rateId,
      activeRateId: liveTip?.id ?? newestTip.id,
      versions,
    };
  }

  /**
   * Restore a historical tip by creating a new active version from its content
   * (does not reactivate the old row).
   */
  async restoreHotelRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
    sourceVersionId: string,
  ) {
    const source = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: sourceVersionId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
    });
    if (!source) throw new NotFoundException('Source rate version not found');

    const chain = await this.listHotelRateVersions(organizationId, rateId);
    if (!chain.versions.some((v) => v.id === sourceVersionId)) {
      throw new BadRequestException('Source is not in this rate version family');
    }

    const active = await this.prisma.supplierHotelRate.findFirst({
      where: {
        id: chain.activeRateId,
        organizationId,
        deletedAt: null,
      },
    });
    if (!active) throw new NotFoundException('Active rate tip not found');

    const pendingTip = chain.versions.find((v) => v.pendingActivation);
    if (pendingTip) {
      throw new BadRequestException(
        `Tip v${pendingTip.versionNumber} is pending activation — Activate it before restore`,
      );
    }

    // Version from active tip, copying content from historical source.
    const plan = planHotelRateNewVersion({
      id: active.id,
      versionNumber: active.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = hotelRateVersionRequiresPendingActivation(canActivate);

    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending && active.isActive) {
        await tx.supplierHotelRate.update({
          where: { id: active.id },
          data: { isActive: false },
        });
      }
      return tx.supplierHotelRate.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          placeId: source.placeId,
          isSystem: false,
          roomType: source.roomType,
          roomProductId: source.roomProductId,
          contractId: source.contractId,
          mealPlan: source.mealPlan,
          unitCost: source.unitCost,
          weekendUnitCost: source.weekendUnitCost,
          occupancyPricingJson:
            source.occupancyPricingJson === null
              ? Prisma.JsonNull
              : (source.occupancyPricingJson as Prisma.InputJsonValue),
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.hotelInclude,
      });
    });

    if (pending) {
      await this.enqueueHotelRateActivationTask({
        organizationId,
        actorUserId: user.sub,
        tipId: created.id,
        supplierId: created.supplierId,
        versionNumber: created.versionNumber,
        roomType: created.roomType,
      });
      await this.audit.record({
        organizationId,
        actorUserId: user.sub,
        action: 'rate.pending_activation',
        entityType: 'supplier_hotel_rate',
        entityId: created.id,
        metadata: {
          previousRateId: active.id,
          restoredFromId: source.id,
          versionNumber: plan.versionNumber,
        },
      });
    }

    return { ...created, pendingActivation: pending };
  }

  // ── Transfer fare versions ─────────────────────────────────────────

  async createTransferFareVersion(
    organizationId: string,
    user: AuthUser,
    fareId: string,
  ) {
    const source = await this.prisma.transferFare.findFirst({
      where: {
        id: fareId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
    });
    if (!source) throw new NotFoundException('Transfer fare not found');
    if (!source.isActive) {
      throw new BadRequestException(
        'Only the active tip can be versioned — open History and restore, or edit the active fare',
      );
    }
    const pendingChild = await this.prisma.transferFare.findFirst({
      where: {
        organizationId,
        supersedesId: source.id,
        isActive: false,
        deletedAt: null,
      },
      select: { id: true, versionNumber: true },
      orderBy: { versionNumber: 'desc' },
    });
    if (pendingChild) {
      throw new BadRequestException(
        `Tip v${pendingChild.versionNumber} is pending activation — Activate it before branching again`,
      );
    }
    const plan = planRateNewVersion({
      id: source.id,
      versionNumber: source.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = rateTipVersionRequiresPendingActivation(canActivate);
    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending) {
        await tx.transferFare.update({
          where: { id: source.id },
          data: { isActive: false },
        });
      }
      return tx.transferFare.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          isSystem: false,
          fromPlaceId: source.fromPlaceId,
          toPlaceId: source.toPlaceId,
          vehicleTypeId: source.vehicleTypeId,
          unitCost: source.unitCost,
          childUnitCost: source.childUnitCost,
          infantUnitCost: source.infantUnitCost,
          childAgeMin: source.childAgeMin,
          childAgeMax: source.childAgeMax,
          pricingMode: source.pricingMode,
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.fareInclude,
      });
    });
    if (pending) {
      await this.audit.record({
        organizationId,
        actorUserId: user.sub,
        action: 'rate.pending_activation',
        entityType: 'transfer_fare',
        entityId: created.id,
        metadata: {
          previousRateId: source.id,
          versionNumber: plan.versionNumber,
        },
      });
    }
    return {
      ...created,
      pendingActivation: pending,
      versionMeta: {
        previousRateId: source.id,
        previousVersionNumber: plan.previousVersionNumber,
        versionNumber: plan.versionNumber,
        pendingActivation: pending,
      },
    };
  }

  async activateTransferFareVersion(
    organizationId: string,
    user: AuthUser,
    fareId: string,
  ) {
    if (!hasPermission(user.permissions, 'rates.approve')) {
      throw new ForbiddenException('Missing rates.approve');
    }
    const tip = await this.prisma.transferFare.findFirst({
      where: {
        id: fareId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
      include: this.fareInclude,
    });
    if (!tip) throw new NotFoundException('Transfer fare not found');
    if (tip.isActive) {
      return { ...tip, pendingActivation: false, alreadyActive: true };
    }
    if (!tip.supersedesId) {
      throw new BadRequestException('Only a branched tip can be activated');
    }
    const live = await this.prisma.transferFare.findFirst({
      where: {
        id: tip.supersedesId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, isActive: true },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      if (live?.isActive) {
        await tx.transferFare.update({
          where: { id: live.id },
          data: { isActive: false },
        });
      }
      return tx.transferFare.update({
        where: { id: tip.id },
        data: { isActive: true },
        include: this.fareInclude,
      });
    });
    await this.audit.record({
      organizationId,
      actorUserId: user.sub,
      action: 'rate.activated',
      entityType: 'transfer_fare',
      entityId: tip.id,
      metadata: { previousRateId: tip.supersedesId },
    });
    return { ...updated, pendingActivation: false, alreadyActive: false };
  }

  async listTransferFareVersions(organizationId: string, fareId: string) {
    const transferVersionSelect = {
      id: true,
      versionNumber: true,
      supersedesId: true,
      isActive: true,
      unitCost: true,
      childUnitCost: true,
      infantUnitCost: true,
      pricingMode: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
    } as const;
    return this.listGenericRateVersions({
      rateId: fareId,
      findOne: (id) =>
        this.prisma.transferFare.findFirst({
          where: {
            id,
            organizationId,
            isSystem: false,
            deletedAt: null,
          },
          select: transferVersionSelect,
        }),
      findAncestor: (id) =>
        this.prisma.transferFare.findFirst({
          where: { id, organizationId, deletedAt: null },
          select: transferVersionSelect,
        }),
      findChildren: (ids) =>
        this.prisma.transferFare.findMany({
          where: {
            organizationId,
            deletedAt: null,
            supersedesId: { in: ids },
          },
          select: transferVersionSelect,
        }),
      mapRow: (row) => ({
        id: row.id,
        versionNumber: row.versionNumber,
        supersedesId: row.supersedesId,
        isActive: row.isActive,
        unitCost: Number(row.unitCost),
        childUnitCost:
          row.childUnitCost != null ? Number(row.childUnitCost) : null,
        infantUnitCost:
          row.infantUnitCost != null ? Number(row.infantUnitCost) : null,
        pricingMode: row.pricingMode,
        startDate: row.startDate,
        endDate: row.endDate,
        updatedAt: row.updatedAt,
      }),
      attachDiffVsActive: (prior, active) =>
        diffTransferFareTips(prior, active),
      notFound: 'Transfer fare not found',
    });
  }

  async restoreTransferFareVersion(
    organizationId: string,
    user: AuthUser,
    fareId: string,
    sourceVersionId: string,
  ) {
    const source = await this.prisma.transferFare.findFirst({
      where: {
        id: sourceVersionId,
        organizationId,
        isSystem: false,
        deletedAt: null,
      },
    });
    if (!source) throw new NotFoundException('Source fare version not found');
    const chain = await this.listTransferFareVersions(organizationId, fareId);
    if (!chain.versions.some((v) => v.id === sourceVersionId)) {
      throw new BadRequestException('Source is not in this fare version family');
    }
    const pendingTip = chain.versions.find((v) => v.pendingActivation);
    if (pendingTip) {
      throw new BadRequestException(
        `Tip v${pendingTip.versionNumber} is pending activation — Activate it before restore`,
      );
    }
    const active = await this.prisma.transferFare.findFirst({
      where: { id: chain.activeRateId, organizationId, deletedAt: null },
    });
    if (!active) throw new NotFoundException('Active fare tip not found');
    const plan = planRateNewVersion({
      id: active.id,
      versionNumber: active.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = rateTipVersionRequiresPendingActivation(canActivate);
    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending && active.isActive) {
        await tx.transferFare.update({
          where: { id: active.id },
          data: { isActive: false },
        });
      }
      return tx.transferFare.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          isSystem: false,
          fromPlaceId: source.fromPlaceId,
          toPlaceId: source.toPlaceId,
          vehicleTypeId: source.vehicleTypeId,
          unitCost: source.unitCost,
          childUnitCost: source.childUnitCost,
          infantUnitCost: source.infantUnitCost,
          childAgeMin: source.childAgeMin,
          childAgeMax: source.childAgeMax,
          pricingMode: source.pricingMode,
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.fareInclude,
      });
    });
    return { ...created, pendingActivation: pending };
  }

  // ── Activity rate versions ────────────────────────────────────────

  async createActivityRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
  ) {
    const source = await this.prisma.supplierActivityRate.findFirst({
      where: { id: rateId, organizationId, deletedAt: null },
    });
    if (!source) throw new NotFoundException('Activity rate not found');
    if (!source.isActive) {
      throw new BadRequestException(
        'Only the active tip can be versioned — open History and restore, or edit the active rate',
      );
    }
    const pendingChild = await this.prisma.supplierActivityRate.findFirst({
      where: {
        organizationId,
        supersedesId: source.id,
        isActive: false,
        deletedAt: null,
      },
      select: { id: true, versionNumber: true },
      orderBy: { versionNumber: 'desc' },
    });
    if (pendingChild) {
      throw new BadRequestException(
        `Tip v${pendingChild.versionNumber} is pending activation — Activate it before branching again`,
      );
    }
    const plan = planRateNewVersion({
      id: source.id,
      versionNumber: source.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = rateTipVersionRequiresPendingActivation(canActivate);
    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending) {
        await tx.supplierActivityRate.update({
          where: { id: source.id },
          data: { isActive: false },
        });
      }
      return tx.supplierActivityRate.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          placeId: source.placeId,
          activityName: source.activityName,
          activityKey: source.activityKey,
          privateOrSic: source.privateOrSic,
          adultUnitCost: source.adultUnitCost,
          childUnitCost: source.childUnitCost,
          childAgeMin: source.childAgeMin,
          childAgeMax: source.childAgeMax,
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.activityInclude,
      });
    });
    if (pending) {
      await this.audit.record({
        organizationId,
        actorUserId: user.sub,
        action: 'rate.pending_activation',
        entityType: 'supplier_activity_rate',
        entityId: created.id,
        metadata: {
          previousRateId: source.id,
          versionNumber: plan.versionNumber,
        },
      });
    }
    return {
      ...created,
      pendingActivation: pending,
      versionMeta: {
        previousRateId: source.id,
        previousVersionNumber: plan.previousVersionNumber,
        versionNumber: plan.versionNumber,
        pendingActivation: pending,
      },
    };
  }

  async activateActivityRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
  ) {
    if (!hasPermission(user.permissions, 'rates.approve')) {
      throw new ForbiddenException('Missing rates.approve');
    }
    const tip = await this.prisma.supplierActivityRate.findFirst({
      where: { id: rateId, organizationId, deletedAt: null },
      include: this.activityInclude,
    });
    if (!tip) throw new NotFoundException('Activity rate not found');
    if (tip.isActive) {
      return { ...tip, pendingActivation: false, alreadyActive: true };
    }
    if (!tip.supersedesId) {
      throw new BadRequestException('Only a branched tip can be activated');
    }
    const live = await this.prisma.supplierActivityRate.findFirst({
      where: {
        id: tip.supersedesId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, isActive: true },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      if (live?.isActive) {
        await tx.supplierActivityRate.update({
          where: { id: live.id },
          data: { isActive: false },
        });
      }
      return tx.supplierActivityRate.update({
        where: { id: tip.id },
        data: { isActive: true },
        include: this.activityInclude,
      });
    });
    await this.audit.record({
      organizationId,
      actorUserId: user.sub,
      action: 'rate.activated',
      entityType: 'supplier_activity_rate',
      entityId: tip.id,
      metadata: { previousRateId: tip.supersedesId },
    });
    return { ...updated, pendingActivation: false, alreadyActive: false };
  }

  async listActivityRateVersions(organizationId: string, rateId: string) {
    const activityVersionSelect = {
      id: true,
      versionNumber: true,
      supersedesId: true,
      isActive: true,
      adultUnitCost: true,
      childUnitCost: true,
      privateOrSic: true,
      activityName: true,
      startDate: true,
      endDate: true,
      updatedAt: true,
    } as const;
    return this.listGenericRateVersions({
      rateId,
      findOne: (id) =>
        this.prisma.supplierActivityRate.findFirst({
          where: { id, organizationId, deletedAt: null },
          select: activityVersionSelect,
        }),
      findAncestor: (id) =>
        this.prisma.supplierActivityRate.findFirst({
          where: { id, organizationId, deletedAt: null },
          select: activityVersionSelect,
        }),
      findChildren: (ids) =>
        this.prisma.supplierActivityRate.findMany({
          where: {
            organizationId,
            deletedAt: null,
            supersedesId: { in: ids },
          },
          select: activityVersionSelect,
        }),
      mapRow: (row) => ({
        id: row.id,
        versionNumber: row.versionNumber,
        supersedesId: row.supersedesId,
        isActive: row.isActive,
        unitCost: Number(row.adultUnitCost),
        childUnitCost:
          row.childUnitCost != null ? Number(row.childUnitCost) : null,
        privateOrSic: row.privateOrSic,
        activityName: row.activityName,
        startDate: row.startDate,
        endDate: row.endDate,
        updatedAt: row.updatedAt,
      }),
      attachDiffVsActive: (prior, active) =>
        diffActivityRateTips(prior, active),
      notFound: 'Activity rate not found',
    });
  }

  async restoreActivityRateVersion(
    organizationId: string,
    user: AuthUser,
    rateId: string,
    sourceVersionId: string,
  ) {
    const source = await this.prisma.supplierActivityRate.findFirst({
      where: { id: sourceVersionId, organizationId, deletedAt: null },
    });
    if (!source) throw new NotFoundException('Source rate version not found');
    const chain = await this.listActivityRateVersions(organizationId, rateId);
    if (!chain.versions.some((v) => v.id === sourceVersionId)) {
      throw new BadRequestException('Source is not in this rate version family');
    }
    const pendingTip = chain.versions.find((v) => v.pendingActivation);
    if (pendingTip) {
      throw new BadRequestException(
        `Tip v${pendingTip.versionNumber} is pending activation — Activate it before restore`,
      );
    }
    const active = await this.prisma.supplierActivityRate.findFirst({
      where: { id: chain.activeRateId, organizationId, deletedAt: null },
    });
    if (!active) throw new NotFoundException('Active rate tip not found');
    const plan = planRateNewVersion({
      id: active.id,
      versionNumber: active.versionNumber,
    });
    const canActivate = hasPermission(user.permissions, 'rates.approve');
    const pending = rateTipVersionRequiresPendingActivation(canActivate);
    const created = await this.prisma.$transaction(async (tx) => {
      if (!pending && active.isActive) {
        await tx.supplierActivityRate.update({
          where: { id: active.id },
          data: { isActive: false },
        });
      }
      return tx.supplierActivityRate.create({
        data: {
          organizationId: source.organizationId,
          supplierId: source.supplierId,
          placeId: source.placeId,
          activityName: source.activityName,
          activityKey: source.activityKey,
          privateOrSic: source.privateOrSic,
          adultUnitCost: source.adultUnitCost,
          childUnitCost: source.childUnitCost,
          childAgeMin: source.childAgeMin,
          childAgeMax: source.childAgeMax,
          currency: source.currency,
          startDate: source.startDate,
          endDate: source.endDate,
          isActive: !pending,
          versionNumber: plan.versionNumber,
          supersedesId: plan.supersedesId,
          createdBy: user.sub,
        },
        include: this.activityInclude,
      });
    });
    return { ...created, pendingActivation: pending };
  }

  private async listGenericRateVersions<
    TRow extends {
      id: string;
      versionNumber: number;
      supersedesId: string | null;
      isActive: boolean;
    },
    TRef extends RateVersionRef,
  >(opts: {
    rateId: string;
    findOne: (id: string) => Promise<TRow | null>;
    findAncestor: (id: string) => Promise<TRow | null>;
    findChildren: (ids: string[]) => Promise<TRow[]>;
    mapRow: (row: TRow) => TRef;
    attachDiffVsActive?: (
      prior: TRef,
      active: TRef,
    ) => { changes: string[]; summary: string | null } | null;
    notFound: string;
  }) {
    const tip = await opts.findOne(opts.rateId);
    if (!tip) throw new NotFoundException(opts.notFound);

    const family: TRef[] = [];
    const byId = new Map<string, TRef>();
    let cur: TRow | null = tip;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const ref = opts.mapRow(cur);
      family.push(ref);
      byId.set(ref.id, ref);
      if (!cur.supersedesId) break;
      cur = await opts.findAncestor(cur.supersedesId);
    }

    let frontier = family.map((r) => r.id);
    while (frontier.length) {
      const children = await opts.findChildren(frontier);
      frontier = [];
      for (const c of children) {
        if (byId.has(c.id)) continue;
        const ref = opts.mapRow(c);
        byId.set(ref.id, ref);
        family.push(ref);
        frontier.push(c.id);
      }
    }

    const activeTip =
      [...byId.values()].find((r) => r.isActive) ?? null;
    const newestTip =
      [...byId.values()].sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
    const chainRoot = newestTip;
    const liveTip = activeTip ?? newestTip;
    const versions = orderRateVersionChain(chainRoot, byId).map((v) => {
      const pendingActivation = rateTipPendingActivation({
        isActive: v.isActive,
        isNewestInFamily: v.id === newestTip.id,
      });
      const base = { ...v, pendingActivation };
      if (!opts.attachDiffVsActive || v.id === liveTip.id) {
        return { ...base, diffVsActive: null };
      }
      return {
        ...base,
        diffVsActive: opts.attachDiffVsActive(v, liveTip),
      };
    });

    return {
      rateId: opts.rateId,
      activeRateId: liveTip.id,
      versions,
    };
  }

  // ── Activity rates ────────────────────────────────────────────────

  private activityInclude = {
    place: { select: { id: true, name: true, kind: true } },
    supplier: { select: { id: true, name: true, type: true } },
  } as const;

  async listActivityRates(
    organizationId: string,
    opts?: { supplierId?: string; placeId?: string; q?: string },
  ) {
    const items = await this.prisma.supplierActivityRate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(opts?.supplierId ? { supplierId: opts.supplierId } : {}),
        ...(opts?.placeId ? { placeId: opts.placeId } : {}),
        ...(opts?.q
          ? {
              OR: [
                { activityName: { contains: opts.q } },
                { activityKey: { contains: opts.q } },
                { supplier: { name: { contains: opts.q } } },
                { place: { name: { contains: opts.q } } },
              ],
            }
          : {}),
      },
      include: this.activityInclude,
      orderBy: [{ activityName: 'asc' }, { adultUnitCost: 'asc' }],
      take: 400,
    });
    return { items };
  }

  async createActivityRate(
    organizationId: string,
    userId: string,
    input: CreateSupplierActivityRateInput,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId,
        deletedAt: null,
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.type !== 'activity') {
      throw new BadRequestException('Activity rates require an activity supplier');
    }
    if (input.placeId) await this.assertPlace(input.placeId);

    const activityName = input.activityName.trim();
    const activityKey = normalizeActivityKey(activityName);
    if (!activityKey) {
      throw new BadRequestException('Activity name is required');
    }

    const pricing = await this.orgPricing(organizationId);
    const privateOrSic = input.privateOrSic ?? null;
    const childAges = this.normalizeChildAgeBounds(
      input.childAgeMin,
      input.childAgeMax,
    );

    return this.prisma.supplierActivityRate.create({
      data: {
        organizationId,
        supplierId: input.supplierId,
        placeId: input.placeId || supplier.placeId || null,
        activityName,
        activityKey,
        privateOrSic,
        adultUnitCost: new Prisma.Decimal(input.adultUnitCost),
        childUnitCost:
          input.childUnitCost != null
            ? new Prisma.Decimal(input.childUnitCost)
            : null,
        childAgeMin: childAges.min,
        childAgeMax: childAges.max,
        currency: input.currency || pricing.currency,
        startDate: parseDateOnly(input.startDate),
        endDate: parseDateOnly(input.endDate),
        isActive: input.isActive !== false,
        createdBy: userId,
      },
      include: this.activityInclude,
    });
  }

  async updateActivityRate(
    organizationId: string,
    rateId: string,
    input: UpdateSupplierActivityRateInput,
  ) {
    const existing = await this.prisma.supplierActivityRate.findFirst({
      where: { id: rateId, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Activity rate not found');
    if (input.placeId) await this.assertPlace(input.placeId);

    const activityName =
      input.activityName !== undefined
        ? input.activityName.trim()
        : existing.activityName;
    const activityKey = normalizeActivityKey(activityName);
    if (!activityKey) {
      throw new BadRequestException('Activity name is required');
    }

    const childAgesTouched =
      input.childAgeMin !== undefined || input.childAgeMax !== undefined;
    const childAges = childAgesTouched
      ? this.normalizeChildAgeBounds(
          input.childAgeMin !== undefined
            ? input.childAgeMin
            : existing.childAgeMin,
          input.childAgeMax !== undefined
            ? input.childAgeMax
            : existing.childAgeMax,
        )
      : null;

    return this.prisma.supplierActivityRate.update({
      where: { id: rateId },
      data: {
        ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
        ...(input.activityName !== undefined
          ? { activityName, activityKey }
          : {}),
        ...(input.privateOrSic !== undefined
          ? { privateOrSic: input.privateOrSic }
          : {}),
        ...(input.adultUnitCost != null
          ? { adultUnitCost: new Prisma.Decimal(input.adultUnitCost) }
          : {}),
        ...(input.childUnitCost !== undefined
          ? {
              childUnitCost:
                input.childUnitCost != null
                  ? new Prisma.Decimal(input.childUnitCost)
                  : null,
            }
          : {}),
        ...(childAges
          ? { childAgeMin: childAges.min, childAgeMax: childAges.max }
          : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.startDate !== undefined
          ? { startDate: parseDateOnly(input.startDate) }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: parseDateOnly(input.endDate) }
          : {}),
        ...(input.isActive != null ? { isActive: input.isActive } : {}),
      },
      include: this.activityInclude,
    });
  }

  async deleteActivityRate(organizationId: string, rateId: string) {
    const existing = await this.prisma.supplierActivityRate.findFirst({
      where: { id: rateId, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Activity rate not found');
    await this.prisma.supplierActivityRate.update({
      where: { id: rateId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  private normalizeChildAgeBounds(
    minRaw: number | null | undefined,
    maxRaw: number | null | undefined,
  ): { min: number | null; max: number | null } {
    if (minRaw == null && maxRaw == null) {
      return { min: null, max: null };
    }
    const min =
      minRaw != null && Number.isFinite(minRaw)
        ? Math.max(0, Math.min(17, Math.round(minRaw)))
        : 0;
    const max =
      maxRaw != null && Number.isFinite(maxRaw)
        ? Math.max(0, Math.min(17, Math.round(maxRaw)))
        : 17;
    if (min > max) {
      throw new BadRequestException('childAgeMin cannot exceed childAgeMax');
    }
    return { min, max };
  }

  // ── Transfer fares ─────────────────────────────────────────────────

  async listTransferFares(
    organizationId: string | null,
    opts?: {
      fromPlaceId?: string;
      toPlaceId?: string;
      vehicleTypeId?: string;
      supplierId?: string;
      q?: string;
      systemOnly?: boolean;
      includeSystem?: boolean;
    },
  ) {
    const systemOnly = opts?.systemOnly === true;
    const includeSystem = opts?.includeSystem !== false;
    const supplierId = opts?.supplierId?.trim();
    const items = await this.prisma.transferFare.findMany({
      where: {
        deletedAt: null,
        ...(supplierId
          ? {
              organizationId: organizationId!,
              isSystem: false,
              supplierId,
            }
          : systemOnly
            ? { isSystem: true, organizationId: null }
            : {
                OR: [
                  ...(organizationId ? [{ organizationId }] : []),
                  ...(includeSystem && organizationId
                    ? [{ isSystem: true, organizationId: null as string | null }]
                    : []),
                  ...(includeSystem && !organizationId
                    ? [{ isSystem: true }]
                    : []),
                ],
              }),
        ...(opts?.fromPlaceId ? { fromPlaceId: opts.fromPlaceId } : {}),
        ...(opts?.toPlaceId ? { toPlaceId: opts.toPlaceId } : {}),
        ...(opts?.vehicleTypeId ? { vehicleTypeId: opts.vehicleTypeId } : {}),
        ...(opts?.q
          ? {
              AND: [
                {
                  OR: [
                    { fromPlace: { name: { contains: opts.q } } },
                    { toPlace: { name: { contains: opts.q } } },
                    { vehicleType: { name: { contains: opts.q } } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: this.fareInclude,
      orderBy: [
        { isSystem: 'asc' },
        { fromPlace: { name: 'asc' } },
        { toPlace: { name: 'asc' } },
        { vehicleType: { name: 'asc' } },
      ],
      take: 500,
    });

    // Agency list: once an org override exists for a route+vehicle, hide the system row.
    // Supplier-scoped lists skip this (only that supplier's rows).
    let result = items;
    if (organizationId && !systemOnly && !supplierId) {
      const overriddenRoutes = new Set(
        items
          .filter((f) => !f.isSystem)
          .map(
            (f) => `${f.fromPlaceId}|${f.toPlaceId}|${f.vehicleTypeId}`,
          ),
      );
      result = items.filter((f) => {
        if (!f.isSystem) return true;
        const key = `${f.fromPlaceId}|${f.toPlaceId}|${f.vehicleTypeId}`;
        return !overriddenRoutes.has(key);
      });
    }

    return { items: result };
  }

  async createTransferFare(
    organizationId: string | null,
    userId: string,
    input: CreateTransferFareInput,
    opts?: { asSystem?: boolean },
  ) {
    const asSystem = opts?.asSystem === true || !organizationId;
    if (input.fromPlaceId === input.toPlaceId) {
      throw new BadRequestException('From and to places must differ');
    }
    await this.assertPlace(input.fromPlaceId);
    await this.assertPlace(input.toPlaceId);
    await this.assertVehicleType(organizationId, input.vehicleTypeId);

    let supplierId: string | null = null;
    if (!asSystem && input.supplierId?.trim()) {
      if (!organizationId) {
        throw new BadRequestException('Organization required for supplier fares');
      }
      const supplier = await this.prisma.supplier.findFirst({
        where: {
          id: input.supplierId.trim(),
          organizationId,
          deletedAt: null,
        },
        select: { id: true, type: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
      const t = (supplier.type || '').toLowerCase();
      if (
        t !== 'car_rental' &&
        t !== 'driver' &&
        t !== 'transfer' &&
        t !== 'transport' &&
        t !== 'fleet'
      ) {
        throw new BadRequestException(
          'Transfer fares require a transport / fleet / driver supplier',
        );
      }
      supplierId = supplier.id;
    }

    const pricing = organizationId
      ? await this.orgPricing(organizationId)
      : { currency: 'INR' };
    const childAges = this.normalizeChildAgeBounds(
      input.childAgeMin,
      input.childAgeMax,
    );
    return this.prisma.transferFare.create({
      data: {
        organizationId: asSystem ? null : organizationId,
        isSystem: asSystem,
        supplierId: asSystem ? null : supplierId,
        fromPlaceId: input.fromPlaceId,
        toPlaceId: input.toPlaceId,
        vehicleTypeId: input.vehicleTypeId,
        unitCost: new Prisma.Decimal(input.unitCost),
        childUnitCost:
          input.childUnitCost != null
            ? new Prisma.Decimal(input.childUnitCost)
            : null,
        infantUnitCost:
          input.infantUnitCost != null
            ? new Prisma.Decimal(input.infantUnitCost)
            : null,
        childAgeMin: childAges.min,
        childAgeMax: childAges.max,
        pricingMode: input.pricingMode || 'per_vehicle',
        currency: input.currency || pricing.currency,
        startDate: parseDateOnly(input.startDate),
        endDate: parseDateOnly(input.endDate),
        isActive: input.isActive !== false,
        createdBy: userId,
      },
      include: this.fareInclude,
    });
  }

  async updateTransferFare(
    organizationId: string | null,
    fareId: string,
    input: UpdateTransferFareInput,
    opts?: { systemOnly?: boolean },
  ) {
    const existing = await this.prisma.transferFare.findFirst({
      where: {
        id: fareId,
        deletedAt: null,
        ...(opts?.systemOnly
          ? { isSystem: true, organizationId: null }
          : { organizationId: organizationId!, isSystem: false }),
      },
    });
    if (!existing) throw new NotFoundException('Transfer fare not found');
    const fromPlaceId = input.fromPlaceId || existing.fromPlaceId;
    const toPlaceId = input.toPlaceId || existing.toPlaceId;
    if (fromPlaceId === toPlaceId) {
      throw new BadRequestException('From and to places must differ');
    }
    if (input.fromPlaceId) await this.assertPlace(input.fromPlaceId);
    if (input.toPlaceId) await this.assertPlace(input.toPlaceId);
    if (input.vehicleTypeId) {
      await this.assertVehicleType(organizationId, input.vehicleTypeId);
    }
    let nextSupplierId: string | null | undefined;
    if (input.supplierId !== undefined) {
      if (input.supplierId == null || !String(input.supplierId).trim()) {
        nextSupplierId = null;
      } else {
        if (!organizationId) {
          throw new BadRequestException('Organization required for supplier fares');
        }
        const supplier = await this.prisma.supplier.findFirst({
          where: {
            id: String(input.supplierId).trim(),
            organizationId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        nextSupplierId = supplier.id;
      }
    }
    return this.prisma.transferFare.update({
      where: { id: fareId },
      data: {
        ...(input.fromPlaceId ? { fromPlaceId: input.fromPlaceId } : {}),
        ...(input.toPlaceId ? { toPlaceId: input.toPlaceId } : {}),
        ...(input.vehicleTypeId ? { vehicleTypeId: input.vehicleTypeId } : {}),
        ...(nextSupplierId !== undefined ? { supplierId: nextSupplierId } : {}),
        ...(input.unitCost != null
          ? { unitCost: new Prisma.Decimal(input.unitCost) }
          : {}),
        ...(input.childUnitCost !== undefined
          ? {
              childUnitCost:
                input.childUnitCost != null
                  ? new Prisma.Decimal(input.childUnitCost)
                  : null,
            }
          : {}),
        ...(input.infantUnitCost !== undefined
          ? {
              infantUnitCost:
                input.infantUnitCost != null
                  ? new Prisma.Decimal(input.infantUnitCost)
                  : null,
            }
          : {}),
        ...(input.childAgeMin !== undefined || input.childAgeMax !== undefined
          ? (() => {
              const bounds = this.normalizeChildAgeBounds(
                input.childAgeMin !== undefined
                  ? input.childAgeMin
                  : existing.childAgeMin,
                input.childAgeMax !== undefined
                  ? input.childAgeMax
                  : existing.childAgeMax,
              );
              return { childAgeMin: bounds.min, childAgeMax: bounds.max };
            })()
          : {}),
        ...(input.pricingMode ? { pricingMode: input.pricingMode } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.startDate !== undefined
          ? { startDate: parseDateOnly(input.startDate) }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: parseDateOnly(input.endDate) }
          : {}),
        ...(input.isActive != null ? { isActive: input.isActive } : {}),
      },
      include: this.fareInclude,
    });
  }

  async deleteTransferFare(
    organizationId: string | null,
    fareId: string,
    opts?: { systemOnly?: boolean },
  ) {
    const existing = await this.prisma.transferFare.findFirst({
      where: {
        id: fareId,
        deletedAt: null,
        ...(opts?.systemOnly
          ? { isSystem: true, organizationId: null }
          : { organizationId: organizationId!, isSystem: false }),
      },
    });
    if (!existing) throw new NotFoundException('Transfer fare not found');
    await this.prisma.transferFare.update({
      where: { id: fareId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  /** Clone a system fare into an agency override row. */
  async overrideTransferFare(
    organizationId: string,
    userId: string,
    systemFareId: string,
    overrides?: Partial<CreateTransferFareInput>,
  ) {
    const system = await this.prisma.transferFare.findFirst({
      where: {
        id: systemFareId,
        isSystem: true,
        organizationId: null,
        deletedAt: null,
      },
    });
    if (!system) throw new NotFoundException('System fare not found');
    const existing = await this.prisma.transferFare.findFirst({
      where: {
        organizationId,
        isSystem: false,
        fromPlaceId: system.fromPlaceId,
        toPlaceId: system.toPlaceId,
        vehicleTypeId: system.vehicleTypeId,
        deletedAt: null,
      },
      include: this.fareInclude,
    });
    // Re-open existing agency override instead of erroring (edit UX).
    if (existing) return existing;
    return this.createTransferFare(organizationId, userId, {
      fromPlaceId: overrides?.fromPlaceId || system.fromPlaceId,
      toPlaceId: overrides?.toPlaceId || system.toPlaceId,
      vehicleTypeId: overrides?.vehicleTypeId || system.vehicleTypeId,
      unitCost:
        overrides?.unitCost ?? Number(system.unitCost),
      childUnitCost:
        overrides?.childUnitCost !== undefined
          ? overrides.childUnitCost
          : system.childUnitCost != null
            ? Number(system.childUnitCost)
            : null,
      infantUnitCost:
        overrides?.infantUnitCost !== undefined
          ? overrides.infantUnitCost
          : system.infantUnitCost != null
            ? Number(system.infantUnitCost)
            : null,
      pricingMode:
        (overrides?.pricingMode as 'per_vehicle' | 'per_adult') ||
        (system.pricingMode as 'per_vehicle' | 'per_adult'),
      currency: overrides?.currency || system.currency,
      startDate: overrides?.startDate,
      endDate: overrides?.endDate,
      isActive: true,
    });
  }

  async suggestTransferFare(
    organizationId: string | null,
    input: SuggestTransferFareInput,
  ) {
    await this.assertPlace(input.fromPlaceId);
    await this.assertPlace(input.toPlaceId);
    const vt = await this.prisma.vehicleType.findFirst({
      where: { id: input.vehicleTypeId, deletedAt: null },
      select: { id: true, key: true, name: true },
    });
    if (!vt) throw new NotFoundException('Vehicle type not found');

    let distanceKm: number | null = null;
    let durationMin: number | null = null;
    let source: 'google' | 'edge' | 'haversine' = 'haversine';

    try {
      const route = await this.places.resolveRoute(
        organizationId || '',
        input.fromPlaceId,
        input.toPlaceId,
      );
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
      if (route.source === 'google') source = 'google';
      else if (route.source === 'edge') source = 'edge';
      else throw new Error('unavailable');
    } catch {
      // fall through to haversine
    }

    if (distanceKm == null || distanceKm <= 0) {
      const [from, to] = await Promise.all([
        this.prisma.place.findFirst({
          where: { id: input.fromPlaceId },
          select: { profileJson: true },
        }),
        this.prisma.place.findFirst({
          where: { id: input.toPlaceId },
          select: { profileJson: true },
        }),
      ]);
      const a = coordsFromProfile(from?.profileJson);
      const b = coordsFromProfile(to?.profileJson);
      if (a && b) {
        distanceKm = round2(haversineKm(a, b));
        durationMin = Math.round((distanceKm / 35) * 60);
        source = 'haversine';
      }
    }

    if (distanceKm == null || distanceKm <= 0) {
      throw new BadRequestException(
        'Could not estimate distance between places',
      );
    }

    const band =
      SYSTEM_VEHICLE_RATE_BANDS[vt.key || ''] ||
      SYSTEM_VEHICLE_RATE_BANDS['suv-innova'] ||
      { inrPerKm: 28, minFare: 1500 };
    const suggestedUnitCost = Math.max(
      band.minFare,
      Math.round(distanceKm * band.inrPerKm),
    );

    return {
      fromPlaceId: input.fromPlaceId,
      toPlaceId: input.toPlaceId,
      vehicleTypeId: input.vehicleTypeId,
      vehicleTypeKey: vt.key,
      distanceKm,
      durationMin,
      suggestedUnitCost,
      inrPerKm: band.inrPerKm,
      source,
    };
  }

  async generateMatrix(
    userId: string,
    input: GenerateTransferFareMatrixInput,
  ) {
    let placeIds = input.placeIds || [];
    if (input.clusterKey) {
      const cluster = SYSTEM_FARE_CLUSTERS.find((c) => c.key === input.clusterKey);
      if (!cluster) throw new BadRequestException('Unknown cluster key');
      const places = await this.prisma.place.findMany({
        where: {
          isSystem: true,
          key: { in: cluster.placeKeys },
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, key: true },
      });
      placeIds = places.map((p) => p.id);
    }
    if (placeIds.length < 2) {
      throw new BadRequestException('Need at least two places for a matrix');
    }
    const maxKm = input.maxDistanceKm ?? 180;
    const preview: Array<{
      fromPlaceId: string;
      toPlaceId: string;
      vehicleTypeId: string;
      unitCost: number;
      distanceKm: number | null;
      source: string;
    }> = [];

    for (const fromPlaceId of placeIds) {
      for (const toPlaceId of placeIds) {
        if (fromPlaceId === toPlaceId) continue;
        for (const vehicleTypeId of input.vehicleTypeIds) {
          try {
            const suggestion = await this.suggestTransferFare(null, {
              fromPlaceId,
              toPlaceId,
              vehicleTypeId,
            });
            if (
              suggestion.distanceKm != null &&
              suggestion.distanceKm > maxKm
            ) {
              continue;
            }
            preview.push({
              fromPlaceId,
              toPlaceId,
              vehicleTypeId,
              unitCost: suggestion.suggestedUnitCost,
              distanceKm: suggestion.distanceKm,
              source: suggestion.source,
            });
          } catch {
            // skip unresolvable pairs
          }
        }
      }
    }

    if (!input.commit) {
      return { dryRun: true, count: preview.length, items: preview.slice(0, 100) };
    }

    let upserted = 0;
    for (const row of preview) {
      const existing = await this.prisma.transferFare.findFirst({
        where: {
          isSystem: true,
          organizationId: null,
          fromPlaceId: row.fromPlaceId,
          toPlaceId: row.toPlaceId,
          vehicleTypeId: row.vehicleTypeId,
          deletedAt: null,
        },
      });
      if (existing) {
        await this.prisma.transferFare.update({
          where: { id: existing.id },
          data: {
            unitCost: new Prisma.Decimal(row.unitCost),
            pricingMode: 'per_vehicle',
            isActive: true,
          },
        });
      } else {
        await this.prisma.transferFare.create({
          data: {
            organizationId: null,
            isSystem: true,
            fromPlaceId: row.fromPlaceId,
            toPlaceId: row.toPlaceId,
            vehicleTypeId: row.vehicleTypeId,
            unitCost: new Prisma.Decimal(row.unitCost),
            pricingMode: 'per_vehicle',
            currency: 'INR',
            isActive: true,
            createdBy: userId,
          },
        });
      }
      upserted += 1;
    }
    return { dryRun: false, count: upserted, items: preview.slice(0, 50) };
  }

  async importHotelRatesCsv(
    organizationId: string,
    userId: string,
    input: ImportHotelRateCsvInput,
  ) {
    const results: Array<{
      row: number;
      status: 'ok' | 'skip';
      reason?: string;
      summary?: string;
      rateId?: string;
    }> = [];
    let okCount = 0;
    let skipCount = 0;

    for (let i = 0; i < input.rows.length; i += 1) {
      const row = input.rows[i]!;
      const rowNum = i + 1;
      try {
        if (!row.supplierName?.trim() && !row.placeKey?.trim() && !row.placeName?.trim()) {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: 'Provide supplierName and/or placeKey/placeName',
          });
          continue;
        }
        let supplierId: string | undefined;
        if (row.supplierName?.trim()) {
          const supplier = await this.prisma.supplier.findFirst({
            where: {
              organizationId,
              deletedAt: null,
              name: row.supplierName.trim(),
            },
          });
          if (!supplier) {
            skipCount += 1;
            results.push({
              row: rowNum,
              status: 'skip',
              reason: `Supplier not found: ${row.supplierName.trim()}`,
            });
            continue;
          }
          supplierId = supplier.id;
        }
        let placeId: string | undefined;
        if (row.placeKey?.trim() || row.placeName?.trim()) {
          const place = await this.resolvePlaceRef(
            organizationId,
            row.placeKey?.trim() || row.placeName!.trim(),
          );
          if (!place) {
            skipCount += 1;
            results.push({
              row: rowNum,
              status: 'skip',
              reason: `Place not found: ${row.placeKey || row.placeName}`,
            });
            continue;
          }
          placeId = place.id;
        }

        const summary = [
          row.supplierName?.trim(),
          row.placeKey?.trim() || row.placeName?.trim(),
          row.roomType?.trim(),
          row.mealPlan?.trim(),
          `₹${row.unitCost}`,
        ]
          .filter(Boolean)
          .join(' · ');

        if (!input.commit) {
          okCount += 1;
          results.push({ row: rowNum, status: 'ok', summary });
          continue;
        }

        const created = await this.createHotelRate(organizationId, userId, {
          supplierId: supplierId ?? null,
          placeId: placeId ?? null,
          roomType: row.roomType,
          mealPlan: row.mealPlan,
          unitCost: row.unitCost,
          weekendUnitCost: row.weekendUnitCost,
          currency: row.currency,
          startDate: row.startDate,
          endDate: row.endDate,
        });
        okCount += 1;
        results.push({ row: rowNum, status: 'ok', summary, rateId: created.id });
      } catch (e) {
        skipCount += 1;
        results.push({
          row: rowNum,
          status: 'skip',
          reason: e instanceof Error ? e.message : 'Could not import row',
        });
      }
    }

    const response = {
      commit: Boolean(input.commit),
      okCount,
      skipCount,
      results,
    };
    if (input.commit) {
      await this.recordRatesImportAudit({
        organizationId,
        userId,
        kind: 'hotel',
        okCount,
        skipCount,
        rowCount: input.rows.length,
        fileName: input.fileName,
        lockedSupplierName: input.lockedSupplierName,
        results,
      });
    }
    return response;
  }

  async importActivityRatesCsv(
    organizationId: string,
    userId: string,
    input: ImportActivityRateCsvInput,
  ) {
    const results: Array<{
      row: number;
      status: 'ok' | 'skip';
      reason?: string;
      summary?: string;
      rateId?: string;
    }> = [];
    let okCount = 0;
    let skipCount = 0;

    for (let i = 0; i < input.rows.length; i += 1) {
      const row = input.rows[i]!;
      const rowNum = i + 1;
      try {
        const supplier = await this.prisma.supplier.findFirst({
          where: {
            organizationId,
            deletedAt: null,
            name: row.supplierName.trim(),
          },
        });
        if (!supplier) {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: `Supplier not found: ${row.supplierName.trim()}`,
          });
          continue;
        }
        if (supplier.type !== 'activity') {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: `Supplier is not activity type: ${row.supplierName.trim()}`,
          });
          continue;
        }

        let placeId: string | undefined;
        if (row.placeKey?.trim() || row.placeName?.trim()) {
          const place = await this.resolvePlaceRef(
            organizationId,
            row.placeKey?.trim() || row.placeName!.trim(),
          );
          if (!place) {
            skipCount += 1;
            results.push({
              row: rowNum,
              status: 'skip',
              reason: `Place not found: ${row.placeKey || row.placeName}`,
            });
            continue;
          }
          placeId = place.id;
        }

        const summary = [
          row.supplierName.trim(),
          row.activityName.trim(),
          row.privateOrSic || 'open',
          `₹${row.adultUnitCost}/adult`,
          row.childUnitCost != null ? `₹${row.childUnitCost}/child` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        if (!input.commit) {
          okCount += 1;
          results.push({ row: rowNum, status: 'ok', summary });
          continue;
        }

        const created = await this.createActivityRate(organizationId, userId, {
          supplierId: supplier.id,
          placeId: placeId ?? null,
          activityName: row.activityName,
          privateOrSic: row.privateOrSic ?? null,
          adultUnitCost: row.adultUnitCost,
          childUnitCost: row.childUnitCost,
          childAgeMin: row.childAgeMin,
          childAgeMax: row.childAgeMax,
          currency: row.currency,
          startDate: row.startDate,
          endDate: row.endDate,
        });
        okCount += 1;
        results.push({ row: rowNum, status: 'ok', summary, rateId: created.id });
      } catch (e) {
        skipCount += 1;
        results.push({
          row: rowNum,
          status: 'skip',
          reason: e instanceof Error ? e.message : 'Could not import row',
        });
      }
    }

    const response = {
      commit: Boolean(input.commit),
      okCount,
      skipCount,
      results,
    };
    if (input.commit) {
      await this.recordRatesImportAudit({
        organizationId,
        userId,
        kind: 'activity',
        okCount,
        skipCount,
        rowCount: input.rows.length,
        fileName: input.fileName,
        lockedSupplierName: input.lockedSupplierName,
        results,
      });
    }
    return response;
  }

  async importTransferFaresCsv(
    organizationId: string,
    userId: string,
    input: ImportTransferFareCsvInput,
  ) {
    const results: Array<{
      row: number;
      status: 'ok' | 'skip';
      reason?: string;
      summary?: string;
      fareId?: string;
    }> = [];
    let okCount = 0;
    let skipCount = 0;

    for (let i = 0; i < input.rows.length; i += 1) {
      const row = input.rows[i]!;
      const rowNum = i + 1;
      try {
        const supplierName =
          input.lockedSupplierName?.trim() || row.supplierName?.trim() || '';
        let supplierId: string | undefined;
        if (supplierName) {
          const supplier = await this.prisma.supplier.findFirst({
            where: {
              organizationId,
              deletedAt: null,
              name: supplierName,
            },
            select: { id: true, type: true, name: true },
          });
          if (!supplier) {
            skipCount += 1;
            results.push({
              row: rowNum,
              status: 'skip',
              reason: `Supplier not found: ${supplierName}`,
            });
            continue;
          }
          const t = (supplier.type || '').toLowerCase();
          if (
            t !== 'car_rental' &&
            t !== 'driver' &&
            t !== 'transfer' &&
            t !== 'transport' &&
            t !== 'fleet'
          ) {
            skipCount += 1;
            results.push({
              row: rowNum,
              status: 'skip',
              reason: `Not a transport supplier: ${supplierName}`,
            });
            continue;
          }
          supplierId = supplier.id;
        }

        const from = await this.resolvePlaceRef(organizationId, row.fromPlace);
        if (!from) {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: `From place not found: ${row.fromPlace}`,
          });
          continue;
        }
        const to = await this.resolvePlaceRef(organizationId, row.toPlace);
        if (!to) {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: `To place not found: ${row.toPlace}`,
          });
          continue;
        }
        const vehicle = await this.resolveVehicleTypeRef(organizationId, row.vehicleType);
        if (!vehicle) {
          skipCount += 1;
          results.push({
            row: rowNum,
            status: 'skip',
            reason: `Vehicle type not found: ${row.vehicleType}`,
          });
          continue;
        }

        const summary = [
          supplierName || null,
          `${from.name} → ${to.name}`,
          vehicle.name,
          `₹${row.unitCost}`,
        ]
          .filter(Boolean)
          .join(' · ');
        if (!input.commit) {
          okCount += 1;
          results.push({ row: rowNum, status: 'ok', summary });
          continue;
        }

        const created = await this.createTransferFare(organizationId, userId, {
          supplierId: supplierId ?? undefined,
          fromPlaceId: from.id,
          toPlaceId: to.id,
          vehicleTypeId: vehicle.id,
          unitCost: row.unitCost,
          childUnitCost: row.childUnitCost,
          infantUnitCost: row.infantUnitCost,
          childAgeMin: row.childAgeMin,
          childAgeMax: row.childAgeMax,
          pricingMode: row.pricingMode,
          currency: row.currency,
          startDate: row.startDate,
          endDate: row.endDate,
        });
        okCount += 1;
        results.push({ row: rowNum, status: 'ok', summary, fareId: created.id });
      } catch (e) {
        skipCount += 1;
        results.push({
          row: rowNum,
          status: 'skip',
          reason: e instanceof Error ? e.message : 'Could not import row',
        });
      }
    }

    const response = {
      commit: Boolean(input.commit),
      okCount,
      skipCount,
      results,
    };
    if (input.commit) {
      await this.recordRatesImportAudit({
        organizationId,
        userId,
        kind: 'transfer',
        okCount,
        skipCount,
        rowCount: input.rows.length,
        fileName: input.fileName,
        lockedSupplierName: input.lockedSupplierName,
        results,
      });
    }
    return response;
  }

  async listRatesImportBatches(
    organizationId: string,
    opts?: { kind?: RatesImportKind; limit?: number },
  ) {
    const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
    const events = await this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: RATES_IMPORT_AUDIT_ACTION,
        entityType: RATES_IMPORT_ENTITY_TYPE,
      },
      include: {
        actor: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    });
    const mapped = events
      .map((e) => mapAuditEventToImportBatch(e))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const filtered = opts?.kind
      ? mapped.filter((row) => row.kind === opts.kind)
      : mapped;
    return filtered.slice(0, limit);
  }

  private async recordRatesImportAudit(input: {
    organizationId: string;
    userId: string;
    kind: RatesImportKind;
    okCount: number;
    skipCount: number;
    rowCount: number;
    fileName?: string | null;
    lockedSupplierName?: string | null;
    results: Array<{ row: number; status: 'ok' | 'skip'; reason?: string }>;
  }) {
    const batchId = `imp_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const metadata = composeRatesImportAuditMetadata(input);
    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: RATES_IMPORT_AUDIT_ACTION,
      entityType: RATES_IMPORT_ENTITY_TYPE,
      entityId: batchId,
      correlationId: batchId,
      metadata,
    });
  }

  private async resolvePlaceRef(organizationId: string, nameOrKey: string) {
    const q = nameOrKey.trim();
    if (!q) return null;
    const byKey = await this.prisma.place.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        key: q,
        OR: [{ organizationId: null }, { organizationId }],
      },
    });
    if (byKey) return byKey;
    return this.prisma.place.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        name: q,
        OR: [{ organizationId: null }, { organizationId }],
      },
    });
  }

  private async resolveVehicleTypeRef(organizationId: string, nameOrKey: string) {
    const q = nameOrKey.trim();
    if (!q) return null;
    const byKey = await this.prisma.vehicleType.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        key: q,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
    if (byKey) return byKey;
    return this.prisma.vehicleType.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        name: q,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });
  }

  /**
   * Block ambiguous overlapping seasons for the same commercial dimensions.
   * Dimensions: contract + room product (or room type) + meal plan + date window.
   */
  private async assertNoHotelRateSeasonOverlap(opts: {
    organizationId: string | null;
    isSystem: boolean;
    supplierId: string | null;
    placeId: string | null;
    contractId: string | null;
    roomProductId: string | null;
    roomType: string | null;
    mealPlan: string | null;
    /** Rate market segment (IN / INTL); null = any. */
    nationality?: string | null;
    startDate: Date | null;
    endDate: Date | null;
    excludeRateId?: string;
  }) {
    const mealNorm = (opts.mealPlan || '').trim().toLowerCase();
    const roomNorm = (opts.roomType || '').trim().toLowerCase();
    const natNorm = normalizeHotelNationality(opts.nationality);
    const candidates = await this.prisma.supplierHotelRate.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        isSystem: opts.isSystem,
        organizationId: opts.organizationId,
        ...(opts.excludeRateId ? { id: { not: opts.excludeRateId } } : {}),
        ...(opts.supplierId
          ? { supplierId: opts.supplierId }
          : opts.placeId
            ? { placeId: opts.placeId }
            : {}),
        ...(opts.contractId
          ? { contractId: opts.contractId }
          : { contractId: null }),
        ...(opts.roomProductId
          ? { roomProductId: opts.roomProductId }
          : { roomProductId: null }),
      },
      select: {
        id: true,
        roomType: true,
        mealPlan: true,
        startDate: true,
        endDate: true,
        occupancyPricingJson: true,
      },
    });

    const overlaps = candidates.filter((r) => {
      const rMeal = (r.mealPlan || '').trim().toLowerCase();
      if (rMeal !== mealNorm) return false;
      if (!opts.roomProductId) {
        const rRoom = (r.roomType || '').trim().toLowerCase();
        if (rRoom !== roomNorm) return false;
      }
      const rNat = normalizeHotelNationality(
        nationalityFromOccupancy(r.occupancyPricingJson),
      );
      if (rNat !== natNorm) return false;
      return hotelSeasonWindowsOverlap(
        opts.startDate,
        opts.endDate,
        r.startDate,
        r.endDate,
      );
    });

    if (overlaps.length) {
      throw new BadRequestException(
        'Season overlaps an existing rate for the same contract, room, meal plan, and nationality. Adjust dates or archive the other season first.',
      );
    }
  }

  private async assertPlace(placeId: string) {
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, deletedAt: null, isActive: true },
    });
    if (!place) throw new NotFoundException('Place not found');
  }

  private async assertVehicleType(
    organizationId: string | null,
    vehicleTypeId: string,
  ) {
    const vt = await this.prisma.vehicleType.findFirst({
      where: {
        id: vehicleTypeId,
        deletedAt: null,
        isActive: true,
        OR: [
          ...(organizationId ? [{ organizationId }] : []),
          { isSystem: true, organizationId: null },
        ],
      },
    });
    if (!vt) throw new NotFoundException('Vehicle type not found');
  }

  /** Backfill roomProductId (and optional sole active contract) on agency hotel rates. */
  async backfillHotelRateRoomProducts(organizationId?: string): Promise<number> {
    return backfillHotelRateRoomProductsHelper(this.prisma, organizationId);
  }

  // ── Resolve ────────────────────────────────────────────────────────

  async resolve(organizationId: string, input: ResolveRatesInput) {
    const pricing = await this.orgPricing(organizationId, {
      partyId: input.partyId,
    });
    const tripAsOf = parseDateOnly(input.startDate);
    const adults = Math.max(0, Number(input.adults) || 0);
    const children = Math.max(0, Number(input.children) || 0);
    const infants = Math.max(0, Number(input.infants) || 0);

    const supplierIds = [
      ...new Set(
        input.items
          .map((i) => i.details?.supplierId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const placeIds = [
      ...new Set(
        input.items
          .map((i) => i.details?.placeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const hotelRatesRaw = await this.prisma.supplierHotelRate.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          ...(supplierIds.length
            ? [{ organizationId, supplierId: { in: supplierIds } }]
            : []),
          ...(placeIds.length
            ? [
                { organizationId, placeId: { in: placeIds }, isSystem: false },
                {
                  isSystem: true,
                  organizationId: null,
                  placeId: { in: placeIds },
                },
              ]
            : []),
        ],
      },
      include: {
        contract: {
          select: { id: true, title: true, status: true, versionNumber: true },
        },
      },
    });
    const hotelRates = hotelRatesRaw as HotelRow[];

    const transferKeys = input.items.filter(
      (i) =>
        (i.type === 'transfer' || i.type === 'flight') &&
        i.details?.fromPlaceId &&
        i.details?.toPlaceId &&
        i.details?.vehicleTypeId,
    );
    const transferFaresRaw = transferKeys.length
      ? await this.prisma.transferFare.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            OR: transferKeys.flatMap((i) => {
              const from = i.details!.fromPlaceId!;
              const to = i.details!.toPlaceId!;
              const vehicle = i.details!.vehicleTypeId!;
              return [
                {
                  organizationId,
                  isSystem: false,
                  fromPlaceId: from,
                  toPlaceId: to,
                  vehicleTypeId: vehicle,
                },
                {
                  isSystem: true,
                  organizationId: null,
                  fromPlaceId: from,
                  toPlaceId: to,
                  vehicleTypeId: vehicle,
                },
                // Load reverse corridor for P2P explain (not for auto-match).
                {
                  organizationId,
                  isSystem: false,
                  fromPlaceId: to,
                  toPlaceId: from,
                  vehicleTypeId: vehicle,
                },
                {
                  isSystem: true,
                  organizationId: null,
                  fromPlaceId: to,
                  toPlaceId: from,
                  vehicleTypeId: vehicle,
                },
              ];
            }),
          },
          include: {
            vehicleType: { select: { seats: true, name: true } },
          },
        })
      : [];
    const transferFares = transferFaresRaw as FareRow[];

    const hasActivityItems = input.items.some(
      (i) => i.type === 'activity' || i.type === 'sightseeing',
    );
    const activityRatesRaw = hasActivityItems
      ? await this.prisma.supplierActivityRate.findMany({
          where: {
            organizationId,
            deletedAt: null,
            isActive: true,
          },
        })
      : [];
    const activityRates = activityRatesRaw as ActivityRow[];

    const blackoutsBySupplier = new Map<string, BlackoutRange[]>();
    const contractStopSaleBySupplier = new Map<string, StopSaleRange[]>();
    const stopSellByAsset = new Map<string, DateWindow[]>();
    const supplierAssetId = new Map<string, string>();
    const activeContractIds = new Set<string>();
    const cancellationByContractId = new Map<string, unknown>();
    const cancellationBySupplierId = new Map<string, unknown>();

    if (supplierIds.length) {
      const contracts = await this.prisma.supplierContract.findMany({
        where: {
          organizationId,
          supplierId: { in: supplierIds },
          deletedAt: null,
          status: 'active',
        },
        select: {
          id: true,
          supplierId: true,
          preferred: true,
          blackoutJson: true,
          stopSaleJson: true,
          cancellationPolicyJson: true,
          cancellationTerms: true,
        },
      });
      for (const c of contracts) {
        activeContractIds.add(c.id);
        const cancelRaw =
          c.cancellationPolicyJson != null
            ? c.cancellationPolicyJson
            : c.cancellationTerms?.trim() || null;
        if (cancelRaw != null) {
          cancellationByContractId.set(c.id, cancelRaw);
          const prev = cancellationBySupplierId.get(c.supplierId);
          if (!prev || c.preferred) {
            cancellationBySupplierId.set(c.supplierId, cancelRaw);
          }
        }
        const ranges = parseBlackoutRanges(c.blackoutJson);
        if (ranges.length) {
          const prev = blackoutsBySupplier.get(c.supplierId) ?? [];
          blackoutsBySupplier.set(c.supplierId, prev.concat(ranges));
        }
        const stops = parseStopSaleRanges(c.stopSaleJson);
        if (stops.length) {
          const prev = contractStopSaleBySupplier.get(c.supplierId) ?? [];
          contractStopSaleBySupplier.set(c.supplierId, prev.concat(stops));
        }
      }

      const suppliers = await this.prisma.supplier.findMany({
        where: {
          organizationId,
          id: { in: supplierIds },
          deletedAt: null,
          linkedAssetId: { not: null },
        },
        select: { id: true, linkedAssetId: true },
      });
      const assetIds: string[] = [];
      for (const s of suppliers) {
        if (!s.linkedAssetId) continue;
        supplierAssetId.set(s.id, s.linkedAssetId);
        assetIds.push(s.linkedAssetId);
      }
      if (assetIds.length) {
        const allotments = await this.prisma.assetAllotment.findMany({
          where: {
            stopSell: true,
            roomProduct: {
              assetId: { in: [...new Set(assetIds)] },
              deletedAt: null,
            },
          },
          select: {
            startDate: true,
            endDate: true,
            roomProductId: true,
            roomProduct: { select: { assetId: true } },
          },
        });
        for (const a of allotments) {
          const assetId = a.roomProduct.assetId;
          const prev = stopSellByAsset.get(assetId) ?? [];
          prev.push({
            startDate: a.startDate,
            endDate: a.endDate,
            roomProductId: a.roomProductId,
          });
          stopSellByAsset.set(assetId, prev);
        }
      }
    }

    const results = input.items.map((item) =>
      this.resolveOne(item, {
        hotelRates,
        transferFares,
        activityRates,
        pricing,
        tripAsOf,
        adults,
        children,
        infants,
        nationality: input.nationality?.trim() || null,
        nationalities: Array.isArray(input.nationalities)
          ? input.nationalities
          : null,
        blackoutsBySupplier,
        contractStopSaleBySupplier,
        stopSellByAsset,
        supplierAssetId,
        activeContractIds,
        cancellationByContractId,
        cancellationBySupplierId,
      }),
    );

    return {
      markupPercent: pricing.markupPercent,
      taxPercent: pricing.taxPercent,
      currency: pricing.currency,
      adults,
      children,
      infants,
      items: results,
      matchedCount: results.filter((r) => r.matched).length,
      unmatchedCount: results.filter((r) => !r.matched).length,
    };
  }

  private resolveOne(
    item: ResolveRatesItemInput,
    ctx: {
      hotelRates: HotelRow[];
      transferFares: FareRow[];
      activityRates: ActivityRow[];
      pricing: {
        markupPercent: number;
        taxPercent: number;
        currency: string;
        childFareFactor: number;
        infantFareFactor: number;
      };
      tripAsOf: Date | null;
      adults: number;
      children: number;
      infants: number;
      nationality: string | null;
      nationalities: Array<string | null> | null;
      blackoutsBySupplier: Map<string, BlackoutRange[]>;
      contractStopSaleBySupplier: Map<string, StopSaleRange[]>;
      stopSellByAsset: Map<string, DateWindow[]>;
      supplierAssetId: Map<string, string>;
      activeContractIds: Set<string>;
      cancellationByContractId: Map<string, unknown>;
      cancellationBySupplierId: Map<string, unknown>;
    },
  ) {
    const asOf = parseDateOnly(item.date) || ctx.tripAsOf;
    const type = item.type === 'activity' ? 'sightseeing' : item.type;

    if (type === 'hotel') {
      const supplierId = item.details?.supplierId;
      const placeId = item.details?.placeId;
      const roomWanted = (item.details?.roomType || '').trim().toLowerCase();
      const mealWanted = (item.details?.mealPlan || '').trim().toLowerCase();
      const roomProductIdWanted =
        (item.details?.roomProductId || '').trim() || null;
      const rooms = Math.max(1, Number(item.details?.rooms) || 1);
      const nightsCount = Math.max(1, Number(item.details?.nights) || 1);
      const lineGuestCodes = collectGuestNationalityBag({
        nationality:
          typeof item.details?.nationality === 'string'
            ? item.details.nationality.trim()
            : null,
        nationalities: Array.isArray(item.details?.nationalities)
          ? item.details.nationalities
          : null,
      });
      const ctxGuestCodes = collectGuestNationalityBag({
        nationality: ctx.nationality,
        nationalities: ctx.nationalities,
      });
      // Line nationalities win; trip/traveller ctx only fills when the line is blank.
      // Bag keeps multiplicity for per-pax split; Match still collapses via effectiveGuestNationality.
      const guestCodes = lineGuestCodes.length ? lineGuestCodes : ctxGuestCodes;
      const guestNationality = effectiveGuestNationality(guestCodes);
      const guestMixed = guestNationalitiesAreMixed(guestCodes);
      const stayNights = eachStayNight(asOf, nightsCount);

      const policyBlock = (sid: string | null | undefined) => {
        if (!sid) return null;
        const blackouts = ctx.blackoutsBySupplier.get(sid) ?? [];
        const assetId = ctx.supplierAssetId.get(sid);
        const stopSell = assetId ? (ctx.stopSellByAsset.get(assetId) ?? []) : [];
        const contractStopSales =
          ctx.contractStopSaleBySupplier.get(sid) ?? [];
        return supplierBlockedReason(stayNights, blackouts, stopSell, {
          roomProductId: roomProductIdWanted,
          contractStopSales,
        });
      };

      // Hard block: stop-sale. Soft: blackout → unmatched (manual rate allowed).
      if (supplierId) {
        const block = policyBlock(supplierId);
        if (block === 'stop_sell') {
          return unmatched(
            item.itemId,
            'hotel',
            'per_room',
            ctx.pricing.taxPercent,
            'stop_sell',
            {
              matchExplain: {
                accepted: [],
                rejected: [
                  {
                    label: 'Stay dates',
                    reason: 'stop-sale — room/property unavailable',
                  },
                ],
              },
            },
          );
        }
        if (block === 'blackout') {
          return unmatched(
            item.itemId,
            'hotel',
            'per_room',
            ctx.pricing.taxPercent,
            'blackout',
            {
              matchExplain: {
                accepted: ['manual rate allowed — contracted rate in blackout'],
                rejected: [
                  {
                    label: 'Contracted rates',
                    reason: 'blackout — contracted rate invalid for stay',
                  },
                ],
              },
            },
          );
        }
      }

      const pickBest = (pool: HotelRow[]) => {
        let best: HotelRow | undefined;
        let bestScore = -1;
        for (const r of pool) {
          let score = windowScore(r.startDate, r.endDate);
          if (!r.isSystem && r.organizationId) score += 10;
          // Prefer rates owned by an active contract version.
          if (r.contractId && ctx.activeContractIds.has(r.contractId)) {
            score += 20;
          } else if (r.contractId == null) {
            score += 5; // legacy / unversioned still usable
          } else {
            continue; // superseded / draft / terminated contract rates
          }
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        return best;
      };

      const inWindow = (r: HotelRow) =>
        dateInWindow(asOf, r.startDate, r.endDate);

      const contractEligible = (r: HotelRow) =>
        !r.contractId || ctx.activeContractIds.has(r.contractId);

      const matchDims = (pool: HotelRow[]) =>
        pickBest(
          filterHotelByNationality(
            filterHotelByRoomAndMeal(
              pool,
              roomWanted,
              mealWanted,
              roomProductIdWanted,
            ),
            guestNationality,
          ),
        );

      let best: HotelRow | undefined;

      if (supplierId) {
        const agency = ctx.hotelRates.filter(
          (r) =>
            !r.isSystem &&
            r.supplierId === supplierId &&
            inWindow(r) &&
            contractEligible(r),
        );
        best = matchDims(agency);
      }

      if (!best && placeId) {
        const agencyPlace = ctx.hotelRates.filter(
          (r) =>
            !r.isSystem &&
            r.placeId === placeId &&
            inWindow(r) &&
            contractEligible(r),
        );
        const systemPlace = ctx.hotelRates.filter(
          (r) => r.isSystem && r.placeId === placeId && inWindow(r),
        );
        best = matchDims(agencyPlace) || matchDims(systemPlace);
      }

      const explainPool = (
        supplierId
          ? ctx.hotelRates.filter((r) => r.supplierId === supplierId)
          : placeId
            ? ctx.hotelRates.filter((r) => r.placeId === placeId)
            : []
      ).map((r) => ({
        ...r,
        contractStatus: r.contract?.status ?? null,
      }));

      if (!best) {
        const rejected = explainHotelRejects(explainPool, undefined, {
          roomWanted,
          mealWanted,
          roomProductIdWanted,
          asOf,
        });
        return unmatched(
          item.itemId,
          'hotel',
          'per_room',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected:
                rejected.length > 0
                  ? rejected
                  : [{ label: 'No rates', reason: 'no eligible hotel rate' }],
            },
          },
        );
      }

      const stayDates = stayNights.length ? stayNights : asOf ? [asOf] : [];
      const stayDateIsos = stayDates.map((d) => d.toISOString().slice(0, 10));
      const adults = Math.max(
        0,
        Number(item.details?.adults) || ctx.adults || 0,
      );
      const children = Math.max(
        0,
        Number(item.details?.children) || ctx.children || 0,
      );
      const childrenWithoutBed = Math.max(
        0,
        Number(item.details?.childrenWithoutBed) || 0,
      );
      const childAges = Array.isArray(item.details?.childAges)
        ? item.details!.childAges!.filter(
            (a): a is number => typeof a === 'number' && Number.isFinite(a),
          )
        : [];

      const splitCandidatePool = (
        supplierId
          ? ctx.hotelRates.filter(
              (r) =>
                !r.isSystem &&
                r.supplierId === supplierId &&
                inWindow(r) &&
                contractEligible(r),
            )
          : placeId
            ? [
                ...ctx.hotelRates.filter(
                  (r) =>
                    !r.isSystem &&
                    r.placeId === placeId &&
                    inWindow(r) &&
                    contractEligible(r),
                ),
                ...ctx.hotelRates.filter(
                  (r) => r.isSystem && r.placeId === placeId && inWindow(r),
                ),
              ]
            : []
      );
      const splitRoomMealPool = filterHotelByRoomAndMeal(
        splitCandidatePool,
        roomWanted,
        mealWanted,
        roomProductIdWanted,
      );
      const paxSplit = tryHotelPaxBuySplit({
        guestCodes,
        adults,
        children,
        rooms,
        stayDates,
        candidatePool: splitRoomMealPool.map((r) => ({
          id: r.id,
          unitCost: Number(r.unitCost),
          weekendUnitCost:
            r.weekendUnitCost != null ? Number(r.weekendUnitCost) : null,
          occupancyPricingJson: r.occupancyPricingJson,
        })),
        pickBest: (pool) => {
          const ids = new Set(pool.map((p) => p.id));
          const row = pickBest(splitRoomMealPool.filter((r) => ids.has(r.id)));
          if (!row) return undefined;
          return {
            id: row.id,
            unitCost: Number(row.unitCost),
            weekendUnitCost:
              row.weekendUnitCost != null ? Number(row.weekendUnitCost) : null,
            occupancyPricingJson: row.occupancyPricingJson,
          };
        },
      });

      let baseCalc = hotelStayCalculation(
        {
          unitCost: best.unitCost,
          weekendUnitCost: best.weekendUnitCost,
        },
        stayDates,
        rooms,
      );
      const occupancyPricing = parseOccupancyPricing(best.occupancyPricingJson);
      const pax = classifyHotelOccupancyPax({
        adults,
        children,
        childAges,
        childAgeMax: occupancyPricing?.childAgeMax,
      });
      const adultBand = pickAdultBand({
        bands: occupancyPricing?.adultBands ?? [],
        adults: pax.adults,
        rooms,
        chartUnitCost: Number(best.unitCost),
        chartWeekendUnitCost:
          best.weekendUnitCost != null ? Number(best.weekendUnitCost) : null,
      });
      let occPricingForExtras = occupancyPricing;
      if (paxSplit) {
        baseCalc = {
          weekdayNights: paxSplit.weekdayNights,
          weekendNights: paxSplit.weekendNights,
          weekdayUnit: paxSplit.weekdayUnit,
          weekendUnit: paxSplit.weekendUnit,
          rooms: paxSplit.rooms,
          totalBuy: paxSplit.totalBuy,
        };
        occPricingForExtras = occupancyPricing
          ? { ...occupancyPricing, baseAdults: paxSplit.bandAdults }
          : { baseAdults: paxSplit.bandAdults, baseChildren: 0 };
      } else if (adultBand) {
        baseCalc = hotelStayCalculation(
          {
            unitCost: adultBand.unitCostPerNight,
            weekendUnitCost: adultBand.weekendUnitCostPerNight,
          },
          stayDates,
          rooms,
        );
        occPricingForExtras = occupancyPricing
          ? { ...occupancyPricing, baseAdults: adultBand.adults }
          : {
              baseAdults: adultBand.adults,
              baseChildren: 0,
            };
      }
      const occ = applyOccupancyPricing(baseCalc.totalBuy, occPricingForExtras, {
        adults: pax.adults,
        children: pax.children,
        childrenWithoutBed,
        rooms,
        nights: nightsCount,
      });
      const dateSupplements = parseDateSupplements(best.occupancyPricingJson);
      const gala = applyDateSupplements(
        occ.totalBuy,
        dateSupplements,
        stayDateIsos,
        rooms,
      );
      const roomNightSlots = Math.max(1, rooms * nightsCount);
      const unitCost = round2(gala.totalBuy / roomNightSlots);
      const calculation = {
        ...baseCalc,
        totalBuy: gala.totalBuy,
        baseRoomTotal: occ.baseTotal,
        occupancyExtraTotal: occ.occupancyExtraTotal,
        extraAdultCount: occ.extraAdultCount,
        childWithBedCount: occ.childWithBedCount,
        childWithoutBedCount: occ.childWithoutBedCount,
        dateSupplementTotal: gala.supplementTotal,
        dateSupplements: gala.matched,
        partyAdults: pax.partyAdults,
        partyChildren: pax.partyChildren,
        adultsCharged: pax.adults,
        childrenCharged: pax.children,
        ...(paxSplit
          ? {
              buyMode: paxSplit.buyMode,
              paxBuySplits: paxSplit.paxBuySplits,
              paxBuySplitTotalPerNight: paxSplit.paxBuySplitTotalPerNight,
              adultBandAdults: paxSplit.bandAdults,
              adultBandUnitCost: paxSplit.paxBuySplitTotalPerNight,
              adultsPerRoom: paxSplit.bandAdults,
              composition: paxSplit.composition,
            }
          : adultBand
            ? {
                adultBandAdults: adultBand.adults,
                adultBandUnitCost: adultBand.unitCostPerNight,
                ...(adultBand.weekendUnitCostPerNight != null
                  ? {
                      adultBandWeekendUnitCost:
                        adultBand.weekendUnitCostPerNight,
                    }
                  : {}),
                adultsPerRoom: adultBand.adultsPerRoom,
              }
            : {}),
        ...(pax.childAgeMax != null
          ? { childAgeMin: 0, childAgeMax: pax.childAgeMax }
          : {}),
        ...(pax.reclassifiedAsAdult > 0
          ? { reclassifiedAsAdult: pax.reclassifiedAsAdult }
          : {}),
      };

      const accepted: string[] = [];
      if (roomProductIdWanted && best.roomProductId === roomProductIdWanted) {
        accepted.push('Room matched');
      } else if (roomWanted && best.roomType) {
        accepted.push('Room matched');
      } else {
        accepted.push('Default room rate');
      }
      if (mealWanted && best.mealPlan) accepted.push('Meal plan matched');
      else if (!mealWanted) accepted.push('Meal plan matched');
      accepted.push('Dates covered');
      const rateNationality = nationalityFromOccupancy(best.occupancyPricingJson);
      accepted.push(
        ...hotelNationalityMatchAccepted(rateNationality, guestNationality, {
          guestNationalities: guestCodes,
          mixed: guestMixed,
        }),
      );
      if (paxSplit) {
        accepted.push(...hotelPaxBuySplitMatchAccepted(paxSplit));
      }
      const rateVersionNumber = best.versionNumber ?? 1;
      if (rateVersionNumber > 1 || best.supersedesId) {
        accepted.push(`Rate ${hotelRateVersionLabel(rateVersionNumber)}`);
      }
      if (best.contractId && ctx.activeContractIds.has(best.contractId)) {
        accepted.push(
          `Active contract v${best.contract?.versionNumber ?? 1}`,
        );
      } else if (!best.contractId) {
        accepted.push('Legacy / unversioned rate');
      }
      accepted.push('No blackout');
      accepted.push('No stop-sale');
      if (!best.isSystem && best.organizationId) {
        accepted.push('Agency rate preferred');
      }
      if (occupancyPricing || adultBand) {
        accepted.push(
          ...occupancyMatchAccepted(
            occ,
            occPricingForExtras || {
              baseAdults: adultBand?.adults ?? 2,
              baseChildren: 0,
            },
            adultBand,
          ),
        );
        if (pax.reclassifiedAsAdult > 0 && pax.childAgeMax != null) {
          accepted.push(
            `${pax.reclassifiedAsAdult} child age${pax.reclassifiedAsAdult === 1 ? '' : 's'} priced as adult (≤${pax.childAgeMax})`,
          );
        }
      }
      if (gala.matched.length) {
        accepted.push(...dateSupplementMatchAccepted(gala));
      }
      const minStay = evaluateHotelMinStay({
        minStayNights: occupancyPricing?.minStayNights,
        nights: nightsCount,
      });
      if (minStay) {
        accepted.push(...hotelMinStayMatchAccepted(minStay));
      }
      const cancelSummary = summarizeCancellationForMatch(
        (best.contractId
          ? ctx.cancellationByContractId.get(best.contractId)
          : null) ??
          (best.supplierId
            ? ctx.cancellationBySupplierId.get(best.supplierId)
            : null),
      );
      if (cancelSummary) {
        accepted.push(...cancelSummary.accepted);
      }

      const rejected = explainHotelRejects(explainPool, best.id, {
        roomWanted,
        mealWanted,
        roomProductIdWanted,
        asOf,
      });

      return matched({
        itemId: item.itemId,
        rateKind: 'hotel',
        rateId: best.id,
        unitCost,
        markupPercent: ctx.pricing.markupPercent,
        taxPercent: ctx.pricing.taxPercent,
        quantity: nightsCount,
        pricingUnit: 'per_room',
        rateMeta: {
          isSystem: best.isSystem,
          placeId: best.placeId,
          supplierId: best.supplierId,
          roomType: best.roomType,
          roomProductId: best.roomProductId,
          mealPlan: best.mealPlan,
          contractId: best.contractId,
          contractTitle: best.contract?.title ?? null,
          contractVersionNumber: best.contract?.versionNumber ?? null,
          rateVersionNumber: best.versionNumber ?? 1,
          nationality: rateNationality,
          guestNationality,
          guestNationalities: guestCodes.length ? guestCodes : undefined,
          guestNationalityMixed: guestMixed || undefined,
          weekendUnitCost:
            best.weekendUnitCost != null ? Number(best.weekendUnitCost) : null,
          startDate: best.startDate
            ? best.startDate.toISOString().slice(0, 10)
            : null,
          endDate: best.endDate
            ? best.endDate.toISOString().slice(0, 10)
            : null,
          currency: best.currency || 'INR',
          updatedAt: best.updatedAt.toISOString(),
          unitCost: Number(best.unitCost),
          calculation: {
            ...calculation,
            ...(minStay
              ? {
                  minStayNights: minStay.minStayNights,
                  stayNights: minStay.nights,
                  minStayShort: minStay.short,
                  minStayNote: minStay.note,
                }
              : {}),
            ...(rateNationality || guestNationality || guestMixed
              ? {
                  nationality: rateNationality,
                  guestNationality,
                  ...(guestCodes.length > 1
                    ? { guestNationalities: guestCodes }
                    : {}),
                  ...(guestMixed ? { guestNationalityMixed: true } : {}),
                }
              : {}),
            ...(cancelSummary
              ? {
                  cancellationPolicy: cancelSummary.snapshot,
                  cancellationSummary: cancelSummary.humanText,
                }
              : {}),
          },
          matchExplain: { accepted, rejected },
          ...(minStay?.short
            ? {
                minStayWarn: true as const,
                minStayNote: minStay.note,
              }
            : {}),
        },
      });
    }

    if (type === 'transfer') {
      const fromPlaceId = item.details?.fromPlaceId;
      const toPlaceId = item.details?.toPlaceId;
      const vehicleTypeId = item.details?.vehicleTypeId;
      const supplierId = item.details?.supplierId;

      // Hard stop-sale / soft blackout on transport supplier contract (service date).
      if (supplierId && asOf) {
        const block = supplierBlockedReason(
          [asOf],
          ctx.blackoutsBySupplier.get(supplierId) ?? [],
          [],
          {
            roomProductId: null,
            contractStopSales: ctx.contractStopSaleBySupplier.get(supplierId) ?? [],
          },
        );
        if (block === 'stop_sell') {
          return unmatched(
            item.itemId,
            'transfer',
            'per_service',
            ctx.pricing.taxPercent,
            'stop_sell',
            {
              matchExplain: {
                accepted: [],
                rejected: [
                  {
                    label: 'Service date',
                    reason: 'stop-sale / closing — fleet unavailable',
                  },
                ],
              },
            },
          );
        }
        if (block === 'blackout') {
          return unmatched(
            item.itemId,
            'transfer',
            'per_service',
            ctx.pricing.taxPercent,
            'blackout',
            {
              matchExplain: {
                accepted: ['manual rate allowed — contracted transfer in blackout'],
                rejected: [
                  {
                    label: 'Contracted transfers',
                    reason: 'blackout — contracted rate invalid for date',
                  },
                ],
              },
            },
          );
        }
      }

      if (!fromPlaceId || !toPlaceId || !vehicleTypeId) {
        return unmatched(
          item.itemId,
          'transfer',
          'per_service',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected: [
                {
                  label: 'Route',
                  reason: 'from, to and vehicle are required to match a corridor',
                },
              ],
            },
          },
        );
      }

      const routePool = ctx.transferFares.filter(
        (f) =>
          (f.fromPlaceId === fromPlaceId && f.toPlaceId === toPlaceId) ||
          (f.fromPlaceId === toPlaceId && f.toPlaceId === fromPlaceId),
      );

      const candidates = ctx.transferFares.filter((f) => {
        if (f.fromPlaceId !== fromPlaceId) return false;
        if (f.toPlaceId !== toPlaceId) return false;
        if (f.vehicleTypeId !== vehicleTypeId) return false;
        return dateInWindow(asOf, f.startDate, f.endDate);
      });
      let best: FareRow | undefined;
      let bestScore = -1;
      for (const f of candidates) {
        let score = windowScore(f.startDate, f.endDate);
        if (supplierId) {
          if (f.supplierId === supplierId) score += 40;
          else if (f.supplierId) continue; // other supplier's chart
          else score += 5; // org/system catalog still eligible
        } else if (f.supplierId) {
          score += 2; // mild preference when quote has no supplier
        }
        if (!f.isSystem && f.organizationId) score += 10;
        if (score > bestScore) {
          bestScore = score;
          best = f;
        }
      }
      if (!best) {
        const rejected = explainTransferRejects(routePool, undefined, {
          fromPlaceId,
          toPlaceId,
          vehicleTypeId,
          asOf,
        });
        return unmatched(
          item.itemId,
          'transfer',
          'per_service',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected:
                rejected.length > 0
                  ? rejected
                  : [
                      {
                        label: 'No fares',
                        reason: 'no corridor fare for this route and vehicle',
                      },
                    ],
            },
          },
        );
      }

      const adultCost = Number(best.unitCost);
      const childCost =
        best.childUnitCost != null
          ? Number(best.childUnitCost)
          : round2(adultCost * ctx.pricing.childFareFactor);
      const infantCost =
        best.infantUnitCost != null
          ? Number(best.infantUnitCost)
          : round2(adultCost * ctx.pricing.infantFareFactor);

      const pricingMode = best.pricingMode || 'per_vehicle';
      let unitCost = adultCost;
      let quantity = 1;
      let pricingUnit: 'per_service' | 'per_person' = 'per_service';
      let partyAdults = ctx.adults;
      let partyChildren = ctx.children;

      if (pricingMode === 'per_adult') {
        const lineAdultsRaw = Number(item.details?.adults);
        const lineChildrenRaw = Number(item.details?.children);
        if (Number.isFinite(lineAdultsRaw) && lineAdultsRaw >= 0) {
          partyAdults = Math.round(lineAdultsRaw);
        }
        if (Number.isFinite(lineChildrenRaw) && lineChildrenRaw >= 0) {
          partyChildren = Math.round(lineChildrenRaw);
        }
        let partyInfants = ctx.infants;
        const lineInfantsRaw = Number(item.details?.infants);
        if (Number.isFinite(lineInfantsRaw) && lineInfantsRaw >= 0) {
          partyInfants = Math.round(lineInfantsRaw);
        }
        const childAges = Array.isArray(item.details?.childAges)
          ? item.details!.childAges!.filter(
              (a): a is number => typeof a === 'number' && Number.isFinite(a),
            )
          : [];
        const pax = classifyTransferPax({
          adults: partyAdults,
          children: partyChildren,
          infants: partyInfants,
          childAges,
          childAgeMin: best.childAgeMin,
          childAgeMax: best.childAgeMax,
        });
        const infants = pax.infantHeads;
        const party = pax.adultHeads + pax.childHeads + infants;
        if (party > 0) {
          const total =
            pax.adultHeads * adultCost +
            pax.childHeads * childCost +
            infants * infantCost;
          quantity = party;
          unitCost = round2(total / party);
          pricingUnit = 'per_person';
        }

        const vehicleSeats = best.vehicleType?.seats ?? null;
        const accepted = transferMatchAccepted({
          isSystem: best.isSystem,
          supplierId: best.supplierId,
          pricingMode,
          startDate: best.startDate,
          endDate: best.endDate,
          vehicleSeats,
        });
        if (pax.usedChildAges) {
          accepted.push(
            `${pax.adultHeads} adult · ${pax.childHeads} child · ${pax.infantHeads} infant from ages (${pax.ageMin}–${pax.ageMax})`,
          );
        } else if (infants > 0) {
          accepted.push(
            `${infants} infant${infants === 1 ? '' : 's'} @ ₹${infantCost}`,
          );
        }
        const rejected = explainTransferRejects(routePool, best.id, {
          fromPlaceId,
          toPlaceId,
          vehicleTypeId,
          asOf,
        });

        return matched({
          itemId: item.itemId,
          rateKind: 'transfer',
          rateId: best.id,
          unitCost,
          markupPercent: ctx.pricing.markupPercent,
          taxPercent: ctx.pricing.taxPercent,
          quantity,
          pricingUnit,
          rateMeta: {
            isSystem: best.isSystem,
            pricingMode,
            adults: partyAdults,
            children: partyChildren,
            adultsCharged: pax.adultHeads,
            childrenCharged: pax.childHeads,
            infantsCharged: pax.infantHeads,
            childAgeMin: pax.ageMin,
            childAgeMax: pax.ageMax,
            infants,
            infantUnitCost: infantCost,
            adultUnitCost: adultCost,
            childUnitCost: childCost,
            fromPlaceId: best.fromPlaceId,
            toPlaceId: best.toPlaceId,
            vehicleTypeId: best.vehicleTypeId,
            vehicleName: best.vehicleType?.name ?? null,
            vehicleSeats,
            capacity: vehicleSeats,
            startDate: best.startDate ? best.startDate.toISOString().slice(0, 10) : null,
            endDate: best.endDate ? best.endDate.toISOString().slice(0, 10) : null,
            currency: best.currency || 'INR',
            updatedAt: best.updatedAt.toISOString(),
            unitCost: adultCost,
            supplierId: best.supplierId || supplierId || null,
            rateVersionNumber: best.versionNumber ?? 1,
            calculation: {
              totalBuy: round2(
                pax.adultHeads * adultCost +
                  pax.childHeads * childCost +
                  infants * infantCost,
              ),
              adultUnit: adultCost,
              childUnit: childCost,
              infantUnit: infantCost,
              adults: pax.adultHeads,
              children: pax.childHeads,
              infants,
              partyAdults,
              partyChildren,
              partyInfants: partyInfants,
              adultsCharged: pax.adultHeads,
              childrenCharged: pax.childHeads,
              infantsCharged: pax.infantHeads,
              childAgeMin: pax.ageMin,
              childAgeMax: pax.ageMax,
              usedChildAges: pax.usedChildAges,
            },
            matchExplain: { accepted, rejected },
          },
        });
      }

      const vehicleSeats = best.vehicleType?.seats ?? null;
      const accepted = transferMatchAccepted({
        isSystem: best.isSystem,
        supplierId: best.supplierId,
        pricingMode,
        startDate: best.startDate,
        endDate: best.endDate,
        vehicleSeats,
      });
      const rejected = explainTransferRejects(routePool, best.id, {
        fromPlaceId,
        toPlaceId,
        vehicleTypeId,
        asOf,
      });

      return matched({
        itemId: item.itemId,
        rateKind: 'transfer',
        rateId: best.id,
        unitCost,
        markupPercent: ctx.pricing.markupPercent,
        taxPercent: ctx.pricing.taxPercent,
        quantity,
        pricingUnit,
        rateMeta: {
          isSystem: best.isSystem,
          pricingMode,
          adults: partyAdults,
          children: partyChildren,
          infants: ctx.infants,
          adultUnitCost: adultCost,
          childUnitCost: childCost,
          fromPlaceId: best.fromPlaceId,
          toPlaceId: best.toPlaceId,
          vehicleTypeId: best.vehicleTypeId,
          vehicleName: best.vehicleType?.name ?? null,
          vehicleSeats,
          capacity: vehicleSeats,
          startDate: best.startDate ? best.startDate.toISOString().slice(0, 10) : null,
          endDate: best.endDate ? best.endDate.toISOString().slice(0, 10) : null,
          currency: best.currency || 'INR',
          updatedAt: best.updatedAt.toISOString(),
          unitCost: adultCost,
          supplierId: best.supplierId || supplierId || null,
          rateVersionNumber: best.versionNumber ?? 1,
          matchExplain: { accepted, rejected },
        },
      });
    }

    if (type === 'sightseeing') {
      const supplierId = item.details?.supplierId || null;
      const placeId = item.details?.placeId || null;
      const privateOrSic = item.details?.privateOrSic || null;
      const wantedName =
        (item.details?.propertyName || item.details?.activityName || '').trim();
      const adults = Math.max(
        0,
        Number(item.details?.adults ?? ctx.adults) || 0,
      );
      const children = Math.max(
        0,
        Number(item.details?.children ?? ctx.children) || 0,
      );
      const childAges = Array.isArray(item.details?.childAges)
        ? item.details!.childAges!.filter(
            (a): a is number => typeof a === 'number' && Number.isFinite(a),
          )
        : [];

      if (supplierId && asOf) {
        const block = supplierBlockedReason(
          [asOf],
          ctx.blackoutsBySupplier.get(supplierId) ?? [],
          [],
          {
            roomProductId: null,
            contractStopSales:
              ctx.contractStopSaleBySupplier.get(supplierId) ?? [],
          },
        );
        if (block === 'stop_sell') {
          return unmatched(
            item.itemId,
            'activity',
            'per_person',
            ctx.pricing.taxPercent,
            'stop_sell',
            {
              matchExplain: {
                accepted: [],
                rejected: [
                  {
                    label: 'Activity date',
                    reason: 'stop-sale — activity supplier unavailable',
                  },
                ],
              },
            },
          );
        }
        if (block === 'blackout') {
          return unmatched(
            item.itemId,
            'activity',
            'per_person',
            ctx.pricing.taxPercent,
            'blackout',
            {
              matchExplain: {
                accepted: ['manual rate allowed — contracted activity in blackout'],
                rejected: [
                  {
                    label: 'Contracted activities',
                    reason: 'blackout — contracted rate invalid for date',
                  },
                ],
              },
            },
          );
        }
      }

      if (!wantedName) {
        return unmatched(
          item.itemId,
          'activity',
          'per_person',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected: [
                {
                  label: 'Activity',
                  reason: 'activity name is required to match a rate card',
                },
              ],
            },
          },
        );
      }
      if (!asOf) {
        return unmatched(
          item.itemId,
          'activity',
          'per_person',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected: [
                {
                  label: 'Date',
                  reason: 'activity date is required to match a season window',
                },
              ],
            },
          },
        );
      }

      const pool: ActivityRateCandidate[] = ctx.activityRates.map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        placeId: r.placeId,
        activityName: r.activityName,
        activityKey: r.activityKey || normalizeActivityKey(r.activityName),
        privateOrSic: r.privateOrSic,
        adultUnitCost: Number(r.adultUnitCost),
        childUnitCost:
          r.childUnitCost != null ? Number(r.childUnitCost) : null,
        startDate: r.startDate,
        endDate: r.endDate,
        updatedAt: r.updatedAt,
        currency: r.currency,
        versionNumber: r.versionNumber ?? 1,
        supersedesId: r.supersedesId ?? null,
      }));

      const best = pickBestActivityRate(pool, {
        asOf,
        supplierId,
        placeId,
        privateOrSic,
        wantedName,
      });

      if (!best) {
        return unmatched(
          item.itemId,
          'activity',
          'per_person',
          ctx.pricing.taxPercent,
          null,
          {
            matchExplain: {
              accepted: [],
              rejected: [
                {
                  label: 'Activity rate',
                  reason:
                    'no active activity rate for this name, date, and supplier/place',
                },
              ],
            },
          },
        );
      }

      const bestRow = ctx.activityRates.find((r) => r.id === best.id);
      const pax = classifyActivityPax({
        adults,
        children,
        childAges,
        childAgeMin: bestRow?.childAgeMin,
        childAgeMax: bestRow?.childAgeMax,
      });
      const blended = blendedActivityUnitCost({
        adultUnitCost: best.adultUnitCost,
        childUnitCost: best.childUnitCost,
        adults: pax.adultHeads,
        children: pax.childHeads,
      });
      const accepted: string[] = [
        `Matched ${best.activityName}`,
        privateOrSic && best.privateOrSic
          ? `${best.privateOrSic.toUpperCase()} rate`
          : 'open private/SIC',
        `₹${best.adultUnitCost}/adult` +
          (best.childUnitCost != null
            ? ` · ₹${best.childUnitCost}/child (ages ${pax.ageMin}–${pax.ageMax})`
            : ''),
        pax.usedChildAges
          ? `${pax.adultHeads} adult-rate · ${pax.childHeads} child-rate from ages`
          : undefined,
      ].filter(Boolean) as string[];

      return matched({
        itemId: item.itemId,
        rateKind: 'activity',
        rateId: best.id,
        unitCost: blended.unitCost,
        markupPercent: ctx.pricing.markupPercent,
        taxPercent: ctx.pricing.taxPercent,
        quantity: blended.quantity,
        pricingUnit: 'per_person',
        rateMeta: {
          activityName: best.activityName,
          activityKey: best.activityKey,
          privateOrSic: best.privateOrSic,
          adultUnitCost: best.adultUnitCost,
          childUnitCost: best.childUnitCost,
          childAgeMin: pax.ageMin,
          childAgeMax: pax.ageMax,
          adults,
          children,
          adultsCharged: pax.adultHeads,
          childrenCharged: pax.childHeads,
          supplierId: best.supplierId,
          placeId: best.placeId,
          startDate: best.startDate
            ? best.startDate.toISOString().slice(0, 10)
            : null,
          endDate: best.endDate ? best.endDate.toISOString().slice(0, 10) : null,
          currency: best.currency || 'INR',
          updatedAt: best.updatedAt.toISOString(),
          unitCost: blended.unitCost,
          rateVersionNumber: best.versionNumber ?? 1,
          calculation: {
            totalBuy: blended.totalBuy,
            adultUnit: best.adultUnitCost,
            childUnit: blended.childUnit,
            adults: pax.adultHeads,
            children: pax.childHeads,
          },
          matchExplain: { accepted, rejected: [] },
        },
      });
    }

    return {
      itemId: item.itemId,
      matched: false as const,
      rateKind: null,
      rateId: null,
      unitCost: 0,
      unitSell: 0,
      quantity: 1,
      taxPercent: ctx.pricing.taxPercent,
      pricingUnit: 'per_service' as const,
      rateMeta: null,
    };
  }

  /** Batch live chart `updatedAt` for quote rate-drift preflight. */
  async chartFreshness(
    organizationId: string,
    items: Array<{ rateId: string; rateKind?: string | null }>,
  ) {
    const hotelIds = [
      ...new Set(
        items
          .filter((c) => !c.rateKind || c.rateKind === 'hotel')
          .map((c) => c.rateId.trim())
          .filter(Boolean),
      ),
    ];
    const transferIds = [
      ...new Set(
        items
          .filter((c) => !c.rateKind || c.rateKind === 'transfer')
          .map((c) => c.rateId.trim())
          .filter(Boolean),
      ),
    ];
    const activityIds = [
      ...new Set(
        items
          .filter((c) => !c.rateKind || c.rateKind === 'activity')
          .map((c) => c.rateId.trim())
          .filter(Boolean),
      ),
    ];

    const [hotels, transfers, activities] = await Promise.all([
      hotelIds.length
        ? this.prisma.supplierHotelRate.findMany({
            where: {
              id: { in: hotelIds },
              deletedAt: null,
              OR: [{ organizationId }, { isSystem: true, organizationId: null }],
            },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
      transferIds.length
        ? this.prisma.transferFare.findMany({
            where: {
              id: { in: transferIds },
              deletedAt: null,
              OR: [{ organizationId }, { organizationId: null }],
            },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
      activityIds.length
        ? this.prisma.supplierActivityRate.findMany({
            where: {
              organizationId,
              id: { in: activityIds },
              deletedAt: null,
            },
            select: { id: true, updatedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const byId = new Map<string, string>();
    for (const row of [...hotels, ...transfers, ...activities]) {
      byId.set(row.id, row.updatedAt.toISOString());
    }

    return {
      items: items.map((item) => ({
        rateId: item.rateId,
        rateKind: item.rateKind ?? null,
        updatedAt: byId.get(item.rateId.trim()) ?? null,
      })),
    };
  }
}

function unmatched(
  itemId: string,
  rateKind: 'hotel' | 'transfer' | 'activity',
  pricingUnit: 'per_room' | 'per_service' | 'per_person',
  taxPercent: number,
  blockReason?: 'blackout' | 'stop_sell' | null,
  extraMeta?: Record<string, unknown> | null,
) {
  return {
    itemId,
    matched: false as const,
    rateKind,
    rateId: null as string | null,
    unitCost: 0,
    unitSell: 0,
    quantity: 1,
    taxPercent,
    pricingUnit,
    rateMeta:
      blockReason || extraMeta
        ? {
            ...(blockReason ? { blockReason } : {}),
            ...(extraMeta ?? {}),
          }
        : (null as null),
  };
}

function matched(opts: {
  itemId: string;
  rateKind: 'hotel' | 'transfer' | 'activity';
  rateId: string;
  unitCost: number;
  markupPercent: number;
  taxPercent: number;
  quantity: number;
  pricingUnit: 'per_room' | 'per_service' | 'per_person';
  rateMeta?: Record<string, unknown> | null;
}) {
  const unitSell = round2(opts.unitCost * (1 + opts.markupPercent / 100));
  return {
    itemId: opts.itemId,
    matched: true as const,
    rateKind: opts.rateKind,
    rateId: opts.rateId,
    unitCost: round2(opts.unitCost),
    unitSell,
    quantity: opts.quantity,
    taxPercent: opts.taxPercent,
    pricingUnit: opts.pricingUnit,
    rateMeta: opts.rateMeta ?? null,
  };
}

function coordsFromProfile(
  profile: unknown,
): { lat: number; lng: number } | null {
  if (!profile || typeof profile !== 'object') return null;
  const p = profile as Record<string, unknown>;
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Inclusive calendar windows overlap when both ends are open or ranges intersect. */
function hotelSeasonWindowsOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): boolean {
  const a0 = aStart ? aStart.getTime() : Number.NEGATIVE_INFINITY;
  const a1 = aEnd ? aEnd.getTime() : Number.POSITIVE_INFINITY;
  const b0 = bStart ? bStart.getTime() : Number.NEGATIVE_INFINITY;
  const b1 = bEnd ? bEnd.getTime() : Number.POSITIVE_INFINITY;
  return a0 <= b1 && b0 <= a1;
}
