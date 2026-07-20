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
  tpl?: number;
  tplWeekend?: number;
  sgl?: number;
  sglWeekend?: number;
}) {
  const adultBands: Array<{
    adults: number;
    unitCostPerNight: number;
    weekendUnitCostPerNight?: number;
  }> = [];
  if (opts.sgl != null) {
    adultBands.push({
      adults: 1,
      unitCostPerNight: opts.sgl,
      ...(opts.sglWeekend != null
        ? { weekendUnitCostPerNight: opts.sglWeekend }
        : {}),
    });
  }
  if (opts.dbl != null) {
    adultBands.push({
      adults: 2,
      unitCostPerNight: opts.dbl,
      ...(opts.dblWeekend != null
        ? { weekendUnitCostPerNight: opts.dblWeekend }
        : {}),
    });
  }
  if (opts.tpl != null) {
    adultBands.push({
      adults: 3,
      unitCostPerNight: opts.tpl,
      ...(opts.tplWeekend != null
        ? { weekendUnitCostPerNight: opts.tplWeekend }
        : {}),
    });
  }
  return {
    id: opts.id,
    unitCost: opts.unitCost,
    weekendUnitCost: opts.weekendUnitCost ?? null,
    occupancyPricingJson: {
      ...(opts.nationality ? { nationality: opts.nationality } : {}),
      ...(adultBands.length ? { adultBands } : {}),
    },
  };
}

describe('hotel-pax-buy-split', () => {
  it('gates on adults === 2×rooms / exactly two mixed codes (children allowed)', () => {
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
      hotelPaxBuySplitAdultSlots(['IN', 'US'], {
        adults: 4,
        children: 0,
        rooms: 2,
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

  it('gates TPL/3 on 1 room / 3 adults / three or weighted two codes', () => {
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US', 'GB'], {
        adults: 3,
        children: 0,
        rooms: 1,
      }),
    ).toEqual(['IN', 'US', 'GB']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US'], {
        adults: 3,
        children: 0,
        rooms: 1,
      }),
    ).toEqual(['IN', 'IN', 'US']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US', 'GB'], {
        adults: 3,
        children: 0,
        rooms: 2,
      }),
    ).toEqual(['IN', 'US', 'GB']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN', 'US'], {
        adults: 3,
        children: 0,
        rooms: 2,
      }),
    ).toEqual(['IN', 'IN', 'US']);
    expect(
      hotelPaxBuySplitAdultSlots(['IN'], {
        adults: 3,
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

  it('multiplies stay buy by rooms for 2A×N (4 adults / 2 rooms)', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', dbl: 6200 }),
    ];
    const stayDates = [
      new Date('2026-04-10T00:00:00.000Z'),
      new Date('2026-04-11T00:00:00.000Z'),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 4,
      children: 0,
      rooms: 2,
      stayDates,
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.rooms).toBe(2);
    expect(split!.bandAdults).toBe(2);
    expect(split!.paxBuySplitTotalPerNight).toBe(5350);
    expect(split!.totalBuy).toBe(5350 * 2 * 2);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).toMatch(/× 2 rooms/);
  });

  it('splits IN+US+GB TPL/3 shares for 3 adults / 1 room', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', tpl: 6600 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', tpl: 7200 }),
      tip({ id: 'gb', unitCost: 5500, nationality: 'GB', tpl: 6900 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US', 'GB'],
      adults: 3,
      children: 0,
      rooms: 1,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.bandAdults).toBe(3);
    expect(split!.paxBuySplits).toHaveLength(3);
    expect(split!.paxBuySplits[0]).toMatchObject({
      nationality: 'IN',
      sharePerNight: 2200,
      tipUnitCostPerNight: 6600,
    });
    expect(split!.paxBuySplits[1]).toMatchObject({
      nationality: 'US',
      sharePerNight: 2400,
    });
    expect(split!.paxBuySplits[2]).toMatchObject({
      nationality: 'GB',
      sharePerNight: 2300,
    });
    expect(split!.paxBuySplitTotalPerNight).toBe(6900);
    expect(split!.totalBuy).toBe(6900);
  });

  it('composes DBL+SGL for 3 adults / 2 rooms without ×2 rooms', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500, sgl: 3600 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', dbl: 6200, sgl: 4800 }),
      tip({ id: 'gb', unitCost: 5500, nationality: 'GB', dbl: 5800, sgl: 3800 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US', 'GB'],
      adults: 3,
      children: 0,
      rooms: 2,
      stayDates: [
        new Date('2026-04-10T00:00:00.000Z'),
        new Date('2026-04-11T00:00:00.000Z'),
      ],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.composition).toBe('dbl_sgl');
    expect(split!.rooms).toBe(2);
    expect(split!.bandAdults).toBe(2);
    expect(split!.paxBuySplits).toEqual([
      expect.objectContaining({
        nationality: 'IN',
        tipBandAdults: 2,
        sharePerNight: 2250,
      }),
      expect.objectContaining({
        nationality: 'US',
        tipBandAdults: 2,
        sharePerNight: 3100,
      }),
      expect.objectContaining({
        nationality: 'GB',
        tipBandAdults: 1,
        sharePerNight: 3800,
      }),
    ]);
    // 2250 + 3100 + 3800 = 9150/n × 2 nights × stayRooms 1
    expect(split!.paxBuySplitTotalPerNight).toBe(9150);
    expect(split!.totalBuy).toBe(9150 * 2);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).toMatch(/DBL\+SGL/);
    expect(hotelPaxBuySplitMatchAccepted(split!)[0]).not.toMatch(/× 2 rooms/);
  });

  it('weights 2×IN + US on TPL/3 (reuses IN tip)', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', tpl: 6600 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', tpl: 7200 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 3,
      children: 0,
      rooms: 1,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.paxBuySplits).toEqual([
      expect.objectContaining({ nationality: 'IN', sharePerNight: 2200 }),
      expect.objectContaining({ nationality: 'IN', sharePerNight: 2200 }),
      expect.objectContaining({ nationality: 'US', sharePerNight: 2400 }),
    ]);
    expect(split!.paxBuySplitTotalPerNight).toBe(6800);
    expect(split!.paxBuySplits[0]!.tipRateId).toBe(
      split!.paxBuySplits[1]!.tipRateId,
    );
  });

  it('weights 2×IN + US on DBL+SGL (IN on both DBL halves)', () => {
    const pool = [
      tip({ id: 'in', unitCost: 4000, nationality: 'IN', dbl: 4500, sgl: 3600 }),
      tip({ id: 'us', unitCost: 6000, nationality: 'US', dbl: 6200, sgl: 4800 }),
    ];
    const split = tryHotelPaxBuySplit({
      guestCodes: ['IN', 'US'],
      adults: 3,
      children: 0,
      rooms: 2,
      stayDates: [new Date('2026-04-10T00:00:00.000Z')],
      candidatePool: pool,
      pickBest: (rows) => rows[0],
    });
    expect(split).not.toBeNull();
    expect(split!.composition).toBe('dbl_sgl');
    expect(split!.paxBuySplits).toEqual([
      expect.objectContaining({
        nationality: 'IN',
        tipBandAdults: 2,
        sharePerNight: 2250,
      }),
      expect.objectContaining({
        nationality: 'IN',
        tipBandAdults: 2,
        sharePerNight: 2250,
      }),
      expect.objectContaining({
        nationality: 'US',
        tipBandAdults: 1,
        sharePerNight: 4800,
      }),
    ]);
    expect(split!.paxBuySplitTotalPerNight).toBe(9300);
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
