import { describe, expect, it } from 'vitest';
import {
  mapSupplierListRow,
  supplierActiveRateCount,
  supplierHasRateCatalog,
} from './supplier-list';

describe('supplierActiveRateCount', () => {
  it('picks hotel rates for stay suppliers', () => {
    expect(
      supplierActiveRateCount('hotel', {
        hotelRates: 3,
        activityRates: 0,
        transferFares: 0,
      }),
    ).toBe(3);
  });

  it('picks activity rates for activity suppliers', () => {
    expect(
      supplierActiveRateCount('activity', {
        hotelRates: 0,
        activityRates: 2,
        transferFares: 0,
      }),
    ).toBe(2);
  });

  it('returns null for types without a rate catalog', () => {
    expect(
      supplierActiveRateCount('dmc', {
        hotelRates: 1,
        activityRates: 1,
        transferFares: 1,
      }),
    ).toBeNull();
  });
});

describe('supplierHasRateCatalog', () => {
  it('covers stay, activity, and transport types', () => {
    expect(supplierHasRateCatalog('homestay')).toBe(true);
    expect(supplierHasRateCatalog('activity')).toBe(true);
    expect(supplierHasRateCatalog('car_rental')).toBe(true);
    expect(supplierHasRateCatalog('guide')).toBe(false);
  });
});

describe('mapSupplierListRow', () => {
  it('flattens counts and strips prisma _count', () => {
    const mapped = mapSupplierListRow({
      id: 'sup-1',
      name: 'Heritage Lodge',
      type: 'hotel',
      profileJson: {},
      _count: {
        hotelRates: 2,
        activityRates: 0,
        transferFares: 0,
        contracts: 1,
      },
      linkedAsset: {
        id: 'asset-1',
        name: 'Heritage Lodge',
        assetKind: 'hotel',
        _count: { roomProducts: 4 },
      },
    });

    expect(mapped).toMatchObject({
      id: 'sup-1',
      roomProductCount: 4,
      activeRateCount: 2,
      activeContractCount: 1,
      linkedAsset: {
        id: 'asset-1',
        name: 'Heritage Lodge',
        assetKind: 'hotel',
      },
    });
    expect(mapped).not.toHaveProperty('_count');
    expect(mapped.linkedAsset).not.toHaveProperty('_count');
  });

  it('defaults room products to zero when stay supplier has no linked asset', () => {
    const mapped = mapSupplierListRow({
      id: 'sup-2',
      type: 'farmstay',
      linkedAsset: null,
      _count: {
        hotelRates: 0,
        activityRates: 0,
        transferFares: 0,
        contracts: 0,
      },
    });
    expect(mapped.roomProductCount).toBe(0);
    expect(mapped.activeRateCount).toBe(0);
  });
});
