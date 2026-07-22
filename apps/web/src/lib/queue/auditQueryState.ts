import { omitEmptyParams } from './types';

/** Stable Audit log queue query — client-side `q=` search only (no server facets yet). */
export type AuditQueryState = {
  q?: string;
};

const KNOWN_KEYS = ['q'];

export function parseAuditQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): AuditQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
  };
}

export function serializeAuditQueryState(state: AuditQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchAuditQueryParams(
  current: URLSearchParams,
  patch: Partial<AuditQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseAuditQueryState(current);
  const next: AuditQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : { ...parsed, ...patch };

  const serialized = serializeAuditQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function auditQueryHasFilters(_state: AuditQueryState): boolean {
  return false;
}
