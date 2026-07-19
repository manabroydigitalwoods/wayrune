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

export function formatHotelNationalityNote(calc: {
  nationality?: string | null;
  guestNationality?: string | null;
} | null | undefined): string | null {
  const rate = normalizeHotelNationalityUi(calc?.nationality);
  const guest = normalizeHotelNationalityUi(calc?.guestNationality);
  if (!rate && !guest) return null;
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
