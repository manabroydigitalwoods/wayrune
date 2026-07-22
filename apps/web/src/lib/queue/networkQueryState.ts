import { omitEmptyParams } from './types';

export type NetworkView = 'discover' | 'following' | 'commerce';

/** Stable Network (Partner network) queue query — backward-compatible with existing deep-links. */
export type NetworkQueryState = {
  view: NetworkView;
  /** Discover-only facets — ignored on Following / Commerce. */
  q?: string;
  kind?: string;
};

const KNOWN_KEYS = ['view', 'q', 'kind'];

function parseView(raw: string | null | undefined, fallback: NetworkView): NetworkView {
  return raw === 'following' || raw === 'commerce' || raw === 'discover' ? raw : fallback;
}

export function parseNetworkQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackView: NetworkView = 'discover',
): NetworkQueryState {
  const view = parseView(params.get('view'), fallbackView);
  return {
    view,
    q: view === 'discover' ? params.get('q')?.trim() || undefined : undefined,
    kind: view === 'discover' ? params.get('kind')?.trim() || undefined : undefined,
  };
}

export function serializeNetworkQueryState(state: NetworkQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== 'discover') params.set('view', state.view);
  if (state.view === 'discover') {
    if (state.q) params.set('q', state.q);
    if (state.kind) params.set('kind', state.kind);
  }
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchNetworkQueryParams(
  current: URLSearchParams,
  patch: Partial<NetworkQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseNetworkQueryState(current);
  const viewChanged = patch.view !== undefined && patch.view !== parsed.view;
  const next: NetworkQueryState = patch.clearFilters
    ? {
        view: patch.view ?? parsed.view,
        q: patch.q !== undefined ? patch.q : parsed.q,
      }
    : viewChanged
      // Facets and search are scoped to the discover view — reset them on switch.
      ? { view: patch.view as NetworkView }
      : { ...parsed, ...patch };

  const serialized = serializeNetworkQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function networkQueryHasFilters(state: NetworkQueryState): boolean {
  return Boolean(state.kind);
}
