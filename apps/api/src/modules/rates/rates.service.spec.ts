import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RatesService } from './rates.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlacesService } from '../places/places.service';

function hotelRate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rate-default',
    organizationId: 'org-1',
    isSystem: false,
    supplierId: 'sup-heritage',
    placeId: 'place-darjeeling',
    roomType: 'Deluxe mountain view',
    mealPlan: 'MAP',
    roomProductId: 'prod-deluxe',
    contractId: 'contract-active',
    unitCost: { toString: () => '4500' },
    weekendUnitCost: null,
    currency: 'INR',
    startDate: new Date('2026-04-01T00:00:00.000Z'),
    endDate: new Date('2026-12-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    contract: {
      id: 'contract-active',
      title: 'FY26 FIT',
      status: 'active',
      versionNumber: 1,
    },
    ...overrides,
  };
}

describe('RatesService.resolve (hotel)', () => {
  let service: RatesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          currency: 'INR',
          settingsJson: { defaultMarkupPercent: 20, defaultTaxPercent: 5 },
        }),
      },
      supplierHotelRate: { findMany: vi.fn().mockResolvedValue([]) },
      transferFare: { findMany: vi.fn().mockResolvedValue([]) },
      supplierActivityRate: { findMany: vi.fn().mockResolvedValue([]) },
      supplierContract: { findMany: vi.fn().mockResolvedValue([]) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
      assetAllotment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    service = new RatesService(prisma, {} as PlacesService, {
      record: vi.fn(),
    } as never);
  });

  it('prefers rate with matching roomProductId and exposes matchExplain on rateMeta', async () => {
    vi.mocked(prisma.supplierHotelRate.findMany).mockResolvedValue([
      hotelRate({
        id: 'rate-string-only',
        roomProductId: null,
        unitCost: { toString: () => '4000' },
        contractId: null,
        contract: null,
      }),
      hotelRate({
        id: 'rate-product',
        roomProductId: 'prod-deluxe',
        unitCost: { toString: () => '4500' },
      }),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      { id: 'contract-active', supplierId: 'sup-heritage', blackoutJson: [], stopSaleJson: [] },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-1',
          type: 'hotel',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-heritage',
            placeId: 'place-darjeeling',
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            roomProductId: 'prod-deluxe',
            nights: 2,
            rooms: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    expect(result.items[0]?.rateId).toBe('rate-product');
    const meta = result.items[0]?.rateMeta as {
      roomProductId?: string;
      matchExplain?: { accepted?: string[]; rejected?: unknown[] };
    };
    expect(meta.roomProductId).toBe('prod-deluxe');
    expect(meta.matchExplain?.accepted).toContain('Room matched');
    expect(Array.isArray(meta.matchExplain?.rejected)).toBe(true);
  });

  it('ignores superseded contract rates when an active contract rate exists', async () => {
    vi.mocked(prisma.supplierHotelRate.findMany).mockResolvedValue([
      hotelRate({
        id: 'rate-superseded',
        unitCost: { toString: () => '3000' },
        contractId: 'contract-old',
        contract: {
          id: 'contract-old',
          title: 'FY25',
          status: 'superseded',
          versionNumber: 1,
        },
      }),
      hotelRate({
        id: 'rate-active',
        unitCost: { toString: () => '4500' },
        contractId: 'contract-active',
        contract: {
          id: 'contract-active',
          title: 'FY26',
          status: 'active',
          versionNumber: 2,
        },
      }),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      { id: 'contract-active', supplierId: 'sup-heritage', blackoutJson: [], stopSaleJson: [] },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-1',
          type: 'hotel',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-heritage',
            placeId: 'place-darjeeling',
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            nights: 1,
            rooms: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.rateId).toBe('rate-active');
  });

  it('returns stop_sell block before blackout (hard block)', async () => {
    vi.mocked(prisma.supplierHotelRate.findMany).mockResolvedValue([
      hotelRate({ id: 'rate-1' }),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'contract-active',
        supplierId: 'sup-heritage',
        blackoutJson: [{ from: '2026-10-05', to: '2026-10-05' }],
        stopSaleJson: [{ from: '2026-10-05', to: '2026-10-05', roomProductId: null }],
      },
    ] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([
      { id: 'sup-heritage', linkedAssetId: 'asset-1' },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-1',
          type: 'hotel',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-heritage',
            placeId: 'place-darjeeling',
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            nights: 1,
            rooms: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'stop_sell',
      matchExplain: {
        rejected: [{ reason: 'stop-sale — room/property unavailable' }],
      },
    });
  });

  it('returns blackout as soft unmatched with manual-rate hint', async () => {
    vi.mocked(prisma.supplierHotelRate.findMany).mockResolvedValue([
      hotelRate({ id: 'rate-1' }),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'contract-active',
        supplierId: 'sup-heritage',
        blackoutJson: [{ from: '2026-10-05', to: '2026-10-05' }],
        stopSaleJson: [],
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-1',
          type: 'hotel',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-heritage',
            placeId: 'place-darjeeling',
            roomType: 'Deluxe mountain view',
            mealPlan: 'MAP',
            nights: 1,
            rooms: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'blackout',
      matchExplain: {
        accepted: ['manual rate allowed — contracted rate in blackout'],
      },
    });
  });
});

function transferFare(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fare-ixb-daj',
    organizationId: null,
    supplierId: null,
    isSystem: true,
    fromPlaceId: 'place-ixb',
    toPlaceId: 'place-daj',
    vehicleTypeId: 'veh-innova',
    unitCost: { toString: () => '4500' },
    childUnitCost: null,
    infantUnitCost: null,
    pricingMode: 'per_vehicle',
    currency: 'INR',
    startDate: null,
    endDate: null,
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    vehicleType: { seats: 7, name: 'Innova' },
    ...overrides,
  };
}

describe('RatesService.resolve (transfer)', () => {
  let service: RatesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          currency: 'INR',
          settingsJson: { defaultMarkupPercent: 20, defaultTaxPercent: 5 },
        }),
      },
      supplierHotelRate: { findMany: vi.fn().mockResolvedValue([]) },
      transferFare: { findMany: vi.fn().mockResolvedValue([]) },
      supplierActivityRate: { findMany: vi.fn().mockResolvedValue([]) },
      supplierContract: { findMany: vi.fn().mockResolvedValue([]) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
      assetAllotment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    service = new RatesService(prisma, {} as PlacesService, {
      record: vi.fn(),
    } as never);
  });

  it('matches corridor with matchExplain and capacity', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare(),
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    const meta = result.items[0]?.rateMeta as {
      vehicleSeats?: number;
      matchExplain?: { accepted?: string[] };
    };
    expect(meta.vehicleSeats).toBe(7);
    expect(meta.matchExplain?.accepted).toEqual(
      expect.arrayContaining([
        'System corridor fare',
        'Per-vehicle pricing',
        'Capacity 7 seats',
      ]),
    );
  });

  it('uses line adults/children for per_adult fares', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({ pricingMode: 'per_adult' }),
    ] as never);

    const result = await service.resolve('org-1', {
      adults: 2,
      children: 0,
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            adults: 3,
            children: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    expect(result.items[0]?.quantity).toBe(4);
    const meta = result.items[0]?.rateMeta as {
      adults?: number;
      children?: number;
      pricingMode?: string;
    };
    expect(meta.pricingMode).toBe('per_adult');
    expect(meta.adults).toBe(3);
    expect(meta.children).toBe(1);
  });

  it('reclassifies over-age children on per_adult fares', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({
        pricingMode: 'per_adult',
        unitCost: { toString: () => '1000' },
        childUnitCost: { toString: () => '500' },
        childAgeMin: 0,
        childAgeMax: 11,
      }),
    ] as never);

    const result = await service.resolve('org-1', {
      adults: 2,
      children: 2,
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            adults: 2,
            children: 2,
            childAges: [8, 14],
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    // 3 adult-rate (2 + over-age 14) + 1 child-rate (8) = 4 heads
    expect(result.items[0]?.quantity).toBe(4);
    // blended: (3*1000 + 1*500) / 4 = 875
    expect(result.items[0]?.unitCost).toBe(875);
    const meta = result.items[0]?.rateMeta as {
      adultsCharged?: number;
      childrenCharged?: number;
      childAgeMin?: number;
      childAgeMax?: number;
      calculation?: { partyAdults?: number };
    };
    expect(meta.adultsCharged).toBe(3);
    expect(meta.childrenCharged).toBe(1);
    expect(meta.childAgeMin).toBe(0);
    expect(meta.childAgeMax).toBe(11);
    expect(meta.calculation?.partyAdults).toBe(2);
  });

  it('prices under-age children as infants on per_adult fares', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({
        pricingMode: 'per_adult',
        unitCost: { toString: () => '1000' },
        childUnitCost: { toString: () => '500' },
        infantUnitCost: { toString: () => '200' },
        childAgeMin: 2,
        childAgeMax: 11,
      }),
    ] as never);

    const result = await service.resolve('org-1', {
      adults: 2,
      children: 2,
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            adults: 2,
            children: 2,
            infants: 0,
            childAges: [1, 8],
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    // 2 adult + 1 child (8) + 1 infant (1) = 4
    expect(result.items[0]?.quantity).toBe(4);
    // (2*1000 + 1*500 + 1*200) / 4 = 675
    expect(result.items[0]?.unitCost).toBe(675);
    const meta = result.items[0]?.rateMeta as {
      infantsCharged?: number;
      adultsCharged?: number;
      childrenCharged?: number;
      calculation?: {
        infantsCharged?: number;
        usedChildAges?: boolean;
        partyInfants?: number;
      };
    };
    expect(meta.adultsCharged).toBe(2);
    expect(meta.childrenCharged).toBe(1);
    expect(meta.infantsCharged).toBe(1);
    expect(meta.calculation?.usedChildAges).toBe(true);
    expect(meta.calculation?.infantsCharged).toBe(1);
    expect(meta.calculation?.partyInfants).toBe(0);
  });

  it('prices line infants on per_adult fares', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({
        pricingMode: 'per_adult',
        unitCost: { toString: () => '1000' },
        childUnitCost: { toString: () => '500' },
        infantUnitCost: { toString: () => '200' },
      }),
    ] as never);

    const result = await service.resolve('org-1', {
      adults: 2,
      children: 0,
      infants: 9,
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            adults: 2,
            children: 0,
            infants: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    expect(result.items[0]?.quantity).toBe(3);
    // (2*1000 + 1*200) / 3
    expect(result.items[0]?.unitCost).toBe(733.33);
    const meta = result.items[0]?.rateMeta as {
      infants?: number;
      infantUnitCost?: number;
      calculation?: { infantUnit?: number; partyInfants?: number };
    };
    expect(meta.infants).toBe(1);
    expect(meta.infantUnitCost).toBe(200);
    expect(meta.calculation?.infantUnit).toBe(200);
    expect(meta.calculation?.partyInfants).toBe(1);
  });

  it('prefers supplier-owned corridor over system catalog', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({
        id: 'fare-system',
        unitCost: { toString: () => '4500' },
      }),
      transferFare({
        id: 'fare-supplier',
        organizationId: 'org-1',
        isSystem: false,
        supplierId: 'sup-fleet',
        unitCost: { toString: () => '3600' },
      }),
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            supplierId: 'sup-fleet',
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    expect(result.items[0]?.rateId).toBe('fare-supplier');
    expect(result.items[0]?.unitCost).toBe(3600);
    const meta = result.items[0]?.rateMeta as {
      supplierId?: string;
      matchExplain?: { accepted?: string[] };
    };
    expect(meta.supplierId).toBe('sup-fleet');
    expect(meta.matchExplain?.accepted).toEqual(
      expect.arrayContaining(['Supplier corridor fare']),
    );
  });

  it('hard-blocks transfer stop-sale on supplier contract', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare(),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'fleet-c1',
        supplierId: 'sup-fleet',
        blackoutJson: [],
        stopSaleJson: [{ from: '2026-10-01', to: '2026-10-10' }],
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            supplierId: 'sup-fleet',
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'stop_sell',
    });
  });

  it('soft-blocks transfer blackout with manual-rate hint', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare(),
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'fleet-c1',
        supplierId: 'sup-fleet',
        blackoutJson: [{ from: '2026-10-05', to: '2026-10-05' }],
        stopSaleJson: [],
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
            supplierId: 'sup-fleet',
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'blackout',
      matchExplain: {
        accepted: ['manual rate allowed — contracted transfer in blackout'],
      },
    });
  });

  it('explains reverse corridor when direction is wrong', async () => {
    vi.mocked(prisma.transferFare.findMany).mockResolvedValue([
      transferFare({
        id: 'fare-reverse',
        fromPlaceId: 'place-daj',
        toPlaceId: 'place-ixb',
      }),
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 't1',
          type: 'transfer',
          date: '2026-10-05',
          details: {
            fromPlaceId: 'place-ixb',
            toPlaceId: 'place-daj',
            vehicleTypeId: 'veh-innova',
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    const meta = result.items[0]?.rateMeta as {
      matchExplain?: { rejected?: Array<{ reason: string }> };
    };
    expect(
      meta.matchExplain?.rejected?.some((r) =>
        /reverse|opposite direction/i.test(r.reason),
      ),
    ).toBe(true);
  });
});

describe('RatesService.resolve (activity)', () => {
  let service: RatesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          currency: 'INR',
          settingsJson: { defaultMarkupPercent: 20, defaultTaxPercent: 5 },
        }),
      },
      supplierHotelRate: { findMany: vi.fn().mockResolvedValue([]) },
      transferFare: { findMany: vi.fn().mockResolvedValue([]) },
      supplierActivityRate: { findMany: vi.fn().mockResolvedValue([]) },
      supplierContract: { findMany: vi.fn().mockResolvedValue([]) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
      assetAllotment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    service = new RatesService(prisma, {} as PlacesService, {
      record: vi.fn(),
    } as never);
  });

  it('matches activity rate and blends adult/child into unitCost', async () => {
    vi.mocked(prisma.supplierActivityRate.findMany).mockResolvedValue([
      {
        id: 'act-tiger-private',
        organizationId: 'org-1',
        supplierId: 'sup-tiger',
        placeId: 'place-tiger',
        activityName: 'Tiger Hill sunrise',
        activityKey: 'tiger-hill-sunrise',
        privateOrSic: 'private',
        adultUnitCost: { toString: () => '1800' },
        childUnitCost: { toString: () => '900' },
        currency: 'INR',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        updatedAt: new Date('2026-07-01'),
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-act',
          type: 'activity',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-tiger',
            placeId: 'place-tiger',
            propertyName: 'Tiger Hill sunrise',
            privateOrSic: 'private',
            adults: 2,
            children: 1,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(true);
    expect(result.items[0]?.rateKind).toBe('activity');
    expect(result.items[0]?.pricingUnit).toBe('per_person');
    expect(result.items[0]?.quantity).toBe(3);
    expect(result.items[0]?.unitCost).toBe(1500);
    expect(result.items[0]?.rateId).toBe('act-tiger-private');
  });

  it('hard-blocks activity stop-sale on supplier contract', async () => {
    vi.mocked(prisma.supplierActivityRate.findMany).mockResolvedValue([
      {
        id: 'act-tiger-private',
        organizationId: 'org-1',
        supplierId: 'sup-tiger',
        placeId: 'place-tiger',
        activityName: 'Tiger Hill sunrise',
        activityKey: 'tiger-hill-sunrise',
        privateOrSic: 'private',
        adultUnitCost: { toString: () => '1800' },
        childUnitCost: { toString: () => '900' },
        currency: 'INR',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        updatedAt: new Date('2026-07-01'),
      },
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'tiger-c1',
        supplierId: 'sup-tiger',
        blackoutJson: [],
        stopSaleJson: [{ from: '2026-10-01', to: '2026-10-10' }],
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-act',
          type: 'activity',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-tiger',
            placeId: 'place-tiger',
            propertyName: 'Tiger Hill sunrise',
            privateOrSic: 'private',
            adults: 2,
            children: 0,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'stop_sell',
    });
  });

  it('soft-blocks activity blackout with manual-rate hint', async () => {
    vi.mocked(prisma.supplierActivityRate.findMany).mockResolvedValue([
      {
        id: 'act-tiger-private',
        organizationId: 'org-1',
        supplierId: 'sup-tiger',
        placeId: 'place-tiger',
        activityName: 'Tiger Hill sunrise',
        activityKey: 'tiger-hill-sunrise',
        privateOrSic: 'private',
        adultUnitCost: { toString: () => '1800' },
        childUnitCost: { toString: () => '900' },
        currency: 'INR',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        updatedAt: new Date('2026-07-01'),
      },
    ] as never);
    vi.mocked(prisma.supplierContract.findMany).mockResolvedValue([
      {
        id: 'tiger-c1',
        supplierId: 'sup-tiger',
        blackoutJson: [{ from: '2026-10-05', to: '2026-10-05' }],
        stopSaleJson: [],
      },
    ] as never);

    const result = await service.resolve('org-1', {
      items: [
        {
          itemId: 'line-act',
          type: 'activity',
          date: '2026-10-05',
          details: {
            supplierId: 'sup-tiger',
            placeId: 'place-tiger',
            propertyName: 'Tiger Hill sunrise',
            privateOrSic: 'private',
            adults: 2,
            children: 0,
          },
        },
      ],
    });

    expect(result.items[0]?.matched).toBe(false);
    expect(result.items[0]?.rateMeta).toMatchObject({
      blockReason: 'blackout',
      matchExplain: {
        accepted: ['manual rate allowed — contracted activity in blackout'],
      },
    });
  });
});

describe('RatesService.importTransferFaresCsv', () => {
  let service: RatesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      supplier: { findFirst: vi.fn() },
      place: { findFirst: vi.fn() },
      vehicleType: { findFirst: vi.fn() },
      transferFare: { create: vi.fn() },
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          currency: 'INR',
          settingsJson: {},
        }),
      },
      auditEvent: { create: vi.fn() },
    } as unknown as PrismaService;
    service = new RatesService(prisma, {} as PlacesService, {
      record: vi.fn(),
    } as never);
  });

  it('resolves supplierName and passes supplierId on commit', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({
      id: 'sup-fleet',
      type: 'fleet',
      name: 'North Bengal Fleet Rentals',
    } as never);
    vi.mocked(prisma.place.findFirst)
      .mockResolvedValueOnce({ id: 'p-from', name: 'Bagdogra' } as never)
      .mockResolvedValueOnce({ id: 'p-to', name: 'Darjeeling' } as never);
    vi.mocked(prisma.vehicleType.findFirst).mockResolvedValue({
      id: 'veh-1',
      name: 'Sedan',
    } as never);
    const createSpy = vi
      .spyOn(service, 'createTransferFare')
      .mockResolvedValue({ id: 'fare-1' } as never);

    const res = await service.importTransferFaresCsv('org-1', 'user-1', {
      commit: true,
      rows: [
        {
          supplierName: 'North Bengal Fleet Rentals',
          fromPlace: 'Bagdogra',
          toPlace: 'Darjeeling',
          vehicleType: 'Sedan',
          unitCost: 3200,
        },
      ],
    });

    expect(res.okCount).toBe(1);
    expect(res.skipCount).toBe(0);
    expect(createSpy).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        supplierId: 'sup-fleet',
        fromPlaceId: 'p-from',
        toPlaceId: 'p-to',
        vehicleTypeId: 'veh-1',
        unitCost: 3200,
      }),
    );
  });

  it('skips when supplierName is missing from directory', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);

    const res = await service.importTransferFaresCsv('org-1', 'user-1', {
      commit: false,
      rows: [
        {
          supplierName: 'Unknown Fleet',
          fromPlace: 'Bagdogra',
          toPlace: 'Darjeeling',
          vehicleType: 'Sedan',
          unitCost: 3200,
        },
      ],
    });

    expect(res.okCount).toBe(0);
    expect(res.skipCount).toBe(1);
    expect(res.results[0]?.reason).toMatch(/Supplier not found/i);
  });

  it('passes child age bounds on commit', async () => {
    vi.mocked(prisma.place.findFirst)
      .mockResolvedValueOnce({ id: 'p-from', name: 'Bagdogra' } as never)
      .mockResolvedValueOnce({ id: 'p-to', name: 'Darjeeling' } as never);
    vi.mocked(prisma.vehicleType.findFirst).mockResolvedValue({
      id: 'veh-1',
      name: 'Sedan',
    } as never);
    const createSpy = vi
      .spyOn(service, 'createTransferFare')
      .mockResolvedValue({ id: 'fare-ages' } as never);

    const res = await service.importTransferFaresCsv('org-1', 'user-1', {
      commit: true,
      rows: [
        {
          fromPlace: 'Bagdogra',
          toPlace: 'Darjeeling',
          vehicleType: 'Sedan',
          unitCost: 3200,
          childUnitCost: 1600,
          infantUnitCost: 400,
          childAgeMin: 0,
          childAgeMax: 11,
          pricingMode: 'per_adult',
        },
      ],
    });

    expect(res.okCount).toBe(1);
    expect(createSpy).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        childAgeMin: 0,
        childAgeMax: 11,
        childUnitCost: 1600,
        infantUnitCost: 400,
        pricingMode: 'per_adult',
      }),
    );
  });

  it('allows catalog rows with empty supplierName', async () => {
    vi.mocked(prisma.place.findFirst)
      .mockResolvedValueOnce({ id: 'p-from', name: 'Bagdogra' } as never)
      .mockResolvedValueOnce({ id: 'p-to', name: 'Darjeeling' } as never);
    vi.mocked(prisma.vehicleType.findFirst).mockResolvedValue({
      id: 'veh-1',
      name: 'Sedan',
    } as never);

    const res = await service.importTransferFaresCsv('org-1', 'user-1', {
      commit: false,
      rows: [
        {
          fromPlace: 'Bagdogra',
          toPlace: 'Darjeeling',
          vehicleType: 'Sedan',
          unitCost: 3200,
        },
      ],
    });

    expect(res.okCount).toBe(1);
    expect(res.results[0]?.summary).not.toMatch(/Fleet/);
    expect(vi.mocked(prisma.supplier.findFirst)).not.toHaveBeenCalled();
  });

  it('rejects commit when every row skips', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);

    await expect(
      service.importTransferFaresCsv('org-1', 'user-1', {
        commit: true,
        rows: [
          {
            supplierName: 'Unknown Fleet',
            fromPlace: 'Bagdogra',
            toPlace: 'Darjeeling',
            vehicleType: 'Sedan',
            unitCost: 3200,
          },
        ],
      }),
    ).rejects.toThrow(/No rows imported/i);
  });
});
