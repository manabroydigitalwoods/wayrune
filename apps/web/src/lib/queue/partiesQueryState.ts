import { omitEmptyParams } from './types';

export type PartiesPartyType = 'individual' | 'organization';

/** Stable Parties/Clients queue query — backward-compatible with existing deep-links. */
export type PartiesQueryState = {
  q?: string;
  type?: PartiesPartyType;
  /** Explicit B2B-only toggle. `undefined` follows the page's own default (e.g. DMC orgs). */
  b2b?: boolean;
};

const KNOWN_KEYS = ['q', 'type', 'b2b'];

function parseType(raw: string | null | undefined): PartiesPartyType | undefined {
  return raw === 'individual' || raw === 'organization' ? raw : undefined;
}

function parseB2b(raw: string | null | undefined): boolean | undefined {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return undefined;
}

export function parsePartiesQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): PartiesQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    type: parseType(params.get('type')),
    b2b: parseB2b(params.get('b2b')),
  };
}

export function serializePartiesQueryState(state: PartiesQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.type) params.set('type', state.type);
  if (state.b2b === true) params.set('b2b', '1');
  else if (state.b2b === false) params.set('b2b', '0');
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchPartiesQueryParams(
  current: URLSearchParams,
  patch: Partial<PartiesQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parsePartiesQueryState(current);
  const next: PartiesQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q, type: undefined, b2b: false }
    : { ...parsed, ...patch };

  const serialized = serializePartiesQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function partiesQueryHasFilters(state: PartiesQueryState): boolean {
  return Boolean(state.type || state.b2b);
}
