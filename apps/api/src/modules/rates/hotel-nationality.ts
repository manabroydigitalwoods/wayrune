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
): string[] {
  const rate = normalizeHotelNationality(rateNationality);
  const guest = normalizeHotelNationality(guestNationality);
  if (rate == null && guest == null) return [];
  if (rate != null && guest != null && rate === guest) {
    return [`Nationality ${rate} matched`];
  }
  if (
    rate === HOTEL_NATIONALITY_INTL &&
    guest != null &&
    guest !== HOTEL_NATIONALITY_IN
  ) {
    return [`Foreign (INTL) card for guest ${guest}`];
  }
  if (rate != null && guest == null) {
    return [`Nationality ${rate} card (guest unset)`];
  }
  if (rate == null && guest != null) {
    return [`Any-nationality card for guest ${guest}`];
  }
  return [];
}
