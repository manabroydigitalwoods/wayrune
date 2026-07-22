/**
 * Organisation partner profile HQ/base Place helpers (Step 6 P0).
 * When placeId is set, city/region/country are server-derived snapshots.
 */

export const ORG_PROFILE_PLACE_KINDS = [
  'country',
  'state',
  'region',
  'area',
  'city',
] as const;

export type OrgProfilePlaceKind = (typeof ORG_PROFILE_PLACE_KINDS)[number];

export const ORG_PROFILE_PLACE_KIND_SET = new Set<string>(ORG_PROFILE_PLACE_KINDS);

export function isAllowedOrgProfilePlaceKind(kind: string): boolean {
  return ORG_PROFILE_PLACE_KIND_SET.has(kind);
}

export type OrgProfilePlaceNode = {
  id: string;
  name: string;
  kind: string;
  country: string;
  region: string | null;
};

export type OrgProfileLocationSnapshots = {
  placeId: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

/**
 * Derive city/region/country from a Place + ancestors (root → … → parent of selected).
 * Ancestors should be ordered nearest-parent-first or any order — we match by kind.
 */
export function deriveOrgProfileLocationSnapshots(
  place: OrgProfilePlaceNode,
  ancestors: Array<{ name: string; kind: string; country?: string | null }>,
): OrgProfileLocationSnapshots {
  const findAncestor = (kinds: string[]) =>
    ancestors.find((a) => kinds.includes(a.kind));

  const kind = place.kind;
  if (kind === 'city' || kind === 'area') {
    const stateOrRegion = findAncestor(['state', 'region']);
    const countryAnc = findAncestor(['country']);
    return {
      placeId: place.id,
      city: place.name,
      region: stateOrRegion?.name ?? place.region ?? null,
      country: countryAnc?.name ?? place.country ?? null,
    };
  }
  if (kind === 'state' || kind === 'region') {
    const countryAnc = findAncestor(['country']);
    return {
      placeId: place.id,
      city: null,
      region: place.name,
      country: countryAnc?.name ?? place.country ?? null,
    };
  }
  // country (and any allowed fallback)
  return {
    placeId: place.id,
    city: null,
    region: null,
    country: place.name || place.country || null,
  };
}

/** Clear linked location — ID and derived snapshots together. */
export function clearOrgProfileLocationSnapshots(): {
  placeId: null;
  city: null;
  region: null;
  country: null;
} {
  return { placeId: null, city: null, region: null, country: null };
}
