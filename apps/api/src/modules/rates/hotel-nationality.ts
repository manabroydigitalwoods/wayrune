/**
 * Hotel rate nationality / market segment.
 * Rate cards: blank = any · IN = Indian domestic · INTL = foreign catch-all · ISO-2 = country tip.
 * Match prefers exact code, then INTL (for non-IN guests), then any.
 */

import { iso3166RegionLabel } from '@wayrune/contracts';

export const HOTEL_NATIONALITY_ANY = '' as const;
export const HOTEL_NATIONALITY_IN = 'IN' as const;
export const HOTEL_NATIONALITY_INTL = 'INTL' as const;

/** Featured ISO tips for quick chips (full catalog is searchable). */
export const HOTEL_NATIONALITY_ISO_TIPS = [
  'US',
  'GB',
  'AE',
  'SG',
  'AU',
  'DE',
  'FR',
  'CA',
] as const;

export type HotelNationalityIsoTip = (typeof HOTEL_NATIONALITY_ISO_TIPS)[number];

/** Canonical stored code: IN | INTL | ISO-2, or null = any. */
export type HotelNationalityCode = string;

const IN_ALIASES = new Set(['IN', 'IND', 'INDIA', 'DOMESTIC']);
const INTL_ALIASES = new Set([
  'INTL',
  'INTERNATIONAL',
  'FOREIGN',
  'NON-IN',
  'NON_IN',
]);

/** Normalize stored rate or guest code → canonical code, or null = any / unknown. */
export function normalizeHotelNationality(
  raw: string | null | undefined,
): HotelNationalityCode | null {
  const c = String(raw || '')
    .trim()
    .toUpperCase();
  if (!c) return null;
  if (IN_ALIASES.has(c)) return HOTEL_NATIONALITY_IN;
  if (INTL_ALIASES.has(c)) return HOTEL_NATIONALITY_INTL;
  // ISO-3166 alpha-2 (preserve; do not collapse to INTL)
  if (/^[A-Z]{2}$/.test(c)) return c;
  // Rare alpha-3 → leave unknown (except IND handled above)
  return null;
}

/** Broad market bucket for labels / soft cues. */
export function hotelNationalityMarket(
  raw: string | null | undefined,
): typeof HOTEL_NATIONALITY_IN | typeof HOTEL_NATIONALITY_INTL | null {
  const c = normalizeHotelNationality(raw);
  if (c == null) return null;
  if (c === HOTEL_NATIONALITY_IN) return HOTEL_NATIONALITY_IN;
  return HOTEL_NATIONALITY_INTL;
}

export function hotelNationalityLabel(
  raw: string | null | undefined,
): string {
  const c = normalizeHotelNationality(raw);
  if (c === HOTEL_NATIONALITY_IN) return 'Indian (IN)';
  if (c === HOTEL_NATIONALITY_INTL) return 'Foreign (INTL)';
  if (c) return iso3166RegionLabel(c) || c;
  return 'Any nationality';
}

/**
 * Collect guest nationality codes from singular + list inputs.
 * Blanks / unknown tokens are dropped; order preserved; duplicates removed.
 */
export function collectGuestNationalityCodes(input: {
  nationality?: string | null;
  nationalities?: Array<string | null | undefined> | null;
}): HotelNationalityCode[] {
  const raw: unknown[] = [];
  if (Array.isArray(input.nationalities)) {
    raw.push(...input.nationalities);
  }
  if (input.nationality != null && String(input.nationality).trim()) {
    raw.push(input.nationality);
  }
  const out: HotelNationalityCode[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const n = normalizeHotelNationality(
      typeof item === 'string' ? item : null,
    );
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Like collectGuestNationalityCodes but keeps duplicates (traveller multiplicity).
 * Caps at 12 entries.
 */
export function collectGuestNationalityBag(input: {
  nationality?: string | null;
  nationalities?: Array<string | null | undefined> | null;
}): HotelNationalityCode[] {
  const raw: unknown[] = [];
  if (Array.isArray(input.nationalities)) {
    raw.push(...input.nationalities);
  }
  if (input.nationality != null && String(input.nationality).trim()) {
    raw.push(input.nationality);
  }
  const out: HotelNationalityCode[] = [];
  for (const item of raw) {
    if (out.length >= 12) break;
    const n = normalizeHotelNationality(
      typeof item === 'string' ? item : null,
    );
    if (!n) continue;
    out.push(n);
  }
  return out;
}

/**
 * Move one occurrence of `alone` to the end (SGL / who sleeps alone).
 * Used for 3A/2R DBL+SGL rooming.
 */
export function orderBagWithAloneLast(
  bag: Array<string | null | undefined>,
  alone: string | null | undefined,
): HotelNationalityCode[] {
  const list = collectGuestNationalityBag({ nationalities: bag });
  const aloneCode = normalizeHotelNationality(alone);
  if (!aloneCode || !list.length) return list;
  const idx = list.findIndex((c) => c === aloneCode);
  if (idx < 0) return list;
  return [...list.slice(0, idx), ...list.slice(idx + 1), aloneCode];
}

/**
 * Collapse multi-guest nationalities to one Match code.
 * - all IN → IN
 * - single foreign ISO (no IN) → that ISO
 * - IN + foreign, multiple foreign ISOs, or any INTL guest → INTL
 * - empty → null (unknown / any)
 */
export function effectiveGuestNationality(
  codes: Array<string | null | undefined> | string | null | undefined,
): HotelNationalityCode | null {
  const list = Array.isArray(codes)
    ? collectGuestNationalityCodes({ nationalities: codes })
    : collectGuestNationalityCodes({ nationality: codes });
  if (!list.length) return null;
  if (list.length === 1) return list[0]!;

  const hasIn = list.includes(HOTEL_NATIONALITY_IN);
  const hasIntl = list.includes(HOTEL_NATIONALITY_INTL);
  const foreignIsos = list.filter(
    (c) => c !== HOTEL_NATIONALITY_IN && c !== HOTEL_NATIONALITY_INTL,
  );

  if (hasIntl || (hasIn && (foreignIsos.length > 0 || hasIntl))) {
    return HOTEL_NATIONALITY_INTL;
  }
  if (hasIn && foreignIsos.length === 0) {
    return HOTEL_NATIONALITY_IN;
  }
  if (foreignIsos.length === 1 && !hasIn && !hasIntl) {
    return foreignIsos[0]!;
  }
  // Multiple distinct foreign ISOs (or foreign + IN already handled)
  return HOTEL_NATIONALITY_INTL;
}

export function guestNationalitiesAreMixed(
  codes: Array<string | null | undefined> | string | null | undefined,
): boolean {
  const list = Array.isArray(codes)
    ? collectGuestNationalityCodes({ nationalities: codes })
    : collectGuestNationalityCodes({ nationality: codes });
  return list.length > 1;
}

export type TripTravellerNationalityRow = {
  isLead?: boolean | null;
  nationality?: string | null;
  traveller?: { nationality?: string | null } | null;
};

/**
 * Derive Match guest codes from trip travellers.
 * Prefer lead nationality; mixed parties keep one code per traveller (multiplicity).
 */
export function guestNationalitiesFromTripTravellers(
  rows: TripTravellerNationalityRow[] | null | undefined,
): { nationality: HotelNationalityCode | null; nationalities: HotelNationalityCode[] } {
  if (!Array.isArray(rows) || !rows.length) {
    return { nationality: null, nationalities: [] };
  }
  const lead = rows.find((r) => r.isLead);
  const leadCode = normalizeHotelNationality(
    lead?.nationality ?? lead?.traveller?.nationality ?? null,
  );
  const orderedRows = lead
    ? [lead, ...rows.filter((r) => r !== lead)]
    : rows;
  const bag = collectGuestNationalityBag({
    nationalities: orderedRows.map(
      (r) => r.nationality ?? r.traveller?.nationality ?? null,
    ),
  });
  if (!bag.length) {
    return { nationality: null, nationalities: [] };
  }
  const distinct = collectGuestNationalityCodes({ nationalities: bag });
  if (distinct.length === 1) {
    return { nationality: distinct[0]!, nationalities: distinct };
  }
  // Lead-first bag: all lead occurrences first, then others in traveller order
  const leadFirst = leadCode
    ? [
        ...bag.filter((c) => c === leadCode),
        ...bag.filter((c) => c !== leadCode),
      ]
    : bag;
  return {
    nationality: effectiveGuestNationality(leadFirst),
    nationalities: leadFirst,
  };
}

/** Top-level resolve/rematch fields from trip travellers (omit when empty). */
export function resolveNationalityOptsFromTripTravellers(
  rows: TripTravellerNationalityRow[] | null | undefined,
): { nationality?: string; nationalities?: string[] } {
  const derived = guestNationalitiesFromTripTravellers(rows);
  if (!derived.nationalities.length) return {};
  if (derived.nationalities.length === 1) {
    return { nationality: derived.nationalities[0] };
  }
  return {
    nationality: derived.nationality ?? undefined,
    nationalities: derived.nationalities,
  };
}

/** Rate applies when it is "any", exact match, or INTL catch-all for non-IN guests. */
export function hotelNationalityCompatible(
  rateNationality: string | null | undefined,
  guestNationality: string | null | undefined,
): boolean {
  const rate = normalizeHotelNationality(rateNationality);
  if (rate == null) return true;
  const guest = normalizeHotelNationality(guestNationality);
  if (guest == null) return true; // unknown guest can use any card
  if (rate === guest) return true;
  // Foreign catch-all covers any non-Indian guest (including specific ISO guests)
  if (rate === HOTEL_NATIONALITY_INTL && guest !== HOTEL_NATIONALITY_IN) {
    return true;
  }
  return false;
}

/**
 * Prefer exact ISO/market cards, then INTL catch-all (non-IN guests), then any.
 */
export function filterHotelByNationality<
  T extends { occupancyPricingJson?: unknown },
>(pool: T[], guestNationality: string | null | undefined): T[] {
  if (!pool.length) return pool;
  const guest = normalizeHotelNationality(guestNationality);
  const withNat = (r: T) =>
    normalizeHotelNationality(nationalityFromOccupancy(r.occupancyPricingJson));

  const compatible = pool.filter((r) =>
    hotelNationalityCompatible(withNat(r), guestNationality),
  );
  if (!compatible.length) return [];

  if (guest == null) {
    return compatible;
  }

  const exact = compatible.filter((r) => withNat(r) === guest);
  if (exact.length) return exact;

  if (guest !== HOTEL_NATIONALITY_IN) {
    const intl = compatible.filter((r) => withNat(r) === HOTEL_NATIONALITY_INTL);
    if (intl.length) return intl;
  }

  const any = compatible.filter((r) => withNat(r) == null);
  return any.length ? any : compatible;
}

export function nationalityFromOccupancy(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const n = (raw as { nationality?: unknown }).nationality;
  if (typeof n !== 'string') return null;
  const t = n.trim();
  return t || null;
}

export function hotelNationalityMatchAccepted(
  rateNationality: string | null | undefined,
  guestNationality: string | null | undefined,
  opts?: {
    guestNationalities?: Array<string | null | undefined> | null;
    mixed?: boolean;
  },
): string[] {
  const rate = normalizeHotelNationality(rateNationality);
  const guest = normalizeHotelNationality(guestNationality);
  const mixed =
    opts?.mixed === true ||
    guestNationalitiesAreMixed(
      opts?.guestNationalities ??
        (guestNationality != null ? [guestNationality] : []),
    );
  if (rate == null && guest == null && !mixed) return [];
  if (mixed && rate === HOTEL_NATIONALITY_INTL) {
    return ['Foreign (INTL) card for mixed guest nationalities'];
  }
  if (mixed && rate != null && guest != null && rate === guest) {
    return [`Nationality ${rate} matched (mixed guests → ${guest})`];
  }
  if (mixed && rate == null && guest != null) {
    return [`Any-nationality card for mixed guests → ${guest}`];
  }
  if (rate != null && guest != null && rate === guest) {
    return [`Nationality ${rate} matched`];
  }
  if (
    rate === HOTEL_NATIONALITY_INTL &&
    guest != null &&
    guest !== HOTEL_NATIONALITY_IN
  ) {
    return [
      mixed
        ? 'Foreign (INTL) card for mixed guest nationalities'
        : `Foreign (INTL) card for guest ${guest}`,
    ];
  }
  if (rate != null && guest == null) {
    return [`Nationality ${rate} card (guest unset)`];
  }
  if (rate == null && guest != null) {
    return [`Any-nationality card for guest ${guest}`];
  }
  return [];
}
