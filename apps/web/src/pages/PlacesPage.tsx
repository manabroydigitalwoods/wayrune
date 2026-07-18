import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FolderTree,
  Globe2,
  Landmark,
  Map,
  MapPin,
  Plane,
  Tags,
  TrainFront,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  Input,
  PageHeader,
  RecordDialog,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@wayrune/ui';
import { CreatePlaceSchema, parseWithFieldErrors } from '@wayrune/contracts';
import { api } from '../api';
import { reportError } from '../lib/errors';
import type { PlaceProfile } from '../lib/placeSnapshot';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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

const PLACE_KIND_ICONS: Record<string, ComboboxOption['icon']> = {
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

const PLACE_KIND_FILTER_OPTIONS: ComboboxOption[] = [
  { value: '', label: 'All kinds', icon: Tags },
  ...PLACE_KINDS.map((k) => ({
    value: k,
    label: PLACE_KIND_LABELS[k],
    icon: PLACE_KIND_ICONS[k],
  })),
];

const ADD_PLACE_KIND_OPTIONS = (
  ['city', 'region', 'state', 'area', 'landmark', 'airport', 'railway_station'] as const
).map((k) => ({ value: k, label: PLACE_KIND_LABELS[k] }));

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
  useDocumentTitle('Places');
  const [section, setSection] = useState<'catalog' | 'contributions'>('catalog');
  const [items, setItems] = useState<PlaceRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [parentId, setParentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (kind) params.set('kind', kind);
      if (parentId) params.set('parentId', parentId);
      if (categoryId) params.set('categoryId', categoryId);
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
  }, [q, kind, parentId, categoryId]);

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
    if (section === 'contributions') void loadContributions();
  }, [section, loadContributions]);

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
      if (section === 'contributions') await loadContributions();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not submit suggestion');
    } finally {
      setSuggestSubmitting(false);
    }
  }

  const parentOptions = useMemo(
    () => items.filter((p) => ['country', 'region', 'state', 'city'].includes(p.kind)),
    [items],
  );

  const parentFilterOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Any parent', icon: FolderTree },
      ...parentOptions.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.kind})`,
        icon: PLACE_KIND_ICONS[p.kind] || MapPin,
      })),
    ],
    [parentOptions],
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

  const categoryOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'All categories', icon: Tags },
      ...categories.map((c) => ({
        value: c.id,
        label: c.name,
        icon: Tags,
      })),
    ],
    [categories],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title="Places"
        subtitle="Geographic catalog with regions, cities, airports, railway stations, and landmarks for multi-city trips."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSuggestOpen(true)}>
              Suggest place
            </Button>
            <SuggestionChips
              aria-label="Places section"
              allowDeselect={false}
              options={[
                { value: 'catalog', label: 'Catalog' },
                { value: 'contributions', label: 'Contributions' },
              ]}
              value={section}
              onChange={(v) => setSection(v as 'catalog' | 'contributions')}
            />
          </div>
        }
      />

      {section === 'catalog' ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Search">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name…" />
                </FormField>
                <FormField label="Kind">
                  <Combobox options={PLACE_KIND_FILTER_OPTIONS} value={kind} onChange={setKind} />
                </FormField>
                <FormField label="Parent">
                  <Combobox
                    options={parentFilterOptions}
                    value={parentId}
                    onChange={setParentId}
                    searchable
                    searchPlaceholder="Search parent…"
                  />
                </FormField>
                <FormField label="Category">
                  <Combobox
                    options={categoryOptions}
                    value={categoryId}
                    onChange={setCategoryId}
                    searchable={categories.length > 6}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No places match.</p>
                ) : (
                  <ul className="divide-y">
                    {items.map((p) => {
                      const thumb = p.profile?.imageUrls?.[0];
                      const hint = placeProfileHint(p.profile);
                      return (
                        <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 gap-3">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="size-12 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <MapPin className="size-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{p.name}</span>
                                <StatusBadge value={p.kind} label={p.kind} />
                                {p.isSystem ? (
                                  <span className="text-[11px] text-muted-foreground">System</span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">Agency</span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {p.breadcrumbLabel || p.country}
                              </p>
                              {hint ? (
                                <p className="mt-0.5 text-xs text-foreground/75">{hint}</p>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setParentId(p.id)}
                          >
                            Children
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

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
        </>
      ) : (
        <Card>
          <CardContent className="p-0">
            {contributionsLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading pending contributions…</p>
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
    </div>
  );
}
