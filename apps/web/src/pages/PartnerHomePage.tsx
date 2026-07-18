import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ClipboardList, Network, Plus } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  FormGrid,
  Input,
  ListPageShell,
  PageHeader,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { PartnerInventoryPanel } from '../components/partner/PartnerInventoryPanel';
import {
  StayPortalLayout,
  StayPropertySwitcher,
  stayTabMeta,
  type StayTabId,
} from '../components/stay/StayPortalLayout';
import { StayDashboard } from '../components/stay/StayDashboard';
import { StayHousekeepingBoard } from '../components/stay/StayHousekeepingBoard';
import { StayRatesPanel } from '../components/stay/StayRatesPanel';
import { StayReservationsPanel } from '../components/stay/StayReservationsPanel';
import { StayRoomsPanel } from '../components/stay/StayRoomsPanel';
import { StayExperiencesPanel } from '../components/stay/StayExperiencesPanel';
import { StayFrontDeskPanel } from '../components/stay/StayFrontDeskPanel';
import { StayMaintenancePanel } from '../components/stay/StayMaintenancePanel';
import { StayPropertyStructurePanel } from '../components/stay/StayPropertyStructurePanel';
import { RestaurantOpsPanel } from '../components/restaurant/RestaurantOpsPanel';
import {
  GUEST_COMPANION_TAB_IDS,
  RestaurantPortalLayout,
  RESTAURANT_TABS,
  type RestaurantTabId,
} from '../components/restaurant/RestaurantPortalLayout';
import { MobilityOpsPanel } from '../components/mobility/MobilityOpsPanel';
import {
  MobilityPortalLayout,
  MOBILITY_TABS,
  type MobilityTabId,
} from '../components/mobility/MobilityPortalLayout';
import { DriverOpsPanel } from '../components/driver/DriverOpsPanel';
import {
  DriverPortalLayout,
  DRIVER_TABS,
  type DriverTabId,
} from '../components/driver/DriverPortalLayout';
import { CareHistoryPanel } from '../components/care/CareHistoryPanel';
import {
  GuestServicesPanel,
  type GuestCompanionSection,
} from '../components/guest-services/GuestServicesPanel';
import { useAuth } from '../auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  isDriverOrgKind,
  isFarmstayOrgKind,
  isFleetOrgKind,
  isRestaurantOrgKind,
  isStayOrgKind,
  orgKindLabel,
  partnerHomeSubtitle,
} from '../lib/orgKind';
import {
  isExternalPartnerPath,
  partnerOsNavForKind,
  partnerOsPathForSection,
  partnerOsSectionFromPath,
} from '../lib/partnerOsNav';
import { hasPermission } from '../lib/permissions';
import { reportError } from '../lib/errors';

type PartnerProfileResponse = {
  organization: { id: string; name: string; slug: string; kind: string };
  profile: {
    discoverable: boolean;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    bio?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    capacityHint?: string | null;
  } | null;
};

type Follower = {
  id: string;
  status: string;
  organization: { id: string; name: string; kind: string };
};

type InboundBooking = {
  id: string;
  title: string;
  type: string;
  status: string;
  confirmationRef?: string | null;
  createdAt: string;
  agency: { id: string; name: string; kind: string };
  trip: { tripNumber: string; title: string; status: string };
};

type PartnerAsset = {
  id: string;
  name: string;
  assetKind: string;
  isActive: boolean;
  place?: { id: string; name: string } | null;
};

const ASSET_KINDS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'farmstay', label: 'Farmstay' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'driver', label: 'Driver' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'other', label: 'Other' },
];

type PartnerTabId = 'portfolio' | 'inventory' | 'profile' | 'inbound';

const STAY_SECTION_IDS = new Set([
  'dashboard',
  'properties',
  'rooms',
  'front_desk',
  'reservations',
  'housekeeping',
  'maintenance',
  'rates',
  'experiences',
  'qr_locations',
  'guest_menu',
  'live_tickets',
  'companion_settings',
  'care',
  'inbox',
  'profile',
]);

const GUEST_COMPANION_SECTIONS = new Set([
  'qr_locations',
  'guest_menu',
  'live_tickets',
  'companion_settings',
]);

export function PartnerHomePage() {
  const { me } = useAuth();
  const kindLabel = orgKindLabel(me?.organization.kind);
  const orgKind = me?.organization.kind;
  const stayPortal = isStayOrgKind(orgKind);
  const restaurantPortal = isRestaurantOrgKind(orgKind);
  const fleetPortal = isFleetOrgKind(orgKind);
  const driverPortal = isDriverOrgKind(orgKind);
  const location = useLocation();
  const { navigate } = useOrgNavigate();
  const [searchParams] = useSearchParams();

  // Legacy bookmarks: /?tab=kitchen → /kitchen ; /guest-services?gs=menu → /guest-menu
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      const path = partnerOsPathForSection(orgKind, tab);
      navigate(path, { replace: true });
      return;
    }
    const gs = searchParams.get('gs');
    if (!gs) return;
    const map: Record<string, string> = {
      links: 'qr_locations',
      menu: 'guest_menu',
      board: 'live_tickets',
      settings: 'companion_settings',
    };
    const section = map[gs];
    if (!section) return;
    navigate(partnerOsPathForSection(orgKind, section), { replace: true });
  }, [searchParams, orgKind, navigate]);

  const sectionId = partnerOsSectionFromPath(location.pathname, orgKind);

  // Permission gating: hide/redirect sections this role can't access.
  const perms = me?.permissions ?? [];
  const kindNav = partnerOsNavForKind(orgKind);
  const inPageAllowedSections = kindNav.filter(
    (n) =>
      !isExternalPartnerPath(n.path) &&
      (!n.permission || hasPermission(perms, n.permission)),
  );
  const currentNavItem = kindNav.find((n) => n.id === sectionId);
  const sectionAllowed =
    !currentNavItem?.permission || hasPermission(perms, currentNavItem.permission);
  const redirectTarget = inPageAllowedSections[0]?.path;
  const stayVisibleIds = inPageAllowedSections.map((n) => n.id);
  const canProfileWrite = hasPermission(perms, 'network.write');
  const canAssetWrite =
    hasPermission(perms, 'network.write') || hasPermission(perms, 'org.settings.write');

  useEffect(() => {
    if (sectionAllowed) return;
    if (redirectTarget) navigate(redirectTarget, { replace: true });
  }, [sectionAllowed, redirectTarget, navigate]);

  const resolvedStayTab: StayTabId = STAY_SECTION_IDS.has(sectionId)
    ? (sectionId as StayTabId)
    : 'dashboard';
  const stayTab: StayTabId =
    resolvedStayTab === 'experiences' && !isFarmstayOrgKind(orgKind)
      ? 'dashboard'
      : resolvedStayTab;
  const stayMeta = stayTabMeta(stayTab, orgKind);

  const restaurantTabIds = RESTAURANT_TABS.map((t) => t.id) as RestaurantTabId[];
  const restaurantTab: RestaurantTabId = restaurantTabIds.includes(
    sectionId as RestaurantTabId,
  )
    ? (sectionId as RestaurantTabId)
    : 'inquiry';

  const mobilityTabIds = MOBILITY_TABS.map((t) => t.id) as MobilityTabId[];
  const mobilityTab: MobilityTabId = mobilityTabIds.includes(sectionId as MobilityTabId)
    ? (sectionId as MobilityTabId)
    : 'book';

  const driverTabIds = DRIVER_TABS.map((t) => t.id) as DriverTabId[];
  const driverTab: DriverTabId = driverTabIds.includes(sectionId as DriverTabId)
    ? (sectionId as DriverTabId)
    : 'today';

  const partnerTab: PartnerTabId =
    sectionId === 'inventory' ||
    sectionId === 'profile' ||
    sectionId === 'inbound' ||
    sectionId === 'portfolio'
      ? sectionId
      : 'portfolio';

  useDocumentTitle(
    stayPortal
      ? stayMeta.label
      : restaurantPortal
        ? `Restaurant · ${RESTAURANT_TABS.find((t) => t.id === restaurantTab)?.label || 'Home'}`
        : fleetPortal
          ? `Cars · ${MOBILITY_TABS.find((t) => t.id === mobilityTab)?.label || 'Home'}`
          : driverPortal
            ? `Driver · ${DRIVER_TABS.find((t) => t.id === driverTab)?.label || 'Home'}`
            : `${kindLabel} home`,
  );

  const [profile, setProfile] = useState<PartnerProfileResponse | null>(null);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [inbound, setInbound] = useState<InboundBooking[]>([]);
  const [assets, setAssets] = useState<PartnerAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PartnerAsset | null>(null);
  const [assetForm, setAssetForm] = useState({ name: '', assetKind: 'hotel' });
  const [form, setForm] = useState({
    discoverable: true,
    city: '',
    region: '',
    bio: '',
    contactEmail: '',
    contactPhone: '',
    capacityHint: '',
  });

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || assets[0] || null,
    [assets, selectedAssetId],
  );

  const load = useCallback(async () => {
    try {
      const [p, f, b, a] = await Promise.all([
        api<PartnerProfileResponse>('/network/profile'),
        api<Follower[]>('/network/followers'),
        api<InboundBooking[]>('/network/inbound-bookings'),
        api<PartnerAsset[]>('/partner-assets'),
      ]);
      setProfile(p);
      setFollowers(f);
      setInbound(b);
      setAssets(a);
      setSelectedAssetId((prev) => {
        if (prev && a.some((x) => x.id === prev)) return prev;
        return a[0]?.id ?? null;
      });
      const pr = p.profile;
      setForm({
        discoverable: pr?.discoverable ?? true,
        city: pr?.city || '',
        region: pr?.region || '',
        bio: pr?.bio || '',
        contactEmail: pr?.contactEmail || '',
        contactPhone: pr?.contactPhone || '',
        capacityHint: pr?.capacityHint || '',
      });
    } catch (e) {
      reportError(e, 'Could not load partner home');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function goToSection(section: string) {
    if (section === 'experiences' && !isFarmstayOrgKind(orgKind)) {
      toastError('Experiences are available for farmstay accounts');
      return;
    }
    navigate(partnerOsPathForSection(orgKind, section));
  }

  function stayPageSubtitle(tab: StayTabId) {
    switch (tab) {
      case 'dashboard':
        return 'Tonight’s occupancy, arrivals, and inbound requests.';
      case 'properties':
        return 'Properties under this hotel account.';
      case 'rooms':
        return 'Room products, units, allotment calendar, and stop-sell.';
      case 'front_desk':
        return 'Today’s arrivals, departures, in-house guests, and no-shows.';
      case 'reservations':
        return 'Agency inbound and manual stays — check-in and check-out.';
      case 'housekeeping':
        return 'Unit status board — clean, dirty, occupied, OOO.';
      case 'maintenance':
        return 'Work orders and inventory blocks for repairs.';
      case 'rates':
        return 'BAR and seasonal rates on room products.';
      case 'experiences':
        return 'Farm and activity products with capacity and safety notes.';
      case 'care':
        return 'Look up guest history across past stays and related visits.';
      case 'qr_locations':
        return 'Tables and rooms with printable QR links for Guest Companion.';
      case 'guest_menu':
        return 'Catalogue guests see in Companion — categories, dishes, and promotions.';
      case 'live_tickets':
        return 'A-la-carte kitchen / host board for QR orders and floor requests.';
      case 'companion_settings':
        return 'Ordering hours, pause controls, and Guest Companion rules.';
      case 'inbox':
        return 'Confirm agency booking requests and create stay reservations.';
      case 'profile':
        return 'Network discoverability for agencies.';
      default:
        return partnerHomeSubtitle(orgKind);
    }
  }

  function restaurantPageSubtitle(tab: RestaurantTabId): string {
    switch (tab) {
      case 'qr_locations':
        return 'Tables and rooms with printable QR links for Guest Companion.';
      case 'guest_menu':
        return 'Catalogue guests see in Companion — categories, dishes, and promotions.';
      case 'live_tickets':
        return 'A-la-carte kitchen board for QR orders and floor requests.';
      case 'companion_settings':
        return 'Ordering hours, pause controls, and Guest Companion rules.';
      case 'kitchen':
        return 'Group dining pass — booked meal packages for today.';
      case 'care':
        return 'Look up guest history across past visits.';
      case 'catalog':
        return 'Meal packages and dining products.';
      case 'profile':
        return 'Network discoverability for agencies.';
      case 'inbound':
        return 'Confirm agency booking requests.';
      default:
        return 'Inquiry → reserve → kitchen → bill — offline restaurant OS.';
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await api('/network/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          discoverable: form.discoverable,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          bio: form.bio.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          capacityHint: form.capacityHint.trim() || null,
        }),
      });
      toastSuccess('Profile saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  async function confirmInbound(booking: InboundBooking) {
    const ref = window.prompt('Confirmation reference (optional)', booking.confirmationRef || '');
    if (ref === null) return;
    try {
      await api(`/network/inbound-bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'confirmed',
          confirmationRef: ref.trim() || null,
          assetId: selectedAsset?.id || undefined,
        }),
      });
      toastSuccess('Booking confirmed — reservation created when stock allows');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not confirm booking');
    }
  }

  function openCreateAsset() {
    setEditingAsset(null);
    setAssetForm({
      name: '',
      assetKind: ASSET_KINDS.some((k) => k.value === me?.organization.kind)
        ? (me?.organization.kind as string)
        : me?.organization.kind === 'car_rental'
          ? 'vehicle'
          : me?.organization.kind === 'driver'
            ? 'driver'
            : 'hotel',
    });
    setAssetOpen(true);
  }

  function openEditAsset(asset: PartnerAsset) {
    setEditingAsset(asset);
    setAssetForm({ name: asset.name, assetKind: asset.assetKind });
    setAssetOpen(true);
  }

  async function saveAsset() {
    if (!assetForm.name.trim()) {
      toastError('Asset name is required');
      return;
    }
    try {
      if (editingAsset) {
        await api(`/partner-assets/${editingAsset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: assetForm.name.trim(),
            assetKind: assetForm.assetKind,
          }),
        });
        toastSuccess('Asset updated');
      } else {
        await api('/partner-assets', {
          method: 'POST',
          body: JSON.stringify({
            name: assetForm.name.trim(),
            assetKind: assetForm.assetKind,
          }),
        });
        toastSuccess('Asset added');
      }
      setAssetOpen(false);
      setEditingAsset(null);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save asset');
    }
  }

  const profilePanel = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-5">
          <strong className="text-sm">Discoverability</strong>
          <p className="text-xs text-muted-foreground">
            Agencies find you on Network when discoverable is on.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="partner-discoverable"
              checked={form.discoverable}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, discoverable: checked === true }))
              }
            />
            <label htmlFor="partner-discoverable" className="cursor-pointer text-sm">
              Listed in partner network
            </label>
          </div>
          <FormGrid>
            <FormField label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Goa"
              />
            </FormField>
            <FormField label="Region">
              <Input
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              />
            </FormField>
          </FormGrid>
          <FormField label="Bio">
            <Input
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Beachfront boutique stay…"
            />
          </FormField>
          <FormGrid>
            <FormField label="B2B email">
              <Input
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              />
            </FormField>
            <FormField label="B2B phone">
              <Input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              />
            </FormField>
          </FormGrid>
          <FormField label="Capacity hint">
            <Input
              value={form.capacityHint}
              onChange={(e) => setForm((f) => ({ ...f, capacityHint: e.target.value }))}
              placeholder="24 rooms · groups OK"
            />
          </FormField>
          {canProfileWrite ? (
            <Button disabled={saving} onClick={() => void saveProfile()}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-muted-foreground" />
            <strong className="text-sm">Agencies following you</strong>
          </div>
          {followers.length ? (
            <ul className="space-y-2">
              {followers.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm glass-row"
                >
                  <span className="font-medium">{f.organization.name}</span>
                  <StatusBadge value={f.status} showIcon={false} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No followers yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const inboundPanel = (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <strong className="text-sm">
            {stayPortal ? 'Inbound requests' : 'Inbound bookings'}
          </strong>
        </div>
        <p className="text-xs text-muted-foreground">
          Confirming allocates inventory and creates a stay reservation when dates and
          stock exist.
        </p>
        {inbound.length ? (
          <ul className="space-y-2">
            {inbound.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm glass-row"
              >
                <div className="min-w-0">
                  <div className="font-medium">{b.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.agency.name} · {b.trip.tripNumber} · {b.trip.title}
                    {b.confirmationRef ? ` · ${b.confirmationRef}` : ''}
                  </div>
                  <div className="mt-1">
                    <StatusBadge value={b.status} />
                  </div>
                </div>
                {canProfileWrite && b.status !== 'confirmed' && b.status !== 'cancelled' ? (
                  <Button type="button" size="sm" onClick={() => void confirmInbound(b)}>
                    Confirm
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No inbound bookings yet. When an agency links your organization and adds you
            on a trip booking, it will show here.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const propertiesPanel = (
    <Card className="mb-4">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-sm">{stayPortal ? 'Properties' : 'Portfolio'}</strong>
            <p className="text-xs text-muted-foreground">
              Operable units under this {kindLabel.toLowerCase()} account. Inventory hangs
              off each asset.
            </p>
          </div>
          {canAssetWrite ? (
            <Button type="button" size="sm" onClick={openCreateAsset}>
              <Plus className="size-4" />
              {stayPortal ? 'Add property' : 'Add asset'}
            </Button>
          ) : null}
        </div>
        {assets.length ? (
          <ul className="space-y-2">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
              >
                <div className="min-w-0">
                  <div className="font-medium">{asset.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusBadge value={asset.assetKind} showIcon={false} />
                    {asset.place ? <span>· {asset.place.name}</span> : null}
                    {!asset.isActive ? <span>· inactive</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      if (stayPortal) goToSection('rooms');
                      else goToSection('inventory');
                    }}
                  >
                    {stayPortal ? 'Rooms' : 'Inventory'}
                  </Button>
                  {canAssetWrite ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEditAsset(asset)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No assets yet. Add your first property, vehicle, or driver.
          </p>
        )}
      </CardContent>
    </Card>
  );

  const assetSheet = (
    <RecordSheet
      open={assetOpen}
      onOpenChange={(next) => {
        setAssetOpen(next);
        if (!next) setEditingAsset(null);
      }}
      title={editingAsset ? (stayPortal ? 'Edit property' : 'Edit asset') : stayPortal ? 'Add property' : 'Add asset'}
      description="One operable unit under this account (hotel, vehicle, driver…)."
      submitLabel={editingAsset ? 'Save' : 'Add'}
      onSubmit={() => void saveAsset()}
    >
      <FormField label="Name" required>
        <Input
          value={assetForm.name}
          onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Hillside Homestay"
          required
        />
      </FormField>
      <FormField label="Kind">
        <SuggestionChips
          aria-label="Asset kind"
          allowDeselect={false}
          options={ASSET_KINDS}
          value={assetForm.assetKind}
          onChange={(assetKind) => setAssetForm((f) => ({ ...f, assetKind }))}
        />
      </FormField>
    </RecordSheet>
  );

  const needsProperty =
    stayTab === 'rooms' ||
    stayTab === 'front_desk' ||
    stayTab === 'reservations' ||
    stayTab === 'housekeeping' ||
    stayTab === 'maintenance' ||
    stayTab === 'rates' ||
    stayTab === 'experiences' ||
    GUEST_COMPANION_SECTIONS.has(stayTab);

  if (!sectionAllowed) {
    return (
      <ListPageShell>
        <PageHeader
          icon={Building2}
          title="Restricted section"
          subtitle="Your role doesn’t have access to this section."
        />
        <p className="text-sm text-muted-foreground">
          {redirectTarget
            ? 'Redirecting to a section you can access…'
            : 'No sections are available for your role. Ask an owner or admin for access.'}
        </p>
      </ListPageShell>
    );
  }

  return (
    <ListPageShell
      fill={!stayPortal && !restaurantPortal && !fleetPortal && !driverPortal}
    >
      <PageHeader
        icon={Building2}
        title={
          stayPortal
            ? stayMeta.label
            : restaurantPortal
              ? RESTAURANT_TABS.find((t) => t.id === restaurantTab)?.label ||
                me?.organization.name ||
                'Restaurant'
              : fleetPortal
                ? me?.organization.name || 'Car rental'
                : driverPortal
                  ? me?.organization.name || 'Driver'
                  : me?.organization.name || `${kindLabel} home`
        }
        subtitle={
          stayPortal
            ? stayPageSubtitle(stayTab)
            : restaurantPortal
              ? restaurantPageSubtitle(restaurantTab)
              : fleetPortal
                ? 'Fleet → rates → book → checkout/return → bill — offline car rental OS.'
                : driverPortal
                  ? 'Today → job → en route → complete → pay — mobile-first driver OS.'
                  : partnerHomeSubtitle(orgKind)
        }
        actions={
          (stayPortal && needsProperty) ||
          restaurantPortal ||
          fleetPortal ||
          driverPortal ? (
            <StayPropertySwitcher
              assets={assets}
              selectedId={selectedAsset?.id || null}
              onChange={setSelectedAssetId}
            />
          ) : undefined
        }
      />

      {stayPortal ? (
        <StayPortalLayout orgKind={orgKind} visibleTabIds={stayVisibleIds}>
          {stayTab === 'dashboard' ? (
            <StayDashboard assetId={selectedAsset?.id || null} />
          ) : null}
          {stayTab === 'properties' ? (
            <>
              {propertiesPanel}
              {selectedAsset ? (
                <StayPropertyStructurePanel assetId={selectedAsset.id} />
              ) : null}
            </>
          ) : null}
          {stayTab === 'rooms' ? (
            selectedAsset ? (
              <StayRoomsPanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'front_desk' ? (
            selectedAsset ? (
              <StayFrontDeskPanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'reservations' ? (
            selectedAsset ? (
              <StayReservationsPanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'housekeeping' ? (
            selectedAsset ? (
              <StayHousekeepingBoard assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'maintenance' ? (
            selectedAsset ? (
              <StayMaintenancePanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'rates' ? (
            selectedAsset ? (
              <StayRatesPanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'experiences' ? (
            selectedAsset ? (
              <StayExperiencesPanel assetId={selectedAsset.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {GUEST_COMPANION_SECTIONS.has(stayTab) ? (
            selectedAsset ? (
              <GuestServicesPanel
                assetId={selectedAsset.id}
                orgKind={orgKind}
                section={stayTab as GuestCompanionSection}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Add a property first.</p>
            )
          ) : null}
          {stayTab === 'care' ? <CareHistoryPanel /> : null}
          {stayTab === 'inbox' ? inboundPanel : null}
          {stayTab === 'profile' ? profilePanel : null}
        </StayPortalLayout>
      ) : restaurantPortal ? (
        <RestaurantPortalLayout>
          {restaurantTab === 'profile' ? (
            profilePanel
          ) : restaurantTab === 'inbound' ? (
            inboundPanel
          ) : (GUEST_COMPANION_TAB_IDS as readonly string[]).includes(restaurantTab) ? (
            selectedAsset ? (
              <GuestServicesPanel
                assetId={selectedAsset.id}
                orgKind={orgKind}
                section={restaurantTab as GuestCompanionSection}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Add a restaurant asset first.</p>
            )
          ) : selectedAsset ? (
            <RestaurantOpsPanel assetId={selectedAsset.id} tab={restaurantTab} />
          ) : (
            <div className="space-y-3">
              {propertiesPanel}
              <p className="text-sm text-muted-foreground">
                Add a restaurant outlet (asset) to run inquiries, reservations, kitchen, and billing.
              </p>
            </div>
          )}
        </RestaurantPortalLayout>
      ) : fleetPortal ? (
        <MobilityPortalLayout>
          {mobilityTab === 'profile' ? (
            profilePanel
          ) : mobilityTab === 'inbound' ? (
            inboundPanel
          ) : selectedAsset ? (
            <MobilityOpsPanel
              assetId={selectedAsset.id}
              orgKind={orgKind}
              tab={mobilityTab}
            />
          ) : (
            <div className="space-y-3">
              {propertiesPanel}
              <p className="text-sm text-muted-foreground">
                Add a vehicle fleet asset to manage units, rates, rentals, and billing.
              </p>
            </div>
          )}
        </MobilityPortalLayout>
      ) : driverPortal ? (
        <DriverPortalLayout tab={driverTab} onNavigate={(path) => navigate(path)}>
          {driverTab === 'profile' ? (
            profilePanel
          ) : driverTab === 'inbound' ? (
            inboundPanel
          ) : selectedAsset ? (
            <DriverOpsPanel
              assetId={selectedAsset.id}
              orgKind={orgKind}
              tab={driverTab}
            />
          ) : (
            <div className="space-y-3">
              {propertiesPanel}
              <p className="text-sm text-muted-foreground">
                Add a driver profile (asset) to manage calendar, jobs, and pay.
              </p>
            </div>
          )}
        </DriverPortalLayout>
      ) : (
        <>
          {partnerTab === 'portfolio' ? propertiesPanel : null}

          {partnerTab === 'inventory' ? (
            <div className="space-y-3">
              {assets.length ? (
                <div className="flex min-w-[12rem] flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Asset</span>
                  <Combobox
                    className="min-w-[12rem]"
                    options={assets.map((a) => ({
                      value: a.id,
                      label: `${a.name} (${a.assetKind})`,
                    }))}
                    value={selectedAsset?.id || undefined}
                    onChange={setSelectedAssetId}
                    placeholder="Select asset"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add an asset first, then manage rooms, fleet, or calendar here.
                </p>
              )}
              {selectedAsset ? (
                <PartnerInventoryPanel
                  assetId={selectedAsset.id}
                  assetKind={selectedAsset.assetKind}
                  orgKind={me?.organization.kind}
                />
              ) : null}
            </div>
          ) : null}

          {partnerTab === 'profile' ? profilePanel : null}
          {partnerTab === 'inbound' ? inboundPanel : null}
        </>
      )}

      {assetSheet}
      {profile ? null : null}
    </ListPageShell>
  );
}
