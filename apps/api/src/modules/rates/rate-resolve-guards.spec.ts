import { describe, expect, it } from 'vitest';
import {
  anyNightInBlackout,
  anyNightInStopSell,
  averageHotelUnitCost,
  eachStayNight,
  filterHotelByRoomAndMeal,
  hotelNightUnitCost,
  isWeekendUtc,
  parseBlackoutRanges,
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

  it('prefers blackout over stop-sell in block reason', () => {
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
});
