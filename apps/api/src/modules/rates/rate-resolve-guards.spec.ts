import { describe, expect, it } from 'vitest';
import {
  anyNightInBlackout,
  anyNightInContractStopSale,
  anyNightInStopSell,
  averageHotelUnitCost,
  eachStayNight,
  explainHotelRejects,
  filterHotelByRoomAndMeal,
  hotelNightUnitCost,
  isWeekendUtc,
  parseBlackoutRanges,
  parseStopSaleRanges,
  supplierBlockedReason,
} from './rate-resolve-guards';

describe('rate-resolve-guards', () => {
  it('expands stay nights from check-in', () => {
    const nights = eachStayNight(new Date('2026-10-01T00:00:00.000Z'), 3);
    expect(nights.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('parses blackout ranges from from/to and aliases', () => {
    expect(
      parseBlackoutRanges([
        { from: '2026-12-20', to: '2026-12-26' },
        { start: '2026-01-01', end: '2026-01-02' },
        { junk: true },
      ]),
    ).toEqual([
      { from: '2026-12-20', to: '2026-12-26' },
      { from: '2026-01-01', to: '2026-01-02' },
    ]);
  });

  it('parses stop-sale ranges with optional roomProductId', () => {
    expect(
      parseStopSaleRanges([
        { from: '2026-08-10', to: '2026-08-12' },
        { start: '2026-09-01', end: '2026-09-03', roomProductId: 'prod-suite' },
        { from: '2026-10-01', to: '2026-09-30' },
      ]),
    ).toEqual([
      { from: '2026-08-10', to: '2026-08-12', roomProductId: null },
      { from: '2026-09-01', to: '2026-09-03', roomProductId: 'prod-suite' },
    ]);
  });

  it('detects blackout on later stay nights', () => {
    const nights = eachStayNight(new Date('2026-12-24T00:00:00.000Z'), 3);
    expect(
      anyNightInBlackout(nights, [{ from: '2026-12-25', to: '2026-12-31' }]),
    ).toBe(true);
    expect(
      anyNightInBlackout(nights, [{ from: '2026-11-01', to: '2026-11-05' }]),
    ).toBe(false);
  });

  it('detects stop-sell with half-open allotment windows', () => {
    const nights = eachStayNight(new Date('2026-08-10T00:00:00.000Z'), 2);
    const windows = [
      {
        startDate: new Date('2026-08-10T00:00:00.000Z'),
        endDate: new Date('2026-08-12T00:00:00.000Z'),
      },
    ];
    expect(anyNightInStopSell(nights, windows)).toBe(true);
    expect(
      anyNightInStopSell(nights, [
        {
          startDate: new Date('2026-08-12T00:00:00.000Z'),
          endDate: new Date('2026-08-15T00:00:00.000Z'),
        },
      ]),
    ).toBe(false);
  });

  it('scopes stop-sell to roomProductId when set', () => {
    const nights = eachStayNight(new Date('2026-08-10T00:00:00.000Z'), 1);
    const windows = [
      {
        startDate: new Date('2026-08-10T00:00:00.000Z'),
        endDate: new Date('2026-08-11T00:00:00.000Z'),
        roomProductId: 'suite-only',
      },
    ];
    expect(anyNightInStopSell(nights, windows, 'deluxe-id')).toBe(false);
    expect(anyNightInStopSell(nights, windows, 'suite-only')).toBe(true);
    expect(anyNightInStopSell(nights, windows)).toBe(true);
  });

  it('scopes contract stop-sale to roomProductId when set', () => {
    const nights = eachStayNight(new Date('2026-08-10T00:00:00.000Z'), 1);
    const ranges = [{ from: '2026-08-10', to: '2026-08-10', roomProductId: 'prod-a' }];
    expect(anyNightInContractStopSale(nights, ranges, 'prod-b')).toBe(false);
    expect(anyNightInContractStopSale(nights, ranges, 'prod-a')).toBe(true);
  });

  it('prefers stop-sell over blackout in block reason when both apply', () => {
    const nights = eachStayNight(new Date('2026-08-10T00:00:00.000Z'), 1);
    expect(
      supplierBlockedReason(
        nights,
        [{ from: '2026-08-10', to: '2026-08-10' }],
        [
          {
            startDate: new Date('2026-08-10T00:00:00.000Z'),
            endDate: new Date('2026-08-11T00:00:00.000Z'),
          },
        ],
      ),
    ).toBe('stop_sell');
    expect(
      supplierBlockedReason(
        nights,
        [{ from: '2026-08-10', to: '2026-08-10' }],
        [],
      ),
    ).toBe('blackout');
    expect(
      supplierBlockedReason(
        nights,
        [],
        [
          {
            startDate: new Date('2026-08-10T00:00:00.000Z'),
            endDate: new Date('2026-08-11T00:00:00.000Z'),
          },
        ],
      ),
    ).toBe('stop_sell');
  });

  it('applies weekend unit cost on Sat/Sun nights', () => {
    const rate = { unitCost: 4000, weekendUnitCost: 5000 };
    const fri = new Date('2026-07-17T00:00:00.000Z'); // Friday
    const sat = new Date('2026-07-18T00:00:00.000Z'); // Saturday
    expect(isWeekendUtc(fri)).toBe(false);
    expect(isWeekendUtc(sat)).toBe(true);
    expect(hotelNightUnitCost(rate, fri)).toBe(4000);
    expect(hotelNightUnitCost(rate, sat)).toBe(5000);
    expect(
      averageHotelUnitCost(rate, [
        fri,
        sat,
        new Date('2026-07-19T00:00:00.000Z'),
      ]),
    ).toBeCloseTo((4000 + 5000 + 5000) / 3);
  });

  it('filters hotel rows by room and meal preferring exact matches', () => {
    const pool = [
      { id: '1', roomType: 'Deluxe', mealPlan: 'MAP' },
      { id: '2', roomType: 'Deluxe', mealPlan: null },
      { id: '3', roomType: null, mealPlan: 'MAP' },
      { id: '4', roomType: 'Suite', mealPlan: 'CP' },
    ];
    expect(filterHotelByRoomAndMeal(pool, 'Deluxe', 'MAP').map((r) => r.id)).toEqual([
      '1',
    ]);
    expect(filterHotelByRoomAndMeal(pool, 'Deluxe', 'CP').map((r) => r.id)).toEqual([
      '2',
    ]);
    expect(filterHotelByRoomAndMeal(pool, 'Suite', '').map((r) => r.id)).toEqual([
      '4',
    ]);
  });

  it('prefers roomProductId exact match over string room type', () => {
    const pool = [
      {
        id: 'legacy',
        roomType: 'Deluxe mountain view',
        mealPlan: 'MAP',
        roomProductId: null,
      },
      {
        id: 'canonical',
        roomType: 'Deluxe mountain view',
        mealPlan: 'MAP',
        roomProductId: 'prod-deluxe',
      },
      {
        id: 'other-product',
        roomType: 'Deluxe mountain view',
        mealPlan: 'MAP',
        roomProductId: 'prod-suite',
      },
    ];
    expect(
      filterHotelByRoomAndMeal(pool, 'Deluxe mountain view', 'MAP', 'prod-deluxe').map(
        (r) => r.id,
      ),
    ).toEqual(['canonical']);
  });

  it('classifies superseded contract rates in explainHotelRejects', () => {
    const pool = [
      {
        id: 'old',
        roomType: 'Deluxe',
        mealPlan: 'MAP',
        roomProductId: null,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-12-31'),
        contractId: 'c-old',
        contractStatus: 'superseded',
      },
      {
        id: 'active',
        roomType: 'Deluxe',
        mealPlan: 'MAP',
        roomProductId: 'prod-1',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-12-31'),
        contractId: 'c-new',
        contractStatus: 'active',
      },
    ];
    const rejects = explainHotelRejects(pool, 'active', {
      roomWanted: 'Deluxe',
      mealWanted: 'MAP',
      roomProductIdWanted: 'prod-1',
      asOf: new Date('2026-10-05'),
    });
    expect(rejects.some((r) => r.rateId === 'old' && r.reason === 'superseded contract')).toBe(
      true,
    );
  });
});
