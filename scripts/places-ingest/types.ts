/** Places CSV catalog ingest — shared types and constants. */

export const PLACE_KINDS = [
  'country',
  'region',
  'state',
  'city',
  'area',
  'landmark',
  'airport',
  'railway_station',
] as const;

export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_SET = new Set<string>(PLACE_KINDS);

export type PlaceProfileJson = {
  description?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string;
  durationMin?: number;
  bestTime?: string;
  entryFee?: string;
  suitabilityTags?: string[];
  googleMapsUrl?: string;
  iataCode?: string;
  icaoCode?: string;
  stationCode?: string;
  officialName?: string;
  shortName?: string;
  sourceUrl?: string;
  legacyKeys?: string[];
  [key: string]: unknown;
};

export type ParsedPlaceRow = {
  name: string;
  key: string;
  kind: PlaceKind;
  parentKey: string | null;
  country: string;
  region: string | null;
  domesticOrIntl: 'domestic' | 'international';
  isSystem: boolean;
  isActive: boolean;
  profile: PlaceProfileJson;
  /** Source file basename for reports. */
  sourceFile: string;
};

export type IngestOutcome =
  | 'created'
  | 'updated'
  | 'merged_legacy'
  | 'skipped_duplicate_key'
  | 'skipped_invalid'
  | 'conflict_kind'
  | 'conflict_name'
  | 'conflict_transport'
  | 'conflict_org_scoped'
  | 'warn_orphan_parent';

export type IngestCounters = Record<IngestOutcome, number> & {
  files: number;
  rows_parsed: number;
  unique_keys: number;
};

export function emptyCounters(): IngestCounters {
  return {
    files: 0,
    rows_parsed: 0,
    unique_keys: 0,
    created: 0,
    updated: 0,
    merged_legacy: 0,
    skipped_duplicate_key: 0,
    skipped_invalid: 0,
    conflict_kind: 0,
    conflict_name: 0,
    conflict_transport: 0,
    conflict_org_scoped: 0,
    warn_orphan_parent: 0,
  };
}

export function normalizePlaceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function legacyLeafKey(pathKey: string): string {
  const parts = pathKey.trim().split('/').filter(Boolean);
  return parts[parts.length - 1] || pathKey.trim();
}

export function isAllowedPlaceKind(kind: string): kind is PlaceKind {
  return PLACE_KIND_SET.has(kind);
}
