import { useCallback, useEffect, useMemo, useState } from 'react';
import { BedDouble, Pencil, Plus } from 'lucide-react';
import {
  Button,
  FormGrid,
  Input,
  NumberField,
  QuickPicks,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  Textarea,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api, type AssetRoomProductRow } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import {
  isStaySupplierType,
  supplierProfileSectionTitle,
} from '../../lib/supplierTypes';
import { PlaceMultiPicker } from '../places/PlacePicker';
import type { PlaceRef } from '../../lib/placeRefs';
import {
  GalleryUrlList,
  ImageUrlField,
  MultiChipField,
  ProfileFormSection,
  StarRatingInput,
} from './ProfileFormParts';
import { SupplierProfilePreview } from './SupplierProfilePreview';

type ProfileMap = Record<string, unknown>;

type ServedPlaceRow = {
  id: string;
  name: string;
  kind?: string;
  secondaryLabel?: string;
};

function showsServiceAreasPicker(type: string): boolean {
  return (
    type === 'dmc' ||
    type === 'guide' ||
    type === 'driver' ||
    type === 'car_rental' ||
    type === 'other'
  );
}
const STAY_AMENITY_PRESETS = [
  'WiFi',
  'Breakfast',
  'Parking',
  'Mountain view',
  'Hot water',
  'Garden',
  'Spa',
  'Pool',
  'Restaurant',
  'AC',
  'Fireplace',
  'Airport desk',
];

const STAY_ROOM_PRESETS = [
  'Deluxe',
  'Suite',
  'Standard twin',
  'Family room',
  'Cottage',
  'Heritage suite',
  'Garden view',
  'Sea view',
  'Mountain view',
];

const emptyRoomForm = () => ({
  name: '',
  customerFacingName: '',
  maxOccupancy: '2',
  baseQuantity: '1',
  bedConfig: '',
});

function roomFormFromProduct(r: AssetRoomProductRow) {
  return {
    name: r.name,
    customerFacingName: r.customerFacingName || '',
    maxOccupancy: String(r.maxOccupancy ?? 2),
    baseQuantity: String(r.baseQuantity ?? 1),
    bedConfig: r.bedConfig || '',
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function numStr(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string') return v;
  return '';
}

function linesFrom(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join('\n');
  return str(v);
}

function csvFrom(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  return str(v);
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function profileBlurb(type: string): string {
  if (isStaySupplierType(type)) {
    return 'Same fields the itinerary loads onto hotel stays — photos, story, amenities, ratings, and check times.';
  }
  switch (type) {
    case 'restaurant':
      return 'Outlet details for meal stops — cuisine, capacity, hours, and menu style.';
    case 'car_rental':
      return 'Fleet notes for transport costing — vehicle types, routes, and permits.';
    case 'driver':
      return 'Driver credentials and service areas (person profile, not a fleet).';
    case 'activity':
      return 'Activities offered, duration, capacity, and safety notes.';
    case 'guide':
      return 'Guide languages, destinations, and specialties.';
    case 'dmc':
      return 'Ground partner coverage — destinations, services, and booking SLA.';
    default:
      return 'Generic service notes for this supplier.';
  }
}

export function SupplierProfilePanel({
  supplierId,
  supplierName,
  supplierType,
  initialProfile,
  initialServedPlaces,
  initialServedPlaceIds,
  linkedAssetId,
  layout = 'stack',
  onSaved,
}: {
  supplierId: string;
  supplierName?: string;
  supplierType: string;
  initialProfile?: ProfileMap | null;
  /** null = structured coverage unset (legacy CSV may still display). */
  initialServedPlaceIds?: string[] | null;
  initialServedPlaces?: ServedPlaceRow[] | null;
  linkedAssetId?: string | null;
  /** split = sticky preview beside fields (detail page). */
  layout?: 'stack' | 'split';
  onSaved?: (payload: {
    profileJson: ProfileMap;
    servedPlaceIds?: string[] | null;
    servedPlaces?: ServedPlaceRow[] | null;
  }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [servedRefs, setServedRefs] = useState<PlaceRef[]>([]);
  const [servedDirty, setServedDirty] = useState(false);
  const [coverageConfigured, setCoverageConfigured] = useState(false);
  const [roomProducts, setRoomProducts] = useState<AssetRoomProductRow[]>([]);
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [roomEditOpen, setRoomEditOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [roomEditForm, setRoomEditForm] = useState(emptyRoomForm);

  const loadRoomProducts = useCallback(async () => {
    if (!linkedAssetId || !isStaySupplierType(supplierType)) {
      setRoomProducts([]);
      return;
    }
    try {
      const rows = await api<AssetRoomProductRow[]>(
        `/inventory/assets/${linkedAssetId}/rooms`,
      );
      setRoomProducts(rows);
    } catch {
      setRoomProducts([]);
    }
  }, [linkedAssetId, supplierType]);

  useEffect(() => {
    void loadRoomProducts();
  }, [loadRoomProducts]);

  useEffect(() => {
    const p = initialProfile && typeof initialProfile === 'object' ? initialProfile : {};
    const configured = initialServedPlaceIds !== null && initialServedPlaceIds !== undefined;
    setCoverageConfigured(configured);
    setServedDirty(false);
    setServedRefs(
      configured && initialServedPlaces?.length
        ? initialServedPlaces.map((sp) => ({
            placeId: sp.id,
            name: sp.name,
            kind: sp.kind,
          }))
        : [],
    );
    if (isStaySupplierType(supplierType)) {
      setForm({
        imageUrl: str(p.imageUrl),
        imageUrls: linesFrom(p.imageUrls),
        description: str(p.description),
        amenities: csvFrom(p.amenities),
        capacityHint: str(p.capacityHint),
        stars: numStr(p.stars),
        googleRating: numStr(p.googleRating),
        googleReviewCount: numStr(p.googleReviewCount),
        googleMapsUrl: str(p.googleMapsUrl),
        reviewSnippet: str(p.reviewSnippet),
        checkIn: str(p.checkIn),
        checkOut: str(p.checkOut),
        distanceHint: str(p.distanceHint),
      });
      return;
    }
    if (supplierType === 'restaurant') {
      setForm({
        cuisine: str(p.cuisine),
        mealPeriods: csvFrom(p.mealPeriods),
        menuType: str(p.menuType),
        seatingCapacity: numStr(p.seatingCapacity),
        openingHours: str(p.openingHours),
        vegNonVeg: str(p.vegNonVeg),
        reservationLeadHours: numStr(p.reservationLeadHours),
        photos: linesFrom(p.photos ?? p.imageUrls),
      });
      return;
    }
    if (supplierType === 'car_rental') {
      setForm({
        fleetHint: str(p.fleetHint ?? p.capacityHint),
        vehicleTypes: csvFrom(p.vehicleTypes ?? p.vehicleHints),
        routesServed: csvFrom(p.routesServed),
        permitNotes: str(p.permitNotes),
        parkingTollPolicy: str(p.parkingTollPolicy),
      });
      return;
    }
    if (supplierType === 'driver') {
      setForm({
        licenceNumber: str(p.licenceNumber),
        licenceExpiry: str(p.licenceExpiry),
        languages: csvFrom(p.languages),
        serviceAreas: csvFrom(p.serviceAreas),
        emergencyContact: str(p.emergencyContact),
        verificationStatus: str(p.verificationStatus),
      });
      return;
    }
    if (supplierType === 'activity') {
      setForm({
        activitiesOffered: csvFrom(p.activitiesOffered),
        durationHint: str(p.durationHint),
        privateOrSic: str(p.privateOrSic),
        capacity: numStr(p.capacity),
        inclusions: csvFrom(p.inclusions),
        safetyNotes: str(p.safetyNotes),
      });
      return;
    }
    if (supplierType === 'guide') {
      setForm({
        languages: csvFrom(p.languages),
        destinations: csvFrom(p.destinations),
        specialties: csvFrom(p.specialties),
        verificationStatus: str(p.verificationStatus),
      });
      return;
    }
    if (supplierType === 'dmc') {
      setForm({
        destinationsServed: csvFrom(p.destinationsServed),
        serviceCategories: csvFrom(p.serviceCategories),
        markets: csvFrom(p.markets),
        emergencyContact: str(p.emergencyContact),
        bookingSlaHint: str(p.bookingSlaHint),
      });
      return;
    }
    setForm({
      serviceCategory: str(p.serviceCategory),
      description: str(p.description),
      serviceArea: str(p.serviceArea),
    });
  }, [supplierId, supplierType, initialProfile, initialServedPlaceIds, initialServedPlaces]);

  const legacyCoverageText = useMemo(() => {
    const p = initialProfile && typeof initialProfile === 'object' ? initialProfile : {};
    if (supplierType === 'dmc') return csvFrom(p.destinationsServed);
    if (supplierType === 'guide') return csvFrom(p.destinations);
    if (supplierType === 'driver') return csvFrom(p.serviceAreas);
    if (supplierType === 'car_rental') return csvFrom(p.routesServed);
    return str(p.serviceArea);
  }, [initialProfile, supplierType]);

  function patch(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addRoomProduct() {
    if (!linkedAssetId) return;
    if (!roomForm.name.trim()) {
      toastError('Room name is required');
      return;
    }
    setRoomSaving(true);
    try {
      await api('/inventory/rooms', {
        method: 'POST',
        body: JSON.stringify({
          assetId: linkedAssetId,
          name: roomForm.name.trim(),
          customerFacingName: roomForm.customerFacingName.trim() || null,
          maxOccupancy: Number(roomForm.maxOccupancy) || 2,
          baseQuantity: Number(roomForm.baseQuantity) || 1,
          bedConfig: roomForm.bedConfig.trim() || null,
        }),
      });
      toastSuccess('Room product added');
      setRoomForm(emptyRoomForm());
      setRoomFormOpen(false);
      await loadRoomProducts();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add room product');
    } finally {
      setRoomSaving(false);
    }
  }

  function openEditRoom(r: AssetRoomProductRow) {
    setEditingRoomId(r.id);
    setRoomEditForm(roomFormFromProduct(r));
    setRoomEditOpen(true);
  }

  async function saveRoomEdit() {
    if (!editingRoomId) return;
    if (!roomEditForm.name.trim()) {
      toastError('Room name is required');
      return;
    }
    setRoomSaving(true);
    try {
      await api(`/inventory/rooms/${editingRoomId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: roomEditForm.name.trim(),
          customerFacingName: roomEditForm.customerFacingName.trim() || null,
          maxOccupancy: Number(roomEditForm.maxOccupancy) || 2,
          baseQuantity: Number(roomEditForm.baseQuantity) || 1,
          bedConfig: roomEditForm.bedConfig.trim() || null,
        }),
      });
      toastSuccess('Room product updated');
      setRoomEditOpen(false);
      setEditingRoomId(null);
      await loadRoomProducts();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update room product');
    } finally {
      setRoomSaving(false);
    }
  }

  async function setRoomActive(id: string, isActive: boolean) {
    setRoomSaving(true);
    try {
      await api(`/inventory/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      toastSuccess(isActive ? 'Room product restored' : 'Room product archived');
      await loadRoomProducts();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update room product');
    } finally {
      setRoomSaving(false);
    }
  }

  function buildProfileJson(): ProfileMap {
    if (isStaySupplierType(supplierType)) {
      const out: ProfileMap = {};
      if (form.imageUrl?.trim()) out.imageUrl = form.imageUrl.trim();
      const gallery = splitLines(form.imageUrls || '');
      if (gallery.length) out.imageUrls = gallery;
      if (form.description?.trim()) out.description = form.description.trim();
      const amenities = splitCsv(form.amenities || '');
      if (amenities.length) out.amenities = amenities;
      const roomHints = [
        ...new Set(
          roomProducts
            .filter((r) => r.isActive !== false)
            .map((r) => (r.customerFacingName?.trim() || r.name.trim()))
            .filter(Boolean),
        ),
      ];
      if (roomHints.length) out.roomHints = roomHints;
      if (form.capacityHint?.trim()) out.capacityHint = form.capacityHint.trim();
      if (form.stars?.trim()) {
        const n = Number(form.stars);
        if (Number.isFinite(n)) out.stars = n;
      }
      if (form.googleRating?.trim()) {
        const n = Number(form.googleRating);
        if (Number.isFinite(n)) out.googleRating = n;
      }
      if (form.googleReviewCount?.trim()) {
        const n = Number(form.googleReviewCount);
        if (Number.isFinite(n)) out.googleReviewCount = n;
      }
      if (form.googleMapsUrl?.trim()) out.googleMapsUrl = form.googleMapsUrl.trim();
      if (form.reviewSnippet?.trim()) out.reviewSnippet = form.reviewSnippet.trim();
      if (form.checkIn?.trim()) out.checkIn = form.checkIn.trim();
      if (form.checkOut?.trim()) out.checkOut = form.checkOut.trim();
      if (form.distanceHint?.trim()) out.distanceHint = form.distanceHint.trim();
      return out;
    }
    if (supplierType === 'restaurant') {
      const out: ProfileMap = {};
      if (form.cuisine?.trim()) out.cuisine = form.cuisine.trim();
      const mealPeriods = splitCsv(form.mealPeriods || '');
      if (mealPeriods.length) out.mealPeriods = mealPeriods;
      if (form.menuType?.trim()) out.menuType = form.menuType.trim();
      if (form.seatingCapacity?.trim()) {
        const n = Number(form.seatingCapacity);
        if (Number.isFinite(n)) out.seatingCapacity = n;
      }
      if (form.openingHours?.trim()) out.openingHours = form.openingHours.trim();
      if (form.vegNonVeg?.trim()) out.vegNonVeg = form.vegNonVeg.trim();
      if (form.reservationLeadHours?.trim()) {
        const n = Number(form.reservationLeadHours);
        if (Number.isFinite(n)) out.reservationLeadHours = n;
      }
      const photos = splitLines(form.photos || '');
      if (photos.length) out.photos = photos;
      return out;
    }
    if (supplierType === 'car_rental') {
      const out: ProfileMap = {};
      if (form.fleetHint?.trim()) out.fleetHint = form.fleetHint.trim();
      const vehicleTypes = splitCsv(form.vehicleTypes || '');
      if (vehicleTypes.length) out.vehicleTypes = vehicleTypes;
      const routes = splitCsv(form.routesServed || '');
      if (routes.length) out.routesServed = routes;
      if (form.permitNotes?.trim()) out.permitNotes = form.permitNotes.trim();
      if (form.parkingTollPolicy?.trim()) {
        out.parkingTollPolicy = form.parkingTollPolicy.trim();
      }
      return out;
    }
    if (supplierType === 'driver') {
      const out: ProfileMap = {};
      if (form.licenceNumber?.trim()) out.licenceNumber = form.licenceNumber.trim();
      if (form.licenceExpiry?.trim()) out.licenceExpiry = form.licenceExpiry.trim();
      const languages = splitCsv(form.languages || '');
      if (languages.length) out.languages = languages;
      const areas = splitCsv(form.serviceAreas || '');
      if (areas.length) out.serviceAreas = areas;
      if (form.emergencyContact?.trim()) {
        out.emergencyContact = form.emergencyContact.trim();
      }
      if (form.verificationStatus?.trim()) {
        out.verificationStatus = form.verificationStatus.trim();
      }
      return out;
    }
    if (supplierType === 'activity') {
      const out: ProfileMap = {};
      const activities = splitCsv(form.activitiesOffered || '');
      if (activities.length) out.activitiesOffered = activities;
      if (form.durationHint?.trim()) out.durationHint = form.durationHint.trim();
      if (form.privateOrSic?.trim()) out.privateOrSic = form.privateOrSic.trim();
      if (form.capacity?.trim()) {
        const n = Number(form.capacity);
        if (Number.isFinite(n)) out.capacity = n;
      }
      const inclusions = splitCsv(form.inclusions || '');
      if (inclusions.length) out.inclusions = inclusions;
      if (form.safetyNotes?.trim()) out.safetyNotes = form.safetyNotes.trim();
      return out;
    }
    if (supplierType === 'guide') {
      const out: ProfileMap = {};
      const languages = splitCsv(form.languages || '');
      if (languages.length) out.languages = languages;
      const destinations = splitCsv(form.destinations || '');
      if (destinations.length) out.destinations = destinations;
      const specialties = splitCsv(form.specialties || '');
      if (specialties.length) out.specialties = specialties;
      if (form.verificationStatus?.trim()) {
        out.verificationStatus = form.verificationStatus.trim();
      }
      return out;
    }
    if (supplierType === 'dmc') {
      const out: ProfileMap = {};
      const dest = splitCsv(form.destinationsServed || '');
      if (dest.length) out.destinationsServed = dest;
      const cats = splitCsv(form.serviceCategories || '');
      if (cats.length) out.serviceCategories = cats;
      const markets = splitCsv(form.markets || '');
      if (markets.length) out.markets = markets;
      if (form.emergencyContact?.trim()) {
        out.emergencyContact = form.emergencyContact.trim();
      }
      if (form.bookingSlaHint?.trim()) out.bookingSlaHint = form.bookingSlaHint.trim();
      return out;
    }
    const out: ProfileMap = {};
    if (form.serviceCategory?.trim()) out.serviceCategory = form.serviceCategory.trim();
    if (form.description?.trim()) out.description = form.description.trim();
    if (form.serviceArea?.trim()) out.serviceArea = form.serviceArea.trim();
    return out;
  }

  async function save() {
    setSaving(true);
    try {
      const profileJson = buildProfileJson();
      // Only send servedPlaceIds when already configured or the employee edited Service areas.
      // Prevents profile-only saves from flipping null → [] and dropping legacy display authority.
      const includeCoverage =
        showsServiceAreasPicker(supplierType) && (coverageConfigured || servedDirty);
      const body: Record<string, unknown> = { profileJson };
      if (includeCoverage) {
        body.servedPlaceIds = servedRefs
          .map((r) => r.placeId)
          .filter((id): id is string => Boolean(id));
      }
      const res = await api<{
        profileJson?: ProfileMap;
        servedPlaceIds?: string[] | null;
        servedPlaces?: ServedPlaceRow[] | null;
      }>(`/suppliers/${supplierId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toastSuccess('Profile saved');
      if (includeCoverage) {
        setCoverageConfigured(true);
        setServedDirty(false);
      }
      onSaved?.({
        profileJson: (res.profileJson as ProfileMap) || profileJson,
        servedPlaceIds: res.servedPlaceIds,
        servedPlaces: res.servedPlaces,
      });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  const serviceAreasBlock =
    showsServiceAreasPicker(supplierType) ? (
      <ProfileFormSection
        title="Service areas"
        description="Destinations this supplier can serve. Matching uses these places exactly — not parent regions."
      >
        <PlaceMultiPicker
          label="Service areas"
          purpose="destination"
          value={servedRefs}
          onChange={(next) => {
            setServedRefs(next);
            setServedDirty(true);
          }}
          placeholder="Search city, region, state or country…"
        />
        {!coverageConfigured && legacyCoverageText ? (
          <p className="text-[11px] text-muted-foreground" data-testid="supplier-legacy-coverage">
            Legacy text (display only until you save service areas): “{legacyCoverageText}”
          </p>
        ) : null}
      </ProfileFormSection>
    ) : null;

  const fields = (
    <>
      {serviceAreasBlock}
      {isStaySupplierType(supplierType) ? (
        <>
          <ProfileFormSection
            title="Photos"
            description="Paste image URLs for now — upload comes later. Preview updates live."
          >
            <ImageUrlField
              label="Cover photo"
              value={form.imageUrl || ''}
              onChange={(imageUrl) => patch('imageUrl', imageUrl)}
            />
            <GalleryUrlList
              value={form.imageUrls || ''}
              onChange={(imageUrls) => patch('imageUrls', imageUrls)}
            />
          </ProfileFormSection>

          <ProfileFormSection
            title="Proposal story"
            description="Copied onto the hotel itinerary item as the customer description on share & PDF."
          >
            <FormField label="Property description">
              <Textarea
                value={form.description || ''}
                onChange={(e) => patch('description', e.target.value)}
                rows={3}
                placeholder="Boutique mountain rooms with views that make evenings feel special."
              />
            </FormField>
          </ProfileFormSection>

          <ProfileFormSection title="Stay details">
            <MultiChipField
              label="Amenities"
              value={form.amenities || ''}
              onChange={(amenities) => patch('amenities', amenities)}
              presets={STAY_AMENITY_PRESETS}
              placeholder="Custom amenity"
            />
            {linkedAssetId ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Room products</p>
                    <p className="text-xs text-muted-foreground">
                      Canonical room types on the linked property — used in contracts and rate charts.
                    </p>
                  </div>
                  <Can anyOf={CAP.supplierWrite}>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRoomFormOpen(true)}>
                      <Plus className="size-3.5" />
                      Add room
                    </Button>
                  </Can>
                </div>
                {roomProducts.length ? (
                  <ul className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
                    {roomProducts.map((r) => {
                      const active = r.isActive !== false;
                      return (
                        <li
                          key={r.id}
                          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                            active ? '' : 'opacity-60'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <BedDouble className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{r.name}</span>
                            {r.customerFacingName?.trim() ? (
                              <span className="text-xs text-muted-foreground">
                                Proposal name: {r.customerFacingName.trim()}
                              </span>
                            ) : null}
                            {!active ? (
                              <StatusBadge value="archived" label="Archived" showIcon={false} />
                            ) : null}
                            {r.maxOccupancy ? (
                              <span className="text-xs text-muted-foreground">
                                Occ {r.maxOccupancy}
                              </span>
                            ) : null}
                            {r.baseQuantity ? (
                              <span className="text-xs text-muted-foreground">
                                {r.baseQuantity} units
                              </span>
                            ) : null}
                          </div>
                          <Can anyOf={CAP.supplierWrite}>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                onClick={() => openEditRoom(r)}
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={roomSaving}
                                onClick={() => void setRoomActive(r.id, !active)}
                              >
                                {active ? 'Archive' : 'Restore'}
                              </Button>
                            </div>
                          </Can>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                    No room products yet — add one to power rate matching.
                  </p>
                )}
              </div>
            ) : null}
            <FormField label="Capacity hint">
              <Input
                value={form.capacityHint || ''}
                onChange={(e) => patch('capacityHint', e.target.value)}
                placeholder="24 rooms · groups OK"
              />
            </FormField>
            <FormGrid>
              <FormField label="Check-in">
                <Input
                  value={form.checkIn || ''}
                  onChange={(e) => patch('checkIn', e.target.value)}
                  placeholder="2:00 PM"
                />
              </FormField>
              <FormField label="Check-out">
                <Input
                  value={form.checkOut || ''}
                  onChange={(e) => patch('checkOut', e.target.value)}
                  placeholder="11:00 AM"
                />
              </FormField>
            </FormGrid>
            <FormField label="Distance / location hint">
              <Input
                value={form.distanceHint || ''}
                onChange={(e) => patch('distanceHint', e.target.value)}
                placeholder="500m from Mall Road"
              />
            </FormField>
          </ProfileFormSection>

          <ProfileFormSection
            title="Hotel category"
            description="Official star classification of the property (e.g. 3★ hotel) — not guest review scores."
          >
            <FormField
              label="Category stars"
              description="Tap 1–5 for hotel class. Leave blank if unrated / boutique."
            >
              <StarRatingInput
                value={form.stars || ''}
                onChange={(stars) => patch('stars', stars)}
              />
            </FormField>
          </ProfileFormSection>

          <ProfileFormSection
            title="Guest reviews"
            description="Google (or similar) guest scores shown next to the category stars on proposals."
          >
            <FormGrid>
              <FormField
                label="Google score"
                description="Average out of 5 from guest reviews (e.g. 4.4)."
              >
                <NumberField
                  integer={false}
                  min={0}
                  max={5}
                  value={form.googleRating || ''}
                  onChange={(googleRating) => patch('googleRating', googleRating)}
                  placeholder="4.4"
                />
              </FormField>
              <FormField label="Number of reviews">
                <NumberField
                  min={0}
                  value={form.googleReviewCount || ''}
                  onChange={(googleReviewCount) =>
                    patch('googleReviewCount', googleReviewCount)
                  }
                  placeholder="312"
                />
              </FormField>
            </FormGrid>
            <FormField label="Guest quote">
              <Input
                value={form.reviewSnippet || ''}
                onChange={(e) => patch('reviewSnippet', e.target.value)}
                placeholder="Warm staff and excellent views…"
              />
            </FormField>
            <FormField label="Google Maps link">
              <Input
                value={form.googleMapsUrl || ''}
                onChange={(e) => patch('googleMapsUrl', e.target.value)}
                placeholder="https://maps.google.com/…"
              />
            </FormField>
          </ProfileFormSection>
        </>
      ) : null}

      {supplierType === 'restaurant' ? (
        <>
          <FormField label="Cuisine">
            <Input
              value={form.cuisine || ''}
              onChange={(e) => patch('cuisine', e.target.value)}
              placeholder="North Indian, Continental"
            />
          </FormField>
          <FormField label="Meal periods (comma-separated)">
            <Input
              value={form.mealPeriods || ''}
              onChange={(e) => patch('mealPeriods', e.target.value)}
              placeholder="Breakfast, Lunch, Dinner"
            />
          </FormField>
          <FormField label="Menu type">
            <SuggestionChips
              aria-label="Menu type"
              allowDeselect
              options={[
                { value: 'a_la_carte', label: 'À la carte' },
                { value: 'buffet', label: 'Buffet' },
                { value: 'set_menu', label: 'Set menu' },
              ]}
              value={form.menuType || ''}
              onChange={(menuType) => patch('menuType', menuType)}
            />
          </FormField>
          <FormGrid>
            <FormField label="Seating capacity">
              <NumberField
                min={0}
                value={form.seatingCapacity || ''}
                onChange={(seatingCapacity) =>
                  patch('seatingCapacity', seatingCapacity)
                }
              />
            </FormField>
            <FormField label="Reservation lead (hours)">
              <NumberField
                min={0}
                value={form.reservationLeadHours || ''}
                onChange={(reservationLeadHours) =>
                  patch('reservationLeadHours', reservationLeadHours)
                }
              />
            </FormField>
          </FormGrid>
          <FormField label="Opening hours">
            <Input
              value={form.openingHours || ''}
              onChange={(e) => patch('openingHours', e.target.value)}
              placeholder="11:00–22:00"
            />
          </FormField>
          <FormField label="Veg / non-veg">
            <SuggestionChips
              aria-label="Veg non-veg"
              allowDeselect
              options={[
                { value: 'veg', label: 'Veg' },
                { value: 'non_veg', label: 'Non-veg' },
                { value: 'both', label: 'Both' },
              ]}
              value={form.vegNonVeg || ''}
              onChange={(vegNonVeg) => patch('vegNonVeg', vegNonVeg)}
            />
          </FormField>
          <FormField label="Photos (one URL per line)">
            <Textarea
              value={form.photos || ''}
              onChange={(e) => patch('photos', e.target.value)}
              rows={3}
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'car_rental' ? (
        <>
          <FormField label="Fleet hint">
            <Input
              value={form.fleetHint || ''}
              onChange={(e) => patch('fleetHint', e.target.value)}
              placeholder="12 sedans · 4 innovas"
            />
          </FormField>
          <FormField label="Vehicle types (comma-separated)">
            <Input
              value={form.vehicleTypes || ''}
              onChange={(e) => patch('vehicleTypes', e.target.value)}
              placeholder="Sedan, Innova, Tempo"
            />
          </FormField>
          <FormField label="Permit notes">
            <Input
              value={form.permitNotes || ''}
              onChange={(e) => patch('permitNotes', e.target.value)}
            />
          </FormField>
          <FormField label="Parking / toll policy">
            <Input
              value={form.parkingTollPolicy || ''}
              onChange={(e) => patch('parkingTollPolicy', e.target.value)}
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'driver' ? (
        <>
          <FormGrid>
            <FormField label="Licence number">
              <Input
                value={form.licenceNumber || ''}
                onChange={(e) => patch('licenceNumber', e.target.value)}
              />
            </FormField>
            <FormField label="Licence expiry">
              <Input
                value={form.licenceExpiry || ''}
                onChange={(e) => patch('licenceExpiry', e.target.value)}
                placeholder="2027-12-31"
              />
            </FormField>
          </FormGrid>
          <FormField label="Languages (comma-separated)">
            <Input
              value={form.languages || ''}
              onChange={(e) => patch('languages', e.target.value)}
              placeholder="Hindi, English, Nepali"
            />
          </FormField>
          <FormField label="Emergency contact">
            <Input
              value={form.emergencyContact || ''}
              onChange={(e) => patch('emergencyContact', e.target.value)}
            />
          </FormField>
          <FormField label="Verification status">
            <SuggestionChips
              aria-label="Verification"
              allowDeselect
              options={[
                { value: 'unverified', label: 'Unverified' },
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
              ]}
              value={form.verificationStatus || ''}
              onChange={(verificationStatus) =>
                patch('verificationStatus', verificationStatus)
              }
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'activity' ? (
        <>
          <FormField label="Activities offered (comma-separated)">
            <Input
              value={form.activitiesOffered || ''}
              onChange={(e) => patch('activitiesOffered', e.target.value)}
            />
          </FormField>
          <FormField label="Duration hint">
            <Input
              value={form.durationHint || ''}
              onChange={(e) => patch('durationHint', e.target.value)}
              placeholder="3–4 hours"
            />
          </FormField>
          <FormField label="Private / SIC">
            <SuggestionChips
              aria-label="Private or SIC"
              allowDeselect
              options={[
                { value: 'private', label: 'Private' },
                { value: 'sic', label: 'SIC' },
                { value: 'both', label: 'Both' },
              ]}
              value={form.privateOrSic || ''}
              onChange={(privateOrSic) => patch('privateOrSic', privateOrSic)}
            />
          </FormField>
          <FormField label="Capacity">
            <NumberField
              min={0}
              value={form.capacity || ''}
              onChange={(capacity) => patch('capacity', capacity)}
            />
          </FormField>
          <FormField label="Inclusions (comma-separated)">
            <Input
              value={form.inclusions || ''}
              onChange={(e) => patch('inclusions', e.target.value)}
            />
          </FormField>
          <FormField label="Safety notes">
            <Textarea
              value={form.safetyNotes || ''}
              onChange={(e) => patch('safetyNotes', e.target.value)}
              rows={2}
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'guide' ? (
        <>
          <FormField label="Languages (comma-separated)">
            <Input
              value={form.languages || ''}
              onChange={(e) => patch('languages', e.target.value)}
            />
          </FormField>
          <FormField label="Specialties (comma-separated)">
            <Input
              value={form.specialties || ''}
              onChange={(e) => patch('specialties', e.target.value)}
            />
          </FormField>
          <FormField label="Verification status">
            <SuggestionChips
              aria-label="Verification"
              allowDeselect
              options={[
                { value: 'unverified', label: 'Unverified' },
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
              ]}
              value={form.verificationStatus || ''}
              onChange={(verificationStatus) =>
                patch('verificationStatus', verificationStatus)
              }
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'dmc' ? (
        <>
          <FormField label="Service categories">
            <Input
              value={form.serviceCategories || ''}
              onChange={(e) => patch('serviceCategories', e.target.value)}
              placeholder="Hotels, Transport, Activities"
            />
          </FormField>
          <FormField label="Markets handled">
            <Input
              value={form.markets || ''}
              onChange={(e) => patch('markets', e.target.value)}
              placeholder="Domestic FIT, MICE"
            />
          </FormField>
          <FormField label="Emergency contact">
            <Input
              value={form.emergencyContact || ''}
              onChange={(e) => patch('emergencyContact', e.target.value)}
            />
          </FormField>
          <FormField label="Booking SLA hint">
            <Input
              value={form.bookingSlaHint || ''}
              onChange={(e) => patch('bookingSlaHint', e.target.value)}
              placeholder="Confirm within 4 hours"
            />
          </FormField>
        </>
      ) : null}

      {supplierType === 'other' ||
      (!isStaySupplierType(supplierType) &&
        !['restaurant', 'car_rental', 'driver', 'activity', 'guide', 'dmc'].includes(
          supplierType,
        )) ? (
        <>
          <FormField label="Service category">
            <Input
              value={form.serviceCategory || ''}
              onChange={(e) => patch('serviceCategory', e.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <Textarea
              value={form.description || ''}
              onChange={(e) => patch('description', e.target.value)}
              rows={3}
            />
          </FormField>
        </>
      ) : null}

      <Can anyOf={CAP.supplierWrite}>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </Can>
    </>
  );

  const roomPreviewNames = useMemo(
    () =>
      roomProducts
        .filter((r) => r.isActive !== false)
        .map((r) => r.customerFacingName?.trim() || r.name.trim())
        .filter(Boolean),
    [roomProducts],
  );

  const preview = (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Preview
      </p>
      <SupplierProfilePreview
        supplierName={supplierName}
        supplierType={supplierType}
        form={form}
        roomPreviewNames={roomPreviewNames}
      />
    </div>
  );

  const roomProductFields = (
    <>
      <FormField label="Name" required>
        <Input
          value={roomForm.name}
          onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Deluxe double"
          autoFocus
        />
        <QuickPicks>
          <SuggestionChips
            aria-label="Room name presets"
            allowDeselect
            options={STAY_ROOM_PRESETS.map((name) => ({ value: name, label: name }))}
            value={STAY_ROOM_PRESETS.includes(roomForm.name) ? roomForm.name : ''}
            onChange={(name) => setRoomForm((f) => ({ ...f, name }))}
          />
        </QuickPicks>
      </FormField>
      <FormField
        label="Proposal name"
        description="Optional customer-facing label on itineraries — defaults to internal name."
      >
        <Input
          value={roomForm.customerFacingName}
          onChange={(e) =>
            setRoomForm((f) => ({ ...f, customerFacingName: e.target.value }))
          }
          placeholder="Deluxe mountain view"
        />
      </FormField>
      <FormGrid>
        <FormField label="Max occupancy">
          <NumberField
            value={roomForm.maxOccupancy}
            onChange={(maxOccupancy) => setRoomForm((f) => ({ ...f, maxOccupancy }))}
            min={1}
            max={12}
          />
        </FormField>
        <FormField label="Units">
          <NumberField
            value={roomForm.baseQuantity}
            onChange={(baseQuantity) => setRoomForm((f) => ({ ...f, baseQuantity }))}
            min={1}
            max={999}
          />
        </FormField>
      </FormGrid>
      <FormField label="Bed config">
        <Input
          value={roomForm.bedConfig}
          onChange={(e) => setRoomForm((f) => ({ ...f, bedConfig: e.target.value }))}
          placeholder="1 king"
        />
      </FormField>
    </>
  );

  const roomEditFields = (
    <>
      <FormField label="Name" required>
        <Input
          value={roomEditForm.name}
          onChange={(e) => setRoomEditForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Deluxe double"
          autoFocus
        />
      </FormField>
      <FormField
        label="Proposal name"
        description="Optional customer-facing label on itineraries."
      >
        <Input
          value={roomEditForm.customerFacingName}
          onChange={(e) =>
            setRoomEditForm((f) => ({ ...f, customerFacingName: e.target.value }))
          }
          placeholder="Deluxe mountain view"
        />
      </FormField>
      <FormGrid>
        <FormField label="Max occupancy">
          <NumberField
            value={roomEditForm.maxOccupancy}
            onChange={(maxOccupancy) =>
              setRoomEditForm((f) => ({ ...f, maxOccupancy }))
            }
            min={1}
            max={12}
          />
        </FormField>
        <FormField label="Units">
          <NumberField
            value={roomEditForm.baseQuantity}
            onChange={(baseQuantity) =>
              setRoomEditForm((f) => ({ ...f, baseQuantity }))
            }
            min={1}
            max={999}
          />
        </FormField>
      </FormGrid>
      <FormField label="Bed config">
        <Input
          value={roomEditForm.bedConfig}
          onChange={(e) => setRoomEditForm((f) => ({ ...f, bedConfig: e.target.value }))}
          placeholder="1 king"
        />
      </FormField>
    </>
  );

  if (layout === 'split') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">
            {supplierProfileSectionTitle(supplierType)}
          </h2>
          <p className="text-xs text-muted-foreground">{profileBlurb(supplierType)}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="lg:sticky lg:top-4">{preview}</div>
          <div className="space-y-4 rounded-xl border border-border/60 px-4 py-4">
            {fields}
          </div>
        </div>
        {linkedAssetId && isStaySupplierType(supplierType) ? (
          <>
            <RecordSheet
              open={roomFormOpen}
              onOpenChange={setRoomFormOpen}
              title="Add room product"
              description="Sellable room type on the linked property inventory."
              submitLabel="Save room"
              submitting={roomSaving}
              onSubmit={() => void addRoomProduct()}
            >
              <div className="space-y-4">{roomProductFields}</div>
            </RecordSheet>
            <RecordSheet
              open={roomEditOpen}
              onOpenChange={(open) => {
                setRoomEditOpen(open);
                if (!open) setEditingRoomId(null);
              }}
              title="Edit room product"
              description="Internal name, proposal label, and capacity for this room type."
              submitLabel="Save changes"
              submitting={roomSaving}
              onSubmit={() => void saveRoomEdit()}
            >
              <div className="space-y-4">{roomEditFields}</div>
            </RecordSheet>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preview}
      <div>
        <h2 className="text-sm font-semibold">
          {supplierProfileSectionTitle(supplierType)}
        </h2>
        <p className="text-xs text-muted-foreground">{profileBlurb(supplierType)}</p>
      </div>
      {fields}
      {linkedAssetId && isStaySupplierType(supplierType) ? (
        <>
          <RecordSheet
            open={roomFormOpen}
            onOpenChange={setRoomFormOpen}
            title="Add room product"
            description="Sellable room type on the linked property inventory."
            submitLabel="Save room"
            submitting={roomSaving}
            onSubmit={() => void addRoomProduct()}
          >
            <div className="space-y-4">{roomProductFields}</div>
          </RecordSheet>
          <RecordSheet
            open={roomEditOpen}
            onOpenChange={(open) => {
              setRoomEditOpen(open);
              if (!open) setEditingRoomId(null);
            }}
            title="Edit room product"
            description="Internal name, proposal label, and capacity for this room type."
            submitLabel="Save changes"
            submitting={roomSaving}
            onSubmit={() => void saveRoomEdit()}
          >
            <div className="space-y-4">{roomEditFields}</div>
          </RecordSheet>
        </>
      ) : null}
    </div>
  );
}
