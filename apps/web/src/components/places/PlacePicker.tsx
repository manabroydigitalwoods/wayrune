import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PURPOSE_CONFIG,
  looksLikeTransportCode,
  salesPlaceSecondaryLabel,
  type PlaceKind,
  type PlaceSearchPurpose,
  type PlaceSearchTab,
} from '@wayrune/contracts';
import {
  Button,
  EntityCombobox,
  MultiEntityCombobox,
  SimpleFormField as FormField,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@wayrune/ui';
import { api } from '../../api';
import { useAuth } from '../../auth';
import type { PlaceProfile } from '../../lib/placeSnapshot';
import {
  placeName,
  placeRefKey,
  toPlaceRef,
  type PlaceRef,
} from '../../lib/placeRefs';
import { type EnquiryDestinationSuggestion } from '../../lib/destinationEnquirySuggestions';
import {
  dropRecentDestination,
  readRecentDestinations,
  rememberRecentDestination,
  type RecentPlace,
} from '../../lib/recentDestinations';
import { EnquiryDestinationSuggestions } from '../inquiries/EnquiryDestinationSuggestions';

export {
  classifyDestinationSuggestion,
  resolveDestinationSuggestion,
} from '../../lib/resolveDestinationSuggestion';
import { resolveDestinationSuggestion } from '../../lib/resolveDestinationSuggestion';

export type PlaceKnowledgeRow = {
  id: string;
  season: string;
  kind: string;
  title?: string | null;
  body: string;
  meta?: unknown;
};

export type PlaceApiItem = {
  id: string;
  name: string;
  kind: string;
  breadcrumbLabel?: string;
  country?: string;
  region?: string | null;
  isSystem?: boolean;
  salesDescription?: string;
  matchType?: string;
  profile?: PlaceProfile | null;
  parent?: { id: string; name: string; kind: string } | null;
  children?: Array<{ id: string; name: string; kind: string }>;
  knowledge?: PlaceKnowledgeRow[];
};

function placeToOption(p: PlaceApiItem): ComboboxOption {
  return {
    value: p.id,
    label: p.name,
    description:
      p.salesDescription ||
      salesPlaceSecondaryLabel({
        name: p.name,
        kind: p.kind,
        country: p.country,
        region: p.region,
        parent: p.parent,
        profile: p.profile,
      }),
  };
}

/** Catalog / admin description (may include richer metadata). Prefer sales rows for pickers. */
function placeOptionDescription(p: PlaceApiItem): string {
  if (p.salesDescription) return p.salesDescription;
  return salesPlaceSecondaryLabel({
    name: p.name,
    kind: p.kind,
    country: p.country,
    region: p.region,
    parent: p.parent,
    profile: p.profile,
  });
}

async function searchPlaces(
  q: string,
  opts?: {
    domesticOrIntl?: string;
    kind?: string;
    kinds?: PlaceKind[];
    purpose?: PlaceSearchPurpose;
    parentId?: string;
    limit?: number;
  },
): Promise<{ items: PlaceApiItem[]; suggestions: PlaceApiItem[] }> {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (opts?.domesticOrIntl) params.set('domesticOrIntl', opts.domesticOrIntl);
  if (opts?.purpose) params.set('purpose', opts.purpose);
  if (opts?.kinds?.length) params.set('kinds', opts.kinds.join(','));
  else if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.parentId) params.set('parentId', opts.parentId);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  else if (opts?.purpose) params.set('limit', '40');
  const res = await api<{ items: PlaceApiItem[]; suggestions?: PlaceApiItem[] }>(
    `/places?${params.toString()}`,
  );
  return { items: res.items || [], suggestions: res.suggestions || [] };
}

async function searchPlacesAsOptions(
  q: string,
  opts?: {
    domesticOrIntl?: string;
    kind?: string;
    kinds?: PlaceKind[];
    purpose?: PlaceSearchPurpose;
    parentId?: string;
    limit?: number;
  },
): Promise<{ options: ComboboxOption[]; emptySuggestions?: ComboboxOption[] }> {
  const { items, suggestions } = await searchPlaces(q, opts);
  return {
    options: items.map(placeToOption),
    ...(items.length === 0 && suggestions.length > 0
      ? { emptySuggestions: suggestions.map(placeToOption) }
      : {}),
  };
}

async function searchLandmarksAndCities(
  q: string,
  opts?: { parentId?: string },
): Promise<{ options: ComboboxOption[]; emptySuggestions?: ComboboxOption[] }> {
  const base = { parentId: opts?.parentId, purpose: 'all' as const, limit: 50 };
  const [landmarks, cities, airports, stations] = await Promise.all([
    searchPlacesAsOptions(q, { ...base, kind: 'landmark' }),
    searchPlacesAsOptions(q, { ...base, kind: 'city' }),
    searchPlacesAsOptions(q, { ...base, kind: 'airport' }),
    searchPlacesAsOptions(q, { ...base, kind: 'railway_station' }),
  ]);
  const seen = new Set<string>();
  const merged: ComboboxOption[] = [];
  for (const opt of [
    ...landmarks.options,
    ...airports.options,
    ...stations.options,
    ...cities.options,
  ]) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    merged.push(opt);
  }
  if (merged.length > 0) {
    return { options: merged.slice(0, 50) };
  }
  const sugSeen = new Set<string>();
  const emptySuggestions: ComboboxOption[] = [];
  for (const opt of [
    ...(landmarks.emptySuggestions || []),
    ...(cities.emptySuggestions || []),
    ...(airports.emptySuggestions || []),
    ...(stations.emptySuggestions || []),
  ]) {
    if (sugSeen.has(opt.value)) continue;
    sugSeen.add(opt.value);
    emptySuggestions.push(opt);
    if (emptySuggestions.length >= 3) break;
  }
  return { options: [], ...(emptySuggestions.length ? { emptySuggestions } : {}) };
}

export async function loadPlace(id: string): Promise<PlaceApiItem> {
  return api<PlaceApiItem>(`/places/${id}`);
}

function DestinationTabBar({
  tab,
  onChange,
}: {
  tab: PlaceSearchTab;
  onChange: (tab: PlaceSearchTab) => void;
}) {
  const tabs: Array<{ id: PlaceSearchTab; label: string }> = [
    { id: 'destinations', label: 'Destinations' },
    { id: 'transport', label: 'Airports & stations' },
    { id: 'all', label: 'All' },
  ];
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Place search category">
      {tabs.map((t) => (
        <Button
          key={t.id}
          type="button"
          size="xs"
          variant={tab === t.id ? 'default' : 'outline'}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

export function PlaceSinglePicker({
  label,
  value,
  onChange,
  placeholder,
  domesticOrIntl,
  kind,
  purpose,
  onCreateNew,
  required,
  error,
  size = 'default',
}: {
  label: string;
  value?: PlaceRef | string | null;
  onChange: (value: PlaceRef | null) => void;
  placeholder?: string;
  domesticOrIntl?: string;
  kind?: string;
  purpose?: PlaceSearchPurpose;
  onCreateNew?: (q: string) => void;
  required?: boolean;
  error?: string;
  size?: 'default' | 'sm';
}) {
  const { me } = useAuth();
  const orgId = me?.organization?.id;
  const ref = toPlaceRef(value);
  const onSearch = useCallback(
    (q: string) =>
      searchPlacesAsOptions(q, {
        domesticOrIntl,
        kind,
        ...(purpose ? { purpose, limit: 40 } : {}),
      }),
    [domesticOrIntl, kind, purpose],
  );

  return (
    <FormField label={label} required={required} error={error}>
      <EntityCombobox
        size={size}
        value={ref?.placeId || ''}
        selectedLabel={ref?.name || undefined}
        onChange={(id, option) => {
          if (!id) {
            onChange(null);
            return;
          }
          const next = {
            placeId: id,
            name: option?.label || ref?.name || id,
          };
          onChange(next);
          if (purpose === 'destination' || purpose === 'origin') {
            rememberRecentDestination(orgId, {
              id,
              name: next.name,
              kind: kind || 'city',
              salesDescription: option?.description,
            });
          }
        }}
        onSearch={onSearch}
        placeholder={
          placeholder ||
          (purpose === 'origin'
            ? 'Search city, airport or station…'
            : 'Search places…')
        }
        emptyText="No places match — add one for your agency."
        createNewLabel="Add place"
        onCreateNew={onCreateNew}
        clearable
      />
    </FormField>
  );
}

/** Destination-guide picker — landmarks, cities, airports, and railway stations. */
export function CatalogLandmarkPicker({
  label = 'Search destination guide',
  placeholder = 'Landmark, airport, station, or city…',
  cityPlaceId,
  onPick,
}: {
  label?: string;
  placeholder?: string;
  cityPlaceId?: string;
  onPick: (place: PlaceApiItem) => void;
}) {
  const onSearch = useCallback(
    (q: string) => searchLandmarksAndCities(q, { parentId: cityPlaceId }),
    [cityPlaceId],
  );

  return (
    <FormField label={label}>
      <EntityCombobox
        value=""
        onChange={(id) => {
          if (!id) return;
          void (async () => {
            try {
              const place = await loadPlace(id);
              onPick(place);
            } catch (e) {
              toastError(e instanceof Error ? e.message : 'Could not load place');
            }
          })();
        }}
        onSearch={onSearch}
        placeholder={placeholder}
        emptyText="No places match the destination guide."
        clearable={false}
      />
    </FormField>
  );
}

export function PlaceMultiPicker({
  label,
  value,
  onChange,
  placeholder,
  domesticOrIntl,
  purpose = 'destination',
  onCreateNew,
  required,
  error,
  allowExpandRegions = true,
  size = 'default',
  showSuggestions = false,
  leadSuggestionNames = [],
  enquirySuggestions = [],
  enquiryDestinationText,
  searchSeed,
  onSearchSeedConsumed,
}: {
  label: string;
  value: PlaceRef[];
  onChange: (value: PlaceRef[]) => void;
  placeholder?: string;
  domesticOrIntl?: string;
  purpose?: PlaceSearchPurpose;
  onCreateNew?: (q: string) => void;
  required?: boolean;
  error?: string;
  allowExpandRegions?: boolean;
  size?: 'default' | 'sm';
  showSuggestions?: boolean;
  /** @deprecated Prefer enquirySuggestions — free-text names from lead tags only. */
  leadSuggestionNames?: string[];
  /** Merged visitor-text + tag suggestions with provenance. */
  enquirySuggestions?: EnquiryDestinationSuggestion[];
  /** Immutable original visitor destination free-text (audit / display). */
  enquiryDestinationText?: string | null;
  /** Prefill the combobox query (ambiguous / unresolved Search Places). */
  searchSeed?: string | null;
  onSearchSeedConsumed?: () => void;
}) {
  const { me } = useAuth();
  const orgId = me?.organization?.id;
  const [expanding, setExpanding] = useState(false);
  const [tab, setTab] = useState<PlaceSearchTab>('destinations');
  const [recent, setRecent] = useState<RecentPlace[]>(() => readRecentDestinations(orgId));
  const [transportCue, setTransportCue] = useState<ComboboxOption[]>([]);
  const [hintQuery, setHintQuery] = useState<string | null>(null);
  const showTabs = purpose === 'destination';

  const mergedEnquirySuggestions = useMemo((): EnquiryDestinationSuggestion[] => {
    if (enquirySuggestions.length) return enquirySuggestions;
    return leadSuggestionNames.map((name) => ({
      name,
      sources: ['lead_tag' as const],
    }));
  }, [enquirySuggestions, leadSuggestionNames.join('\u0001')]);

  // Refresh recent when org changes
  useEffect(() => {
    setRecent(readRecentDestinations(orgId));
  }, [orgId]);

  useEffect(() => {
    if (searchSeed?.trim()) {
      setHintQuery(searchSeed.trim());
      onSearchSeedConsumed?.();
    }
  }, [searchSeed]);

  const tabKinds = useMemo((): PlaceKind[] | undefined => {
    if (!showTabs) return undefined;
    return PURPOSE_CONFIG.destination.tabs?.[tab];
  }, [showTabs, tab]);

  const onSearch = useCallback(
    async (q: string) => {
      setTransportCue([]);
      const trimmed = q.trim();
      // All / purpose: require query (API also returns empty)
      if (!trimmed && (tab === 'all' || purpose)) {
        return { options: [] };
      }

      const primary = await searchPlaces(trimmed, {
        domesticOrIntl,
        purpose,
        kinds: tabKinds,
        limit: 40,
      });
      let options = primary.items.map(placeToOption);

      // Destinations tab + transport code: surface cue without switching tab
      if (
        showTabs &&
        tab === 'destinations' &&
        looksLikeTransportCode(trimmed) &&
        primary.items.length === 0
      ) {
        const transport = await searchPlaces(trimmed, {
          domesticOrIntl,
          purpose: 'destination',
          kinds: PURPOSE_CONFIG.destination.tabs?.transport,
          limit: 10,
        });
        const cue = transport.items.map(placeToOption);
        setTransportCue(cue);
        if (cue.length) {
          options = [
            {
              value: '__transport_header__',
              label: 'Airport & station matches',
              description: 'Transport points — not switched from Destinations',
            },
            ...cue.map((c) => ({
              ...c,
              description: c.description,
            })),
            {
              value: '__view_transport__',
              label: 'View all transport results',
              description: 'Switch to Airports & stations tab',
            },
          ];
        }
      }

      const filtered = options.filter((o) => !value.some((v) => v.placeId === o.value));
      if (filtered.length > 0) return { options: filtered };

      const emptySuggestions = (primary.suggestions || [])
        .map(placeToOption)
        .filter((o) => !value.some((v) => v.placeId === o.value))
        .slice(0, 3);

      return {
        options: [],
        ...(emptySuggestions.length ? { emptySuggestions } : {}),
      };
    },
    [domesticOrIntl, purpose, tab, tabKinds, showTabs, value],
  );

  const values = value.map((v) => v.placeId || placeRefKey(v));
  const selectedLabels = Object.fromEntries(
    value.map((v) => [v.placeId || placeRefKey(v), v.name]),
  );

  function applySelection(next: PlaceRef[]) {
    onChange(next);
    setRecent(readRecentDestinations(orgId));
  }

  async function expandRegionCities() {
    const candidates = value.filter((v) => v.placeId);
    if (!candidates.length) {
      toastError('Select a region or state from the catalog first');
      return;
    }
    setExpanding(true);
    try {
      const next = [...value];
      const keys = new Set(next.map(placeRefKey));
      let added = 0;
      for (const region of candidates) {
        if (!region.placeId) continue;
        const detail = await loadPlace(region.placeId);
        if (!['region', 'state', 'country'].includes(detail.kind)) continue;
        const res = await api<{ items: PlaceApiItem[] }>(
          `/places?parentId=${encodeURIComponent(region.placeId)}&includeDescendants=1`,
        );
        for (const child of res.items) {
          if (child.kind !== 'city' && child.kind !== 'area') continue;
          const ref: PlaceRef = {
            placeId: child.id,
            name: child.name,
            kind: child.kind,
          };
          if (!keys.has(placeRefKey(ref))) {
            keys.add(placeRefKey(ref));
            next.push(ref);
            added += 1;
          }
        }
      }
      applySelection(next);
      toastSuccess(added ? `Added ${added} cities` : 'No child cities found');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not expand region');
    } finally {
      setExpanding(false);
    }
  }

  function addRecent(place: RecentPlace) {
    if (value.some((v) => v.placeId === place.id)) return;
    void (async () => {
      try {
        const detail = await loadPlace(place.id);
        rememberRecentDestination(orgId, {
          id: detail.id,
          name: detail.name,
          kind: detail.kind,
          country: detail.country,
          region: detail.region,
          parent: detail.parent,
          profile: detail.profile,
          salesDescription: detail.salesDescription,
        });
        applySelection([
          ...value,
          { placeId: detail.id, name: detail.name, kind: detail.kind },
        ]);
      } catch {
        dropRecentDestination(orgId, place.id);
        setRecent(readRecentDestinations(orgId));
        toastError('That place is no longer available');
      }
    })();
  }

  return (
    <FormField label={label} required={required} error={error}>
      {showSuggestions ? (
        <div className="mb-2 space-y-2">
          {enquiryDestinationText?.trim() ? (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="enquiry-destination-text"
            >
              Visitor entered: “{enquiryDestinationText.trim()}”
            </p>
          ) : null}
          {mergedEnquirySuggestions.length > 0 ? (
            <EnquiryDestinationSuggestions
              suggestions={mergedEnquirySuggestions.slice(0, 8)}
              selected={value}
              domesticOrIntl={domesticOrIntl}
              onAdd={(ref) => {
                if (value.some((v) => v.placeId === ref.placeId)) return;
                if (ref.placeId) {
                  rememberRecentDestination(orgId, {
                    id: ref.placeId,
                    name: ref.name,
                    kind: ref.kind,
                  });
                }
                applySelection([...value, ref]);
              }}
              onSearchHint={(visitorName) => setHintQuery(visitorName)}
            />
          ) : null}
          {recent.length > 0 && value.length === 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Recently used</span>
              {recent.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => addRecent(p)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <MultiEntityCombobox
        size={size}
        values={values}
        selectedLabels={selectedLabels}
        clearQueryOnSelect
        listMaxHeightClassName="max-h-[min(22rem,50vh)]"
        header={
          showTabs ? <DestinationTabBar tab={tab} onChange={setTab} /> : undefined
        }
        onChange={(next) => {
          const prevByKey = new Map(value.map((v) => [v.placeId || placeRefKey(v), v]));
          const mapped: PlaceRef[] = [];
          for (const n of next) {
            if (n.value === '__view_transport__') {
              setTab('transport');
              continue;
            }
            if (n.value === '__transport_header__') continue;
            const prev = prevByKey.get(n.value);
            if (prev) {
              mapped.push(prev);
              continue;
            }
            const cue = transportCue.find((c) => c.value === n.value);
            mapped.push({
              placeId: n.value,
              name: n.label || placeName(n.value),
            });
            rememberRecentDestination(orgId, {
              id: n.value,
              name: n.label || placeName(n.value),
              kind: 'city',
              salesDescription: cue?.description || n.label,
            });
          }
          applySelection(mapped);
        }}
        onSearch={onSearch}
        placeholder={
          hintQuery
            ? `Search for “${hintQuery}”…`
            : placeholder ||
              (purpose === 'intermediate_stop'
                ? 'Search cities or regions…'
                : 'Search city, region, state or country…')
        }
        emptyText={
          tab === 'all'
            ? 'Type to search all places…'
            : 'No places match — add one for your agency.'
        }
        createNewLabel="Add place"
        onCreateNew={onCreateNew}
      />
      {allowExpandRegions ? (
        <div className="mt-2">
          <Button
            type="button"
            size={size === 'sm' ? 'xs' : 'sm'}
            variant="secondary"
            disabled={expanding || value.length === 0}
            onClick={() => void expandRegionCities()}
          >
            {expanding ? 'Expanding…' : 'Add cities from selected regions'}
          </Button>
        </div>
      ) : null}
    </FormField>
  );
}

// Keep catalog helpers available for PlacesPage if needed
void placeOptionDescription;
