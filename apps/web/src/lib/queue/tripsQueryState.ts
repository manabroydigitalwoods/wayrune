import { omitEmptyParams } from './types';

/** Stable Trips queue query — backward-compatible with existing deep-links. */
export type TripsQueryState = {
  q?: string;
  status?: string;
  travelFrom?: string | null;
  travelTo?: string | null;
  travelPeriod?: string | null;
};

const KNOWN_KEYS = ['q', 'status', 'travelFrom', 'travelTo', 'travelPeriod'];

export function parseTripsQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): TripsQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    status: params.get('status')?.trim() || undefined,
    travelFrom: params.get('travelFrom') || null,
    travelTo: params.get('travelTo') || null,
    travelPeriod: params.get('travelPeriod') || null,
  };
}

export function serializeTripsQueryState(state: TripsQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status) params.set('status', state.status);
  if (state.travelFrom) params.set('travelFrom', state.travelFrom);
  if (state.travelTo) params.set('travelTo', state.travelTo);
  if (state.travelPeriod && state.travelPeriod !== 'custom') {
    params.set('travelPeriod', state.travelPeriod);
  }
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys (e.g. `ops=1`, `focus=`). */
export function patchTripsQueryParams(
  current: URLSearchParams,
  patch: Partial<TripsQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseTripsQueryState(current);
  const next: TripsQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : {
        ...parsed,
        ...patch,
        travelFrom: patch.travelFrom !== undefined ? patch.travelFrom : parsed.travelFrom,
        travelTo: patch.travelTo !== undefined ? patch.travelTo : parsed.travelTo,
        travelPeriod: patch.travelPeriod !== undefined ? patch.travelPeriod : parsed.travelPeriod,
      };

  const serialized = serializeTripsQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function tripsQueryHasFilters(state: TripsQueryState): boolean {
  return Boolean(state.status || state.travelFrom || state.travelTo);
}
