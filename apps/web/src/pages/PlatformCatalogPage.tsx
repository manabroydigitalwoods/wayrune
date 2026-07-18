import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  Car,
  Check,
  FolderTree,
  Globe2,
  Inbox,
  Landmark,
  Map,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Tags,
  TrainFront,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  formatDateTime,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@wayrune/ui';
import {
  CreatePlaceSchema,
  CreateVehicleTypeSchema,
  UpdatePlaceSchema,
  parseWithFieldErrors,
} from '@wayrune/contracts';
import { api } from '../api';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import type { PlaceProfile } from '../lib/placeSnapshot';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  PlatformEdgesPanel,
  PlatformHotelRatesPanel,
  PlatformTransferFaresPanel,
} from '../components/platform/PlatformRatesPanels';

type PlaceRow = {
  id: string;
  name: string;
  key: string;
  kind: string;
  country: string;
  breadcrumbLabel?: string;
  domesticOrIntl: string;
  isSystem: boolean;
  isActive?: boolean;
  parentId?: string | null;
  profile?: PlaceProfile | null;
  subcategories?: Array<{ id: string; name: string; key: string }>;
};

type PlaceKnowledgeRow = {
  id: string;
  season: string;
  kind: string;
  title?: string | null;
  body: string;
};

type VehicleTypeRow = {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  seats?: number | null;
  isActive: boolean;
  profileJson?: {
    imageUrl?: string;
    imageUrls?: string[];
    suitabilityTags?: string[];
  } | null;
};

type ContributionRow = {
  id: string;
  kind: string;
  status: string;
  organizationId?: string;
  organization?: { id: string; name: string; slug: string } | null;
  placeId?: string | null;
  payloadJson: {
    name?: string;
    kind?: string;
    country?: string;
    description?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  reviewNote?: string | null;
};

type CatalogTab =
  | 'queue'
  | 'places'
  | 'vehicles'
  | 'fares'
  | 'hotels'
  | 'edges';
type ContribStatus = 'pending' | 'approved' | 'rejected';

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

const PARENT_KINDS = new Set(['country', 'region', 'state', 'city']);

const KNOWLEDGE_KINDS = ['weather', 'packing', 'tip', 'safety', 'season_rating'] as const;

const EMPTY_FORM = {
  name: '',
  kind: 'city',
  parentId: '',
  country: 'India',
  domesticOrIntl: 'domestic' as 'domestic' | 'international',
  isActive: true,
  subcategoryIds: [] as string[],
  code: '',
  description: '',
  imageUrls: '',
  bestTime: '',
  googleMapsUrl: '',
  latitude: '',
  longitude: '',
  googleRating: '',
  googleReviewCount: '',
  openingHours: '',
  durationMin: '',
  entryFee: '',
  suitabilityTags: '',
  reviewSnippet: '',
};

const EMPTY_VEHICLE_FORM = {
  name: '',
  description: '',
  seats: '',
  imageUrl: '',
};

const EMPTY_KNOWLEDGE_FORM = {
  season: 'all',
  kind: 'tip',
  title: '',
  body: '',
};

function tabFromSearch(raw: string | null): CatalogTab {
  if (raw === 'places') return 'places';
  if (raw === 'vehicles') return 'vehicles';
  if (raw === 'fares') return 'fares';
  if (raw === 'hotels') return 'hotels';
  if (raw === 'edges') return 'edges';
  return 'queue';
}

function codeFromProfile(kind: string, profile?: PlaceProfile | null) {
  if (!profile) return '';
  if (kind === 'airport') return profile.iataCode || profile.shortName || '';
  if (kind === 'railway_station') return profile.stationCode || profile.shortName || '';
  return profile.shortName || profile.iataCode || profile.stationCode || '';
}

function profileFromForm(form: typeof EMPTY_FORM) {
  const trimmed = form.code.trim().toUpperCase();
  const profile: PlaceProfile = {};
  if (form.description.trim()) profile.description = form.description.trim();
  profile.imageUrls = form.imageUrls
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (form.bestTime.trim()) profile.bestTime = form.bestTime.trim();
  if (form.googleMapsUrl.trim()) profile.googleMapsUrl = form.googleMapsUrl.trim();
  const lat = form.latitude.trim() ? Number(form.latitude) : undefined;
  const lng = form.longitude.trim() ? Number(form.longitude) : undefined;
  if (lat != null && Number.isFinite(lat)) profile.latitude = lat;
  if (lng != null && Number.isFinite(lng)) profile.longitude = lng;
  if (form.googleRating.trim()) {
    const rating = Number(form.googleRating);
    if (Number.isFinite(rating)) profile.googleRating = rating;
  }
  if (form.googleReviewCount.trim()) {
    const count = Number(form.googleReviewCount);
    if (Number.isFinite(count)) profile.googleReviewCount = Math.round(count);
  }
  if (form.openingHours.trim()) profile.openingHours = form.openingHours.trim();
  if (form.durationMin.trim()) {
    const mins = Number(form.durationMin);
    if (Number.isFinite(mins)) profile.durationMin = Math.round(mins);
  }
  if (form.entryFee.trim()) profile.entryFee = form.entryFee.trim();
  const tags = form.suitabilityTags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length) profile.suitabilityTags = tags;
  if (form.reviewSnippet.trim()) profile.reviewSnippet = form.reviewSnippet.trim();
  if (trimmed) {
    if (form.kind === 'airport') {
      profile.iataCode = trimmed;
      profile.shortName = trimmed;
    } else if (form.kind === 'railway_station') {
      profile.stationCode = trimmed;
      profile.shortName = trimmed;
    } else {
      profile.shortName = trimmed;
    }
  }
  return profile;
}

export function PlatformCatalogPage() {
  useDocumentTitle('Platform catalog');
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.platformCatalogWrite);
  const [searchParams, setSearchParams] = useSearchParams();
  const section = tabFromSearch(searchParams.get('tab'));

  const [items, setItems] = useState<PlaceRow[]>([]);
  const [parentPlaces, setParentPlaces] = useState<PlaceRow[]>([]);
  const [contributions, setContributions] = useState<ContributionRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [contribStatus, setContribStatus] = useState<ContribStatus>('pending');
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [knowledge, setKnowledge] = useState<PlaceKnowledgeRow[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState(EMPTY_KNOWLEDGE_FORM);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleTypeRow[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehicleQ, setVehicleQ] = useState('');
  const [debouncedVehicleQ, setDebouncedVehicleQ] = useState('');
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [subcategoryOptions, setSubcategoryOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const setSection = useCallback(
    (next: CatalogTab) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'queue') params.delete('tab');
      else params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedVehicleQ(vehicleQ), 250);
    return () => window.clearTimeout(t);
  }, [vehicleQ]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
      if (kind) params.set('kind', kind);
      const places = await api<{ items: PlaceRow[] }>(
        `/platform/catalog/places?${params.toString()}`,
      );
      setItems(places.items);
    } catch (e) {
      reportError(e, 'Could not load catalog');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, kind]);

  const loadParents = useCallback(async () => {
    try {
      const places = await api<{ items: PlaceRow[] }>('/platform/catalog/places');
      setParentPlaces(places.items.filter((p) => PARENT_KINDS.has(p.kind)));
    } catch {
      /* parent options are best-effort */
    }
  }, []);

  const loadSubcategories = useCallback(async () => {
    try {
      const res = await api<{
        items: Array<{
          name: string;
          subcategories: Array<{ id: string; name: string }>;
        }>;
      }>('/platform/catalog/subcategories');
      setSubcategoryOptions(
        res.items.flatMap((cat) =>
          cat.subcategories.map((s) => ({
            value: s.id,
            label: `${cat.name} · ${s.name}`,
          })),
        ),
      );
    } catch {
      /* optional */
    }
  }, []);

  const loadContributions = useCallback(async (status: ContribStatus) => {
    setContributionsLoading(true);
    try {
      const res = await api<{ items: ContributionRow[] }>(
        `/platform/catalog/contributions?status=${status}`,
      );
      setContributions(res.items || []);
      if (status === 'pending') setPendingCount(res.items?.length ?? 0);
    } catch (e) {
      reportError(e, 'Could not load contributions');
    } finally {
      setContributionsLoading(false);
    }
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const res = await api<{ items: ContributionRow[] }>(
        '/platform/catalog/contributions?status=pending',
      );
      setPendingCount(res.items?.length ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedVehicleQ.trim()) params.set('q', debouncedVehicleQ.trim());
      const res = await api<{ items: VehicleTypeRow[] }>(
        `/platform/catalog/vehicle-types?${params.toString()}`,
      );
      setVehicles(res.items || []);
    } catch (e) {
      reportError(e, 'Could not load vehicle types');
    } finally {
      setVehiclesLoading(false);
    }
  }, [debouncedVehicleQ]);

  useEffect(() => {
    if (section === 'places') {
      void loadCatalog();
      void loadParents();
      void loadSubcategories();
      void refreshPendingCount();
    } else if (section === 'vehicles') {
      void loadVehicles();
      void refreshPendingCount();
    } else if (
      section === 'fares' ||
      section === 'hotels' ||
      section === 'edges'
    ) {
      void refreshPendingCount();
    } else {
      void loadContributions(contribStatus);
      if (contribStatus !== 'pending') void refreshPendingCount();
    }
  }, [
    section,
    contribStatus,
    loadCatalog,
    loadParents,
    loadSubcategories,
    loadContributions,
    loadVehicles,
    refreshPendingCount,
  ]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setKnowledge([]);
    setKnowledgeForm(EMPTY_KNOWLEDGE_FORM);
    setEditingKnowledgeId(null);
  }

  async function startEdit(place: PlaceRow) {
    setEditingId(place.id);
    setForm({
      name: place.name,
      kind: place.kind,
      parentId: place.parentId || '',
      country: place.country || 'India',
      domesticOrIntl:
        place.domesticOrIntl === 'international' ? 'international' : 'domestic',
      isActive: place.isActive !== false,
      subcategoryIds: (place.subcategories || []).map((s) => s.id),
      code: codeFromProfile(place.kind, place.profile),
      description: place.profile?.description || '',
      imageUrls: (place.profile?.imageUrls || []).join('\n'),
      bestTime: place.profile?.bestTime || '',
      googleMapsUrl: place.profile?.googleMapsUrl || '',
      latitude: place.profile?.latitude != null ? String(place.profile.latitude) : '',
      longitude: place.profile?.longitude != null ? String(place.profile.longitude) : '',
      googleRating:
        place.profile?.googleRating != null ? String(place.profile.googleRating) : '',
      googleReviewCount:
        place.profile?.googleReviewCount != null
          ? String(place.profile.googleReviewCount)
          : '',
      openingHours: place.profile?.openingHours || '',
      durationMin:
        place.profile?.durationMin != null ? String(place.profile.durationMin) : '',
      entryFee: place.profile?.entryFee || '',
      suitabilityTags: (place.profile?.suitabilityTags || []).join(', '),
      reviewSnippet: place.profile?.reviewSnippet || '',
    });
    setKnowledgeForm(EMPTY_KNOWLEDGE_FORM);
    setEditingKnowledgeId(null);
    try {
      const detail = await api<{
        knowledge?: PlaceKnowledgeRow[];
        isActive?: boolean;
        subcategories?: Array<{ id: string }>;
      }>(`/platform/catalog/places/${place.id}`);
      setKnowledge(detail.knowledge || []);
      setForm((prev) => ({
        ...prev,
        isActive: detail.isActive !== false,
        subcategoryIds: (detail.subcategories || []).map((s) => s.id),
      }));
    } catch {
      setKnowledge([]);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const profile = profileFromForm(form);
    const body = {
      name: form.name,
      kind: form.kind,
      parentId: form.parentId || null,
      country: form.country,
      domesticOrIntl: form.domesticOrIntl,
      isActive: form.isActive,
      subcategoryIds: form.subcategoryIds,
      profile,
    };

    if (editingId) {
      const parsed = parseWithFieldErrors(UpdatePlaceSchema, body);
      if (!parsed.ok) {
        toastError(Object.values(parsed.errors)[0] || 'Fix the form');
        return;
      }
      setSaving(true);
      try {
        await api(`/platform/catalog/places/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
        toastSuccess('System place updated');
        resetForm();
        await loadCatalog();
        await loadParents();
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Could not update place');
      } finally {
        setSaving(false);
      }
      return;
    }

    const parsed = parseWithFieldErrors(CreatePlaceSchema, body);
    if (!parsed.ok) {
      toastError(Object.values(parsed.errors)[0] || 'Fix the form');
      return;
    }
    setSaving(true);
    try {
      await api('/platform/catalog/places', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toastSuccess('System place created');
      resetForm();
      await loadCatalog();
      await loadParents();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not create place');
    } finally {
      setSaving(false);
    }
  }

  async function saveKnowledge() {
    if (!editingId) return;
    if (!knowledgeForm.body.trim()) {
      toastError('Knowledge body is required');
      return;
    }
    setKnowledgeSaving(true);
    try {
      const payload = {
        season: knowledgeForm.season || 'all',
        kind: knowledgeForm.kind,
        title: knowledgeForm.title.trim() || null,
        body: knowledgeForm.body.trim(),
      };
      if (editingKnowledgeId) {
        const updated = await api<PlaceKnowledgeRow>(
          `/platform/catalog/knowledge/${editingKnowledgeId}`,
          { method: 'PATCH', body: JSON.stringify(payload) },
        );
        setKnowledge((prev) =>
          prev.map((k) => (k.id === updated.id ? { ...k, ...updated } : k)),
        );
        toastSuccess('Knowledge updated');
      } else {
        const created = await api<PlaceKnowledgeRow>(
          `/platform/catalog/places/${editingId}/knowledge`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setKnowledge((prev) => [...prev, created]);
        toastSuccess('Knowledge added');
      }
      setKnowledgeForm(EMPTY_KNOWLEDGE_FORM);
      setEditingKnowledgeId(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save knowledge');
    } finally {
      setKnowledgeSaving(false);
    }
  }

  function resetVehicleForm() {
    setEditingVehicleId(null);
    setVehicleForm(EMPTY_VEHICLE_FORM);
  }

  function startEditVehicle(v: VehicleTypeRow) {
    setEditingVehicleId(v.id);
    setVehicleForm({
      name: v.name,
      description: v.description || '',
      seats: v.seats != null ? String(v.seats) : '',
      imageUrl: v.profileJson?.imageUrl || v.profileJson?.imageUrls?.[0] || '',
    });
  }

  async function onVehicleSubmit(e: FormEvent) {
    e.preventDefault();
    const seatsNum = vehicleForm.seats.trim() ? Number(vehicleForm.seats) : undefined;
    const profile = vehicleForm.imageUrl.trim()
      ? { imageUrl: vehicleForm.imageUrl.trim() }
      : undefined;
    const body = {
      name: vehicleForm.name,
      description: vehicleForm.description.trim() || undefined,
      seats:
        seatsNum != null && Number.isFinite(seatsNum) && seatsNum > 0 ? seatsNum : undefined,
      ...(profile ? { profile } : {}),
    };

    if (editingVehicleId) {
      setVehicleSaving(true);
      try {
        await api(`/platform/catalog/vehicle-types/${editingVehicleId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Vehicle type updated');
        resetVehicleForm();
        await loadVehicles();
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Could not update vehicle type');
      } finally {
        setVehicleSaving(false);
      }
      return;
    }

    const parsed = parseWithFieldErrors(CreateVehicleTypeSchema, body);
    if (!parsed.ok) {
      toastError(Object.values(parsed.errors)[0] || 'Fix the form');
      return;
    }
    setVehicleSaving(true);
    try {
      await api('/platform/catalog/vehicle-types', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toastSuccess('Vehicle type created');
      resetVehicleForm();
      await loadVehicles();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not create vehicle type');
    } finally {
      setVehicleSaving(false);
    }
  }

  async function review(id: string, status: 'approved' | 'rejected') {
    setReviewingId(id);
    try {
      await api(`/platform/catalog/contributions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toastSuccess(status === 'approved' ? 'Merged into system catalog' : 'Contribution rejected');
      setRejectId(null);
      await loadContributions(contribStatus);
      if (contribStatus !== 'pending') await refreshPendingCount();
      else setPendingCount((n) => Math.max(0, n - 1));
      if (status === 'approved' && section === 'places') {
        await loadCatalog();
        await loadParents();
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setReviewingId(null);
    }
  }

  const parentFormOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'None', icon: FolderTree },
      ...parentPlaces.map((p) => ({
        value: p.id,
        label: p.breadcrumbLabel || p.name,
        icon: PLACE_KIND_ICONS[p.kind] || MapPin,
      })),
    ],
    [parentPlaces],
  );

  const codeLabel =
    form.kind === 'airport'
      ? 'IATA code'
      : form.kind === 'railway_station'
        ? 'Station code'
        : 'Short code';

  const codePlaceholder =
    form.kind === 'airport' ? 'DEL' : form.kind === 'railway_station' ? 'NDLS' : 'Optional';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Globe2}
        title="Platform catalog"
        subtitle="Review agency suggestions and maintain the shared destination guide."
      />

      <SuggestionChips
        allowDeselect={false}
        options={[
          {
            value: 'queue',
            label: pendingCount > 0 ? `Contribution queue (${pendingCount})` : 'Contribution queue',
          },
          { value: 'places', label: 'System places' },
          { value: 'vehicles', label: 'Vehicle types' },
          { value: 'fares', label: 'Transfer fares' },
          { value: 'hotels', label: 'Hotel rates' },
          { value: 'edges', label: 'Place edges' },
        ]}
        value={section}
        onChange={(v) => setSection(v as CatalogTab)}
      />

      {section === 'fares' ? <PlatformTransferFaresPanel /> : null}
      {section === 'hotels' ? <PlatformHotelRatesPanel /> : null}
      {section === 'edges' ? <PlatformEdgesPanel /> : null}

      {section === 'queue' ? (
        <div className="space-y-4">
          <SuggestionChips
            allowDeselect={false}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            value={contribStatus}
            onChange={(v) => setContribStatus(v as ContribStatus)}
          />

          <Card>
            <CardContent className="p-0">
              {contributionsLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading contributions…</p>
              ) : contributions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Inbox}
                    title={
                      contribStatus === 'pending'
                        ? 'No pending contributions'
                        : contribStatus === 'approved'
                          ? 'No approved contributions yet'
                          : 'No rejected contributions'
                    }
                    description={
                      contribStatus === 'pending'
                        ? 'When an agency suggests a missing city, landmark, airport, or station, it will appear here for Travel OS review.'
                        : 'Reviewed items from agencies show up in this history.'
                    }
                    action={
                      contribStatus === 'pending' ? (
                        <Button type="button" variant="outline" onClick={() => setSection('places')}>
                          Browse system places
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y">
                  {contributions.map((c) => {
                    const canReview = c.status === 'pending' && canWrite;
                    return (
                      <li
                        key={c.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {c.payloadJson?.name || 'Untitled suggestion'}
                            </span>
                            <StatusBadge value={c.status} />
                            <StatusBadge value={c.kind} label={c.kind} showIcon={false} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.organization?.name || 'Agency'}
                            {' · '}
                            {formatDateTime(c.createdAt)}
                          </p>
                          {typeof c.payloadJson?.description === 'string' &&
                          c.payloadJson.description ? (
                            <p className="text-sm text-muted-foreground">
                              {c.payloadJson.description}
                            </p>
                          ) : null}
                        </div>
                        {canReview ? (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={reviewingId === c.id}
                              onClick={() => void review(c.id, 'approved')}
                            >
                              <Check className="size-3.5" />
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={reviewingId === c.id}
                              onClick={() => setRejectId(c.id)}
                            >
                              <X className="size-3.5" />
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : section === 'vehicles' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardContent className="space-y-3 p-4">
              <FormField label="Search">
                <Input
                  value={vehicleQ}
                  onChange={(e) => setVehicleQ(e.target.value)}
                  placeholder="Innova, Tempo…"
                />
              </FormField>
              <p className="text-xs text-muted-foreground">
                {vehiclesLoading
                  ? 'Loading…'
                  : `${vehicles.length} vehicle type${vehicles.length === 1 ? '' : 's'}`}
              </p>
              {vehiclesLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : vehicles.length === 0 ? (
                <EmptyState
                  icon={Car}
                  title="No vehicle types"
                  description="Seed the catalog or create a system vehicle type."
                />
              ) : (
                <ul className="max-h-[min(70vh,720px)] divide-y overflow-y-auto rounded-xl border">
                  {vehicles.map((v) => {
                    const selected = editingVehicleId === v.id;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => startEditVehicle(v)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                            selected ? 'bg-muted/50' : ''
                          }`}
                        >
                          <Car className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{v.name}</span>
                              {v.seats != null ? (
                                <span className="text-[11px] text-muted-foreground">
                                  {v.seats} seats
                                </span>
                              ) : null}
                              {!v.isActive ? (
                                <StatusBadge value="inactive" label="Inactive" tone="warn" />
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {v.description || v.key}
                            </p>
                          </div>
                          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-50" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {editingVehicleId ? 'Edit vehicle type' : 'Add vehicle type'}
                </h3>
                {editingVehicleId ? (
                  <Button type="button" size="sm" variant="ghost" onClick={resetVehicleForm}>
                    <Plus className="size-3.5" />
                    New
                  </Button>
                ) : null}
              </div>
              <form onSubmit={onVehicleSubmit} className="space-y-3">
                <FormField label="Name" required>
                  <Input
                    value={vehicleForm.name}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                    placeholder="Innova Crysta"
                    required
                  />
                </FormField>
                <FormField label="Seats">
                  <Input
                    type="number"
                    min={1}
                    value={vehicleForm.seats}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value })}
                    placeholder="6"
                  />
                </FormField>
                <FormField label="Description">
                  <Input
                    value={vehicleForm.description}
                    onChange={(e) =>
                      setVehicleForm({ ...vehicleForm, description: e.target.value })
                    }
                    placeholder="AC SUV for hills / airport"
                  />
                </FormField>
                <FormField label="Image URL">
                  <Input
                    value={vehicleForm.imageUrl}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, imageUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </FormField>
                {canWrite ? (
                  <Button type="submit" disabled={vehicleSaving} className="w-full">
                    {vehicleSaving
                      ? 'Saving…'
                      : editingVehicleId
                        ? 'Save changes'
                        : 'Create vehicle type'}
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Search">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="DEL, NDLS, Agra…"
                  />
                </FormField>
                <FormField label="Kind">
                  <Combobox options={PLACE_KIND_FILTER_OPTIONS} value={kind} onChange={setKind} />
                </FormField>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {loading ? 'Loading…' : `${items.length} place${items.length === 1 ? '' : 's'}`}
                </p>
                {(q || kind) && !loading ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setQ('');
                      setKind('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="No places match"
                  description="Try a different search or kind filter, or create a new system place."
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setQ('');
                        setKind('');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <ul className="max-h-[min(70vh,720px)] divide-y overflow-y-auto rounded-xl border">
                  {items.map((p) => {
                    const KindIcon = PLACE_KIND_ICONS[p.kind] || MapPin;
                    const selected = editingId === p.id;
                    const hasMedia = Boolean(p.profile?.imageUrls?.length);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => void startEdit(p)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                            selected ? 'bg-muted/50' : ''
                          }`}
                        >
                          <KindIcon className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{p.name}</span>
                              <StatusBadge
                                value={p.kind}
                                label={
                                  PLACE_KIND_LABELS[p.kind as keyof typeof PLACE_KIND_LABELS] ||
                                  p.kind
                                }
                              />
                              {hasMedia ? (
                                <span className="text-[11px] text-muted-foreground">Photo</span>
                              ) : null}
                              {p.isSystem ? (
                                <span className="text-[11px] text-muted-foreground">System</span>
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {p.breadcrumbLabel || p.country}
                              {p.profile?.bestTime ? ` · ${p.profile.bestTime}` : ''}
                            </p>
                          </div>
                          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-50" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {editingId ? 'Edit system place' : 'Add system place'}
                  </h3>
                  {editingId ? (
                    <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                      <Plus className="size-3.5" />
                      New place
                    </Button>
                  ) : null}
                </div>
                <form onSubmit={onSubmit} className="space-y-3">
                  <FormField label="Name" required>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Delhi (DEL)"
                      required
                    />
                  </FormField>
                  <FormField label="Kind">
                    <SuggestionChips
                      allowDeselect={false}
                      options={ADD_PLACE_KIND_OPTIONS}
                      value={
                        ADD_PLACE_KIND_OPTIONS.some((o) => o.value === form.kind)
                          ? form.kind
                          : 'city'
                      }
                      onChange={(k) => setForm({ ...form, kind: k, code: form.code })}
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
                  <FormField label={codeLabel}>
                    <Input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder={codePlaceholder}
                    />
                  </FormField>
                  <FormField label="Country">
                    <Input
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Scope">
                    <SuggestionChips
                      allowDeselect={false}
                      options={[
                        { value: 'domestic', label: 'Domestic' },
                        { value: 'international', label: 'International' },
                      ]}
                      value={form.domesticOrIntl}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          domesticOrIntl: v as 'domestic' | 'international',
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Active">
                    <SuggestionChips
                      allowDeselect={false}
                      options={[
                        { value: 'yes', label: 'Active' },
                        { value: 'no', label: 'Deactivated' },
                      ]}
                      value={form.isActive ? 'yes' : 'no'}
                      onChange={(v) => setForm({ ...form, isActive: v === 'yes' })}
                    />
                  </FormField>
                  {subcategoryOptions.length ? (
                    <FormField label="Subcategories">
                      <Combobox
                        options={subcategoryOptions.filter(
                          (o) => !form.subcategoryIds.includes(o.value),
                        )}
                        value=""
                        onChange={(id) => {
                          if (!id || form.subcategoryIds.includes(id)) return;
                          setForm({
                            ...form,
                            subcategoryIds: [...form.subcategoryIds, id],
                          });
                        }}
                        searchable
                        searchPlaceholder="Add subcategory…"
                        placeholder="Add subcategory…"
                      />
                      {form.subcategoryIds.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {form.subcategoryIds.map((id) => {
                            const label =
                              subcategoryOptions.find((o) => o.value === id)?.label ||
                              id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-[11px]"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    subcategoryIds: form.subcategoryIds.filter(
                                      (x) => x !== id,
                                    ),
                                  })
                                }
                              >
                                {label} ×
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </FormField>
                  ) : null}
                  <FormField label="Description">
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Short destination guide blurb"
                    />
                  </FormField>
                  <FormField label="Image URLs (one per line)">
                    <textarea
                      className="flex min-h-[72px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.imageUrls}
                      onChange={(e) => setForm({ ...form, imageUrls: e.target.value })}
                      placeholder={'https://…\nhttps://…'}
                    />
                  </FormField>
                  <FormField label="Best time">
                    <Input
                      value={form.bestTime}
                      onChange={(e) => setForm({ ...form, bestTime: e.target.value })}
                      placeholder="Oct – Apr"
                    />
                  </FormField>
                  <FormField label="Google Maps URL">
                    <Input
                      value={form.googleMapsUrl}
                      onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                      placeholder="https://maps.google.com/…"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Google rating">
                      <Input
                        value={form.googleRating}
                        onChange={(e) => setForm({ ...form, googleRating: e.target.value })}
                        placeholder="4.5"
                      />
                    </FormField>
                    <FormField label="Google review count">
                      <Input
                        value={form.googleReviewCount}
                        onChange={(e) =>
                          setForm({ ...form, googleReviewCount: e.target.value })
                        }
                        placeholder="1287"
                      />
                    </FormField>
                  </div>
                  <FormField label="Opening hours">
                    <Input
                      value={form.openingHours}
                      onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
                      placeholder="6:00 AM – 5:00 PM"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Typical duration (min)">
                      <Input
                        value={form.durationMin}
                        onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                        placeholder="90"
                      />
                    </FormField>
                    <FormField label="Entry fee">
                      <Input
                        value={form.entryFee}
                        onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
                        placeholder="₹50"
                      />
                    </FormField>
                  </div>
                  <FormField label="Suitability tags (comma-separated)">
                    <Input
                      value={form.suitabilityTags}
                      onChange={(e) => setForm({ ...form, suitabilityTags: e.target.value })}
                      placeholder="families, sunrise, photography"
                    />
                  </FormField>
                  <FormField label="Review snippet">
                    <Input
                      value={form.reviewSnippet}
                      onChange={(e) => setForm({ ...form, reviewSnippet: e.target.value })}
                      placeholder="“Unforgettable Kanchenjunga sunrise.”"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Latitude">
                      <Input
                        value={form.latitude}
                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                        placeholder="27.036"
                      />
                    </FormField>
                    <FormField label="Longitude">
                      <Input
                        value={form.longitude}
                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                        placeholder="88.263"
                      />
                    </FormField>
                  </div>
                  {canWrite ? (
                    <Button type="submit" disabled={saving} className="w-full">
                      {saving
                        ? 'Saving…'
                        : editingId
                          ? 'Save changes'
                          : 'Create system place'}
                    </Button>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            {editingId ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="text-sm font-semibold">Place knowledge</h3>
                  {knowledge.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No knowledge yet — add weather, packing, or tips.
                    </p>
                  ) : (
                    <ul className="max-h-48 space-y-2 overflow-y-auto">
                      {knowledge.map((k) => (
                        <li key={k.id} className="rounded-lg border px-2.5 py-2 text-xs">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <StatusBadge value={k.kind} label={k.kind} showIcon={false} />
                            <span className="text-muted-foreground">{k.season}</span>
                            {canWrite ? (
                            <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="ml-auto h-6 px-1.5"
                              onClick={() => {
                                setEditingKnowledgeId(k.id);
                                setKnowledgeForm({
                                  season: k.season || 'all',
                                  kind: k.kind,
                                  title: k.title || '',
                                  body: k.body,
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-destructive"
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await api(`/platform/catalog/knowledge/${k.id}`, {
                                      method: 'DELETE',
                                    });
                                    setKnowledge((prev) =>
                                      prev.filter((row) => row.id !== k.id),
                                    );
                                    toastSuccess('Knowledge deleted');
                                  } catch (err) {
                                    toastError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Could not delete',
                                    );
                                  }
                                })();
                              }}
                            >
                              Delete
                            </Button>
                            </>
                            ) : null}
                          </div>
                          {k.title ? <p className="font-medium">{k.title}</p> : null}
                          <p className="text-muted-foreground">{k.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={canWrite ? 'space-y-2 border-t pt-3' : 'hidden'}>
                    <p className="text-xs font-medium">
                      {editingKnowledgeId ? 'Edit knowledge' : 'Add knowledge'}
                    </p>
                    <FormField label="Kind">
                      <SuggestionChips
                        allowDeselect={false}
                        options={KNOWLEDGE_KINDS.map((k) => ({ value: k, label: k }))}
                        value={
                          KNOWLEDGE_KINDS.includes(
                            knowledgeForm.kind as (typeof KNOWLEDGE_KINDS)[number],
                          )
                            ? knowledgeForm.kind
                            : 'tip'
                        }
                        onChange={(k) => setKnowledgeForm({ ...knowledgeForm, kind: k })}
                      />
                    </FormField>
                    <FormField label="Season">
                      <Input
                        value={knowledgeForm.season}
                        onChange={(e) =>
                          setKnowledgeForm({ ...knowledgeForm, season: e.target.value })
                        }
                        placeholder="all | winter | summer…"
                      />
                    </FormField>
                    <FormField label="Title">
                      <Input
                        value={knowledgeForm.title}
                        onChange={(e) =>
                          setKnowledgeForm({ ...knowledgeForm, title: e.target.value })
                        }
                        placeholder="Optional"
                      />
                    </FormField>
                    <FormField label="Body" required>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={knowledgeForm.body}
                        onChange={(e) =>
                          setKnowledgeForm({ ...knowledgeForm, body: e.target.value })
                        }
                        placeholder="Tip body for proposal fill / destination guide"
                      />
                    </FormField>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={knowledgeSaving}
                        onClick={() => void saveKnowledge()}
                      >
                        {knowledgeSaving
                          ? 'Saving…'
                          : editingKnowledgeId
                            ? 'Update'
                            : 'Add knowledge'}
                      </Button>
                      {editingKnowledgeId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingKnowledgeId(null);
                            setKnowledgeForm(EMPTY_KNOWLEDGE_FORM);
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(rejectId)}
        onOpenChange={(open) => {
          if (!open) setRejectId(null);
        }}
        title="Reject this contribution?"
        description="The agency suggestion will be marked rejected. They can submit again later if needed."
        confirmLabel="Reject"
        destructive
        loading={reviewingId === rejectId}
        onConfirm={() => {
          if (rejectId) void review(rejectId, 'rejected');
        }}
      />
    </div>
  );
}
