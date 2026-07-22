import { omitEmptyParams } from './types';

export type PlacesView = 'catalog' | 'contributions';

/** Stable Places (Destinations) queue query — backward-compatible with existing deep-links. */
export type PlacesQueryState = {
  view: PlacesView;
  q?: string;
  /** Catalog-only facets — ignored on the contributions view. */
  kind?: string;
  parentId?: string;
  categoryId?: string;
};

const KNOWN_KEYS = ['view', 'q', 'kind', 'parentId', 'categoryId'];

function parseView(raw: string | null | undefined, fallback: PlacesView): PlacesView {
  return raw === 'contributions' ? 'contributions' : raw === 'catalog' ? 'catalog' : fallback;
}

export function parsePlacesQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackView: PlacesView = 'catalog',
): PlacesQueryState {
  const view = parseView(params.get('view'), fallbackView);
  return {
    view,
    q: params.get('q')?.trim() || undefined,
    kind: view === 'catalog' ? params.get('kind')?.trim() || undefined : undefined,
    parentId: view === 'catalog' ? params.get('parentId')?.trim() || undefined : undefined,
    categoryId: view === 'catalog' ? params.get('categoryId')?.trim() || undefined : undefined,
  };
}

export function serializePlacesQueryState(state: PlacesQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view === 'contributions') params.set('view', state.view);
  if (state.q) params.set('q', state.q);
  if (state.view === 'catalog') {
    if (state.kind) params.set('kind', state.kind);
    if (state.parentId) params.set('parentId', state.parentId);
    if (state.categoryId) params.set('categoryId', state.categoryId);
  }
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchPlacesQueryParams(
  current: URLSearchParams,
  patch: Partial<PlacesQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parsePlacesQueryState(current);
  const viewChanged = patch.view !== undefined && patch.view !== parsed.view;
  const next: PlacesQueryState = patch.clearFilters
    ? {
        view: patch.view ?? parsed.view,
        q: patch.q !== undefined ? patch.q : parsed.q,
      }
    : viewChanged
      // Facets and search are scoped to the catalog view — reset them on switch.
      ? { view: patch.view as PlacesView }
      : { ...parsed, ...patch };

  const serialized = serializePlacesQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function placesQueryHasFilters(state: PlacesQueryState): boolean {
  return Boolean(state.kind || state.parentId || state.categoryId);
}
