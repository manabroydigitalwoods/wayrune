import { omitEmptyParams } from './types';

export type RatesTab = 'hotel' | 'transfer';
export type RatesHotelKind = 'place' | 'supplier';
export type RatesSource = 'system' | 'agency';

/** Stable Rates queue query — backward-compatible with the existing `?tab=` deep-link. */
export type RatesQueryState = {
  tab: RatesTab;
  q?: string;
  /** Hotel-only facet — ignored on the transfer tab. */
  kind?: RatesHotelKind;
  source?: RatesSource;
};

const KNOWN_KEYS = ['tab', 'q', 'kind', 'source'];

function parseTab(raw: string | null | undefined, fallback: RatesTab): RatesTab {
  return raw === 'transfer' ? 'transfer' : raw === 'hotel' ? 'hotel' : fallback;
}

function parseKind(raw: string | null | undefined): RatesHotelKind | undefined {
  return raw === 'place' || raw === 'supplier' ? raw : undefined;
}

function parseSource(raw: string | null | undefined): RatesSource | undefined {
  return raw === 'system' || raw === 'agency' ? raw : undefined;
}

export function parseRatesQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackTab: RatesTab = 'hotel',
): RatesQueryState {
  const tab = parseTab(params.get('tab'), fallbackTab);
  return {
    tab,
    q: params.get('q')?.trim() || undefined,
    kind: tab === 'hotel' ? parseKind(params.get('kind')) : undefined,
    source: parseSource(params.get('source')),
  };
}

export function serializeRatesQueryState(state: RatesQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.tab === 'transfer') params.set('tab', state.tab);
  if (state.q) params.set('q', state.q);
  if (state.tab === 'hotel' && state.kind) params.set('kind', state.kind);
  if (state.source) params.set('source', state.source);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchRatesQueryParams(
  current: URLSearchParams,
  patch: Partial<RatesQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseRatesQueryState(current);
  const tabChanged = patch.tab !== undefined && patch.tab !== parsed.tab;
  const next: RatesQueryState = patch.clearFilters
    ? {
        tab: patch.tab ?? parsed.tab,
        q: patch.q !== undefined ? patch.q : parsed.q,
      }
    : tabChanged
      // Facets and search are scoped to a tab's own columns — reset them on switch.
      ? { tab: patch.tab as RatesTab }
      : { ...parsed, ...patch };

  const serialized = serializeRatesQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function ratesQueryHasFilters(state: RatesQueryState): boolean {
  return Boolean(state.kind || state.source);
}
