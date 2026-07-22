import { omitEmptyParams } from './types';

/** Stable Presence pages-index queue query — scoped to the selected website. */
export type PresencePagesQueryState = {
  q?: string;
  template?: string;
};

const KNOWN_KEYS = ['q', 'template'];

export function parsePresencePagesQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): PresencePagesQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    template: params.get('template')?.trim() || undefined,
  };
}

export function serializePresencePagesQueryState(
  state: PresencePagesQueryState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.template) params.set('template', state.template);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys (e.g. `site`, `view`). */
export function patchPresencePagesQueryParams(
  current: URLSearchParams,
  patch: Partial<PresencePagesQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parsePresencePagesQueryState(current);
  const next: PresencePagesQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : { ...parsed, ...patch };

  const serialized = serializePresencePagesQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function presencePagesQueryHasFilters(state: PresencePagesQueryState): boolean {
  return Boolean(state.template);
}
