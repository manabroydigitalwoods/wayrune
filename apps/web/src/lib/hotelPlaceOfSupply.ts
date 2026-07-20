/** Hotel tip place-of-supply UI helpers (Match-only; mirrors tax display codes). */

export const HOTEL_PLACE_OF_SUPPLY_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: '', label: 'Any (no POS tip)' },
  { value: 'KA', label: 'KA — Karnataka' },
  { value: 'MH', label: 'MH — Maharashtra' },
  { value: 'DL', label: 'DL — Delhi' },
  { value: 'TN', label: 'TN — Tamil Nadu' },
  { value: 'KL', label: 'KL — Kerala' },
  { value: 'GJ', label: 'GJ — Gujarat' },
  { value: 'RJ', label: 'RJ — Rajasthan' },
  { value: 'UP', label: 'UP — Uttar Pradesh' },
  { value: 'WB', label: 'WB — West Bengal' },
  { value: 'TS', label: 'TS — Telangana' },
  { value: 'AP', label: 'AP — Andhra Pradesh' },
  { value: 'GA', label: 'GA — Goa' },
  { value: 'HR', label: 'HR — Haryana' },
  { value: 'PB', label: 'PB — Punjab' },
];

const POS_ALIASES: Record<string, string> = {
  KA: 'KA',
  KARNATAKA: 'KA',
  MH: 'MH',
  MAHARASHTRA: 'MH',
  DL: 'DL',
  DELHI: 'DL',
  TN: 'TN',
  'TAMIL NADU': 'TN',
  KL: 'KL',
  KERALA: 'KL',
  GJ: 'GJ',
  GUJARAT: 'GJ',
  RJ: 'RJ',
  RAJASTHAN: 'RJ',
  UP: 'UP',
  'UTTAR PRADESH': 'UP',
  WB: 'WB',
  'WEST BENGAL': 'WB',
  TS: 'TS',
  TELANGANA: 'TS',
  AP: 'AP',
  'ANDHRA PRADESH': 'AP',
  GOA: 'GA',
  GA: 'GA',
  HR: 'HR',
  HARYANA: 'HR',
  PB: 'PB',
  PUNJAB: 'PB',
};

export function normalizeHotelPlaceOfSupplyUi(
  raw: string | null | undefined,
): string {
  if (raw == null) return '';
  const t = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
  if (!t) return '';
  return POS_ALIASES[t] || t.slice(0, 40);
}
