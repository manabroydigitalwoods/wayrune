import { useCallback, useState } from 'react';
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
import type { PlaceProfile } from '../../lib/placeSnapshot';
import {
  placeName,
  placeRefKey,
  toPlaceRef,
  type PlaceRef,
} from '../../lib/placeRefs';

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
  isSystem?: boolean;
  profile?: PlaceProfile | null;
  children?: Array<{ id: string; name: string; kind: string }>;
  knowledge?: PlaceKnowledgeRow[];
};

function formatDurationMin(min?: number): string | null {
  if (min == null || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function placeOptionDescription(p: PlaceApiItem): string {
  const parts: string[] = [];
  const profile = p.profile;
  if (profile?.shortName?.trim()) parts.push(profile.shortName.trim());
  if (profile?.iataCode) parts.push(profile.iataCode);
  if (profile?.stationCode) parts.push(profile.stationCode);
  if (profile?.officialName?.trim() && profile.officialName !== p.name) {
    parts.push(profile.officialName.trim());
  }
  if (profile?.imageUrls?.[0]) parts.push('Photo');
  const duration = formatDurationMin(profile?.durationMin);
  if (duration) parts.push(duration);
  if (profile?.bestTime?.trim()) parts.push(profile.bestTime.trim());
  const meta = [p.breadcrumbLabel || p.kind, p.country, p.isSystem ? 'System' : 'Agency']
    .filter(Boolean)
    .join(' · ');
  if (meta) parts.push(meta);
  return parts.join(' · ');
}

async function searchPlaces(
  q: string,
  opts?: { domesticOrIntl?: string; kind?: string; parentId?: string },
): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (opts?.domesticOrIntl) params.set('domesticOrIntl', opts.domesticOrIntl);
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.parentId) params.set('parentId', opts.parentId);
  const res = await api<{ items: PlaceApiItem[] }>(`/places?${params.toString()}`);
  return res.items.map((p) => ({
    value: p.id,
    label: p.name,
    description: placeOptionDescription(p),
  }));
}

async function searchLandmarksAndCities(
  q: string,
  opts?: { parentId?: string },
): Promise<ComboboxOption[]> {
  const base = { parentId: opts?.parentId };
  const [landmarks, cities, airports, stations] = await Promise.all([
    searchPlaces(q, { ...base, kind: 'landmark' }),
    searchPlaces(q, { ...base, kind: 'city' }),
    searchPlaces(q, { ...base, kind: 'airport' }),
    searchPlaces(q, { ...base, kind: 'railway_station' }),
  ]);
  const seen = new Set<string>();
  const merged: ComboboxOption[] = [];
  for (const opt of [...landmarks, ...airports, ...stations, ...cities]) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    merged.push(opt);
  }
  return merged.slice(0, 50);
}

export async function loadPlace(id: string): Promise<PlaceApiItem> {
  return api<PlaceApiItem>(`/places/${id}`);
}

export function PlaceSinglePicker({
  label,
  value,
  onChange,
  placeholder,
  domesticOrIntl,
  kind,
  onCreateNew,
  required,
  error,
}: {
  label: string;
  value?: PlaceRef | string | null;
  onChange: (value: PlaceRef | null) => void;
  placeholder?: string;
  domesticOrIntl?: string;
  kind?: string;
  onCreateNew?: (q: string) => void;
  required?: boolean;
  error?: string;
}) {
  const ref = toPlaceRef(value);
  const onSearch = useCallback(
    (q: string) => searchPlaces(q, { domesticOrIntl, kind }),
    [domesticOrIntl, kind],
  );

  return (
    <FormField label={label} required={required} error={error}>
      <EntityCombobox
        value={ref?.placeId || ''}
        selectedLabel={ref?.name || undefined}
        onChange={(id, option) => {
          if (!id) {
            onChange(null);
            return;
          }
          onChange({
            placeId: id,
            name: option?.label || ref?.name || id,
          });
        }}
        onSearch={onSearch}
        placeholder={placeholder || 'Search places…'}
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
  /** Optional parent city/region to scope results. */
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
  onCreateNew,
  required,
  error,
  allowExpandRegions = true,
}: {
  label: string;
  value: PlaceRef[];
  onChange: (value: PlaceRef[]) => void;
  placeholder?: string;
  domesticOrIntl?: string;
  onCreateNew?: (q: string) => void;
  required?: boolean;
  error?: string;
  allowExpandRegions?: boolean;
}) {
  const [expanding, setExpanding] = useState(false);
  const onSearch = useCallback(
    (q: string) => searchPlaces(q, { domesticOrIntl }),
    [domesticOrIntl],
  );

  const values = value.map((v) => v.placeId || placeRefKey(v));
  const selectedLabels = Object.fromEntries(
    value.map((v) => [v.placeId || placeRefKey(v), v.name]),
  );

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
      onChange(next);
      toastSuccess(added ? `Added ${added} cities` : 'No child cities found');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not expand region');
    } finally {
      setExpanding(false);
    }
  }

  return (
    <FormField label={label} required={required} error={error}>
      <MultiEntityCombobox
        values={values}
        selectedLabels={selectedLabels}
        onChange={(next) => {
          const prevByKey = new Map(value.map((v) => [v.placeId || placeRefKey(v), v]));
          onChange(
            next.map((n) => {
              const prev = prevByKey.get(n.value);
              if (prev) return prev;
              return { placeId: n.value, name: n.label || placeName(n.value) };
            }),
          );
        }}
        onSearch={onSearch}
        placeholder={placeholder || 'Search destinations…'}
        emptyText="No places match — add one for your agency."
        createNewLabel="Add place"
        onCreateNew={onCreateNew}
      />
      {allowExpandRegions ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
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
