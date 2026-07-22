/**
 * Supplier service-area coverage helpers (Step 4 Places cleanup).
 * Exact Place ID matching only — no parent/child hierarchy expansion.
 */

export const SUPPLIER_COVERAGE_PLACE_KINDS = [
  'country',
  'state',
  'region',
  'area',
  'city',
] as const;

export type SupplierCoveragePlaceKind = (typeof SUPPLIER_COVERAGE_PLACE_KINDS)[number];

export const SUPPLIER_COVERAGE_KIND_SET = new Set<string>(SUPPLIER_COVERAGE_PLACE_KINDS);

/** Max structured coverage places per supplier. */
export const SUPPLIER_SERVED_PLACES_MAX = 80;

/**
 * Stay / physical property types — list filter matches base placeId only.
 * Coverage-aware types (DMC, guide, transport, …) also match servedPlaceIds.
 */
export const SUPPLIER_PHYSICAL_PLACE_TYPES = new Set([
  'hotel',
  'homestay',
  'farmstay',
  'restaurant',
]);

export function supplierMatchesPlaceViaCoverage(type?: string | null): boolean {
  if (!type) return true;
  return !SUPPLIER_PHYSICAL_PLACE_TYPES.has(type);
}

/** Deterministic profileJson dual-write key by supplier type (display compat only). */
export function supplierCoverageProfileKey(
  type?: string | null,
): 'destinationsServed' | 'destinations' | 'serviceAreas' | 'routesServed' | 'serviceArea' {
  switch (type) {
    case 'dmc':
      return 'destinationsServed';
    case 'guide':
      return 'destinations';
    case 'driver':
      return 'serviceAreas';
    case 'car_rental':
      return 'routesServed';
    default:
      return 'serviceArea';
  }
}

/**
 * Normalize incoming IDs: trim, drop blanks, dedupe preserving first-seen order, cap max.
 */
export function normalizeServedPlaceIds(
  ids: unknown,
  max = SUPPLIER_SERVED_PLACES_MAX,
): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function isAllowedCoveragePlaceKind(kind: string): boolean {
  return SUPPLIER_COVERAGE_KIND_SET.has(kind);
}

/**
 * API shape: null = not structured yet; [] = configured empty; string[] = coverage.
 */
export function servedPlaceIdsFromRows(input: {
  servedCoverageConfigured: boolean;
  placeIds: string[];
}): string[] | null {
  if (!input.servedCoverageConfigured) return null;
  return input.placeIds;
}

export function dualWriteCoverageNames(
  profile: Record<string, unknown> | null | undefined,
  type: string | null | undefined,
  placeNames: string[],
): Record<string, unknown> {
  const next = { ...(profile && typeof profile === 'object' ? profile : {}) };
  const key = supplierCoverageProfileKey(type);
  if (key === 'serviceArea') {
    if (placeNames.length) next.serviceArea = placeNames.join(', ');
    else delete next.serviceArea;
  } else if (placeNames.length) {
    next[key] = placeNames;
  } else {
    delete next[key];
  }
  return next;
}
