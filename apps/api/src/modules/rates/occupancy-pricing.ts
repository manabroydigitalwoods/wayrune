/** Hotel rate occupancy supplements (thin R2 matrix — extras + SGL/DBL/TPL bands). */

import { parseMinStayNights } from './hotel-min-stay';
import { normalizeHotelNationality } from './hotel-nationality';

export type AdultBand = {
  /** Adults covered by this per-room base (1=SGL, 2=DBL, 3=TPL). */
  adults: number;
  /** Weekday unit cost per room-night for this band. */
  unitCostPerNight: number;
  /** Optional absolute weekend cost for this band (else chart ratio). */
  weekendUnitCostPerNight?: number;
};

export type OccupancyPricing = {
  /** Adults included in unitCost per room (default 2). Used when no adultBands. */
  baseAdults: number;
  /** Children included in unitCost per room (default 0). */
  baseChildren: number;
  /** Ages at or below this count as children (optional). */
  childAgeMax?: number;
  /** Extra adult per night (beyond baseAdults × rooms). */
  extraAdultPerNight?: number;
  /** Child with bed per night. */
  childWithBedPerNight?: number;
  /** Child without bed per night. */
  childWithoutBedPerNight?: number;
  /** Optional SGL/DBL/TPL bases (≤3). Meal stays on the season row. */
  adultBands?: AdultBand[];
  /** Minimum stay nights for this rate card (soft Match cue). */
  minStayNights?: number;
  /** Market segment: IN | INTL (blank/any when omitted). */
  nationality?: string;
};

export type OccupancyApplyInput = {
  adults: number;
  children: number;
  /** Count of children without bed; remainder use with-bed rate. */
  childrenWithoutBed?: number;
  rooms: number;
  nights: number;
};

export type OccupancyApplyResult = {
  baseTotal: number;
  extraAdultCount: number;
  childWithBedCount: number;
  childWithoutBedCount: number;
  extraAdultTotal: number;
  childWithBedTotal: number;
  childWithoutBedTotal: number;
  occupancyExtraTotal: number;
  totalBuy: number;
};

export type AdultBandPick = {
  adults: number;
  unitCostPerNight: number;
  weekendUnitCostPerNight: number | null;
  adultsPerRoom: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function numField(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    const n = Number(v);
    return n >= 0 ? n : undefined;
  }
  return undefined;
}

/** Parse ≤3 unique adult bands (1–3), sorted ascending. */
export function parseAdultBands(raw: unknown): AdultBand[] {
  if (!Array.isArray(raw)) return [];
  const byAdults = new Map<number, AdultBand>();
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const adults = numField(o.adults);
    const unitCostPerNight = numField(o.unitCostPerNight ?? o.unitCost);
    if (adults == null || unitCostPerNight == null) continue;
    const a = Math.floor(adults);
    if (a < 1 || a > 3) continue;
    const weekendUnitCostPerNight = numField(
      o.weekendUnitCostPerNight ?? o.weekendUnitCost,
    );
    byAdults.set(a, {
      adults: a,
      unitCostPerNight,
      ...(weekendUnitCostPerNight != null
        ? { weekendUnitCostPerNight }
        : {}),
    });
    if (byAdults.size >= 3) break;
  }
  return [...byAdults.values()].sort((x, y) => x.adults - y.adults);
}

export function adultsPerRoom(adults: number, rooms: number): number {
  const r = Math.max(1, Math.floor(rooms) || 1);
  const a = Math.max(0, Math.floor(adults) || 0);
  if (a <= 0) return 1;
  return Math.max(1, Math.ceil(a / r));
}

/**
 * Highest band with adults ≤ adults/room; else lowest band.
 * Weekend: prefer absolute band weekend; else scale with chart weekend/weekday ratio.
 */
export function pickAdultBand(opts: {
  bands: AdultBand[];
  adults: number;
  rooms: number;
  chartUnitCost: number;
  chartWeekendUnitCost?: number | null;
}): AdultBandPick | null {
  const bands = opts.bands;
  if (!bands.length) return null;
  const perRoom = adultsPerRoom(opts.adults, opts.rooms);
  const sorted = [...bands].sort((a, b) => a.adults - b.adults);
  let chosen = sorted[0]!;
  for (const b of sorted) {
    if (b.adults <= perRoom) chosen = b;
    else break;
  }
  const chart = opts.chartUnitCost > 0 ? opts.chartUnitCost : chosen.unitCostPerNight;
  const chartWeekend =
    opts.chartWeekendUnitCost != null &&
    Number.isFinite(opts.chartWeekendUnitCost) &&
    opts.chartWeekendUnitCost >= 0
      ? opts.chartWeekendUnitCost
      : null;

  let weekendUnitCostPerNight: number | null = null;
  if (
    chosen.weekendUnitCostPerNight != null &&
    Number.isFinite(chosen.weekendUnitCostPerNight) &&
    chosen.weekendUnitCostPerNight >= 0
  ) {
    weekendUnitCostPerNight = round2(chosen.weekendUnitCostPerNight);
  } else if (chartWeekend != null && chart > 0) {
    weekendUnitCostPerNight = round2(
      chosen.unitCostPerNight * (chartWeekend / chart),
    );
  }

  return {
    adults: chosen.adults,
    unitCostPerNight: chosen.unitCostPerNight,
    weekendUnitCostPerNight,
    adultsPerRoom: perRoom,
  };
}

export function parseOccupancyPricing(raw: unknown): OccupancyPricing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const baseAdults = numField(o.baseAdults) ?? 2;
  const baseChildren = numField(o.baseChildren) ?? 0;
  const childAgeMax = numField(o.childAgeMax);
  const extraAdultPerNight = numField(o.extraAdultPerNight);
  const childWithBedPerNight = numField(o.childWithBedPerNight);
  const childWithoutBedPerNight = numField(o.childWithoutBedPerNight);
  const adultBands = parseAdultBands(o.adultBands);
  const minStayNights = parseMinStayNights(o.minStayNights);
  const nationality = normalizeHotelNationality(
    typeof o.nationality === 'string' ? o.nationality : null,
  );
  if (
    extraAdultPerNight == null &&
    childWithBedPerNight == null &&
    childWithoutBedPerNight == null &&
    baseAdults === 2 &&
    baseChildren === 0 &&
    childAgeMax == null &&
    adultBands.length === 0 &&
    minStayNights == null &&
    nationality == null
  ) {
    if (
      o.extraAdultPerNight == null &&
      o.childWithBedPerNight == null &&
      o.childWithoutBedPerNight == null &&
      o.baseAdults == null &&
      o.baseChildren == null &&
      o.adultBands == null &&
      o.minStayNights == null &&
      o.nationality == null
    ) {
      return null;
    }
  }
  return {
    baseAdults: Math.max(1, Math.floor(baseAdults) || 2),
    baseChildren: Math.max(0, Math.floor(baseChildren) || 0),
    ...(childAgeMax != null ? { childAgeMax: Math.floor(childAgeMax) } : {}),
    ...(extraAdultPerNight != null ? { extraAdultPerNight } : {}),
    ...(childWithBedPerNight != null ? { childWithBedPerNight } : {}),
    ...(childWithoutBedPerNight != null ? { childWithoutBedPerNight } : {}),
    ...(adultBands.length ? { adultBands } : {}),
    ...(minStayNights != null ? { minStayNights } : {}),
    ...(nationality != null ? { nationality } : {}),
  };
}

/** Normalize for Prisma JSON storage; null clears. */
export function occupancyPricingToJson(
  value: OccupancyPricing | Partial<OccupancyPricing> | null | undefined,
): OccupancyPricing | null {
  if (value == null) return null;
  return parseOccupancyPricing(value);
}

export function applyOccupancyPricing(
  baseRoomTotal: number,
  pricing: OccupancyPricing | null | undefined,
  input: OccupancyApplyInput,
): OccupancyApplyResult {
  const rooms = Math.max(1, Math.floor(input.rooms) || 1);
  const nights = Math.max(1, Math.floor(input.nights) || 1);
  const adults = Math.max(0, Math.floor(input.adults) || 0);
  const children = Math.max(0, Math.floor(input.children) || 0);
  const base = Number.isFinite(baseRoomTotal) ? baseRoomTotal : 0;

  if (!pricing) {
    return {
      baseTotal: base,
      extraAdultCount: 0,
      childWithBedCount: 0,
      childWithoutBedCount: 0,
      extraAdultTotal: 0,
      childWithBedTotal: 0,
      childWithoutBedTotal: 0,
      occupancyExtraTotal: 0,
      totalBuy: round2(base),
    };
  }

  const includedAdults = pricing.baseAdults * rooms;
  const includedChildren = pricing.baseChildren * rooms;
  const extraAdultCount = Math.max(0, adults - includedAdults);
  const billableChildren = Math.max(0, children - includedChildren);

  let childWithoutBedCount = Math.min(
    billableChildren,
    Math.max(0, Math.floor(input.childrenWithoutBed ?? 0)),
  );
  if (pricing.childWithoutBedPerNight == null) childWithoutBedCount = 0;
  const childWithBedCount = Math.max(0, billableChildren - childWithoutBedCount);

  const extraAdultTotal = round2(
    extraAdultCount * (pricing.extraAdultPerNight ?? 0) * nights,
  );
  const childWithBedTotal = round2(
    childWithBedCount * (pricing.childWithBedPerNight ?? 0) * nights,
  );
  const childWithoutBedTotal = round2(
    childWithoutBedCount * (pricing.childWithoutBedPerNight ?? 0) * nights,
  );
  const occupancyExtraTotal = round2(
    extraAdultTotal + childWithBedTotal + childWithoutBedTotal,
  );

  return {
    baseTotal: round2(base),
    extraAdultCount,
    childWithBedCount,
    childWithoutBedCount,
    extraAdultTotal,
    childWithBedTotal,
    childWithoutBedTotal,
    occupancyExtraTotal,
    totalBuy: round2(base + occupancyExtraTotal),
  };
}

/**
 * Reclassify quote childAges against occupancy childAgeMax.
 * Ages above max pay as adults (extra-adult path). No ages or no max → passthrough.
 */
export function classifyHotelOccupancyPax(opts: {
  adults: number;
  children: number;
  childAges?: number[] | null;
  childAgeMax?: number | null;
}): {
  adults: number;
  children: number;
  partyAdults: number;
  partyChildren: number;
  reclassifiedAsAdult: number;
  childAgeMax: number | null;
  usedChildAges: boolean;
} {
  const partyAdults = Math.max(0, Math.round(opts.adults) || 0);
  const partyChildren = Math.max(0, Math.round(opts.children) || 0);
  const ageMax =
    opts.childAgeMax != null && Number.isFinite(opts.childAgeMax)
      ? Math.max(0, Math.round(opts.childAgeMax))
      : null;
  const ages = (opts.childAges || []).filter(
    (a) => typeof a === 'number' && Number.isFinite(a),
  );

  if (ageMax == null || ages.length === 0) {
    return {
      adults: partyAdults,
      children: partyChildren,
      partyAdults,
      partyChildren,
      reclassifiedAsAdult: 0,
      childAgeMax: ageMax,
      usedChildAges: false,
    };
  }

  let childHeads = 0;
  let adultFromAges = 0;
  for (const age of ages) {
    if (age <= ageMax) childHeads += 1;
    else adultFromAges += 1;
  }
  const undeclared = Math.max(0, partyChildren - ages.length);
  childHeads += undeclared;

  return {
    adults: partyAdults + adultFromAges,
    children: childHeads,
    partyAdults,
    partyChildren,
    reclassifiedAsAdult: adultFromAges,
    childAgeMax: ageMax,
    usedChildAges: true,
  };
}

export function occupancyMatchAccepted(
  occ: OccupancyApplyResult,
  pricing: OccupancyPricing,
  band?: AdultBandPick | null,
): string[] {
  const lines: string[] = [];
  if (band) {
    const weekend =
      band.weekendUnitCostPerNight != null
        ? ` (we ${Math.round(band.weekendUnitCostPerNight).toLocaleString('en-IN')})`
        : '';
    lines.push(
      `${band.adults}A band @ ₹${Math.round(band.unitCostPerNight).toLocaleString('en-IN')}/n${weekend} (${band.adultsPerRoom}A/room)`,
    );
  } else {
    lines.push(
      `Base occupancy ${pricing.baseAdults}A${pricing.baseChildren ? `+${pricing.baseChildren}C` : ''} / room`,
    );
  }
  if (pricing.childAgeMax != null) {
    lines.push(`Child ages ≤${pricing.childAgeMax}`);
  }
  if (occ.occupancyExtraTotal > 0) {
    lines.push(`Occupancy extras ₹${Math.round(occ.occupancyExtraTotal).toLocaleString('en-IN')}`);
  } else if (!band) {
    lines.push('Within base occupancy');
  }
  return lines;
}
