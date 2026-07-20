/** Guest / rate nationality cues (mirrors API hotel-nationality — IN / INTL / ISO-2). */

import {
  ISO_3166_ALPHA2_CODES,
  iso3166RegionLabel,
} from '@wayrune/contracts';

/** Quick chips for common markets (full catalog is searchable Combobox). */
export const HOTEL_NATIONALITY_QUICK_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'IN', label: 'Indian (IN)' },
  { value: 'INTL', label: 'Foreign (INTL)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'GB', label: 'United Kingdom (GB)' },
  { value: 'AE', label: 'UAE (AE)' },
  { value: 'SG', label: 'Singapore (SG)' },
  { value: 'AU', label: 'Australia (AU)' },
  { value: 'DE', label: 'Germany (DE)' },
  { value: 'FR', label: 'France (FR)' },
  { value: 'CA', label: 'Canada (CA)' },
] as const;

/** Full picker: Any / IN / INTL + all ISO-3166-1 alpha-2 countries. */
export const HOTEL_NATIONALITY_OPTIONS: Array<{ value: string; label: string }> =
  [
    { value: '', label: 'Any' },
    { value: 'IN', label: 'Indian (IN)' },
    { value: 'INTL', label: 'Foreign (INTL)' },
    ...ISO_3166_ALPHA2_CODES.filter((c) => c !== 'IN').map((c) => ({
      value: c,
      label: iso3166RegionLabel(c),
    })),
  ];

/** Options for adding a guest nationality (no blank Any). */
export const HOTEL_NATIONALITY_GUEST_OPTIONS = HOTEL_NATIONALITY_OPTIONS.filter(
  (o) => o.value !== '',
);

const IN_ALIASES = new Set(['IN', 'IND', 'INDIA', 'DOMESTIC']);
const INTL_ALIASES = new Set([
  'INTL',
  'INTERNATIONAL',
  'FOREIGN',
  'NON-IN',
  'NON_IN',
]);

/** Canonical UI code: '' | IN | INTL | ISO-2. */
export function normalizeHotelNationalityUi(
  raw: string | null | undefined,
): string {
  const c = String(raw || '')
    .trim()
    .toUpperCase();
  if (!c) return '';
  if (IN_ALIASES.has(c)) return 'IN';
  if (INTL_ALIASES.has(c)) return 'INTL';
  if (/^[A-Z]{2}$/.test(c)) return c;
  return '';
}

export function hotelNationalityLabelUi(raw: string | null | undefined): string {
  const c = normalizeHotelNationalityUi(raw);
  if (!c) return 'Any';
  if (c === 'IN') return 'Indian (IN)';
  if (c === 'INTL') return 'Foreign (INTL)';
  return iso3166RegionLabel(c) || c;
}

/** Distinct guest codes from singular + list (mirrors API collectGuestNationalityCodes). */
export function collectGuestNationalityCodesUi(input: {
  nationality?: string | null;
  nationalities?: Array<string | null | undefined> | null;
}): string[] {
  const raw: unknown[] = [];
  if (Array.isArray(input.nationalities)) raw.push(...input.nationalities);
  if (input.nationality != null && String(input.nationality).trim()) {
    raw.push(input.nationality);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const n = normalizeHotelNationalityUi(
      typeof item === 'string' ? item : null,
    );
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Collapse multi-guest codes to one Match nationality (mirrors API).
 * IN+foreign / multi-ISO / INTL → INTL; single ISO kept; all IN → IN.
 */
export function effectiveGuestNationalityUi(
  codes: Array<string | null | undefined> | string | null | undefined,
): string {
  const list = Array.isArray(codes)
    ? collectGuestNationalityCodesUi({ nationalities: codes })
    : collectGuestNationalityCodesUi({ nationality: codes });
  if (!list.length) return '';
  if (list.length === 1) return list[0]!;

  const hasIn = list.includes('IN');
  const hasIntl = list.includes('INTL');
  const foreignIsos = list.filter((c) => c !== 'IN' && c !== 'INTL');

  if (hasIntl || (hasIn && foreignIsos.length > 0)) return 'INTL';
  if (hasIn) return 'IN';
  if (foreignIsos.length === 1) return foreignIsos[0]!;
  return 'INTL';
}

export function guestNationalitiesAreMixedUi(
  codes: Array<string | null | undefined> | string | null | undefined,
): boolean {
  const list = Array.isArray(codes)
    ? collectGuestNationalityCodesUi({ nationalities: codes })
    : collectGuestNationalityCodesUi({ nationality: codes });
  return list.length > 1;
}

/** Sync nationalities[] + collapsed nationality for quote line details. */
export function withGuestNationalities(
  codes: Array<string | null | undefined>,
): { nationality?: string; nationalities?: string[] } {
  const list = collectGuestNationalityCodesUi({ nationalities: codes });
  if (!list.length) return { nationality: undefined, nationalities: undefined };
  const effective = effectiveGuestNationalityUi(list);
  if (list.length === 1) {
    return { nationality: list[0], nationalities: undefined };
  }
  return {
    nationality: effective || undefined,
    nationalities: list,
  };
}

export type TripTravellerNationalityRowUi = {
  isLead?: boolean | null;
  nationality?: string | null;
  traveller?: { nationality?: string | null } | null;
};

/** Derive Match guest codes from trip travellers (lead-first; mixed → list). */
export function guestNationalitiesFromTripTravellersUi(
  rows: TripTravellerNationalityRowUi[] | null | undefined,
): { nationality?: string; nationalities?: string[] } {
  if (!Array.isArray(rows) || !rows.length) {
    return {};
  }
  const lead = rows.find((r) => r.isLead);
  const leadCode = normalizeHotelNationalityUi(
    lead?.nationality ?? lead?.traveller?.nationality ?? null,
  );
  const allCodes = collectGuestNationalityCodesUi({
    nationalities: rows.map(
      (r) => r.nationality ?? r.traveller?.nationality ?? null,
    ),
  });
  if (!allCodes.length) return {};
  if (allCodes.length === 1) {
    return withGuestNationalities(allCodes);
  }
  const ordered = leadCode
    ? [leadCode, ...allCodes.filter((c) => c !== leadCode)]
    : allCodes;
  return withGuestNationalities(ordered);
}

export function formatHotelNationalityNote(calc: {
  nationality?: string | null;
  guestNationality?: string | null;
  guestNationalities?: Array<string | null | undefined> | null;
  guestNationalityMixed?: boolean | null;
} | null | undefined): string | null {
  const codes = collectGuestNationalityCodesUi({
    nationality: calc?.guestNationality,
    nationalities: calc?.guestNationalities,
  });
  const mixed =
    calc?.guestNationalityMixed === true || guestNationalitiesAreMixedUi(codes);
  const rate = normalizeHotelNationalityUi(calc?.nationality);
  const guest =
    normalizeHotelNationalityUi(calc?.guestNationality) ||
    effectiveGuestNationalityUi(codes);
  if (!rate && !guest && !mixed) return null;
  if (mixed) {
    const guestList = codes.map(hotelNationalityLabelUi).join(' + ');
    if (rate === 'INTL') {
      return `Foreign (INTL) · mixed ${guestList || 'guests'}`;
    }
    if (rate && guest && rate === guest) {
      return `${hotelNationalityLabelUi(rate)} rate · mixed ${guestList}`;
    }
    if (rate) {
      return `${hotelNationalityLabelUi(rate)} card · mixed ${guestList}`;
    }
    return `Mixed guests · Match ${hotelNationalityLabelUi(guest)}`;
  }
  if (rate && guest && rate === guest) {
    return `${hotelNationalityLabelUi(rate)} rate`;
  }
  if (rate === 'INTL' && guest && guest !== 'IN') {
    return `Foreign (INTL) card · guest ${hotelNationalityLabelUi(guest)}`;
  }
  if (rate && !guest) {
    return `${hotelNationalityLabelUi(rate)} card · guest unset`;
  }
  if (!rate && guest) {
    return `Any-nationality card · guest ${hotelNationalityLabelUi(guest)}`;
  }
  return null;
}
