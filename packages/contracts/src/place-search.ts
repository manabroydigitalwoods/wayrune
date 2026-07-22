/** Purpose-specific Places search (shared domain). */

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

export type PlaceSearchPurpose =
  | 'destination'
  | 'origin'
  | 'intermediate_stop'
  | 'transfer_pickup'
  | 'transfer_drop'
  | 'all';

export type PlaceSearchTab = 'destinations' | 'transport' | 'all';

export type PlaceSearchMatchType = 'exact' | 'prefix' | 'code' | 'normal';

export const PLACE_SEARCH_PURPOSES = [
  'destination',
  'origin',
  'intermediate_stop',
  'transfer_pickup',
  'transfer_drop',
  'all',
] as const;

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  country: 'Country',
  region: 'Region',
  state: 'State',
  city: 'City',
  area: 'Area',
  landmark: 'Landmark',
  airport: 'Airport',
  railway_station: 'Railway station',
};

type PurposeConfig = {
  defaultKinds: PlaceKind[];
  kindPriority: PlaceKind[];
  tabs?: Partial<Record<PlaceSearchTab, PlaceKind[] | undefined>>;
};

export const PURPOSE_CONFIG: Record<PlaceSearchPurpose, PurposeConfig> = {
  destination: {
    defaultKinds: ['country', 'state', 'region', 'area', 'city'],
    kindPriority: ['city', 'area', 'region', 'state', 'country'],
    tabs: {
      destinations: ['country', 'state', 'region', 'area', 'city'],
      transport: ['airport', 'railway_station'],
      all: undefined,
    },
  },
  origin: {
    defaultKinds: ['city', 'airport', 'railway_station'],
    kindPriority: ['city', 'airport', 'railway_station'],
  },
  intermediate_stop: {
    defaultKinds: ['city', 'region', 'area'],
    kindPriority: ['city', 'area', 'region'],
  },
  transfer_pickup: {
    defaultKinds: ['airport', 'railway_station', 'city', 'landmark', 'area'],
    kindPriority: ['airport', 'railway_station', 'city', 'landmark', 'area'],
  },
  transfer_drop: {
    defaultKinds: ['city', 'airport', 'railway_station', 'landmark', 'area'],
    kindPriority: ['city', 'airport', 'railway_station', 'landmark', 'area'],
  },
  all: {
    defaultKinds: [...PLACE_KINDS],
    kindPriority: [
      'city',
      'area',
      'region',
      'state',
      'country',
      'airport',
      'railway_station',
      'landmark',
    ],
  },
};

export function parsePlaceKinds(raw: string | string[] | undefined | null): PlaceKind[] {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  const out: PlaceKind[] = [];
  for (const p of parts) {
    const k = p.trim().toLowerCase();
    if (PLACE_KIND_SET.has(k) && !out.includes(k as PlaceKind)) {
      out.push(k as PlaceKind);
    }
  }
  return out;
}

export function parsePlaceSearchPurpose(
  raw: string | undefined | null,
): PlaceSearchPurpose | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return (PLACE_SEARCH_PURPOSES as readonly string[]).includes(v)
    ? (v as PlaceSearchPurpose)
    : undefined;
}

export function resolvePurposeKinds(
  purpose: PlaceSearchPurpose | undefined,
  kindsOverride: PlaceKind[] | undefined,
  singleKind?: string | null,
): PlaceKind[] | null {
  if (kindsOverride && kindsOverride.length > 0) return kindsOverride;
  if (singleKind && PLACE_KIND_SET.has(singleKind)) return [singleKind as PlaceKind];
  if (!purpose || purpose === 'all') return null;
  return PURPOSE_CONFIG[purpose].defaultKinds;
}

/**
 * Heuristic for IATA / station codes (IXA, NJP, AGTL).
 * All-lowercase letter queries (dar, goa, darj) are destination text — not codes.
 */
export function looksLikeTransportCode(q: string): boolean {
  const t = q.trim();
  if (!/^[A-Za-z0-9]{2,4}$/.test(t)) return false;
  // "darjeeling" prefixes and city names typed in lowercase
  if (/^[a-z]+$/.test(t)) return false;
  return true;
}

export function normalizePlaceSearchQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Alias for suggestion / typo helpers — same normalization as search. */
export function normalizePlaceSearchText(q: string): string {
  return normalizePlaceSearchQuery(q);
}

export const PLACE_SUGGEST_MIN_QUERY_LENGTH = 3;
export const PLACE_SUGGEST_MAX_RESULTS = 3;
export const PLACE_SUGGEST_MIN_SIMILARITY = 0.85;
export const PLACE_SUGGEST_CANDIDATE_POOL_LIMIT = 80;

export function maxEditDistanceForQuery(normalizedLength: number): number {
  if (normalizedLength < PLACE_SUGGEST_MIN_QUERY_LENGTH) return -1;
  // Short tokens: keep strict (avoid sevok → seven).
  if (normalizedLength <= 5) return 1;
  // Longer place names: allow common multi-edit romanization typos (dargiling → Darjeeling).
  if (normalizedLength <= 10) return 3;
  return 3;
}

/** Bounded Levenshtein — early-exit when distance already exceeds `max`. */
export function levenshteinDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (!a.length) return b.length > max ? max + 1 : b.length;
  if (!b.length) return a.length > max ? max + 1 : a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

export function placeNameSimilarity(a: string, b: string): number {
  const na = normalizePlaceSearchText(a);
  const nb = normalizePlaceSearchText(b);
  if (!na.length && !nb.length) return 1;
  if (!na.length || !nb.length) return 0;
  const d = levenshteinDistance(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

export type PlaceSuggestionCandidate = {
  id: string;
  name: string;
  kind: string;
  key?: string | null;
};

export type PlaceSuggestionScore = {
  place: PlaceSuggestionCandidate;
  distance: number;
  similarity: number;
};

/**
 * Zero-result typo assistance over existing Places — not a general fuzzy rewrite.
 * Requires distance + similarity + strong first-token alignment.
 */
export function scorePlaceSuggestion(
  place: PlaceSuggestionCandidate,
  query: string,
): PlaceSuggestionScore | null {
  const nq = normalizePlaceSearchText(query);
  if (nq.length < PLACE_SUGGEST_MIN_QUERY_LENGTH) return null;

  const name = normalizePlaceSearchText(place.name);
  if (!name) return null;

  const qToken = nq.split(' ')[0] || nq;
  const nameToken = name.split(' ')[0] || name;
  const allowed = maxEditDistanceForQuery(qToken.length);
  if (allowed < 0) return null;

  const tokenDistance = levenshteinDistance(qToken, nameToken, allowed);
  if (tokenDistance > allowed) return null;

  const tokenSimilarity = placeNameSimilarity(qToken, nameToken);
  const fullSimilarity = placeNameSimilarity(nq, name);
  const similarity = Math.max(tokenSimilarity, fullSimilarity);

  const prefixLen = Math.min(3, qToken.length, nameToken.length);
  const prefixOk =
    prefixLen > 0 && qToken.slice(0, prefixLen) === nameToken.slice(0, prefixLen);
  const firstTokenStrong =
    prefixOk ||
    tokenSimilarity >= PLACE_SUGGEST_MIN_SIMILARITY ||
    (tokenDistance <= 1 && Math.abs(qToken.length - nameToken.length) <= 1);

  if (!firstTokenStrong) return null;
  // Prefix-aligned near-misses (Sevok→Sevoke, Dargeling→Darjeeling) may sit just under 0.85.
  if (similarity < PLACE_SUGGEST_MIN_SIMILARITY && !prefixOk) return null;

  return { place, distance: tokenDistance, similarity };
}

/** Prefix / stem used to bound the server-side candidate pool. */
export function placeSuggestionPoolStems(query: string): {
  prefix: string;
  stem: string;
  firstToken: string;
} | null {
  const nq = normalizePlaceSearchText(query);
  if (nq.length < PLACE_SUGGEST_MIN_QUERY_LENGTH) return null;
  const firstToken = nq.split(' ')[0] || nq;
  const prefix = firstToken.slice(0, Math.min(3, firstToken.length));
  const stem =
    firstToken.length >= 4 ? firstToken.slice(0, firstToken.length - 1) : firstToken;
  return { prefix, stem, firstToken };
}

export function suggestPlaceCorrections<T extends PlaceSuggestionCandidate>(
  candidates: T[],
  query: string,
  opts?: { max?: number },
): T[] {
  const max = opts?.max ?? PLACE_SUGGEST_MAX_RESULTS;
  const scored: PlaceSuggestionScore[] = [];
  for (const place of candidates) {
    const s = scorePlaceSuggestion(place, query);
    if (s) scored.push(s);
  }
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return a.place.name.localeCompare(b.place.name);
  });
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of scored) {
    if (seen.has(s.place.id)) continue;
    seen.add(s.place.id);
    out.push(s.place as T);
    if (out.length >= max) break;
  }
  return out;
}

export type RankablePlace = {
  id: string;
  name: string;
  kind: string;
  profile?: { iataCode?: string | null; stationCode?: string | null } | null;
};

export function placeMatchType(
  place: RankablePlace,
  q: string,
): PlaceSearchMatchType {
  const nq = normalizePlaceSearchQuery(q);
  if (!nq) return 'normal';
  const name = normalizePlaceSearchQuery(place.name);
  if (name === nq) return 'exact';
  if (name.startsWith(nq)) return 'prefix';
  if (looksLikeTransportCode(q)) {
    const code = q.trim().toUpperCase();
    const iata = place.profile?.iataCode?.toUpperCase();
    const station = place.profile?.stationCode?.toUpperCase();
    if (iata === code || station === code) return 'code';
  }
  return 'normal';
}

export function rankPlacesForPurpose<T extends RankablePlace>(
  places: T[],
  opts: { q?: string; purpose?: PlaceSearchPurpose },
): Array<T & { matchType: PlaceSearchMatchType }> {
  const purpose = opts.purpose || 'all';
  const priority = PURPOSE_CONFIG[purpose]?.kindPriority || PURPOSE_CONFIG.all.kindPriority;
  const kindRank = (kind: string) => {
    const i = priority.indexOf(kind as PlaceKind);
    return i === -1 ? 100 : i;
  };
  const q = opts.q?.trim() || '';
  const scored = places.map((p) => {
    const matchType = placeMatchType(p, q);
    const textScore =
      matchType === 'exact' ? 0 : matchType === 'prefix' ? 1 : matchType === 'code' ? 2 : 3;
    return { place: p, matchType, textScore, kindScore: kindRank(p.kind) };
  });
  scored.sort((a, b) => {
    if (a.textScore !== b.textScore) return a.textScore - b.textScore;
    if (a.kindScore !== b.kindScore) return a.kindScore - b.kindScore;
    return a.place.name.localeCompare(b.place.name);
  });
  return scored.map((s) => ({ ...s.place, matchType: s.matchType }));
}

export type SalesPlaceLabelInput = {
  name: string;
  kind: string;
  country?: string | null;
  region?: string | null;
  parent?: { name: string; kind: string } | null;
  profile?: { iataCode?: string | null; stationCode?: string | null } | null;
  breadcrumb?: string[];
};

/** Sales-facing secondary line — no System, no full breadcrumb dump. */
export function salesPlaceSecondaryLabel(p: SalesPlaceLabelInput): string {
  const kind = (PLACE_KIND_LABELS as Record<string, string>)[p.kind] || p.kind;
  const parts: string[] = [kind];

  if (p.kind === 'airport' && p.profile?.iataCode) {
    parts.push(p.profile.iataCode.toUpperCase());
  }
  if (p.kind === 'railway_station' && p.profile?.stationCode) {
    parts.push(p.profile.stationCode.toUpperCase());
  }

  if (p.kind === 'country') {
    return parts.join(' · ');
  }

  const parentName = p.parent?.name?.trim() || '';
  const region = p.region?.trim() || '';
  const country = p.country?.trim() || '';

  // Prefer parent when it's a useful geographic parent (not same as name)
  let geo = '';
  if (parentName && parentName.toLowerCase() !== p.name.toLowerCase()) {
    if (country && parentName.toLowerCase() !== country.toLowerCase()) {
      geo = `${parentName}, ${country}`;
    } else {
      geo = parentName;
    }
  } else if (region && region.toLowerCase() !== p.name.toLowerCase()) {
    if (country && region.toLowerCase() !== country.toLowerCase()) {
      geo = `${region}, ${country}`;
    } else {
      geo = region;
    }
  } else if (country && country.toLowerCase() !== p.name.toLowerCase()) {
    geo = country;
  }

  if (geo) parts.push(geo);
  return parts.join(' · ');
}

export const PLACE_SEARCH_DEFAULT_LIMIT = 40;
export const PLACE_SEARCH_MAX_LIMIT = 100;

export function clampPlaceSearchLimit(raw: number | string | undefined | null): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return PLACE_SEARCH_DEFAULT_LIMIT;
  return Math.min(PLACE_SEARCH_MAX_LIMIT, Math.floor(n));
}
