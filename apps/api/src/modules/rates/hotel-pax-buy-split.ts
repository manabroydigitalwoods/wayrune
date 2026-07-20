/**
 * Thin mixed-nationality hotel buy: equal share from each guest tip's occupancy band.
 * Gates:
 * - DBL/2: adults === 2 × rooms, exactly two distinct codes
 * - TPL/3: 1 room, 3 adults, exactly three distinct codes
 * Children allowed — extras compose via applyOccupancyPricing after the split.
 */

import {
  collectGuestNationalityCodes,
  filterHotelByNationality,
  guestNationalitiesAreMixed,
  normalizeHotelNationality,
} from './hotel-nationality';
import {
  parseOccupancyPricing,
  pickAdultBand,
} from './occupancy-pricing';
import {
  hotelStayCalculation,
} from './rate-resolve-guards';

export type HotelPaxBuySplitTip = {
  id: string;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
  occupancyPricingJson?: unknown;
};

export type HotelPaxBuySplitShare = {
  nationality: string;
  adults: 1;
  sharePerNight: number;
  tipRateId: string;
  tipBandAdults: number;
  tipUnitCostPerNight: number;
  tipWeekendUnitCostPerNight: number | null;
};

export type HotelPaxBuySplitResult = {
  buyMode: 'per_pax_split';
  paxBuySplits: HotelPaxBuySplitShare[];
  /** Weekday combined share (sum of adult shares). */
  paxBuySplitTotalPerNight: number;
  /** Occupancy band size used for equal shares (2 = DBL, 3 = TPL). */
  bandAdults: number;
  weekdayNights: number;
  weekendNights: number;
  weekdayUnit: number;
  weekendUnit: number | null;
  rooms: number;
  totalBuy: number;
};

export type HotelPaxBuySplitPlan = {
  codes: string[];
  bandAdults: 2 | 3;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Plan nationality slots + band size when split is allowed; else null.
 */
export function hotelPaxBuySplitPlan(
  guestCodes: Array<string | null | undefined> | null | undefined,
  opts: { adults: number; children: number; rooms: number },
): HotelPaxBuySplitPlan | null {
  const rooms = Math.max(1, Math.floor(opts.rooms) || 1);
  const adults = Math.max(0, Math.floor(opts.adults) || 0);
  void opts.children; // allowed; child extras apply after split on Match tip
  const codes = collectGuestNationalityCodes({ nationalities: guestCodes });
  if (!guestNationalitiesAreMixed(codes)) return null;

  // TPL/3: one room, three adults, three markets
  if (rooms === 1 && adults === 3) {
    if (codes.length !== 3) return null;
    return { codes, bandAdults: 3 };
  }

  // DBL/2: adults === 2 × rooms (incl. multi-room 2A×N)
  if (adults === 2 * rooms) {
    if (codes.length !== 2) return null;
    return { codes, bandAdults: 2 };
  }

  return null;
}

/** Exactly N adult nationality slots when split is allowed; else null. */
export function hotelPaxBuySplitAdultSlots(
  guestCodes: Array<string | null | undefined> | null | undefined,
  opts: { adults: number; children: number; rooms: number },
): string[] | null {
  return hotelPaxBuySplitPlan(guestCodes, opts)?.codes ?? null;
}

export function bandFromTip(
  tip: HotelPaxBuySplitTip,
  bandAdults: number,
): {
  adults: number;
  unitCostPerNight: number;
  weekendUnitCostPerNight: number | null;
} {
  const n = Math.max(1, Math.floor(bandAdults) || 1);
  const chart = money(tip.unitCost);
  const chartWeekend =
    tip.weekendUnitCost != null && tip.weekendUnitCost !== ''
      ? money(tip.weekendUnitCost)
      : null;
  const occupancy = parseOccupancyPricing(tip.occupancyPricingJson);
  const band = pickAdultBand({
    bands: occupancy?.adultBands ?? [],
    adults: n,
    rooms: 1,
    chartUnitCost: chart,
    chartWeekendUnitCost: chartWeekend,
  });
  if (band) {
    return {
      adults: band.adults,
      unitCostPerNight: band.unitCostPerNight,
      weekendUnitCostPerNight: band.weekendUnitCostPerNight,
    };
  }
  return {
    adults: n,
    unitCostPerNight: chart,
    weekendUnitCostPerNight: chartWeekend,
  };
}

/** @deprecated Prefer bandFromTip(tip, 2) */
export function dblBandFromTip(tip: HotelPaxBuySplitTip) {
  return bandFromTip(tip, 2);
}

function shareFromBand(
  band: {
    unitCostPerNight: number;
    weekendUnitCostPerNight: number | null;
  },
  bandAdults: number,
): { weekday: number; weekend: number | null } {
  const n = Math.max(1, Math.floor(bandAdults) || 1);
  return {
    weekday: round2(band.unitCostPerNight / n),
    weekend:
      band.weekendUnitCostPerNight != null
        ? round2(band.weekendUnitCostPerNight / n)
        : null,
  };
}

/**
 * Resolve per-adult equal-share buy when gate holds and each nationality has a tip.
 * `pickBest` should mirror hotel Match scoring on a nationality-filtered pool.
 */
export function tryHotelPaxBuySplit<T extends HotelPaxBuySplitTip>(opts: {
  guestCodes: Array<string | null | undefined> | null | undefined;
  adults: number;
  children: number;
  rooms: number;
  stayDates: Date[];
  candidatePool: T[];
  pickBest: (pool: T[]) => T | undefined;
}): HotelPaxBuySplitResult | null {
  const plan = hotelPaxBuySplitPlan(opts.guestCodes, opts);
  if (!plan) return null;
  if (!opts.candidatePool.length || !opts.stayDates.length) return null;

  const { codes, bandAdults } = plan;
  const shares: HotelPaxBuySplitShare[] = [];
  const tipIds = new Set<string>();

  for (const rawCode of codes) {
    const code = normalizeHotelNationality(rawCode);
    if (!code) return null;
    const tip = opts.pickBest(
      filterHotelByNationality(opts.candidatePool, code),
    );
    if (!tip) return null;
    tipIds.add(tip.id);
    const band = bandFromTip(tip, bandAdults);
    const share = shareFromBand(band, bandAdults);
    shares.push({
      nationality: code,
      adults: 1,
      sharePerNight: share.weekday,
      tipRateId: tip.id,
      tipBandAdults: band.adults,
      tipUnitCostPerNight: band.unitCostPerNight,
      tipWeekendUnitCostPerNight: band.weekendUnitCostPerNight,
    });
  }

  // Same tip for multiple adults → room tip is clearer; skip split.
  if (tipIds.size < codes.length) return null;

  const weekdayUnit = round2(
    shares.reduce((sum, s) => sum + s.sharePerNight, 0),
  );
  const weekendParts = shares.map((s) =>
    s.tipWeekendUnitCostPerNight != null
      ? round2(s.tipWeekendUnitCostPerNight / bandAdults)
      : s.sharePerNight,
  );
  const anyWeekend = shares.some((s) => s.tipWeekendUnitCostPerNight != null);
  const weekendUnit = anyWeekend
    ? round2(weekendParts.reduce((sum, n) => sum + n, 0))
    : null;

  const stay = hotelStayCalculation(
    {
      unitCost: weekdayUnit,
      weekendUnitCost: weekendUnit,
    },
    opts.stayDates,
    Math.max(1, Math.floor(opts.rooms) || 1),
  );

  return {
    buyMode: 'per_pax_split',
    paxBuySplits: shares,
    paxBuySplitTotalPerNight: weekdayUnit,
    bandAdults,
    weekdayNights: stay.weekdayNights,
    weekendNights: stay.weekendNights,
    weekdayUnit: stay.weekdayUnit,
    weekendUnit: stay.weekendUnit,
    rooms: stay.rooms,
    totalBuy: stay.totalBuy,
  };
}

export function hotelPaxBuySplitMatchAccepted(
  split: Pick<
    HotelPaxBuySplitResult,
    'paxBuySplits' | 'paxBuySplitTotalPerNight' | 'rooms'
  >,
  opts?: { formatAmount?: (n: number) => string },
): string[] {
  const fmt =
    opts?.formatAmount ??
    ((n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`);
  const bits = split.paxBuySplits.map(
    (s) => `${s.nationality} ${fmt(s.sharePerNight)}`,
  );
  const rooms = Math.max(1, Math.floor(Number(split.rooms) || 1));
  const roomsBit = rooms > 1 ? ` · × ${rooms} rooms` : '';
  return [
    `Per-pax buy · ${bits.join(' + ')} = ${fmt(split.paxBuySplitTotalPerNight)}/n${roomsBit}`,
  ];
}
