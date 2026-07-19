/** Hotel rate occupancy supplements (thin R2 matrix — extras on base room rate). */

export type OccupancyPricing = {
  /** Adults included in unitCost per room (default 2). */
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

export function parseOccupancyPricing(raw: unknown): OccupancyPricing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
      const n = Number(v);
      return n >= 0 ? n : undefined;
    }
    return undefined;
  };
  const baseAdults = num(o.baseAdults) ?? 2;
  const baseChildren = num(o.baseChildren) ?? 0;
  const childAgeMax = num(o.childAgeMax);
  const extraAdultPerNight = num(o.extraAdultPerNight);
  const childWithBedPerNight = num(o.childWithBedPerNight);
  const childWithoutBedPerNight = num(o.childWithoutBedPerNight);
  if (
    extraAdultPerNight == null &&
    childWithBedPerNight == null &&
    childWithoutBedPerNight == null &&
    baseAdults === 2 &&
    baseChildren === 0 &&
    childAgeMax == null
  ) {
    // Empty / default-only — treat as unset so resolve skips.
    if (
      o.extraAdultPerNight == null &&
      o.childWithBedPerNight == null &&
      o.childWithoutBedPerNight == null &&
      o.baseAdults == null &&
      o.baseChildren == null
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
  };
}

/** Normalize for Prisma JSON storage; null clears. */
export function occupancyPricingToJson(
  value: OccupancyPricing | Partial<OccupancyPricing> | null | undefined,
): OccupancyPricing | null {
  if (value == null) return null;
  const parsed = parseOccupancyPricing(value);
  return parsed;
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

export function occupancyMatchAccepted(occ: OccupancyApplyResult, pricing: OccupancyPricing): string[] {
  const lines: string[] = [
    `Base occupancy ${pricing.baseAdults}A${pricing.baseChildren ? `+${pricing.baseChildren}C` : ''} / room`,
  ];
  if (pricing.childAgeMax != null) {
    lines.push(`Child ages ≤${pricing.childAgeMax}`);
  }
  if (occ.occupancyExtraTotal > 0) {
    lines.push(`Occupancy extras ₹${Math.round(occ.occupancyExtraTotal).toLocaleString('en-IN')}`);
  } else {
    lines.push('Within base occupancy');
  }
  return lines;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
