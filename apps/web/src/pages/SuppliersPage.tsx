import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, ClipboardList, MoreHorizontal, Plus, UserPlus } from 'lucide-react';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  Input,
  ListPageShell,
  PageHeader,
  PhoneInput,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { PartnerInventoryPanel } from '../components/partner/PartnerInventoryPanel';
import { SupplierContractsPanel } from '../components/agency/SupplierContractsPanel';
import { toPlaceRef, type PlaceRef } from '../lib/placeRefs';

type Supplier = {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  linkedOrganizationId?: string | null;
  linkedOrganization?: { id: string; name: string; kind: string } | null;
  linkedAsset?: { id: string; name: string; assetKind: string } | null;
};

const SUPPLIER_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'farmstay', label: 'Farmstay' },
  { value: 'car_rental', label: 'Car rental' },
  { value: 'driver', label: 'Driver' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'dmc', label: 'DMC' },
  { value: 'other', label: 'Other' },
];

export function SuppliersPage() {
  useDocumentTitle('Suppliers');
  const { has, hasAny } = usePermissions();
  const canContracts = has('ops.read');
  const canNetworkWrite = hasAny(CAP.networkWrite);
  const canOpenInventory = hasAny(CAP.supplierInventory);
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryTarget, setInventoryTarget] = useState<{
    assetId: string;
    assetKind: string;
    name: string;
  } | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractTarget, setContractTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'hotel',
    email: '',
    phone: '',
    placeId: null as PlaceRef | null,
    profileImageUrl: '',
    capacityHint: '',
    imageUrls: '',
    amenities: '',
    roomHints: '',
    stars: '',
    googleRating: '',
    googleReviewCount: '',
    googleMapsUrl: '',
    reviewSnippet: '',
    checkIn: '',
    checkOut: '',
    distanceHint: '',
  });

  const isStayType =
    form.type === 'hotel' || form.type === 'homestay' || form.type === 'farmstay';

  function emptyForm() {
    return {
      name: '',
      type: 'hotel',
      email: '',
      phone: '',
      placeId: null as PlaceRef | null,
      profileImageUrl: '',
      capacityHint: '',
      imageUrls: '',
      amenities: '',
      roomHints: '',
      stars: '',
      googleRating: '',
      googleReviewCount: '',
      googleMapsUrl: '',
      reviewSnippet: '',
      checkIn: '',
      checkOut: '',
      distanceHint: '',
    };
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api<Supplier[]>('/suppliers');
      setItems(res);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load suppliers';
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!form.name.trim()) {
      toastError('Name is required');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        email: form.email || undefined,
        phone: form.phone || undefined,
      };
      const placeRef = toPlaceRef(form.placeId);
      if (placeRef?.placeId) payload.placeId = placeRef.placeId;
      const profileJson: Record<string, unknown> = {};
      if (form.profileImageUrl.trim()) profileJson.imageUrl = form.profileImageUrl.trim();
      if (form.capacityHint.trim()) profileJson.capacityHint = form.capacityHint.trim();
      if (isStayType) {
        const gallery = form.imageUrls
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (gallery.length) profileJson.imageUrls = gallery;
        const amenities = form.amenities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (amenities.length) profileJson.amenities = amenities;
        const roomHints = form.roomHints
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (roomHints.length) profileJson.roomHints = roomHints;
        if (form.stars.trim()) {
          const stars = Number(form.stars);
          if (Number.isFinite(stars)) profileJson.stars = stars;
        }
        if (form.googleRating.trim()) {
          const rating = Number(form.googleRating);
          if (Number.isFinite(rating)) profileJson.googleRating = rating;
        }
        if (form.googleReviewCount.trim()) {
          const count = Number(form.googleReviewCount);
          if (Number.isFinite(count)) profileJson.googleReviewCount = count;
        }
        if (form.googleMapsUrl.trim()) profileJson.googleMapsUrl = form.googleMapsUrl.trim();
        if (form.reviewSnippet.trim()) profileJson.reviewSnippet = form.reviewSnippet.trim();
        if (form.checkIn.trim()) profileJson.checkIn = form.checkIn.trim();
        if (form.checkOut.trim()) profileJson.checkOut = form.checkOut.trim();
        if (form.distanceHint.trim()) profileJson.distanceHint = form.distanceHint.trim();
      }
      if (Object.keys(profileJson).length) payload.profileJson = profileJson;
      await api('/suppliers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toastSuccess('Supplier created');
      setOpen(false);
      setForm(emptyForm());
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create supplier');
    }
  }

  function isInventoryType(type: string) {
    return (
      type === 'hotel' ||
      type === 'homestay' ||
      type === 'farmstay' ||
      type === 'car_rental' ||
      type === 'driver' ||
      type === 'restaurant'
    );
  }

  const columns = useMemo<ColumnDef<Supplier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { label: 'Name' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {isInventoryType(s.type) && canOpenInventory ? (
                <button
                  type="button"
                  className="truncate font-medium text-primary hover:underline"
                  onClick={() => void openInventory(s)}
                >
                  {s.name}
                </button>
              ) : (
                <span className="truncate font-medium text-primary">{s.name}</span>
              )}
              {s.linkedOrganization ? (
                <StatusBadge value="network" label="Network" showIcon={false} />
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'type',
        accessorFn: (r) => r.type,
        header: 'Type',
        meta: { label: 'Type' },
        size: 140,
        minSize: 110,
        cell: ({ row }) => <StatusBadge value={row.original.type} />,
      },
      {
        id: 'asset',
        header: 'Linked asset',
        meta: { label: 'Linked asset' },
        size: 180,
        minSize: 140,
        accessorFn: (r) => r.linkedAsset?.name || '',
        cell: ({ row }) =>
          row.original.linkedAsset ? (
            <span className="text-muted-foreground">
              {row.original.linkedAsset.name}
              <span className="text-xs opacity-70">
                {' '}
                · {row.original.linkedAsset.assetKind.replace(/_/g, ' ')}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'network',
        header: 'Linked partner',
        meta: { label: 'Linked partner' },
        size: 140,
        minSize: 110,
        accessorFn: (r) => r.linkedOrganization?.kind || '',
        cell: ({ row }) =>
          row.original.linkedOrganization ? (
            <span className="text-muted-foreground">
              {row.original.linkedOrganization.kind.replace(/_/g, ' ')}
            </span>
          ) : (
            <span className="text-muted-foreground">Local only</span>
          ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        meta: { label: 'Email' },
        size: 200,
        minSize: 140,
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        meta: { label: 'Phone' },
        size: 140,
        minSize: 120,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.phone || '—'}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        minSize: 44,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const s = row.original;
          const stay = isInventoryType(s.type);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Supplier actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {s.name}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canContracts ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setContractTarget({ id: s.id, name: s.name });
                      setContractOpen(true);
                    }}
                  >
                    <ClipboardList />
                    Contracts
                  </DropdownMenuItem>
                ) : null}
                {stay && canOpenInventory ? (
                  <DropdownMenuItem onClick={() => void openInventory(s)}>
                    <ClipboardList />
                    Inventory
                  </DropdownMenuItem>
                ) : null}
                {s.linkedOrganization ? (
                  <DropdownMenuItem disabled>
                    <UserPlus />
                    Claimed
                  </DropdownMenuItem>
                ) : canNetworkWrite ? (
                  <DropdownMenuItem onClick={() => void inviteSupplier(s)}>
                    <UserPlus />
                    Invite to claim
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function openInventory(supplier: Supplier) {
    try {
      if (supplier.linkedOrganization && supplier.linkedAsset) {
        toastSuccess(
          `${supplier.linkedOrganization.name} manages this inventory — switch to their ${supplier.linkedOrganization.kind.replace(/_/g, ' ')} workspace to edit.`,
        );
        return;
      }
      let assetId = supplier.linkedAsset?.id;
      let assetKind = supplier.linkedAsset?.assetKind || supplier.type;
      if (!assetId) {
        const asset = await api<{ id: string; assetKind: string }>('/inventory/shadow-asset', {
          method: 'POST',
          body: JSON.stringify({ supplierId: supplier.id }),
        });
        assetId = asset.id;
        assetKind = asset.assetKind;
        await load();
      }
      setInventoryTarget({
        assetId,
        assetKind,
        name: supplier.name,
      });
      setInventoryOpen(true);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not open inventory');
    }
  }

  async function inviteSupplier(supplier: Supplier) {
    try {
      const res = await api<{ claimPath: string; claimToken: string }>(
        `/network/suppliers/${supplier.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email: supplier.email || undefined }),
        },
      );
      const url = `${window.location.origin}${res.claimPath}`;
      await navigator.clipboard.writeText(url);
      toastSuccess('Invite link copied — send it to the supplier to claim');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create invite');
    }
  }

  return (
    <ListPageShell>
      <PageHeader
        icon={Building2}
        title="Suppliers"
        subtitle="Hotels, homestays, farmstays, cars, drivers, restaurants and DMCs. Open Inventory for rooms & calendars; invite partners to claim their own workspace."
        className="mb-4 shrink-0"
        actions={
          <Can anyOf={CAP.supplierWrite}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New supplier
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        error={error}
        pageSize={25}
        searchKey="name"
        searchPlaceholder="Search suppliers…"
        columnVisibilityKey={StorageKeys.suppliers.columns}
        emptyTitle="No suppliers yet"
        emptyDescription="Add suppliers while confirming bookings, or create them here."
        emptyIcon={Building2}
        emptyAction={
          <Can anyOf={CAP.supplierWrite}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New supplier
            </Button>
          </Can>
        }
      />
      <RecordSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setForm(emptyForm());
          }
        }}
        title="New supplier"
        description="Used when assigning bookings on a trip. Hotels can store the full itinerary photo/rating pack."
        submitLabel="Create"
        onSubmit={create}
      >
        <FormField label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Supplier name"
            required
          />
        </FormField>
        <FormField label="Type">
          <SuggestionChips
            aria-label="Supplier type"
            allowDeselect={false}
            options={SUPPLIER_TYPES}
            value={form.type}
            onChange={(type) => setForm({ ...form, type })}
          />
        </FormField>
        <FormField label="Email">
          <EmailInput
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
            placeholder="ops@…"
          />
        </FormField>
        <FormField label="Phone">
          <PhoneInput
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
          />
        </FormField>
        <PlaceSinglePicker
          label="Near place (optional)"
          value={form.placeId}
          onChange={(placeId) => setForm({ ...form, placeId })}
          placeholder="City or area for discovery"
        />
        <FormField label="Profile image URL (optional)">
          <Input
            value={form.profileImageUrl}
            onChange={(e) => setForm({ ...form, profileImageUrl: e.target.value })}
            placeholder="https://…"
          />
        </FormField>
        <FormField label="Capacity hint (optional)">
          <Input
            value={form.capacityHint}
            onChange={(e) => setForm({ ...form, capacityHint: e.target.value })}
            placeholder="24 rooms · groups OK"
          />
        </FormField>
        {isStayType ? (
          <>
            <FormField label="Gallery photos (one URL per line)">
              <textarea
                className="flex min-h-[64px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.imageUrls}
                onChange={(e) => setForm({ ...form, imageUrls: e.target.value })}
                placeholder={'https://…\nhttps://…'}
              />
            </FormField>
            <FormField label="Amenities (comma-separated)">
              <Input
                value={form.amenities}
                onChange={(e) => setForm({ ...form, amenities: e.target.value })}
                placeholder="WiFi, Breakfast, Mountain view"
              />
            </FormField>
            <FormField label="Room types (comma-separated)">
              <Input
                value={form.roomHints}
                onChange={(e) => setForm({ ...form, roomHints: e.target.value })}
                placeholder="Deluxe, Suite"
              />
            </FormField>
            <FormField label="Stars">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.stars}
                onChange={(e) => setForm({ ...form, stars: e.target.value })}
                placeholder="4"
              />
            </FormField>
            <FormField label="Google rating">
              <Input
                type="number"
                step="0.1"
                value={form.googleRating}
                onChange={(e) => setForm({ ...form, googleRating: e.target.value })}
                placeholder="4.5"
              />
            </FormField>
            <FormField label="Google review count">
              <Input
                type="number"
                value={form.googleReviewCount}
                onChange={(e) => setForm({ ...form, googleReviewCount: e.target.value })}
                placeholder="1287"
              />
            </FormField>
            <FormField label="Google Maps URL">
              <Input
                value={form.googleMapsUrl}
                onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })}
                placeholder="https://maps.google.com/…"
              />
            </FormField>
            <FormField label="Review snippet">
              <Input
                value={form.reviewSnippet}
                onChange={(e) => setForm({ ...form, reviewSnippet: e.target.value })}
                placeholder="“Rooms were spotless…”"
              />
            </FormField>
            <FormField label="Check-in default">
              <Input
                value={form.checkIn}
                onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
                placeholder="2:00 PM"
              />
            </FormField>
            <FormField label="Check-out default">
              <Input
                value={form.checkOut}
                onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
                placeholder="11:00 AM"
              />
            </FormField>
            <FormField label="Distance hint">
              <Input
                value={form.distanceHint}
                onChange={(e) => setForm({ ...form, distanceHint: e.target.value })}
                placeholder="500m from Mall Road"
              />
            </FormField>
          </>
        ) : null}
      </RecordSheet>
      <RecordSheet
        open={inventoryOpen}
        onOpenChange={(next) => {
          setInventoryOpen(next);
          if (!next) setInventoryTarget(null);
        }}
        title={inventoryTarget ? `Inventory · ${inventoryTarget.name}` : 'Inventory'}
        description="Local shadow asset under your agency. Claimed partners edit inventory in their own workspace."
        submitLabel="Done"
        onSubmit={() => setInventoryOpen(false)}
      >
        {inventoryTarget ? (
          <PartnerInventoryPanel
            assetId={inventoryTarget.assetId}
            assetKind={inventoryTarget.assetKind}
          />
        ) : null}
      </RecordSheet>
      <RecordSheet
        open={contractOpen}
        onOpenChange={(next) => {
          setContractOpen(next);
          if (!next) setContractTarget(null);
        }}
        title={contractTarget ? `Contracts · ${contractTarget.name}` : 'Contracts'}
        description="Payment terms, preferred flag, and contract status for this supplier."
        submitLabel="Done"
        onSubmit={() => setContractOpen(false)}
      >
        {contractTarget ? (
          <SupplierContractsPanel
            supplierId={contractTarget.id}
            supplierName={contractTarget.name}
          />
        ) : null}
      </RecordSheet>
    </ListPageShell>
  );
}
