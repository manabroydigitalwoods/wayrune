import { describe, expect, it } from 'vitest';
import {
  TRANSFER_VEHICLES_CONFIRM,
  TRANSFER_VEHICLES_SOFT_WARN,
  isServiceDateOutsideTrip,
  suggestedSellFromMarkup,
  transferAutoDescription,
  transferBaseCost,
  transferMatchKeysChanged,
  transferRoutePlausibilityWarning,
  transferUnitSellFromSuggestedTotal,
  trimChildAgesForChildrenCount,
  shouldReplaceTransferDescription,
  validateTransferV1,
} from './quoteServiceDetails';

describe('validateTransferV1', () => {
  it('requires From, To, vehicle and service date for match', () => {
    const result = validateTransferV1({ vehicles: 1 });
    expect(result.ok).toBe(true);
    expect(result.matchBlockedReasons).toEqual([
      'select From place',
      'select To place',
      'select vehicle',
      'select service date',
    ]);
  });

  it('allows match when route, vehicle and date are set', () => {
    const result = validateTransferV1({
      fromPlaceId: 'from-1',
      toPlaceId: 'to-1',
      vehicleTypeId: 'veh-1',
      serviceDate: '2026-12-01',
      vehicles: 1,
    });
    expect(result.matchBlockedReasons).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects vehicles below 1, non-integers, and sell below buy', () => {
    const result = validateTransferV1(
      {
        fromPlaceId: 'a',
        toPlaceId: 'b',
        vehicleTypeId: 'v',
        serviceDate: '2026-12-01',
        vehicles: 1.5,
      },
      { buyUnit: 100, sellUnit: 50 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /whole number/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /below buy/i.test(e))).toBe(true);
  });

  it('warns above soft threshold and requires confirm above confirm threshold', () => {
    const soft = validateTransferV1({
      fromPlaceId: 'a',
      toPlaceId: 'b',
      vehicleTypeId: 'v',
      serviceDate: '2026-12-01',
      vehicles: TRANSFER_VEHICLES_SOFT_WARN + 1,
    });
    expect(soft.warnings.some((w) => /Unusual quantity/i.test(w))).toBe(true);
    expect(soft.requiresUnusualVehiclesConfirm).toBe(false);

    const large = validateTransferV1({
      fromPlaceId: 'a',
      toPlaceId: 'b',
      vehicleTypeId: 'v',
      serviceDate: '2026-12-01',
      vehicles: 90012,
    });
    expect(large.requiresUnusualVehiclesConfirm).toBe(true);
    expect(large.ok).toBe(false);
    expect(large.warnings.some((w) => /90,012/i.test(w) || /90012/.test(w))).toBe(
      true,
    );

    const confirmed = validateTransferV1({
      fromPlaceId: 'a',
      toPlaceId: 'b',
      vehicleTypeId: 'v',
      serviceDate: '2026-12-01',
      vehicles: TRANSFER_VEHICLES_CONFIRM + 5,
      unusualVehiclesConfirmed: true,
    });
    expect(confirmed.requiresUnusualVehiclesConfirm).toBe(false);
    expect(confirmed.ok).toBe(true);
  });

  it('blocks service date outside trip unless overridden', () => {
    const blocked = validateTransferV1(
      {
        fromPlaceId: 'a',
        toPlaceId: 'b',
        vehicleTypeId: 'v',
        serviceDate: '2026-07-01',
        vehicles: 1,
      },
      { tripStartDate: '2026-12-01', tripEndDate: '2026-12-06' },
    );
    expect(blocked.requiresServiceDateOverride).toBe(true);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]).toMatch(/outside the trip dates/i);
    expect(blocked.errors[0]).toMatch(/2026/);

    const overridden = validateTransferV1(
      {
        fromPlaceId: 'a',
        toPlaceId: 'b',
        vehicleTypeId: 'v',
        serviceDate: '2026-07-01',
        vehicles: 1,
        serviceDateOutsideTripOverride: true,
      },
      { tripStartDate: '2026-12-01', tripEndDate: '2026-12-06' },
    );
    expect(overridden.requiresServiceDateOverride).toBe(false);
    expect(overridden.ok).toBe(true);
    expect(overridden.warnings.some((w) => /pre\/post-trip/i.test(w))).toBe(true);
  });
});

describe('isServiceDateOutsideTrip', () => {
  it('detects dates before and after the trip window', () => {
    expect(isServiceDateOutsideTrip('2026-07-01', '2026-12-01', '2026-12-06')).toBe(
      true,
    );
    expect(isServiceDateOutsideTrip('2026-12-03', '2026-12-01', '2026-12-06')).toBe(
      false,
    );
    expect(isServiceDateOutsideTrip('2026-12-10', '2026-12-01', '2026-12-06')).toBe(
      true,
    );
  });
});

describe('transferRoutePlausibilityWarning', () => {
  it('warns for international or long-haul routes', () => {
    expect(
      transferRoutePlausibilityWarning({
        fromPlaceName: 'Agartala',
        toPlaceName: 'Bangkok',
        fromCountry: 'India',
        toCountry: 'Thailand',
        vehicleLabel: 'Sedan',
      }),
    ).toMatch(/Cross-border road transfer/i);

    expect(
      transferRoutePlausibilityWarning({
        fromPlaceName: 'New Jalpaiguri (NJP)',
        toPlaceName: 'Bangkok',
        vehicleLabel: 'SUV / Innova',
      }),
    ).toMatch(/Cross-border|international/i);

    expect(
      transferRoutePlausibilityWarning(
        {
          fromPlaceName: 'NJP',
          toPlaceName: 'Darjeeling',
          vehicleLabel: 'SUV / Innova',
        },
        { routeDistanceKm: 70 },
      ),
    ).toBeNull();
  });
});

describe('transferMatchKeysChanged', () => {
  it('detects route and vehicle changes', () => {
    const prev = {
      fromPlaceId: 'a',
      toPlaceId: 'b',
      vehicleTypeId: 'v1',
      supplierId: 's1',
      serviceDate: '2026-04-10',
    };
    expect(transferMatchKeysChanged(prev, { fromPlaceId: 'a2' })).toBe(true);
    expect(transferMatchKeysChanged(prev, { vehicleTypeId: 'v2' })).toBe(true);
    expect(transferMatchKeysChanged(prev, { serviceDate: '2026-04-11' })).toBe(true);
    expect(transferMatchKeysChanged(prev, { vehicles: 2 })).toBe(false);
  });

  it('invalidates match when adults/children/childAges change', () => {
    expect(
      transferMatchKeysChanged(
        { adults: 2, children: 1, fromPlaceId: 'a' },
        { adults: 3 },
      ),
    ).toBe(true);
    expect(
      transferMatchKeysChanged(
        { adults: 2, fromPlaceId: 'a' },
        { childAges: [8] },
      ),
    ).toBe(true);
  });
});

describe('transferAutoDescription', () => {
  it('builds route · vehicle · qty description', () => {
    expect(
      transferAutoDescription({
        fromPlaceName: 'Bagdogra',
        toPlaceName: 'Darjeeling',
        vehicleLabel: 'Innova',
        vehicles: 1,
      }),
    ).toBe('Bagdogra → Darjeeling · Innova · 1 vehicle');
  });

  it('replaces auto-looking descriptions', () => {
    expect(
      shouldReplaceTransferDescription('New service', {
        fromPlaceName: 'A',
        toPlaceName: 'B',
        vehicleLabel: 'SUV',
        vehicles: 1,
      }),
    ).toBe(true);
    expect(
      shouldReplaceTransferDescription('Custom client wording', {
        fromPlaceName: 'A',
        toPlaceName: 'B',
        vehicleLabel: 'SUV',
        vehicles: 1,
      }),
    ).toBe(false);
  });
});

describe('golden scenario NJP → Darjeeling', () => {
  it('matches description and pricing math', () => {
    const details = {
      fromPlaceName: 'NJP',
      toPlaceName: 'Darjeeling',
      vehicleLabel: 'SUV / Innova',
      vehicles: 1,
      serviceDate: '2026-12-01',
    };
    expect(transferAutoDescription(details)).toBe(
      'NJP → Darjeeling · SUV / Innova · 1 vehicle',
    );
    const buy = 3500;
    const base = transferBaseCost(buy, details);
    expect(base).toBe(3500);
    const sellTotal = suggestedSellFromMarkup(base, 'percent', 20);
    expect(sellTotal).toBe(4200);
    const unitSell = transferUnitSellFromSuggestedTotal(sellTotal, details);
    expect(unitSell).toBe(4200);
    const profit = (sellTotal ?? 0) - (base ?? 0);
    const margin = Math.round((profit / (sellTotal ?? 1)) * 10000) / 100;
    expect(profit).toBe(700);
    expect(margin).toBe(16.67);
  });
});

describe('trimChildAgesForChildrenCount', () => {
  it('trims or clears ages when children shrink', () => {
    expect(trimChildAgesForChildrenCount(2, [5, 8, 11])).toEqual([5, 8]);
    expect(trimChildAgesForChildrenCount(0, [5, 8])).toBeUndefined();
    expect(trimChildAgesForChildrenCount(1, [])).toBeUndefined();
  });
});
