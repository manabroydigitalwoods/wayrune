import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateSupplierHotelRateInput,
  CreateTransferFareInput,
  GenerateTransferFareMatrixInput,
  ResolveRatesInput,
  ResolveRatesItemInput,
  SuggestTransferFareInput,
  UpdateSupplierHotelRateInput,
  UpdateTransferFareInput,
} from '@travel/contracts';
import {
  SYSTEM_FARE_CLUSTERS,
  SYSTEM_VEHICLE_RATE_BANDS,
} from '@travel/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PlacesService } from '../places/places.service';

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
  isSystem: boolean;
  fromPlaceId: string;
  toPlaceId: string;
  vehicleTypeId: string;
  unitCost: Prisma.Decimal;
  childUnitCost: Prisma.Decimal | null;
  infantUnitCost: Prisma.Decimal | null;
  pricingMode: string;
  startDate: Date | null;
  endDate: Date | null;
};

type HotelRow = {
  id: string;
  organizationId: string | null;
  isSystem: boolean;
  supplierId: string | null;
  placeId: string | null;
  roomType: string | null;
  unitCost: Prisma.Decimal;
  startDate: Date | null;
  endDate: Date | null;
};

@Injectable()
export class RatesService {
  constructor(
    private prisma: PrismaService,
    private places: PlacesService,
  ) {}

  private async orgPricing(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { currency: true, settingsJson: true },
    });
    const settings =
      org?.settingsJson && typeof org.settingsJson === 'object'
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    const markup =
      typeof settings.defaultMarkupPercent === 'number'
        ? settings.defaultMarkupPercent
        : 20;
    const tax =
      typeof settings.defaultTaxPercent === 'number'
        ? settings.defaultTaxPercent
        : 0;
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
  } as const;

  private hotelInclude = {
    supplier: { select: { id: true, name: true, type: true } },
    place: { select: { id: true, name: true, kind: true, key: true } },
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
    return this.prisma.supplierHotelRate.create({
      data: {
        organizationId: asSystem ? null : organizationId,
        isSystem: asSystem,
        supplierId: asSystem ? null : input.supplierId || null,
        placeId: input.placeId || null,
        roomType: input.roomType?.trim() || null,
        unitCost: new Prisma.Decimal(input.unitCost),
        currency: input.currency || pricing.currency,
        startDate: parseDateOnly(input.startDate),
        endDate: parseDateOnly(input.endDate),
        isActive: input.isActive !== false,
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
    return this.prisma.supplierHotelRate.update({
      where: { id: rateId },
      data: {
        ...(input.supplierId !== undefined
          ? { supplierId: input.supplierId || null }
          : {}),
        ...(input.placeId !== undefined
          ? { placeId: input.placeId || null }
          : {}),
        ...(input.roomType !== undefined
          ? { roomType: input.roomType?.trim() || null }
          : {}),
        ...(input.unitCost != null
          ? { unitCost: new Prisma.Decimal(input.unitCost) }
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

  // ── Transfer fares ─────────────────────────────────────────────────

  async listTransferFares(
    organizationId: string | null,
    opts?: {
      fromPlaceId?: string;
      toPlaceId?: string;
      vehicleTypeId?: string;
      q?: string;
      systemOnly?: boolean;
      includeSystem?: boolean;
    },
  ) {
    const systemOnly = opts?.systemOnly === true;
    const includeSystem = opts?.includeSystem !== false;
    const items = await this.prisma.transferFare.findMany({
      where: {
        deletedAt: null,
        ...(systemOnly
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
    let result = items;
    if (organizationId && !systemOnly) {
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
    const pricing = organizationId
      ? await this.orgPricing(organizationId)
      : { currency: 'INR' };
    return this.prisma.transferFare.create({
      data: {
        organizationId: asSystem ? null : organizationId,
        isSystem: asSystem,
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
    return this.prisma.transferFare.update({
      where: { id: fareId },
      data: {
        ...(input.fromPlaceId ? { fromPlaceId: input.fromPlaceId } : {}),
        ...(input.toPlaceId ? { toPlaceId: input.toPlaceId } : {}),
        ...(input.vehicleTypeId ? { vehicleTypeId: input.vehicleTypeId } : {}),
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

  // ── Resolve ────────────────────────────────────────────────────────

  async resolve(organizationId: string, input: ResolveRatesInput) {
    const pricing = await this.orgPricing(organizationId);
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

    const hotelRates = await this.prisma.supplierHotelRate.findMany({
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
          // system place defaults may still help when only supplierId present — skip
        ],
      },
    });

    const transferKeys = input.items.filter(
      (i) =>
        (i.type === 'transfer' || i.type === 'flight') &&
        i.details?.fromPlaceId &&
        i.details?.toPlaceId &&
        i.details?.vehicleTypeId,
    );
    const transferFares = transferKeys.length
      ? await this.prisma.transferFare.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            OR: transferKeys.flatMap((i) => [
              {
                organizationId,
                isSystem: false,
                fromPlaceId: i.details!.fromPlaceId!,
                toPlaceId: i.details!.toPlaceId!,
                vehicleTypeId: i.details!.vehicleTypeId!,
              },
              {
                isSystem: true,
                organizationId: null,
                fromPlaceId: i.details!.fromPlaceId!,
                toPlaceId: i.details!.toPlaceId!,
                vehicleTypeId: i.details!.vehicleTypeId!,
              },
            ]),
          },
        })
      : [];

    const results = input.items.map((item) =>
      this.resolveOne(item, {
        hotelRates,
        transferFares,
        pricing,
        tripAsOf,
        adults,
        children,
        infants,
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
    },
  ) {
    const asOf = parseDateOnly(item.date) || ctx.tripAsOf;
    const type = item.type === 'activity' ? 'sightseeing' : item.type;

    if (type === 'hotel') {
      const supplierId = item.details?.supplierId;
      const placeId = item.details?.placeId;
      const roomWanted = (item.details?.roomType || '').trim().toLowerCase();

      const pickBest = (pool: HotelRow[]) => {
        let best: HotelRow | undefined;
        let bestScore = -1;
        for (const r of pool) {
          let score = windowScore(r.startDate, r.endDate);
          if (!r.isSystem && r.organizationId) score += 10; // agency wins
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        return best;
      };

      const inWindow = (r: HotelRow) =>
        dateInWindow(asOf, r.startDate, r.endDate);

      let best: HotelRow | undefined;

      if (supplierId) {
        const agency = ctx.hotelRates.filter(
          (r) =>
            !r.isSystem &&
            r.supplierId === supplierId &&
            inWindow(r),
        );
        const exact = roomWanted
          ? agency.filter(
              (r) => (r.roomType || '').trim().toLowerCase() === roomWanted,
            )
          : [];
        const defaults = agency.filter((r) => !(r.roomType || '').trim());
        best = pickBest(exact) || pickBest(defaults) || pickBest(agency);
      }

      if (!best && placeId) {
        const agencyPlace = ctx.hotelRates.filter(
          (r) =>
            !r.isSystem &&
            r.placeId === placeId &&
            inWindow(r),
        );
        const systemPlace = ctx.hotelRates.filter(
          (r) => r.isSystem && r.placeId === placeId && inWindow(r),
        );
        const matchRoom = (pool: HotelRow[]) => {
          const exact = roomWanted
            ? pool.filter(
                (r) => (r.roomType || '').trim().toLowerCase() === roomWanted,
              )
            : [];
          const defaults = pool.filter((r) => !(r.roomType || '').trim());
          return pickBest(exact) || pickBest(defaults) || pickBest(pool);
        };
        best = matchRoom(agencyPlace) || matchRoom(systemPlace);
      }

      if (!best) {
        return unmatched(item.itemId, 'hotel', 'per_room', ctx.pricing.taxPercent);
      }
      const unitCost = Number(best.unitCost);
      const nights = Math.max(1, Number(item.details?.nights) || 1);
      return matched({
        itemId: item.itemId,
        rateKind: 'hotel',
        rateId: best.id,
        unitCost,
        markupPercent: ctx.pricing.markupPercent,
        taxPercent: ctx.pricing.taxPercent,
        quantity: nights,
        pricingUnit: 'per_room',
        rateMeta: {
          isSystem: best.isSystem,
          placeId: best.placeId,
          supplierId: best.supplierId,
        },
      });
    }

    if (type === 'transfer') {
      const fromPlaceId = item.details?.fromPlaceId;
      const toPlaceId = item.details?.toPlaceId;
      const vehicleTypeId = item.details?.vehicleTypeId;
      if (!fromPlaceId || !toPlaceId || !vehicleTypeId) {
        return unmatched(
          item.itemId,
          'transfer',
          'per_service',
          ctx.pricing.taxPercent,
        );
      }
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
        if (!f.isSystem && f.organizationId) score += 10;
        if (score > bestScore) {
          bestScore = score;
          best = f;
        }
      }
      if (!best) {
        return unmatched(
          item.itemId,
          'transfer',
          'per_service',
          ctx.pricing.taxPercent,
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

      if (pricingMode === 'per_adult') {
        const party = ctx.adults + ctx.children + ctx.infants;
        if (party > 0) {
          const total =
            ctx.adults * adultCost +
            ctx.children * childCost +
            ctx.infants * infantCost;
          quantity = party;
          unitCost = round2(total / party);
          pricingUnit = 'per_person';
        }
      }

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
          adults: ctx.adults,
          children: ctx.children,
          infants: ctx.infants,
          adultUnitCost: adultCost,
          childUnitCost: childCost,
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
}

function unmatched(
  itemId: string,
  rateKind: 'hotel' | 'transfer',
  pricingUnit: 'per_room' | 'per_service',
  taxPercent: number,
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
    rateMeta: null as null,
  };
}

function matched(opts: {
  itemId: string;
  rateKind: 'hotel' | 'transfer';
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
