/**
 * Thin mixed-nationality hotel buy: DBL/2 share per adult from each guest's tip.
 * Gate: adults === 2 × rooms (1+ rooms), exactly two distinct guest nationality codes,
 * and a compatible tip for each code in the candidate pool.
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
  weekdayNights: number;
  weekendNights: number;
  weekdayUnit: number;
  weekendUnit: number | null;
  rooms: number;
  totalBuy: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Exactly two adult nationality slots when split is allowed; else null.
 * Multi-room 2A×N: adults must equal 2 × rooms (same DBL/2 math × rooms).
 */
export function hotelPaxBuySplitAdultSlots(
  guestCodes: Array<string | null | undefined> | null | undefined,
  opts: { adults: number; children: number; rooms: number },
): string[] | null {
  const rooms = Math.max(1, Math.floor(opts.rooms) || 1);
  const adults = Math.max(0, Math.floor(opts.adults) || 0);
  void opts.children; // allowed; child extras apply after split on Match tip
  if (adults !== 2 * rooms) return null;
  const codes = collectGuestNationalityCodes({ nationalities: guestCodes });
  if (!guestNationalitiesAreMixed(codes)) return null;
  if (codes.length !== 2) return null;
  return codes;
}

export function dblBandFromTip(tip: HotelPaxBuySplitTip): {
  adults: number;
  unitCostPerNight: number;
  weekendUnitCostPerNight: number | null;
} {
  const chart = money(tip.unitCost);
  const chartWeekend =
    tip.weekendUnitCost != null && tip.weekendUnitCost !== ''
      ? money(tip.weekendUnitCost)
      : null;
  const occupancy = parseOccupancyPricing(tip.occupancyPricingJson);
  const band = pickAdultBand({
    bands: occupancy?.adultBands ?? [],
    adults: 2,
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
    adults: 2,
    unitCostPerNight: chart,
    weekendUnitCostPerNight: chartWeekend,
  };
}

function shareFromBand(band: {
  unitCostPerNight: number;
  weekendUnitCostPerNight: number | null;
}): { weekday: number; weekend: number | null } {
  return {
    weekday: round2(band.unitCostPerNight / 2),
    weekend:
      band.weekendUnitCostPerNight != null
        ? round2(band.weekendUnitCostPerNight / 2)
        : null,
  };
}

/**
 * Resolve per-adult DBL/2 buy when gate holds and each nationality has a tip.
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
  const slots = hotelPaxBuySplitAdultSlots(opts.guestCodes, opts);
  if (!slots) return null;
  if (!opts.candidatePool.length || !opts.stayDates.length) return null;

  const shares: HotelPaxBuySplitShare[] = [];
  const tipIds = new Set<string>();

  for (const rawCode of slots) {
    const code = normalizeHotelNationality(rawCode);
    if (!code) return null;
    const tip = opts.pickBest(
      filterHotelByNationality(opts.candidatePool, code),
    );
    if (!tip) return null;
    tipIds.add(tip.id);
    const band = dblBandFromTip(tip);
    const share = shareFromBand(band);
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

  // Same tip for both adults → room tip is clearer; skip split.
  if (tipIds.size < 2) return null;

  const weekdayUnit = round2(
    shares.reduce((sum, s) => sum + s.sharePerNight, 0),
  );
  const weekendParts = shares.map((s) =>
    s.tipWeekendUnitCostPerNight != null
      ? round2(s.tipWeekendUnitCostPerNight / 2)
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
