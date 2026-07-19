import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Import, IndianRupee, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  QuickPicks,
  RecordSheet,
  SimpleFormField as FormField,
  SuggestionChips,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import {
  api,
  type AssetRoomProductRow,
  type SupplierContractRow,
  type SupplierHotelRateRow,
} from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { RatesCsvImportDialog } from '../rates/RatesCsvImportDialog';
import { type PlaceRef } from '../../lib/placeRefs';

type HotelRate = SupplierHotelRateRow;

const MEAL_OPTIONS = [
  { value: 'EP', label: 'EP' },
  { value: 'CP', label: 'CP' },
  { value: 'MAP', label: 'MAP' },
  { value: 'AP', label: 'AP' },
];

const MEAL_HINT: Record<string, string> = {
  EP: 'Room only',
  CP: 'Breakfast',
  MAP: 'Breakfast + dinner',
  AP: 'All meals',
};

const ROOM_OPTIONS = [
  { value: 'Deluxe', label: 'Deluxe' },
  { value: 'Suite', label: 'Suite' },
  { value: 'Standard twin', label: 'Standard twin' },
  { value: 'Family room', label: 'Family' },
  { value: 'Heritage suite', label: 'Heritage' },
  { value: 'Mountain view', label: 'Mountain view' },
];

function isoDate(raw?: string | Date | null): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  return raw.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  const day = iso.slice(0, 10);
  const d = parseDateInput(day);
  if (!d) return day;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function emptyGalaRows() {
  return [
    { date: '', amount: '', label: '' },
    { date: '', amount: '', label: '' },
    { date: '', amount: '', label: '' },
  ] as Array<{ date: string; amount: string; label: string }>;
}

function emptyForm(defaultContractId = '') {
  return {
    roomType: '',
    roomProductId: '',
    contractId: defaultContractId,
    mealPlan: 'MAP',
    unitCost: '',
    weekendUnitCost: '',
    baseAdults: '2',
    childAgeMax: '',
    extraAdultPerNight: '',
    childWithBedPerNight: '',
    childWithoutBedPerNight: '',
    /** Up to 3 gala / date supplements (single night + amount). */
    galaRows: emptyGalaRows(),
    place: null as PlaceRef | null,
    startDate: '',
    endDate: '',
  };
}

function occupancyFromRate(rate: HotelRate) {
  const o = rate.occupancyPricingJson;
  if (!o || typeof o !== 'object') {
    return {
      baseAdults: '2',
      childAgeMax: '',
      extraAdultPerNight: '',
      childWithBedPerNight: '',
      childWithoutBedPerNight: '',
      galaRows: emptyGalaRows(),
    };
  }
  const supplements = Array.isArray(o.dateSupplements) ? o.dateSupplements : [];
  const galaRows = emptyGalaRows().map((blank, i) => {
    const s = supplements[i];
    if (!s || typeof s !== 'object') return blank;
    const date =
      typeof s.date === 'string'
        ? s.date.slice(0, 10)
        : typeof s.from === 'string'
          ? s.from.slice(0, 10)
          : '';
    return {
      date,
      amount: s.amount != null ? String(s.amount) : '',
      label: typeof s.label === 'string' ? s.label : '',
    };
  });
  return {
    baseAdults: o.baseAdults != null ? String(o.baseAdults) : '2',
    childAgeMax: o.childAgeMax != null ? String(o.childAgeMax) : '',
    extraAdultPerNight:
      o.extraAdultPerNight != null ? String(o.extraAdultPerNight) : '',
    childWithBedPerNight:
      o.childWithBedPerNight != null ? String(o.childWithBedPerNight) : '',
    childWithoutBedPerNight:
      o.childWithoutBedPerNight != null ? String(o.childWithoutBedPerNight) : '',
    galaRows,
  };
}

function occupancyHint(rate: HotelRate): string | null {
  const o = rate.occupancyPricingJson;
  if (!o || typeof o !== 'object') return null;
  const parts: string[] = [];
  const baseA = o.baseAdults ?? 2;
  parts.push(`${baseA}A base`);
  if (o.childAgeMax != null && Number(o.childAgeMax) >= 0) {
    parts.push(`child ≤${Math.round(Number(o.childAgeMax))}`);
  }
  if (o.extraAdultPerNight != null && Number(o.extraAdultPerNight) > 0) {
    parts.push(`+A ₹${Math.round(Number(o.extraAdultPerNight))}`);
  }
  if (o.childWithBedPerNight != null && Number(o.childWithBedPerNight) > 0) {
    parts.push(`child bed ₹${Math.round(Number(o.childWithBedPerNight))}`);
  }
  if (o.childWithoutBedPerNight != null && Number(o.childWithoutBedPerNight) > 0) {
    parts.push(`child no bed ₹${Math.round(Number(o.childWithoutBedPerNight))}`);
  }
  const gala = Array.isArray(o.dateSupplements) ? o.dateSupplements.length : 0;
  if (gala > 0) parts.push(`${gala} gala night${gala === 1 ? '' : 's'}`);
  if (
    parts.length <= 1 &&
    !o.extraAdultPerNight &&
    !o.childWithBedPerNight &&
    gala === 0
  ) {
    return null;
  }
  return parts.join(' · ');
}

function contractLabel(c: SupplierContractRow): string {
  const version = c.versionNumber ? `v${c.versionNumber}` : 'v?';
  const status = c.status === 'active' ? 'active' : c.status;
  return `${version} · ${c.title} (${status})`;
}

function seasonLabel(r: HotelRate): string {
  const from = isoDate(r.startDate);
  const to = isoDate(r.endDate);
  if (from && to) return `${formatDay(from)} → ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return 'Open dates';
}

export function SupplierHotelRatesPanel({
  supplierId,
  supplierName,
  linkedAssetId,
}: {
  supplierId: string;
  supplierName: string;
  linkedAssetId?: string | null;
}) {
  const [rates, setRates] = useState<HotelRate[]>([]);
  const [contracts, setContracts] = useState<SupplierContractRow[]>([]);
  const [roomProducts, setRoomProducts] = useState<AssetRoomProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showPlace, setShowPlace] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [importOpen, setImportOpen] = useState(false);

  const activeContract = useMemo(
    () => contracts.find((c) => c.status === 'active') ?? null,
    [contracts],
  );

  const activeRoomProducts = useMemo(
    () => roomProducts.filter((r) => r.isActive !== false),
    [roomProducts],
  );

  const contractOptions = useMemo(
    () =>
      contracts
        .filter((c) => c.status === 'active' || c.status === 'draft')
        .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))
        .map((c) => ({ value: c.id, label: contractLabel(c) })),
    [contracts],
  );

  const roomProductOptions = useMemo(
    () => activeRoomProducts.map((r) => ({ value: r.id, label: r.name })),
    [activeRoomProducts],
  );

  const loadMeta = useCallback(async () => {
    try {
      const contractRows = await api<SupplierContractRow[]>(
        `/commerce/supplier-contracts?supplierId=${encodeURIComponent(supplierId)}`,
      );
      setContracts(contractRows);
    } catch {
      setContracts([]);
    }
    if (linkedAssetId) {
      try {
        const rooms = await api<AssetRoomProductRow[]>(
          `/inventory/assets/${linkedAssetId}/rooms`,
        );
        setRoomProducts(rooms);
      } catch {
        setRoomProducts([]);
      }
    } else {
      setRoomProducts([]);
    }
  }, [supplierId, linkedAssetId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: HotelRate[] }>(
        `/hotel-rates?supplierId=${encodeURIComponent(supplierId)}`,
      );
      setRates(res.items.filter((r) => !r.isSystem));
      await loadMeta();
    } catch (e) {
      reportError(e, 'Could not load rate chart');
    } finally {
      setLoading(false);
    }
  }, [supplierId, loadMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...rates].sort((a, b) => {
      const room = (a.roomType || '').localeCompare(b.roomType || '');
      if (room) return room;
      const meal = (a.mealPlan || '').localeCompare(b.mealPlan || '');
      if (meal) return meal;
      return isoDate(a.startDate).localeCompare(isoDate(b.startDate));
    });
  }, [rates]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(activeContract?.id || ''));
    setShowPlace(false);
    setFormOpen(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm(activeContract?.id || ''));
    setShowPlace(false);
    setFormOpen(false);
  }

  function onSheetOpenChange(open: boolean) {
    if (!open) closeForm();
    else setFormOpen(true);
  }

  function startEdit(rate: HotelRate) {
    setEditingId(rate.id);
    setForm({
      roomType: rate.roomType || rate.roomProduct?.name || '',
      roomProductId: rate.roomProductId || rate.roomProduct?.id || '',
      contractId: rate.contractId || activeContract?.id || '',
      mealPlan: rate.mealPlan || '',
      unitCost: String(Number(rate.unitCost)),
      weekendUnitCost:
        rate.weekendUnitCost != null ? String(Number(rate.weekendUnitCost)) : '',
      ...occupancyFromRate(rate),
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: isoDate(rate.startDate),
      endDate: isoDate(rate.endDate),
    });
    setShowPlace(Boolean(rate.place));
    setFormOpen(true);
  }

  function duplicateAsSeason(rate: HotelRate) {
    setEditingId(null);
    setForm({
      roomType: rate.roomType || rate.roomProduct?.name || '',
      roomProductId: rate.roomProductId || rate.roomProduct?.id || '',
      contractId: rate.contractId || activeContract?.id || '',
      mealPlan: rate.mealPlan || '',
      unitCost: String(Number(rate.unitCost)),
      weekendUnitCost:
        rate.weekendUnitCost != null ? String(Number(rate.weekendUnitCost)) : '',
      ...occupancyFromRate(rate),
      place: rate.place
        ? { placeId: rate.place.id, name: rate.place.name, kind: rate.place.kind }
        : null,
      startDate: '',
      endDate: '',
    });
    setShowPlace(Boolean(rate.place));
    setFormOpen(true);
  }

  async function ensureRoomProduct(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = activeRoomProducts.find(
      (r) => r.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing.id;
    if (!linkedAssetId) return null;
    setCreatingRoom(true);
    try {
      const created = await api<AssetRoomProductRow>('/inventory/rooms', {
        method: 'POST',
        body: JSON.stringify({
          assetId: linkedAssetId,
          name: trimmed,
          maxOccupancy: 2,
          baseQuantity: 1,
        }),
      });
      setRoomProducts((prev) => [...prev, created]);
      toastSuccess(`Room product “${trimmed}” added`);
      return created.id;
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add room product');
      return null;
    } finally {
      setCreatingRoom(false);
    }
  }

  async function pickRoomProduct(roomProductId: string) {
    const product = activeRoomProducts.find((r) => r.id === roomProductId);
    setForm((f) => ({
      ...f,
      roomProductId,
      roomType: product?.name || f.roomType,
    }));
  }

  async function pickRoomPreset(name: string) {
    if (!name) {
      setForm((f) => ({ ...f, roomProductId: '', roomType: '' }));
      return;
    }
    if (linkedAssetId) {
      const id = await ensureRoomProduct(name);
      if (id) {
        setForm((f) => ({ ...f, roomProductId: id, roomType: name }));
        return;
      }
    }
    setForm((f) => ({ ...f, roomType: name, roomProductId: '' }));
  }

  async function save() {
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toastError('Enter a valid cost per night');
      return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      toastError('Season from must be on or before to');
      return;
    }
    const weekendRaw = form.weekendUnitCost.trim();
    let weekendUnitCost: number | null = null;
    if (weekendRaw) {
      weekendUnitCost = Number(weekendRaw);
      if (!Number.isFinite(weekendUnitCost) || weekendUnitCost < 0) {
        toastError('Weekend cost must be a valid number');
        return;
      }
    }
    const parseOccMoney = (raw: string, label: string): number | null | undefined => {
      const t = raw.trim();
      if (!t) return undefined;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        toastError(`${label} must be a valid number`);
        return null;
      }
      return n;
    };
    const extraAdult = parseOccMoney(form.extraAdultPerNight, 'Extra adult');
    if (extraAdult === null) return;
    const childBed = parseOccMoney(form.childWithBedPerNight, 'Child with bed');
    if (childBed === null) return;
    const childNoBed = parseOccMoney(form.childWithoutBedPerNight, 'Child without bed');
    if (childNoBed === null) return;
    const baseAdultsRaw = form.baseAdults.trim();
    const baseAdults = baseAdultsRaw ? Number(baseAdultsRaw) : 2;
    if (!Number.isFinite(baseAdults) || baseAdults < 1 || baseAdults > 12) {
      toastError('Base adults must be between 1 and 12');
      return;
    }
    const childAgeMaxRaw = form.childAgeMax.trim();
    let childAgeMax: number | undefined;
    if (childAgeMaxRaw) {
      const n = Number(childAgeMaxRaw);
      if (!Number.isFinite(n) || n < 0 || n > 17) {
        toastError('Child age max must be between 0 and 17');
        return;
      }
      childAgeMax = Math.floor(n);
    }
    const dateSupplements: Array<{
      date: string;
      amount: number;
      label?: string;
    }> = [];
    for (const row of form.galaRows) {
      const day = row.date.trim().slice(0, 10);
      const amountRaw = row.amount.trim();
      if (!day && !amountRaw && !row.label.trim()) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        toastError('Each gala night needs a valid date');
        return;
      }
      const amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        toastError('Each gala night needs a positive amount');
        return;
      }
      dateSupplements.push({
        date: day,
        amount,
        ...(row.label.trim() ? { label: row.label.trim().slice(0, 80) } : {}),
      });
    }
    const hasOcc =
      extraAdult != null ||
      childBed != null ||
      childNoBed != null ||
      baseAdults !== 2 ||
      childAgeMax != null ||
      dateSupplements.length > 0;
    const occupancyPricing = hasOcc
      ? {
          baseAdults,
          ...(childAgeMax != null ? { childAgeMax } : {}),
          ...(extraAdult != null ? { extraAdultPerNight: extraAdult } : {}),
          ...(childBed != null ? { childWithBedPerNight: childBed } : {}),
          ...(childNoBed != null ? { childWithoutBedPerNight: childNoBed } : {}),
          ...(dateSupplements.length ? { dateSupplements } : {}),
        }
      : null;
    setSaving(true);
    try {
      let roomProductId = form.roomProductId.trim() || null;
      let roomType = form.roomType.trim() || null;
      if (linkedAssetId && roomProductId) {
        const product = activeRoomProducts.find((r) => r.id === roomProductId);
        roomType = product?.name || roomType;
      } else if (linkedAssetId && roomType && !roomProductId) {
        const createdId = await ensureRoomProduct(roomType);
        if (createdId) roomProductId = createdId;
      }
      const body = {
        supplierId,
        placeId: form.place?.placeId || null,
        roomProductId,
        contractId: form.contractId.trim() || null,
        roomType,
        mealPlan: form.mealPlan.trim() || null,
        unitCost,
        weekendUnitCost,
        occupancyPricing,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editingId) {
        await api(`/hotel-rates/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Rate updated');
      } else {
        await api('/hotel-rates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Rate added');
      }
      closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save rate');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/hotel-rates/${id}`, { method: 'DELETE' });
      toastSuccess('Rate removed');
      if (editingId === id) closeForm();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete rate');
    }
  }

  const roomChipValue = ROOM_OPTIONS.some((o) => o.value === form.roomType)
    ? form.roomType
    : roomProductOptions.some((o) => o.label === form.roomType)
      ? form.roomType
      : '';

  const contractChip = contractOptions.some((o) => o.value === form.contractId)
    ? form.contractId
    : '';

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === form.contractId) || null,
    [contracts, form.contractId],
  );

  const canSaveSeason = useMemo(() => {
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return false;
    if (form.startDate && form.endDate && form.startDate > form.endDate) return false;
    if (contractOptions.length > 0 && !form.contractId.trim()) return false;
    if (linkedAssetId && activeRoomProducts.length > 0 && !form.roomProductId.trim()) {
      return false;
    }
    return true;
  }, [
    form.unitCost,
    form.startDate,
    form.endDate,
    form.contractId,
    form.roomProductId,
    contractOptions.length,
    linkedAssetId,
    activeRoomProducts.length,
  ]);

  const ratePreviewReady = useMemo(() => {
    const unitCost = Number(form.unitCost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return false;
    if (form.startDate && form.endDate && form.startDate > form.endDate) return false;
    if (contractOptions.length > 0 && !form.contractId.trim()) return false;
    if (linkedAssetId && activeRoomProducts.length > 0 && !form.roomProductId.trim()) {
      return false;
    }
    if (!form.startDate && !form.endDate) return false;
    return true;
  }, [
    form.unitCost,
    form.startDate,
    form.endDate,
    form.contractId,
    form.roomProductId,
    contractOptions.length,
    linkedAssetId,
    activeRoomProducts.length,
  ]);

  const summaryRoom =
    activeRoomProducts.find((r) => r.id === form.roomProductId)?.name ||
    form.roomType.trim() ||
    'Default room';
  const summaryMeal = form.mealPlan.trim()
    ? `${form.mealPlan.trim()}${MEAL_HINT[form.mealPlan.trim()] ? ` · ${MEAL_HINT[form.mealPlan.trim()]}` : ''}`
    : 'Any meal';
  const summaryDates =
    form.startDate && form.endDate
      ? `${formatDay(form.startDate)} → ${formatDay(form.endDate)}`
      : form.startDate
        ? `From ${formatDay(form.startDate)}`
        : form.endDate
          ? `Until ${formatDay(form.endDate)}`
          : 'Open dates';
  const weekdayNum = Number(form.unitCost);
  const weekendNum = form.weekendUnitCost.trim()
    ? Number(form.weekendUnitCost)
    : null;
  const summaryContract = selectedContract
    ? `${selectedContract.versionNumber ? `v${selectedContract.versionNumber}` : 'contract'} · ${selectedContract.title}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <IndianRupee className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Rate chart</h2>
            <p className="text-xs text-muted-foreground">
              Seasonal buy rates for {supplierName}. Quotes match room + meal + dates;
              weekend nights and occupancy extras apply when set.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can anyOf={CAP.ratesWrite}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <Import className="size-4" />
              Import CSV / Excel
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Add season
            </Button>
          </Can>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length ? (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/20"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">
                    {r.roomType?.trim() || 'Default room'}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {r.mealPlan?.trim() || 'Any'}
                  </span>
                  {!r.isActive ? (
                    <span className="text-[10px] text-amber-700 dark:text-amber-400">
                      Inactive
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {seasonLabel(r)}
                  {r.place?.name ? ` · ${r.place.name}` : ''}
                  {r.contract?.title
                    ? ` · ${r.contract.versionNumber ? `v${r.contract.versionNumber}` : 'contract'} ${r.contract.title}`
                    : ''}
                  {occupancyHint(r) ? ` · ${occupancyHint(r)}` : ''}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-medium">
                  {formatCurrency(Number(r.unitCost), {
                    currency: r.currency,
                    maximumFractionDigits: 0,
                  })}
                  <span className="text-xs font-normal text-muted-foreground">
                    /night
                  </span>
                </div>
                {r.weekendUnitCost != null ? (
                  <div className="text-xs text-muted-foreground">
                    Weekend{' '}
                    {formatCurrency(Number(r.weekendUnitCost), {
                      currency: r.currency,
                      maximumFractionDigits: 0,
                    })}
                  </div>
                ) : null}
              </div>
              <Can anyOf={CAP.ratesWrite}>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Duplicate as new season"
                    title="Duplicate as new season"
                    onClick={() => duplicateAsSeason(r)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Edit rate"
                    onClick={() => startEdit(r)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    aria-label="Delete rate"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Can>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No seasons yet. Add room + meal + date window, or import a CSV.
          </p>
          <Can anyOf={CAP.ratesWrite}>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button type="button" size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                Add first season
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(true)}
              >
                <Import className="size-4" />
                Import CSV / Excel
              </Button>
            </div>
          </Can>
        </div>
      )}

      <Can anyOf={CAP.ratesWrite}>
        <RecordSheet
          open={formOpen}
          onOpenChange={onSheetOpenChange}
          title={editingId ? 'Edit season' : 'Add season'}
          description="Buy cost for a room + meal plan over a date window. Used when quoting this supplier."
          submitting={saving}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => closeForm()}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving || !canSaveSeason}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save season'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {contractOptions.length ? (
              <FormField
                label="Contract version"
                description="Rates attach to a contract version — active version is used in quoting."
              >
                <Combobox
                  value={form.contractId || undefined}
                  onChange={(contractId) => setForm((f) => ({ ...f, contractId }))}
                  options={contractOptions}
                  placeholder={activeContract ? contractLabel(activeContract) : 'Select contract'}
                />
                <QuickPicks label="Quick pick">
                  <SuggestionChips
                    aria-label="Contract version"
                    allowDeselect
                    options={contractOptions.slice(0, 4)}
                    value={contractChip}
                    onChange={(contractId) =>
                      setForm((f) => ({ ...f, contractId: contractId || activeContract?.id || '' }))
                    }
                  />
                </QuickPicks>
              </FormField>
            ) : null}

            <FormField
              label="Room type"
              description={
                linkedAssetId
                  ? 'Pick a room product from inventory — name is stored on the rate for quotes.'
                  : 'Leave blank to match any / default room on quotes.'
              }
            >
              {linkedAssetId && roomProductOptions.length ? (
                <Combobox
                  value={form.roomProductId || undefined}
                  onChange={(roomProductId) => void pickRoomProduct(roomProductId)}
                  options={roomProductOptions}
                  placeholder="Select room product"
                  disabled={creatingRoom}
                />
              ) : (
                <Input
                  value={form.roomType}
                  onChange={(e) => setForm({ ...form, roomType: e.target.value })}
                  placeholder="e.g. Deluxe mountain view"
                  autoFocus={!editingId}
                  disabled={creatingRoom}
                />
              )}
              <QuickPicks label="Quick pick">
                <SuggestionChips
                  aria-label="Room type"
                  allowDeselect
                  options={
                    roomProductOptions.length
                      ? roomProductOptions.map((o) => ({ value: o.label, label: o.label }))
                      : ROOM_OPTIONS
                  }
                  value={roomChipValue}
                  onChange={(roomType) => void pickRoomPreset(roomType)}
                />
              </QuickPicks>
            </FormField>

            <FormField
              label="Meal plan"
              description={
                form.mealPlan.trim() && MEAL_HINT[form.mealPlan.trim()]
                  ? MEAL_HINT[form.mealPlan.trim()]
                  : 'Optional — blank matches any meal plan.'
              }
            >
              <SuggestionChips
                aria-label="Meal plan"
                allowDeselect
                options={MEAL_OPTIONS}
                value={form.mealPlan}
                onChange={(mealPlan) => setForm({ ...form, mealPlan })}
              />
            </FormField>

            <FormGrid>
              <FormField label="Weekday / night" required>
                <PriceField
                  value={form.unitCost}
                  onChange={(unitCost) => setForm({ ...form, unitCost })}
                  placeholder="4500"
                />
              </FormField>
              <FormField
                label="Weekend / night"
                description="Optional. Blank = same as weekday."
              >
                <PriceField
                  value={form.weekendUnitCost}
                  onChange={(weekendUnitCost) =>
                    setForm({ ...form, weekendUnitCost })
                  }
                  placeholder="5200"
                />
              </FormField>
            </FormGrid>

            <FormField
              label="Occupancy (optional)"
              description="Base adults included in the room rate. Extra adult / child supplements apply on Match rate. Child age max reclassifies older kids as adults."
            >
              <FormGrid>
                <FormField label="Base adults / room">
                  <Input
                    inputMode="numeric"
                    value={form.baseAdults}
                    onChange={(e) =>
                      setForm({ ...form, baseAdults: e.target.value })
                    }
                    placeholder="2"
                  />
                </FormField>
                <FormField label="Child age max">
                  <Input
                    inputMode="numeric"
                    value={form.childAgeMax}
                    onChange={(e) =>
                      setForm({ ...form, childAgeMax: e.target.value })
                    }
                    placeholder="11"
                  />
                </FormField>
                <FormField label="Extra adult / night">
                  <PriceField
                    value={form.extraAdultPerNight}
                    onChange={(extraAdultPerNight) =>
                      setForm({ ...form, extraAdultPerNight })
                    }
                    placeholder="1500"
                  />
                </FormField>
                <FormField label="Child with bed / night">
                  <PriceField
                    value={form.childWithBedPerNight}
                    onChange={(childWithBedPerNight) =>
                      setForm({ ...form, childWithBedPerNight })
                    }
                    placeholder="1000"
                  />
                </FormField>
                <FormField label="Child without bed / night">
                  <PriceField
                    value={form.childWithoutBedPerNight}
                    onChange={(childWithoutBedPerNight) =>
                      setForm({ ...form, childWithoutBedPerNight })
                    }
                    placeholder="500"
                  />
                </FormField>
              </FormGrid>
            </FormField>

            <FormField
              label="Gala / date supplements (optional)"
              description="Per-room buy add-on for specific stay nights (e.g. Christmas Eve). Applied on Match rate after occupancy."
            >
              <div className="space-y-2">
                {form.galaRows.map((row, idx) => (
                  <FormGrid key={idx}>
                    <FormField label={idx === 0 ? 'Night' : ' '}>
                      <DatePicker
                        value={parseDateInput(row.date)}
                        onChange={(d) => {
                          const next = [...form.galaRows];
                          next[idx] = {
                            ...row,
                            date: formatDateInput(d) || '',
                          };
                          setForm({ ...form, galaRows: next });
                        }}
                      />
                    </FormField>
                    <FormField label={idx === 0 ? 'Amount / room' : ' '}>
                      <PriceField
                        value={row.amount}
                        onChange={(amount) => {
                          const next = [...form.galaRows];
                          next[idx] = { ...row, amount };
                          setForm({ ...form, galaRows: next });
                        }}
                        placeholder="2500"
                      />
                    </FormField>
                    <FormField label={idx === 0 ? 'Label' : ' '}>
                      <Input
                        value={row.label}
                        onChange={(e) => {
                          const next = [...form.galaRows];
                          next[idx] = { ...row, label: e.target.value };
                          setForm({ ...form, galaRows: next });
                        }}
                        placeholder="Christmas Eve gala"
                      />
                    </FormField>
                  </FormGrid>
                ))}
              </div>
            </FormField>

            <FormGrid>
              <FormField label="Season from">
                <DatePicker
                  value={parseDateInput(form.startDate)}
                  onChange={(d) =>
                    setForm({ ...form, startDate: formatDateInput(d) || '' })
                  }
                />
              </FormField>
              <FormField label="Season to">
                <DatePicker
                  value={parseDateInput(form.endDate)}
                  onChange={(d) =>
                    setForm({ ...form, endDate: formatDateInput(d) || '' })
                  }
                />
              </FormField>
            </FormGrid>

            {showPlace || form.place ? (
              <PlaceSinglePicker
                label="Place override (optional)"
                value={form.place}
                onChange={(place) => setForm({ ...form, place })}
              />
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowPlace(true)}
              >
                + Place override (rare)
              </button>
            )}

            {ratePreviewReady ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{summaryRoom}</span>
                {' · '}
                {summaryMeal}
                {' · '}
                {summaryDates}
                {' · '}
                <span className="tabular-nums text-foreground">
                  {formatCurrency(weekdayNum, { maximumFractionDigits: 0 })}/night weekday
                </span>
                {weekendNum != null && Number.isFinite(weekendNum) ? (
                  <span className="tabular-nums">
                    {' '}
                    · {formatCurrency(weekendNum, { maximumFractionDigits: 0 })}/night weekend
                  </span>
                ) : null}
                {summaryContract ? (
                  <>
                    {' · '}
                    <span className="text-foreground">{summaryContract}</span>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Select a room product and season dates to preview this rate.
              </div>
            )}
          </div>
        </RecordSheet>
      </Can>

      <RatesCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="hotel"
        lockedSupplierName={supplierName}
        onImported={() => void load()}
      />
    </div>
  );
}
