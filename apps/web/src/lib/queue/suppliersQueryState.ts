import { omitEmptyParams } from './types';

/** Stable Suppliers queue query — backward-compatible with existing deep-links. */
export type SuppliersQueryState = {
  q?: string;
  type?: string;
};

const KNOWN_KEYS = ['q', 'type'];

export function parseSuppliersQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): SuppliersQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    type: params.get('type')?.trim() || undefined,
  };
}

export function serializeSuppliersQueryState(state: SuppliersQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.type) params.set('type', state.type);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchSuppliersQueryParams(
  current: URLSearchParams,
  patch: Partial<SuppliersQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseSuppliersQueryState(current);
  const next: SuppliersQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : { ...parsed, ...patch };

  const serialized = serializeSuppliersQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function suppliersQueryHasFilters(state: SuppliersQueryState): boolean {
  return Boolean(state.type);
}
