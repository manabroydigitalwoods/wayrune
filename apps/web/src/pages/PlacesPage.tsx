import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import {
  Building2,
  ClipboardList,
  FolderTree,
  Globe2,
  Landmark,
  Map,
  MapPin,
  Plane,
  Search,
  Tags,
  TrainFront,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  Combobox,
  DataTable,
  Input,
  RecordDialog,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  SuggestionChips,
  cn,
  localStorageKit,
  toastError,
  toastSuccess,
  usePageChrome,
  Card,
  CardContent,
  Skeleton,
  type ComboboxOption,
} from '@wayrune/ui';
import { CreatePlaceSchema, parseWithFieldErrors } from '@wayrune/contracts';
import { api } from '../api';
import { reportError } from '../lib/errors';
import type { PlaceProfile } from '../lib/placeSnapshot';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  parsePlacesQueryState,
  patchPlacesQueryParams,
  placesQueryHasFilters,
  type PlacesView,
} from '../lib/queue';
import {
  ActiveFilterChips,
  DisplayMenu,
  FilterMenu,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';

type PlaceRow = {
  id: string;
  name: string;
  key: string;
  kind: string;
  country: string;
  breadcrumbLabel?: string;
  domesticOrIntl: string;
  isSystem: boolean;
  parentId?: string | null;
  profile?: PlaceProfile | null;
};

type CategoryRow = {
  id: string;
  name: string;
  key: string;
  subcategories: Array<{ id: string; name: string; key: string }>;
};

type ContributionRow = {
  id: string;
  kind: string;
  status: string;
  placeId?: string | null;
  payloadJson: {
    name?: string;
    kind?: string;
    country?: string;
    description?: string;
    [key: string]: unknown;
  };
  createdAt: string;
};

const PLACE_KINDS = [
  'country',
  'region',
  'state',
  'city',
  'area',
  'landmark',
  'airport',
  'railway_station',
] as const;

const PLACE_KIND_ICONS: Record<string, LucideIcon> = {
  country: Globe2,
  region: Map,
  state: Map,
  city: Building2,
  area: MapPin,
  landmark: Landmark,
  airport: Plane,
  railway_station: TrainFront,
};

const PLACE_KIND_LABELS: Record<(typeof PLACE_KINDS)[number], string> = {
  country: 'Country',
  region: 'Region',
  state: 'State',
  city: 'City',
  area: 'Area',
  landmark: 'Landmark',
  airport: 'Airport',
  railway_station: 'Railway station',
};

const ADD_PLACE_KIND_OPTIONS = (
  ['city', 'region', 'state', 'area', 'landmark', 'airport', 'railway_station'] as const
).map((k) => ({ value: k, label: PLACE_KIND_LABELS[k] }));

function readPlacesColumnVisibility(): VisibilityState {
  const stored = localStorageKit.getJson<VisibilityState>(StorageKeys.places.columns, {
    version: 1,
  });
  if (!stored || typeof stored !== 'object') return {};
  return stored;
}

function formatDurationMin(min?: number): string | null {
  if (min == null || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function placeProfileHint(profile?: PlaceProfile | null): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.iataCode) parts.push(profile.iataCode);
  if (profile.stationCode) parts.push(profile.stationCode);
  if (profile.shortName?.trim()) parts.push(profile.shortName.trim());
  if (profile.officialName?.trim()) parts.push(profile.officialName.trim());
  const duration = formatDurationMin(profile.durationMin);
  if (duration) parts.push(duration);
  if (profile.bestTime?.trim()) parts.push(profile.bestTime.trim());
  return parts.length ? parts.join(' · ') : null;
}

export function PlacesPage() {
  useDocumentTitle('Destinations');
  usePageChrome({
    title: 'Destinations',
    subtitle:
      'Geographic catalog with regions, cities, airports, railway stations, and landmarks for multi-city trips.',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parsePlacesQueryState(searchParams), [searchParams]);
  const view = query.view;
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    readPlacesColumnVisibility(),
  );
  const [items, setItems] = useState<PlaceRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestForm, setSuggestForm] = useState({
    name: '',
    kind: 'landmark',
    country: 'India',
    description: '',
  });
  const [form, setForm] = useState({
    name: '',
    kind: 'city',
    parentId: '',
    country: 'India',
    domesticOrIntl: 'domestic',
  });

  function applyQuery(patch: Parameters<typeof patchPlacesQueryParams>[1]) {
    setSearchParams(patchPlacesQueryParams(searchParams, patch), { replace: true });
  }

  const setView = useCallback(
    (next: PlacesView) => {
      setSearchParams(patchPlacesQueryParams(searchParams, { view: next }), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((query.q ?? '') === next) return;
      applyQuery({ q: next || undefined });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce draft only
  }, [searchDraft]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.kind) params.set('kind', query.kind);
      if (query.parentId) params.set('parentId', query.parentId);
      if (query.categoryId) params.set('categoryId', query.categoryId);
      const [places, cats] = await Promise.all([
        api<{ items: PlaceRow[] }>(`/places?${params.toString()}`),
        api<{ items: CategoryRow[] }>('/places/categories'),
      ]);
      setItems(places.items);
      setCategories(cats.items);
    } catch (e) {
      reportError(e, 'Could not load places');
    } finally {
      setLoading(false);
    }
  }, [query.q, query.kind, query.parentId, query.categoryId]);

  const loadContributions = useCallback(async () => {
    setContributionsLoading(true);
    try {
      const res = await api<{ items: ContributionRow[] }>(
        '/places/contributions?status=pending',
      );
      setContributions(res.items || []);
    } catch (e) {
      setContributions([]);
      reportError(e, 'Could not load contributions');
    } finally {
      setContributionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view === 'contributions') void loadContributions();
  }, [view, loadContributions]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const parsed = parseWithFieldErrors(CreatePlaceSchema, {
      ...form,
      parentId: form.parentId || null,
    });
    if (!parsed.ok) {
      toastError(Object.values(parsed.errors)[0] || 'Fix the form');
      return;
    }
    setSaving(true);
    try {
      await api('/places', { method: 'POST', body: JSON.stringify(parsed.data) });
      toastSuccess('Place created');
      setForm({
        name: '',
        kind: 'city',
        parentId: '',
        country: 'India',
        domesticOrIntl: 'domestic',
      });
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not create place');
    } finally {
      setSaving(false);
    }
  }

  async function submitSuggestion() {
    if (!suggestForm.name.trim()) {
      toastError('Enter a place name');
      return;
    }
    setSuggestSubmitting(true);
    try {
      await api('/places/contributions', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'create',
          payloadJson: {
            name: suggestForm.name.trim(),
            kind: suggestForm.kind,
            country: suggestForm.country.trim() || 'India',
            description: suggestForm.description.trim() || undefined,
          },
        }),
      });
      toastSuccess('Suggestion submitted for review');
      setSuggestOpen(false);
      setSuggestForm({ name: '', kind: 'landmark', country: 'India', description: '' });
      if (view === 'contributions') await loadContributions();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not submit suggestion');
    } finally {
      setSuggestSubmitting(false);
    }
  }

  function toggleColumn(id: string, visible: boolean) {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.places.columns, next, { version: 1 });
      return next;
    });
  }

  function clearPlacesFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearPlacesFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const parentOptions = useMemo(
    () => items.filter((p) => ['country', 'region', 'state', 'city'].includes(p.kind)),
    [items],
  );

  const parentFormOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'None', icon: FolderTree },
      ...parentOptions.map((p) => ({
        value: p.id,
        label: p.breadcrumbLabel || p.name,
        icon: PLACE_KIND_ICONS[p.kind] || MapPin,
      })),
    ],
    [parentOptions],
  );

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name, icon: Tags })),
    [categories],
  );

  const columns = useMemo<ColumnDef<PlaceRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        meta: { label: 'Name' },
        enableHiding: false,
        size: 240,
        minSize: 180,
        accessorFn: (r) => r.name,
        cell: ({ row }) => {
          const p = row.original;
          const thumb = p.profile?.imageUrls?.[0];
          return (
            <div className="flex min-w-0 items-center gap-2">
              {thumb ? (
                <img src={thumb} alt="" className="size-7 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <MapPin className="size-3.5" />
                </div>
              )}
              <span className="truncate font-medium">{p.name}</span>
              {p.isSystem ? null : (
                <span className="shrink-0 text-[11px] text-muted-foreground">Agency</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'kind',
        accessorFn: (r) => r.kind,
        header: 'Kind',
        meta: { label: 'Kind' },
        size: 150,
        minSize: 120,
        cell: ({ row }) => (
          <StatusBadge value={row.original.kind} label={row.original.kind} showIcon={false} />
        ),
      },
      {
        id: 'location',
        accessorFn: (r) => r.breadcrumbLabel || r.country,
        header: 'Location',
        meta: { label: 'Location' },
        size: 220,
        minSize: 140,
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.breadcrumbLabel || row.original.country}
          </span>
        ),
      },
      {
        id: 'details',
        accessorFn: (r) => placeProfileHint(r.profile) || '',
        header: 'Details',
        meta: { label: 'Details' },
        size: 220,
        minSize: 140,
        cell: ({ row }) => {
          const hint = placeProfileHint(row.original.profile);
          return <span className="truncate text-muted-foreground">{hint || '—'}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        size: 100,
        minSize: 90,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => applyQuery({ parentId: row.original.id })}
          >
            Children
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filterDefs = [
    {
      id: 'kind',
      label: 'Kind',
      icon: Tags,
      value: query.kind ?? null,
      options: PLACE_KINDS.map((k) => ({
        value: k,
        label: PLACE_KIND_LABELS[k],
        icon: PLACE_KIND_ICONS[k],
      })),
      onSelect: (value: string | null) => applyQuery({ kind: value || undefined }),
    },
    {
      id: 'parentId',
      label: 'Parent',
      icon: FolderTree,
      value: query.parentId ?? null,
      options: parentOptions.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.kind})`,
        icon: PLACE_KIND_ICONS[p.kind] || MapPin,
      })),
      onSelect: (value: string | null) => applyQuery({ parentId: value || undefined }),
    },
    ...(categories.length
      ? [
          {
            id: 'categoryId',
            label: 'Category',
            icon: Tags,
            value: query.categoryId ?? null,
            options: categoryOptions,
            onSelect: (value: string | null) => applyQuery({ categoryId: value || undefined }),
          },
        ]
      : []),
  ];

  const parentLabel = (id?: string) =>
    parentOptions.find((p) => p.id === id)?.name || 'Parent';
  const categoryLabel = (id?: string) =>
    categories.find((c) => c.id === id)?.name || 'Category';

  const filterChips = [
    query.kind
      ? {
          id: 'kind',
          label: `Kind: ${PLACE_KIND_LABELS[query.kind as (typeof PLACE_KINDS)[number]] || query.kind}`,
          onRemove: () => applyQuery({ kind: undefined }),
        }
      : null,
    query.parentId
      ? {
          id: 'parentId',
          label: `Parent: ${parentLabel(query.parentId)}`,
          onRemove: () => applyQuery({ parentId: undefined }),
        }
      : null,
    query.categoryId
      ? {
          id: 'categoryId',
          label: `Category: ${categoryLabel(query.categoryId)}`,
          onRemove: () => applyQuery({ categoryId: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const displayColumns = [
    { id: 'kind', label: 'Kind', visible: columnVisibility.kind !== false, icon: Tags },
    { id: 'location', label: 'Location', visible: columnVisibility.location !== false },
    { id: 'details', label: 'Details', visible: columnVisibility.details !== false },
  ];

  const hasExtraFilters = placesQueryHasFilters(query) || Boolean(query.q);

  const queueToolbar =
    view === 'catalog' ? (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search destinations…"
            className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
            aria-label="Search destinations"
          />
          {searchDraft.trim() ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
              onClick={() => {
                setSearchDraft('');
                applyQuery({ q: '' });
              }}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <FilterMenu filters={filterDefs} />
          <DisplayMenu columns={displayColumns} onToggleColumn={toggleColumn} />
        </div>
      </div>
    ) : null;

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={view}
          onChange={(id) => setView(id as PlacesView)}
          options={[
            { id: 'catalog', label: 'Catalog', icon: <Map className="size-[0.875em]" /> },
            {
              id: 'contributions',
              label: 'Contributions',
              icon: <ClipboardList className="size-[0.875em]" />,
            },
          ]}
        />
      }
      primaryActions={
        <Button variant="outline" size="sm" onClick={() => setSuggestOpen(true)}>
          Suggest place
        </Button>
      }
      toolbar={queueToolbar}
      chips={
        view === 'catalog' ? (
          <ActiveFilterChips
            chips={filterChips}
            onClear={placesQueryHasFilters(query) ? clearPlacesFilters : undefined}
          />
        ) : null
      }
    >
      {view === 'catalog' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <DataTable
            key={`cols-${JSON.stringify(columnVisibility)}`}
            columns={columns}
            data={items}
            loading={loading}
            pageSize={25}
            showSearch={false}
            showColumnsMenu={false}
            defaultColumnVisibility={columnVisibility}
            columnVisibilityKey={StorageKeys.places.columns}
            emptyTitle={hasExtraFilters ? 'No matching destinations' : 'No destinations yet'}
            emptyDescription={
              hasExtraFilters
                ? 'Try clearing filters or search.'
                : 'Create a destination with the form on the right.'
            }
            emptyIcon={MapPin}
            emptyAction={
              hasExtraFilters ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearPlacesFiltersAndSearch}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />

          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">Add place</h3>
              <form onSubmit={onCreate} className="space-y-3">
                <FormField label="Name" required>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Kind">
                  <SuggestionChips
                    allowDeselect={false}
                    options={ADD_PLACE_KIND_OPTIONS}
                    value={form.kind}
                    onChange={(kind) => setForm({ ...form, kind })}
                  />
                </FormField>
                <FormField label="Parent">
                  <Combobox
                    options={parentFormOptions}
                    value={form.parentId}
                    onChange={(parentId) => setForm({ ...form, parentId })}
                    searchable
                    searchPlaceholder="Search parent…"
                  />
                </FormField>
                <FormField label="Country">
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </FormField>
                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? 'Saving…' : 'Create place'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {contributionsLoading ? (
              <div className="space-y-2 p-4" role="status" aria-busy="true">
                <span className="sr-only">Loading</span>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : contributions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No pending contributions. Use &ldquo;Suggest place&rdquo; to propose a new catalog
                entry.
              </p>
            ) : (
              <ul className="divide-y">
                {contributions.map((c) => {
                  const payload = c.payloadJson || {};
                  const label = payload.name || c.placeId || 'Untitled';
                  return (
                    <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{label}</span>
                          <StatusBadge value={c.kind} label={c.kind} />
                          {payload.kind ? (
                            <StatusBadge value={String(payload.kind)} label={String(payload.kind)} />
                          ) : null}
                        </div>
                        {payload.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {String(payload.description)}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()} · awaiting Travel OS review
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <RecordDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        title="Suggest place"
        description="Propose a place for the shared destination guide. The Travel OS platform team reviews suggestions."
        submitLabel="Submit"
        submitting={suggestSubmitting}
        onSubmit={() => void submitSuggestion()}
      >
        <FormField label="Name" required>
          <Input
            value={suggestForm.name}
            onChange={(e) => setSuggestForm({ ...suggestForm, name: e.target.value })}
            placeholder="e.g. Tiger Hill"
            required
          />
        </FormField>
        <FormField label="Kind">
          <SuggestionChips
            allowDeselect={false}
            options={[
              { value: 'landmark', label: 'Landmark' },
              { value: 'city', label: 'City' },
              { value: 'airport', label: 'Airport' },
              { value: 'railway_station', label: 'Railway station' },
              { value: 'area', label: 'Area' },
            ]}
            value={suggestForm.kind}
            onChange={(kind) => setSuggestForm({ ...suggestForm, kind })}
          />
        </FormField>
        <FormField label="Country">
          <Input
            value={suggestForm.country}
            onChange={(e) => setSuggestForm({ ...suggestForm, country: e.target.value })}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            className="flex min-h-[72px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={suggestForm.description}
            onChange={(e) => setSuggestForm({ ...suggestForm, description: e.target.value })}
            placeholder="Why travellers visit, best time, tips…"
          />
        </FormField>
      </RecordDialog>
    </QueuePageChrome>
  );
}
