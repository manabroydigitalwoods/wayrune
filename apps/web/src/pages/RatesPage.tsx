import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import { useSearchParams } from 'react-router-dom';
import {
  BedDouble,
  Building2,
  Car,
  Copy,
  Import,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
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
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  StorageKeys,
  cn,
  formatCurrency,
  localStorageKit,
  toastError,
  toastSuccess,
  usePageChrome,
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
import { STAY_SUPPLIER_TYPE_QUERY, supplierTypeLabel } from '../lib/supplierTypes';
import {
  parseRatesQueryState,
  patchRatesQueryParams,
  ratesQueryHasFilters,
  type RatesTab,
} from '../lib/queue';
import {
  ActiveFilterChips,
  DisplayMenu,
  FilterMenu,
  QUEUE_MENU_ITEM_CLASS,
  QUEUE_PAGE_SEARCH_CLASS,
  QueuePageChrome,
  QueueViewToggle,
} from '../components/queue';

type HotelRate = {
  id: string;
  supplierId?: string | null;
  placeId?: string | null;
  isSystem?: boolean;
  roomType?: string | null;
  mealPlan?: string | null;
  unitCost: number | string;
  weekendUnitCost?: number | string | null;
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
  infantUnitCost?: number | string | null;
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
    mealPlan: '',
    unitCost: '',
    weekendUnitCost: '',
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
    infantUnitCost: '',
    pricingMode: 'per_vehicle' as 'per_vehicle' | 'per_adult',
    startDate: '',
    endDate: '',
  };
}

async function searchStaySuppliers(q: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', STAY_SUPPLIER_TYPE_QUERY);
  const items = await api<
    Array<{ id: string; name: string; type: string }>
  >(`/suppliers?${params.toString()}`);
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: supplierTypeLabel(s.type),
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

function hotelSource(r: HotelRate): 'system' | 'agency' {
  return r.isSystem ? 'system' : 'agency';
}

function transferSource(f: TransferFare): 'system' | 'agency' {
  return f.isSystem ? 'system' : 'agency';
}

function transferRouteLabel(f: TransferFare) {
  return `${f.fromPlace?.name || '—'} → ${f.toPlace?.name || '—'}`;
}

function readColumnVisibility(key: string): VisibilityState {
  const stored = localStorageKit.getJson<VisibilityState>(key, { version: 1 });
  if (!stored || typeof stored !== 'object') return {};
  return stored;
}

export function RatesPage() {
  useDocumentTitle('Products & rates');
  usePageChrome({
    title: 'Products & rates',
    subtitle:
      'Place-level hotel defaults and the transfer fare matrix. Negotiated hotel sheets live on each supplier’s Rate chart.',
  });
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.ratesWrite);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseRatesQueryState(searchParams), [searchParams]);
  const tab = query.tab;
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [hotelColumnVisibility, setHotelColumnVisibility] = useState<VisibilityState>(() =>
    readColumnVisibility(StorageKeys.rates.hotelColumns),
  );
  const [transferColumnVisibility, setTransferColumnVisibility] = useState<VisibilityState>(() =>
    readColumnVisibility(StorageKeys.rates.transferColumns),
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

  function applyQuery(patch: Parameters<typeof patchRatesQueryParams>[1]) {
    setSearchParams(patchRatesQueryParams(searchParams, patch), { replace: true });
  }

  const setTab = useCallback(
    (next: RatesTab) => {
      setSearchParams(patchRatesQueryParams(searchParams, { tab: next }), { replace: true });
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
      mealPlan: rate.mealPlan || '',
      unitCost: String(Number(rate.unitCost)),
      weekendUnitCost:
        rate.weekendUnitCost != null ? String(Number(rate.weekendUnitCost)) : '',
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
      infantUnitCost:
        fare.infantUnitCost != null ? String(Number(fare.infantUnitCost)) : '',
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
    const weekendRaw = hotelForm.weekendUnitCost.trim();
    let weekendUnitCost: number | null = null;
    if (weekendRaw) {
      weekendUnitCost = Number(weekendRaw);
      if (!Number.isFinite(weekendUnitCost) || weekendUnitCost < 0) {
        toastError('Weekend cost must be a valid number');
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        supplierId: hotelForm.supplierId || null,
        placeId: hotelForm.place?.placeId || null,
        roomType: hotelForm.roomType.trim() || null,
        mealPlan: hotelForm.mealPlan.trim() || null,
        unitCost,
        weekendUnitCost,
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
    const infantRaw = transferForm.infantUnitCost.trim();
    const infantUnitCost = infantRaw === '' ? null : Number(infantRaw);
    if (infantUnitCost != null && (!Number.isFinite(infantUnitCost) || infantUnitCost < 0)) {
      toastError('Enter a valid infant cost');
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
        infantUnitCost,
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

  function toggleHotelColumn(id: string, visible: boolean) {
    setHotelColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.rates.hotelColumns, next, { version: 1 });
      return next;
    });
  }

  function toggleTransferColumn(id: string, visible: boolean) {
    setTransferColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorageKit.setJson(StorageKeys.rates.transferColumns, next, { version: 1 });
      return next;
    });
  }

  function clearRatesFilters() {
    applyQuery({ clearFilters: true });
  }

  function clearRatesFiltersAndSearch() {
    setSearchDraft('');
    applyQuery({ clearFilters: true, q: '' });
  }

  const filteredHotelRates = useMemo(() => {
    let list = hotelRates;
    if (query.kind) list = list.filter((r) => hotelKind(r) === query.kind);
    if (query.source) list = list.filter((r) => hotelSource(r) === query.source);
    const q = query.q?.trim().toLowerCase();
    if (q) list = list.filter((r) => hotelLabel(r).toLowerCase().includes(q));
    return list;
  }, [hotelRates, query.kind, query.source, query.q]);

  const filteredTransferFares = useMemo(() => {
    let list = transferFares;
    if (query.source) list = list.filter((f) => transferSource(f) === query.source);
    const q = query.q?.trim().toLowerCase();
    if (q) list = list.filter((f) => transferRouteLabel(f).toLowerCase().includes(q));
    return list;
  }, [transferFares, query.source, query.q]);

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
        accessorFn: (r) => hotelSource(r),
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
        size: 120,
        minSize: 90,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.roomType?.trim() || 'Default'}
          </span>
        ),
      },
      {
        id: 'mealPlan',
        accessorFn: (r) => r.mealPlan || '',
        header: 'Meal',
        meta: { label: 'Meal' },
        size: 90,
        minSize: 70,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.mealPlan?.trim() || '—'}
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
            {row.original.weekendUnitCost != null
              ? ` · we ${formatCurrency(row.original.weekendUnitCost, {
                  currency: row.original.currency,
                  maximumFractionDigits: 0,
                })}`
              : ''}
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
        accessorFn: (r) => transferSource(r),
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

  const hotelFilterDefs = [
    {
      id: 'kind',
      label: 'Kind',
      icon: BedDouble,
      value: query.kind ?? null,
      options: [
        { value: 'place', label: 'Place defaults' },
        { value: 'supplier', label: 'Supplier rates' },
      ],
      onSelect: (value: string | null) =>
        applyQuery({ kind: (value as 'place' | 'supplier' | null) || undefined }),
    },
    {
      id: 'source',
      label: 'Source',
      icon: Building2,
      value: query.source ?? null,
      options: [
        { value: 'system', label: 'System' },
        { value: 'agency', label: 'Agency' },
      ],
      onSelect: (value: string | null) =>
        applyQuery({ source: (value as 'system' | 'agency' | null) || undefined }),
    },
  ];

  const transferFilterDefs = [
    {
      id: 'source',
      label: 'Source',
      icon: Building2,
      value: query.source ?? null,
      options: [
        { value: 'system', label: 'System' },
        { value: 'agency', label: 'Agency' },
      ],
      onSelect: (value: string | null) =>
        applyQuery({ source: (value as 'system' | 'agency' | null) || undefined }),
    },
  ];

  const filterChips = [
    tab === 'hotel' && query.kind
      ? {
          id: 'kind',
          label: `Kind: ${query.kind === 'supplier' ? 'Supplier rates' : 'Place defaults'}`,
          onRemove: () => applyQuery({ kind: undefined }),
        }
      : null,
    query.source
      ? {
          id: 'source',
          label: `Source: ${query.source === 'system' ? 'System' : 'Agency'}`,
          onRemove: () => applyQuery({ source: undefined }),
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

  const hotelDisplayColumns = [
    { id: 'kind', label: 'Kind', visible: hotelColumnVisibility.kind !== false, icon: BedDouble },
    { id: 'source', label: 'Source', visible: hotelColumnVisibility.source !== false },
    { id: 'roomType', label: 'Room', visible: hotelColumnVisibility.roomType !== false },
    { id: 'mealPlan', label: 'Meal', visible: hotelColumnVisibility.mealPlan !== false },
    { id: 'unitCost', label: 'Cost / night', visible: hotelColumnVisibility.unitCost !== false },
  ];

  const transferDisplayColumns = [
    { id: 'source', label: 'Source', visible: transferColumnVisibility.source !== false },
    { id: 'vehicle', label: 'Vehicle', visible: transferColumnVisibility.vehicle !== false, icon: Car },
    { id: 'pricing', label: 'Mode', visible: transferColumnVisibility.pricing !== false },
    { id: 'unitCost', label: 'Adult / vehicle', visible: transferColumnVisibility.unitCost !== false },
    { id: 'child', label: 'Child', visible: transferColumnVisibility.child !== false },
  ];

  const hasExtraFilters = ratesQueryHasFilters(query) || Boolean(query.q);

  const queueToolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-[12rem] flex-1 basis-[14rem]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={tab === 'hotel' ? 'Search suppliers or places…' : 'Search routes…'}
          className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
          aria-label={tab === 'hotel' ? 'Search hotel rates' : 'Search transfer fares'}
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
        <FilterMenu filters={tab === 'hotel' ? hotelFilterDefs : transferFilterDefs} />
        <DisplayMenu
          columns={tab === 'hotel' ? hotelDisplayColumns : transferDisplayColumns}
          onToggleColumn={tab === 'hotel' ? toggleHotelColumn : toggleTransferColumn}
        />
      </div>
    </div>
  );

  return (
    <QueuePageChrome
      viewToggle={
        <QueueViewToggle
          value={tab}
          onChange={(id) => setTab(id as RatesTab)}
          options={[
            { id: 'hotel', label: 'Hotel', icon: <BedDouble className="size-[0.875em]" /> },
            { id: 'transfer', label: 'Transfer', icon: <Car className="size-[0.875em]" /> },
          ]}
        />
      }
      primaryActions={
        <Can anyOf={CAP.ratesWrite}>
          <Button size="sm" onClick={tab === 'hotel' ? openCreateHotel : openCreateTransfer}>
            <Plus className="size-[0.875em]" />
            {tab === 'hotel' ? 'Add hotel rate' : 'Add transfer fare'}
          </Button>
        </Can>
      }
      moreMenu={
        <Can anyOf={CAP.ratesWrite}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-[var(--control-h-sm)]"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-[0.875em]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1">
              <DropdownMenuLabel className="text-[length:var(--control-text-sm)]">More</DropdownMenuLabel>
              <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={() => setImportOpen(true)}>
                <Import />
                Import CSV / Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      }
      toolbar={queueToolbar}
      chips={
        <ActiveFilterChips
          chips={filterChips}
          onClear={ratesQueryHasFilters(query) ? clearRatesFilters : undefined}
        />
      }
    >
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
          data={filteredHotelRates}
          loading={loading}
          pageSize={25}
          showSearch={false}
          showColumnsMenu={false}
          defaultColumnVisibility={hotelColumnVisibility}
          columnVisibilityKey={StorageKeys.rates.hotelColumns}
          emptyIcon={BedDouble}
          emptyTitle={hasExtraFilters ? 'No matching hotel rates' : 'No hotel rates yet'}
          emptyDescription={
            hasExtraFilters
              ? 'Try clearing filters or search.'
              : 'Place defaults appear when seeded. Add negotiated rates from a supplier’s Rate chart (Suppliers → ⋯ → Rate chart).'
          }
          emptyAction={
            hasExtraFilters ? (
              <Button type="button" size="sm" variant="outline" onClick={clearRatesFiltersAndSearch}>
                Clear filters
              </Button>
            ) : (
              <Can anyOf={CAP.ratesWrite}>
                <Button onClick={openCreateHotel}>
                  <Plus className="size-4" />
                  Add place / hotel rate
                </Button>
              </Can>
            )
          }
        />
      ) : (
        <DataTable
          key="transfer-fares"
          columns={transferColumns}
          data={filteredTransferFares}
          loading={loading}
          pageSize={25}
          showSearch={false}
          showColumnsMenu={false}
          defaultColumnVisibility={transferColumnVisibility}
          columnVisibilityKey={StorageKeys.rates.transferColumns}
          emptyIcon={Car}
          emptyTitle={hasExtraFilters ? 'No matching transfer fares' : 'No transfer fares yet'}
          emptyDescription={
            hasExtraFilters
              ? 'Try clearing filters or search.'
              : 'Click a system route (or ⋯ → Override & edit) to customize for your agency.'
          }
          emptyAction={
            hasExtraFilters ? (
              <Button type="button" size="sm" variant="outline" onClick={clearRatesFiltersAndSearch}>
                Clear filters
              </Button>
            ) : (
              <Can anyOf={CAP.ratesWrite}>
                <Button onClick={openCreateTransfer}>
                  <Plus className="size-4" />
                  Add transfer fare
                </Button>
              </Can>
            )
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
          <FormField label="Meal plan" description="EP / CP / MAP / AP — blank matches any.">
            <Input
              value={hotelForm.mealPlan}
              onChange={(e) => setHotelForm({ ...hotelForm, mealPlan: e.target.value })}
              placeholder="MAP"
            />
          </FormField>
        </FormSection>

        <FormSection title="Pricing">
          <FormField label="Weekday cost per night" required htmlFor="hotel-unit-cost">
            <PriceField
              id="hotel-unit-cost"
              value={hotelForm.unitCost}
              onChange={(unitCost) => setHotelForm({ ...hotelForm, unitCost })}
              placeholder="4500"
            />
          </FormField>
          <FormField label="Weekend cost per night" description="Optional Sat/Sun.">
            <PriceField
              value={hotelForm.weekendUnitCost}
              onChange={(weekendUnitCost) =>
                setHotelForm({ ...hotelForm, weekendUnitCost })
              }
              placeholder="5200"
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
              purpose="transfer_pickup"
              value={transferForm.from}
              onChange={(from) => setTransferForm({ ...transferForm, from })}
              placeholder="Pickup…"
            />
            <PlaceSinglePicker
              label="To"
              purpose="transfer_drop"
              value={transferForm.to}
              onChange={(to) => setTransferForm({ ...transferForm, to })}
              placeholder="Drop…"
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
              : 'Adult / vehicle is the full-cab cost. When Child/Infant are set, Match adds them on top of the cab/band (not the org factor).'
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
            <FormField label="Infant" htmlFor="transfer-infant-cost">
              <PriceField
                id="transfer-infant-cost"
                value={transferForm.infantUnitCost}
                onChange={(infantUnitCost) =>
                  setTransferForm({ ...transferForm, infantUnitCost })
                }
                placeholder="Optional"
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection
          title="Season / closing window"
          description="Optional validity. Outside this window the corridor will not match — use for seasonal closing."
        >
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
    </QueuePageChrome>
  );
}
