/**
 * Thin mixed-nationality hotel buy: equal share from each guest tip's occupancy band.
 * Gates:
 * - DBL/2: adults === 2 × rooms, exactly two distinct codes
 * - DBL+SGL: 2 rooms, 3 adults (last slot = alone / SGL)
 * - TPL/3 × N: adults === 3 × rooms (bag multiplicity or lead-weighted 2-code)
 * Children allowed — extras compose via applyOccupancyPricing after the split.
 */

import {
  collectGuestNationalityBag,
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

export type HotelPaxBuyComposition = 'equal' | 'dbl_sgl';

export type HotelPaxBuySplitResult = {
  buyMode: 'per_pax_split';
  paxBuySplits: HotelPaxBuySplitShare[];
  /** Weekday combined share (sum of adult shares / composed rooms). */
  paxBuySplitTotalPerNight: number;
  /**
   * Extras base adults per room (DBL=2, TPL=3).
   * For dbl_sgl stays at 2 so includedAdults = 2×2 ≥ 3.
   */
  bandAdults: number;
  composition: HotelPaxBuyComposition;
  weekdayNights: number;
  weekendNights: number;
  weekdayUnit: number;
  weekendUnit: number | null;
  rooms: number;
  totalBuy: number;
};

export type HotelPaxBuySplitSlot = {
  code: string;
  bandAdults: number;
};

export type HotelPaxBuySplitPlan = {
  slots: HotelPaxBuySplitSlot[];
  /** Extras / provenance band adults per room. */
  bandAdults: number;
  composition: HotelPaxBuyComposition;
  /** Display rooms on the result (quote rooms). */
  displayRooms: number;
  /**
   * Stay multiplier rooms. For dbl_sgl the night unit already includes both
   * rooms, so stay uses 1.
   */
  stayRooms: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Expand guest codes into three adult slots for 3A / 3A×N parties.
 * - Bag length 3 with 2–3 markets → use bag (multiplicity / alone order)
 * - 3 distinct → one each
 * - 2 distinct → majority ×2 from bag counts; tie / unknown → first ×2
 */
export function expandThreeAdultNationalitySlots(
  codes: string[],
): string[] | null {
  const bag = collectGuestNationalityBag({ nationalities: codes });
  const distinct = collectGuestNationalityCodes({ nationalities: codes });
  if (distinct.length < 2) return null;

  if (bag.length === 3 && distinct.length >= 2 && distinct.length <= 3) {
    return bag;
  }

  if (distinct.length === 3) return [...distinct];

  if (distinct.length === 2) {
    const c0 = distinct[0]!;
    const c1 = distinct[1]!;
    const n0 = bag.filter((c) => c === c0).length;
    const n1 = bag.filter((c) => c === c1).length;
    if (n0 > n1) return [c0, c0, c1];
    if (n1 > n0) return [c1, c1, c0];
    // Tie or distinct-only list → first (lead) twice
    return [c0, c0, c1];
  }

  return null;
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
  const bag = collectGuestNationalityBag({ nationalities: guestCodes });
  const distinct = collectGuestNationalityCodes({ nationalities: guestCodes });
  if (!guestNationalitiesAreMixed(distinct)) return null;

  // Uneven 3A/2R first (not TPL×2): last expanded slot is SGL
  if (rooms === 2 && adults === 3) {
    const expanded = expandThreeAdultNationalitySlots(bag.length ? bag : distinct);
    if (!expanded) return null;
    return {
      slots: [
        { code: expanded[0]!, bandAdults: 2 },
        { code: expanded[1]!, bandAdults: 2 },
        { code: expanded[2]!, bandAdults: 1 },
      ],
      bandAdults: 2,
      composition: 'dbl_sgl',
      displayRooms: 2,
      stayRooms: 1,
    };
  }

  // TPL/3 × N rooms (1R/3A, 2R/6A, 3R/9A, …)
  if (adults === 3 * rooms) {
    const expanded = expandThreeAdultNationalitySlots(bag.length ? bag : distinct);
    if (!expanded) return null;
    return {
      slots: expanded.map((code) => ({ code, bandAdults: 3 })),
      bandAdults: 3,
      composition: 'equal',
      displayRooms: rooms,
      stayRooms: rooms,
    };
  }

  // DBL/2: adults === 2 × rooms (incl. multi-room 2A×N)
  if (adults === 2 * rooms) {
    if (distinct.length !== 2) return null;
    return {
      slots: distinct.map((code) => ({ code, bandAdults: 2 })),
      bandAdults: 2,
      composition: 'equal',
      displayRooms: rooms,
      stayRooms: rooms,
    };
  }

  return null;
}

/** Nationality codes when split is allowed; else null. */
export function hotelPaxBuySplitAdultSlots(
  guestCodes: Array<string | null | undefined> | null | undefined,
  opts: { adults: number; children: number; rooms: number },
): string[] | null {
  const plan = hotelPaxBuySplitPlan(guestCodes, opts);
  if (!plan) return null;
  return plan.slots.map((s) => s.code);
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
 * Resolve per-adult / composed-room buy when gate holds and each slot has a tip.
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

  const shares: HotelPaxBuySplitShare[] = [];
  const tipIds = new Set<string>();

  for (const slot of plan.slots) {
    const code = normalizeHotelNationality(slot.code);
    if (!code) return null;
    const tip = opts.pickBest(
      filterHotelByNationality(opts.candidatePool, code),
    );
    if (!tip) return null;
    tipIds.add(tip.id);
    const band = bandFromTip(tip, slot.bandAdults);
    const share = shareFromBand(band, slot.bandAdults);
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

  // Same tip for every distinct market → room tip is clearer; skip split.
  // Weighted 2-code may reuse one tip across two slots (same nationality).
  const distinctMarkets = new Set(plan.slots.map((s) => s.code)).size;
  if (tipIds.size < distinctMarkets) return null;

  const weekdayUnit = round2(
    shares.reduce((sum, s) => sum + s.sharePerNight, 0),
  );
  const weekendParts = shares.map((s, i) => {
    const slotBand = plan.slots[i]!.bandAdults;
    return s.tipWeekendUnitCostPerNight != null
      ? round2(s.tipWeekendUnitCostPerNight / slotBand)
      : s.sharePerNight;
  });
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
    plan.stayRooms,
  );

  return {
    buyMode: 'per_pax_split',
    paxBuySplits: shares,
    paxBuySplitTotalPerNight: weekdayUnit,
    bandAdults: plan.bandAdults,
    composition: plan.composition,
    weekdayNights: stay.weekdayNights,
    weekendNights: stay.weekendNights,
    weekdayUnit: stay.weekdayUnit,
    weekendUnit: stay.weekendUnit,
    rooms: plan.displayRooms,
    totalBuy: stay.totalBuy,
  };
}

export function hotelPaxBuySplitMatchAccepted(
  split: Pick<
    HotelPaxBuySplitResult,
    | 'paxBuySplits'
    | 'paxBuySplitTotalPerNight'
    | 'rooms'
    | 'composition'
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
  const suffix =
    split.composition === 'dbl_sgl'
      ? ' · DBL+SGL'
      : rooms > 1
        ? ` · × ${rooms} rooms`
        : '';
  return [
    `Per-pax buy · ${bits.join(' + ')} = ${fmt(split.paxBuySplitTotalPerNight)}/n${suffix}`,
  ];
}
