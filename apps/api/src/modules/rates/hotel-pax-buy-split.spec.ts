import { describe, expect, it } from 'vitest';
import {
  dblBandFromTip,
  hotelPaxBuySplitAdultSlots,
  hotelPaxBuySplitMatchAccepted,
  tryHotelPaxBuySplit,
} from './hotel-pax-buy-split';

function tip(opts: {
  id: string;
  unitCost: number;
  weekendUnitCost?: number | null;
  nationality?: string | null;
  dbl?: number;
  dblWeekend?: number;
}) {
  const adultBands =
    opts.dbl != null
      ? [
          {
            adults: 2,
            unitCostPerNight: opts.dbl,
            ...(opts.dblWeekend != null
              ? { weekendUnitCostPerNight: opts.dblWeekend }
              : {}),
          },
        ]
      : undefined;
  return {
    id: opts.id,
    unitCost: opts.unitCost,
    weekendUnitCost: opts.weekendUnitCost ?? null,
    occupancyPricingJson: {
      ...(opts.nationality ? { nationality: opts.nationality } : {}),
      ...(adultBands ? { adultBands } : {}),
    },
  };
}

describe('hotel-pax-buy-split', () => {
  it('gates on 1 room / 2 adults / exactly two mixed codes (children allowed)', () => {
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US'], {
        adults: 2,
        children: 0,
        rooms: 1,
      }),
    ).toEqual(['IN', 'US']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US'], {
        adults: 2,
        children: 1,
        rooms: 1,
      }),
    ).toEqual(['IN', 'US']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US', 'GB'], {
        adults: 2,
        children: 0,
        rooms: 1,
      }),
    ).toBeNull();
    expect(
      hotelPaxBuySplitAdultSlots(['US'], {
        adults: 2,
        children: 0,
        rooms: 1,
      }),
    ).toBeNull();
  });

  it('reads DBL band from tip', () => {
    const band = dblBandFromTip(
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500 }),
    );
    expect(band.unitCostPerNight).toBe(4500);
    expect(band.adults).toBe(2);
  });

  it('splits IN+US DBL/2 shares and totals stay buy', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', dbl: 6200 }),
      tip({ id: 'intl', unitCost: 5800, nationality: 'INTL', dbl: 5800 }),
    ];
    const pickBest = <T extends { id: string }>(rows: T[]) => rows[0];
    const stayDates = [
      new Date('2026-04-10T00:00:00.000Z'),
      new Date('2026-04-11T00:00:00.000Z'),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 2,
      children: 0,
      rooms: 1,
      stayDates,
      candidatePool: pool,
      pickBest,
    });
    expect(split).not.toBeNull();
    expect(split!.buyMode).toBe('per_pax_split');
    expect(split!.paxBuySplits).toHaveLength(2);
    expect(split!.paxBuySplits[0]).toMatchObject({
      nationality: 'IN',
      sharePerNight: 2250,
      tipRateId: 'in',
      tipUnitCostPerNight: 4500,
    });
    expect(split!.paxBuySplits[1]).toMatchObject({
      nationality: 'US',
      sharePerNight: 3100,
      tipRateId: 'us',
      tipUnitCostPerNight: 6200,
    });
    expect(split!.paxBuySplitTotalPerNight).toBe(5350);
    expect(split!.totalBuy).toBe(5350 * 2);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).toMatch(/Per-pax buy/);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).toMatch(/IN/);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).toMatch(/US/);
  });

  it('keeps DBL/2 shares when children are present', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', dbl: 6200 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 2,
      children: 1,
      rooms: 1,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.paxBuySplitTotalPerNight).toBe(5350);
    expect(split!.paxBuySplits).toHaveLength(2);
  });

  it('falls back when a nationality tip is missing', () => {
    const pool = [
      tip({ id: 'intl', unitCost: 5800, nationality: 'INTL', dbl: 5800 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 2,
      children: 0,
      rooms: 1,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    // IN cannot use INTL; US can — missing IN tip → null
    expect(split).toBeNull();
  });

  it('falls back when both adults resolve to the same tip', () => {
    const pool = [tip({ id: 'any', unitCost: 5000, dbl: 5000 })];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 2,
      children: 0,
      rooms: 1,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).toBeNull();
  });
});
