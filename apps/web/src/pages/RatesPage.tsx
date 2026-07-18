import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'react-router-dom';
import {
  BedDouble,
  Car,
  Copy,
  IndianRupee,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Button,
  Combobox,
  DataTable,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  FormGrid,
  FormSection,
  Input,
  ListPageShell,
  PageHeader,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CAP } from '../lib/capabilities';
import { reportError } from '../lib/errors';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PlaceSinglePicker } from '../components/places/PlacePicker';
import { RatesCsvImportDialog } from '../components/rates/RatesCsvImportDialog';
import { type PlaceRef } from '../lib/placeRefs';
import { formatDateInput, parseDateInput } from '../lib/dateInput';

type RatesTab = 'hotel' | 'transfer';

function tabFromSearch(raw: string | null): RatesTab {
  if (raw === 'transfer') return 'transfer';
  return 'hotel';
}

type HotelRate = {
  id: string;
  supplierId?: string | null;
  placeId?: string | null;
  isSystem?: boolean;
  roomType?: string | null;
  unitCost: number | string;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  supplier?: { id: string; name: string; type: string } | null;
  place?: { id: string; name: string; kind?: string } | null;
};

type TransferFare = {
  id: string;
  isSystem?: boolean;
  organizationId?: string | null;
  fromPlaceId: string;
  toPlaceId: string;
  vehicleTypeId: string;
  unitCost: number | string;
  childUnitCost?: number | string | null;
  pricingMode?: string;
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  fromPlace?: { id: string; name: string };
  toPlace?: { id: string; name: string };
  vehicleType?: { id: string; name: string; seats?: number | null };
};

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

function emptyHotelForm() {
  return {
    supplierId: '',
    supplierLabel: '',
    place: null as PlaceRef | null,
    roomType: '',
    unitCost: '',
    startDate: '',
    endDate: '',
  };
}

function emptyTransferForm() {
  return {
    from: null as PlaceRef | null,
    to: null as PlaceRef | null,
    vehicleTypeId: '',
    vehicleLabel: '',
    unitCost: '',
    childUnitCost: '',
    pricingMode: 'per_vehicle' as 'per_vehicle' | 'per_adult',
    startDate: '',
    endDate: '',
  };
}

async function searchStaySuppliers(q: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', 'hotel,homestay,farmstay');
  const items = await api<
    Array<{ id: string; name: string; type: string }>
  >(`/suppliers?${params.toString()}`);
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: s.type.replace(/_/g, ' '),
  }));
}

async function searchVehicleTypes(q: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<{
    items: Array<{ id: string; name: string; seats?: number | null }>;
  }>(`/vehicle-types?${params.toString()}`);
  return res.items.map((v) => ({
    value: v.id,
    label: v.name,
    description: v.seats != null ? `${v.seats} seats` : undefined,
  }));
}

function hotelLabel(r: HotelRate) {
  if (r.supplier?.name) {
    return r.place?.name
      ? `${r.supplier.name} · ${r.place.name}`
      : r.supplier.name;
  }
  if (r.place?.name) return `Place default · ${r.place.name}`;
  return 'Hotel rate';
}

function hotelKind(r: HotelRate): 'supplier' | 'place' {
  return r.supplierId || r.supplier ? 'supplier' : 'place';
}

function transferRouteLabel(f: TransferFare) {
  return `${f.fromPlace?.name || '—'} → ${f.toPlace?.name || '—'}`;
}

export function RatesPage() {
  useDocumentTitle('Catalog & transfers');
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.ratesWrite);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromSearch(searchParams.get('tab'));
  const setTab = useCallback(
    (next: RatesTab) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'hotel') params.delete('tab');
      else params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [hotelRates, setHotelRates] = useState<HotelRate[]>([]);
  const [transferFares, setTransferFares] = useState<TransferFare[]>([]);
  const [loading, setLoading] = useState(true);
  const [hotelOpen, setHotelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [hotelForm, setHotelForm] = useState(emptyHotelForm);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hotels, fares] = await Promise.all([
        api<{ items: HotelRate[] }>('/hotel-rates'),
        api<{ items: TransferFare[] }>('/transfer-fares'),
      ]);
      setHotelRates(hotels.items);
      setTransferFares(fares.items);
    } catch (e) {
      reportError(e, 'Could not load rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearchSuppliers = useCallback(
    (q: string) => searchStaySuppliers(q),
    [],
  );
  const onSearchVehicles = useCallback(
    (q: string) => searchVehicleTypes(q),
    [],
  );

  function openCreateHotel() {
    setEditingHotelId(null);
    setHotelForm(emptyHotelForm());
    setHotelOpen(true);
  }

  function openEditHotel(rate: HotelRate) {
    if (rate.isSystem) return;
    setEditingHotelId(rate.id);
    setHotelForm({
      supplierId: rate.supplierId || '',
      supplierLabel: rate.supplier?.name || '',
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      roomType: rate.roomType || '',
      unitCost: String(Number(rate.unitCost)),
      startDate: isoDate(rate.startDate),
      endDate: isoDate(rate.endDate),
    });
    setHotelOpen(true);
  }

  function openCreateTransfer() {
    setEditingTransferId(null);
    setTransferForm(emptyTransferForm());
    setTransferOpen(true);
  }

  function openEditTransfer(fare: TransferFare) {
    if (fare.isSystem) return;
    setEditingTransferId(fare.id);
    setTransferForm({
      from: fare.fromPlace
        ? { placeId: fare.fromPlaceId, name: fare.fromPlace.name }
        : null,
      to: fare.toPlace
        ? { placeId: fare.toPlaceId, name: fare.toPlace.name }
        : null,
      vehicleTypeId: fare.vehicleTypeId,
      vehicleLabel: fare.vehicleType?.name || '',
      unitCost: String(Number(fare.unitCost)),
      childUnitCost:
        fare.childUnitCost != null ? String(Number(fare.childUnitCost)) : '',
      pricingMode:
        fare.pricingMode === 'per_adult' ? 'per_adult' : 'per_vehicle',
      startDate: isoDate(fare.startDate),
      endDate: isoDate(fare.endDate),
    });
    setTransferOpen(true);
  }

  async function overrideFare(fare: TransferFare) {
    try {
      const created = await api<TransferFare>(`/transfer-fares/${fare.id}/override`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess('Agency override ready — edit your costs');
      await load();
      setTab('transfer');
      openEditTransfer(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not override fare');
    }
  }

  async function overrideHotel(rate: HotelRate) {
    if (!rate.placeId && !rate.supplierId) {
      toastError('System rate has no place to override');
      return;
    }
    try {
      // Prefer existing agency place override with same room type.
      const existing = hotelRates.find(
        (r) =>
          !r.isSystem &&
          r.placeId === rate.placeId &&
          (r.roomType || '') === (rate.roomType || ''),
      );
      if (existing) {
        openEditHotel(existing);
        return;
      }
      const created = await api<HotelRate>('/hotel-rates', {
        method: 'POST',
        body: JSON.stringify({
          placeId: rate.placeId || null,
          supplierId: null,
          roomType: rate.roomType || null,
          unitCost: Number(rate.unitCost),
          startDate: isoDate(rate.startDate) || null,
          endDate: isoDate(rate.endDate) || null,
        }),
      });
      toastSuccess('Agency hotel override ready — edit your cost');
      await load();
      setTab('hotel');
      openEditHotel(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not override hotel rate');
    }
  }

  async function suggestCost() {
    if (!transferForm.from?.placeId || !transferForm.to?.placeId) {
      toastError('Pick from and to places first');
      return;
    }
    if (!transferForm.vehicleTypeId) {
      toastError('Pick a vehicle type first');
      return;
    }
    try {
      const res = await api<{
        suggestedUnitCost: number;
        distanceKm: number;
        source: string;
      }>('/transfer-fares/suggest', {
        method: 'POST',
        body: JSON.stringify({
          fromPlaceId: transferForm.from.placeId,
          toPlaceId: transferForm.to.placeId,
          vehicleTypeId: transferForm.vehicleTypeId,
        }),
      });
      setTransferForm((f) => ({
        ...f,
        unitCost: String(res.suggestedUnitCost),
      }));
      toastSuccess(
        `Suggested ${formatCurrency(res.suggestedUnitCost, { maximumFractionDigits: 0 })} (${res.distanceKm} km via ${res.source}) — confirm before save`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not suggest fare');
    }
  }

  async function removeHotel(id: string) {
    try {
      await api(`/hotel-rates/${id}`, { method: 'DELETE' });
      toastSuccess('Hotel rate removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete rate');
    }
  }

  async function removeTransfer(id: string) {
    try {
      await api(`/transfer-fares/${id}`, { method: 'DELETE' });
      toastSuccess('Transfer fare removed');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete fare');
    }
  }

  async function saveHotel() {
    if (!hotelForm.supplierId && !hotelForm.place?.placeId) {
      toastError('Pick a stay supplier or place');
      return;
    }
    const unitCost = Number(hotelForm.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toastError('Enter a valid cost');
      return;
    }
    setSaving(true);
    try {
      const body = {
        supplierId: hotelForm.supplierId || null,
        placeId: hotelForm.place?.placeId || null,
        roomType: hotelForm.roomType.trim() || null,
        unitCost,
        startDate: hotelForm.startDate || null,
        endDate: hotelForm.endDate || null,
      };
      if (editingHotelId) {
        await api(`/hotel-rates/${editingHotelId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Hotel rate updated');
      } else {
        await api('/hotel-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Hotel rate saved');
      }
      setHotelOpen(false);
      setEditingHotelId(null);
      setHotelForm(emptyHotelForm());
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save rate');
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    if (!transferForm.from?.placeId || !transferForm.to?.placeId) {
      toastError('Pick from and to places');
      return;
    }
    if (!transferForm.vehicleTypeId) {
      toastError('Pick a vehicle type');
      return;
    }
    const unitCost = Number(transferForm.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toastError('Enter a valid cost');
      return;
    }
    const childRaw = transferForm.childUnitCost.trim();
    const childUnitCost = childRaw === '' ? null : Number(childRaw);
    if (childUnitCost != null && (!Number.isFinite(childUnitCost) || childUnitCost < 0)) {
      toastError('Enter a valid child cost');
      return;
    }
    setSaving(true);
    try {
      const body = {
        fromPlaceId: transferForm.from.placeId,
        toPlaceId: transferForm.to.placeId,
        vehicleTypeId: transferForm.vehicleTypeId,
        unitCost,
        childUnitCost,
        pricingMode: transferForm.pricingMode,
        startDate: transferForm.startDate || null,
        endDate: transferForm.endDate || null,
      };
      if (editingTransferId) {
        await api(`/transfer-fares/${editingTransferId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Transfer fare updated');
      } else {
        await api('/transfer-fares', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Transfer fare saved');
      }
      setTransferOpen(false);
      setEditingTransferId(null);
      setTransferForm(emptyTransferForm());
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save fare');
    } finally {
      setSaving(false);
    }
  }

  const hotelColumns = useMemo<ColumnDef<HotelRate>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        meta: { label: 'Name' },
        enableHiding: false,
        size: 220,
        minSize: 160,
        accessorFn: (r) => hotelLabel(r),
        cell: ({ row }) => {
          const rate = row.original;
          if (!canWrite) {
            return <span className="font-medium">{hotelLabel(rate)}</span>;
          }
          return (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                rate.isSystem ? void overrideHotel(rate) : openEditHotel(rate)
              }
            >
              {hotelLabel(rate)}
            </button>
          );
        },
      },
      {
        id: 'kind',
        accessorFn: (r) => hotelKind(r),
        header: 'Kind',
        meta: { label: 'Kind' },
        size: 130,
        minSize: 110,
        cell: ({ row }) => {
          const kind = hotelKind(row.original);
          return (
            <StatusBadge
              value={kind}
              label={kind === 'supplier' ? 'Supplier rate' : 'Place default'}
              showIcon={false}
            />
          );
        },
      },
      {
        id: 'source',
        accessorFn: (r) => (r.isSystem ? 'system' : 'agency'),
        header: 'Source',
        meta: { label: 'Source' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.isSystem ? 'system' : 'agency'}
            label={row.original.isSystem ? 'System' : 'Agency'}
          />
        ),
      },
      {
        accessorKey: 'roomType',
        header: 'Room',
        meta: { label: 'Room' },
        size: 140,
        minSize: 110,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.roomType?.trim() || 'Default'}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost',
        header: 'Cost / night',
        meta: { label: 'Cost / night' },
        size: 140,
        minSize: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground/90">
            {formatCurrency(row.original.unitCost, {
              currency: row.original.currency,
              maximumFractionDigits: 0,
            })}
          </span>
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
          const rate = row.original;
          if (!canWrite) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Hotel rate actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {hotelLabel(rate)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {rate.isSystem ? (
                  <DropdownMenuItem onClick={() => void overrideHotel(rate)}>
                    <Copy />
                    Override & edit
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => openEditHotel(rate)}>
                      <Pencil />
                      Edit rate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void removeHotel(rate.id)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotelRates, load],
  );

  const transferColumns = useMemo<ColumnDef<TransferFare>[]>(
    () => [
      {
        id: 'route',
        header: 'Route',
        meta: { label: 'Route' },
        enableHiding: false,
        size: 200,
        minSize: 140,
        accessorFn: (r) => transferRouteLabel(r),
        cell: ({ row }) => {
          const fare = row.original;
          if (!canWrite) {
            return <span className="font-medium">{transferRouteLabel(fare)}</span>;
          }
          return (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                fare.isSystem ? void overrideFare(fare) : openEditTransfer(fare)
              }
            >
              {transferRouteLabel(fare)}
            </button>
          );
        },
      },
      {
        id: 'source',
        accessorFn: (r) => (r.isSystem ? 'system' : 'agency'),
        header: 'Source',
        meta: { label: 'Source' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <StatusBadge
            value={row.original.isSystem ? 'system' : 'agency'}
            label={row.original.isSystem ? 'System' : 'Agency'}
          />
        ),
      },
      {
        id: 'vehicle',
        header: 'Vehicle',
        meta: { label: 'Vehicle' },
        size: 160,
        minSize: 120,
        accessorFn: (r) => r.vehicleType?.name || '',
        cell: ({ row }) => (
          <span className="text-foreground/90">
            {row.original.vehicleType?.name || '—'}
          </span>
        ),
      },
      {
        id: 'pricing',
        header: 'Mode',
        meta: { label: 'Mode' },
        size: 130,
        minSize: 100,
        accessorFn: (r) => r.pricingMode || 'per_vehicle',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.pricingMode === 'per_adult'
              ? 'Per adult'
              : 'Per vehicle'}
          </span>
        ),
      },
      {
        accessorKey: 'unitCost',
        header: 'Adult / vehicle',
        meta: { label: 'Adult / vehicle' },
        size: 140,
        minSize: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground/90">
            {formatCurrency(row.original.unitCost, {
              currency: row.original.currency,
              maximumFractionDigits: 0,
            })}
          </span>
        ),
      },
      {
        id: 'child',
        header: 'Child',
        meta: { label: 'Child' },
        size: 100,
        minSize: 80,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.childUnitCost != null
              ? formatCurrency(row.original.childUnitCost, {
                  currency: row.original.currency,
                  maximumFractionDigits: 0,
                })
              : '—'}
          </span>
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
          const fare = row.original;
          if (!canWrite) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Transfer fare actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="max-w-[14rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {transferRouteLabel(fare)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {fare.isSystem ? (
                  <DropdownMenuItem onClick={() => void overrideFare(fare)}>
                    <Copy />
                    Override & edit
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => openEditTransfer(fare)}>
                      <Pencil />
                      Edit fare
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void removeTransfer(fare.id)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  );

  return (
    <ListPageShell>
      <PageHeader
        icon={IndianRupee}
        title="Catalog & transfers"
        subtitle="Place-level hotel defaults and the transfer fare matrix. Negotiated hotel sheets live on each supplier’s Rate chart."
        className="mb-4 shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border p-1 glass-strong">
              <Button
                size="sm"
                variant={tab === 'hotel' ? 'secondary' : 'ghost'}
                onClick={() => setTab('hotel')}
              >
                <BedDouble className="size-4" />
                Hotel
              </Button>
              <Button
                size="sm"
                variant={tab === 'transfer' ? 'secondary' : 'ghost'}
                onClick={() => setTab('transfer')}
              >
                <Car className="size-4" />
                Transfer
              </Button>
            </div>
            <Can anyOf={CAP.ratesWrite}>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import CSV
              </Button>
              <Button
                onClick={tab === 'hotel' ? openCreateHotel : openCreateTransfer}
              >
                <Plus className="size-4" />
                {tab === 'hotel' ? 'Add hotel rate' : 'Add transfer fare'}
              </Button>
            </Can>
          </div>
        }
      />

      <RatesCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind={tab}
        onImported={() => void load()}
      />
      {tab === 'hotel' ? (
        <DataTable
          key="hotel-rates"
          columns={hotelColumns}
          data={hotelRates}
          loading={loading}
          pageSize={25}
          searchKey="name"
          searchPlaceholder="Search suppliers or places…"
          columnVisibilityKey={StorageKeys.rates.hotelColumns}
          facets={[
            {
              id: 'kind',
              columnId: 'kind',
              label: 'Kind',
              options: [
                { value: 'place', label: 'Place defaults' },
                { value: 'supplier', label: 'Supplier rates' },
              ],
            },
            {
              id: 'source',
              columnId: 'source',
              label: 'Source',
              options: [
                { value: 'system', label: 'System' },
                { value: 'agency', label: 'Agency' },
              ],
            },
          ]}
          emptyIcon={IndianRupee}
          emptyTitle="No hotel rates yet"
          emptyDescription="Place defaults appear when seeded. Add negotiated rates from a supplier’s Rate chart (Suppliers → ⋯ → Rate chart)."
          emptyAction={
            <Can anyOf={CAP.ratesWrite}>
              <Button onClick={openCreateHotel}>
                <Plus className="size-4" />
                Add place / hotel rate
              </Button>
            </Can>
          }
        />
      ) : (
        <DataTable
          key="transfer-fares"
          columns={transferColumns}
          data={transferFares}
          loading={loading}
          pageSize={25}
          searchKey="route"
          searchPlaceholder="Search routes…"
          columnVisibilityKey={StorageKeys.rates.transferColumns}
          facets={[
            {
              id: 'source',
              columnId: 'source',
              label: 'Source',
              options: [
                { value: 'system', label: 'System' },
                { value: 'agency', label: 'Agency' },
              ],
            },
          ]}
          emptyIcon={IndianRupee}
          emptyTitle="No transfer fares yet"
          emptyDescription="Click a system route (or ⋯ → Override & edit) to customize for your agency."
          emptyAction={
            <Can anyOf={CAP.ratesWrite}>
              <Button onClick={openCreateTransfer}>
                <Plus className="size-4" />
                Add transfer fare
              </Button>
            </Can>
          }
        />
      )}

      <RecordSheet
        open={hotelOpen}
        onOpenChange={(next) => {
          setHotelOpen(next);
          if (!next) {
            setEditingHotelId(null);
            setHotelForm(emptyHotelForm());
          }
        }}
        title={editingHotelId ? 'Edit hotel rate' : 'Add hotel rate'}
        description="Prefer Suppliers → Rate chart for negotiated hotel costs. Use this form for place defaults or cross-supplier browse edits."
        onSubmit={saveHotel}
        submitLabel={editingHotelId ? 'Save changes' : 'Save rate'}
        submitting={saving}
      >
        <FormSection title="Property" description="Stay supplier (preferred) or a place-level default.">
          <FormField label="Supplier">
            <EntityCombobox
              value={hotelForm.supplierId}
              selectedLabel={hotelForm.supplierLabel || undefined}
              onChange={(supplierId, option) => {
                setHotelForm((f) => ({
                  ...f,
                  supplierId,
                  supplierLabel: option?.label || f.supplierLabel,
                }));
              }}
              onSearch={onSearchSuppliers}
              placeholder="Search stay suppliers…"
            />
          </FormField>
          <PlaceSinglePicker
            label="Or place (override system default)"
            value={hotelForm.place}
            onChange={(place) => setHotelForm({ ...hotelForm, place })}
          />
          <FormField label="Room type" description="Leave blank for a default rate.">
            <Input
              value={hotelForm.roomType}
              onChange={(e) => setHotelForm({ ...hotelForm, roomType: e.target.value })}
              placeholder="Deluxe / Suite / …"
            />
          </FormField>
        </FormSection>

        <FormSection title="Pricing">
          <FormField label="Cost per night" required htmlFor="hotel-unit-cost">
            <PriceField
              id="hotel-unit-cost"
              value={hotelForm.unitCost}
              onChange={(unitCost) => setHotelForm({ ...hotelForm, unitCost })}
              placeholder="4500"
            />
          </FormField>
        </FormSection>

        <FormSection title="Season" description="Optional validity window.">
          <FormGrid>
            <FormField label="From">
              <DatePicker
                value={parseDateInput(hotelForm.startDate)}
                onChange={(d) =>
                  setHotelForm({ ...hotelForm, startDate: formatDateInput(d) })
                }
                placeholder="Season start"
              />
            </FormField>
            <FormField label="To">
              <DatePicker
                value={parseDateInput(hotelForm.endDate)}
                onChange={(d) =>
                  setHotelForm({ ...hotelForm, endDate: formatDateInput(d) })
                }
                placeholder="Season end"
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </RecordSheet>

      <RecordSheet
        open={transferOpen}
        onOpenChange={(next) => {
          setTransferOpen(next);
          if (!next) {
            setEditingTransferId(null);
            setTransferForm(emptyTransferForm());
          }
        }}
        title={editingTransferId ? 'Edit transfer fare' : 'Add transfer fare'}
        description={
          editingTransferId
            ? 'Update your agency override. Quotes prefer this over the system fare.'
            : 'Agency fare between two places. Use Suggest to preview Google/edge distance × ₹/km.'
        }
        onSubmit={saveTransfer}
        submitLabel={editingTransferId ? 'Save changes' : 'Save fare'}
        submitting={saving}
        wide
      >
        <FormSection title="Route">
          <FormGrid>
            <PlaceSinglePicker
              label="From"
              value={transferForm.from}
              onChange={(from) => setTransferForm({ ...transferForm, from })}
            />
            <PlaceSinglePicker
              label="To"
              value={transferForm.to}
              onChange={(to) => setTransferForm({ ...transferForm, to })}
            />
          </FormGrid>
          <FormGrid>
            <FormField label="Vehicle type" required>
              <EntityCombobox
                value={transferForm.vehicleTypeId}
                selectedLabel={transferForm.vehicleLabel || undefined}
                onChange={(vehicleTypeId, option) => {
                  setTransferForm((f) => ({
                    ...f,
                    vehicleTypeId,
                    vehicleLabel: option?.label || f.vehicleLabel,
                  }));
                }}
                onSearch={onSearchVehicles}
                placeholder="Innova / Tempo / …"
              />
            </FormField>
            <FormField label="Pricing mode">
              <Combobox
                value={transferForm.pricingMode}
                onChange={(pricingMode) =>
                  setTransferForm({
                    ...transferForm,
                    pricingMode: (pricingMode || 'per_vehicle') as
                      | 'per_vehicle'
                      | 'per_adult',
                  })
                }
                options={[
                  { value: 'per_vehicle', label: 'Per vehicle (full cab)' },
                  { value: 'per_adult', label: 'Per adult (party blend)' },
                ]}
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Costs"
          description={
            transferForm.pricingMode === 'per_adult'
              ? 'Child blank uses org child fare factor (default 0.7× adult).'
              : 'Adult / vehicle is the full-cab cost. Child is optional.'
          }
        >
          <FormGrid>
            <FormField label="Adult / vehicle" required htmlFor="transfer-unit-cost">
              <PriceField
                id="transfer-unit-cost"
                value={transferForm.unitCost}
                onChange={(unitCost) => setTransferForm({ ...transferForm, unitCost })}
                placeholder="5500"
                trailing={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void suggestCost()}
                  >
                    Suggest
                  </Button>
                }
              />
            </FormField>
            <FormField label="Child" htmlFor="transfer-child-cost">
              <PriceField
                id="transfer-child-cost"
                value={transferForm.childUnitCost}
                onChange={(childUnitCost) =>
                  setTransferForm({ ...transferForm, childUnitCost })
                }
                placeholder="Optional"
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Season" description="Optional validity window.">
          <FormGrid>
            <FormField label="From">
              <DatePicker
                value={parseDateInput(transferForm.startDate)}
                onChange={(d) =>
                  setTransferForm({
                    ...transferForm,
                    startDate: formatDateInput(d),
                  })
                }
                placeholder="Season start"
              />
            </FormField>
            <FormField label="To">
              <DatePicker
                value={parseDateInput(transferForm.endDate)}
                onChange={(d) =>
                  setTransferForm({
                    ...transferForm,
                    endDate: formatDateInput(d),
                  })
                }
                placeholder="Season end"
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </RecordSheet>
    </ListPageShell>
  );
}
