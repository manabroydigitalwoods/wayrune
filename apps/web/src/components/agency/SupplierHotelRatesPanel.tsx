import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  GitBranch,
  Grid2x2,
  History,
  Import,
  IndianRupee,
  Pencil,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  NumberField,
  PriceField,
  QuickPicks,
  RecordSheet,
  SimpleFormField as FormField,
  Skeleton,
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
import { cloneHotelRateFormForMealPlan } from '../../lib/hotelRateMealClone';
import {
  HOTEL_NATIONALITY_OPTIONS,
  HOTEL_NATIONALITY_QUICK_OPTIONS,
  normalizeHotelNationalityUi,
} from '../../lib/hotelNationalityNote';
import {
  HOTEL_PLACE_OF_SUPPLY_OPTIONS,
  normalizeHotelPlaceOfSupplyUi,
} from '../../lib/hotelPlaceOfSupply';
import {
  buildHotelRateTipDiffRows,
  formatHotelRateTipDiffCue,
  formatHotelRateVersionHistoryLine,
  hotelRateLooksPendingActivation,
  hotelRateVersionLabel,
  showHotelRateTipDiffExpand,
  type HotelRateTipDiffRow,
  type HotelRateVersionListItem,
} from '../../lib/hotelRateVersion';
import { usePermissions } from '../../lib/permissions';
import {
  MEAL_MATRIX_PLANS,
  MATRIX_ADULT_BANDS,
  buildMealOccupancyMatrix,
  diffMealOccupancyMatrix,
  occupancyJsonWithAdultBands,
  setMatrixCellCost,
  setMatrixCellWeekendCost,
  type MealMatrixPlan,
  type MealOccupancyMatrixCell,
  type MealOccupancyMatrixRate,
  type MatrixAdultBand,
} from '../../lib/hotelRateMealOccupancyMatrix';

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

function emptyAdultBandRows() {
  return [
    { adults: 1 as const, unitCost: '', weekendUnitCost: '' },
    { adults: 2 as const, unitCost: '', weekendUnitCost: '' },
    { adults: 3 as const, unitCost: '', weekendUnitCost: '' },
    { adults: 4 as const, unitCost: '', weekendUnitCost: '' },
    { adults: 5 as const, unitCost: '', weekendUnitCost: '' },
    { adults: 6 as const, unitCost: '', weekendUnitCost: '' },
  ];
}

type ChildAgeNatFormRow = {
  ageMin: string;
  ageMax: string;
  nationality: string;
  withBed: string;
  withoutBed: string;
};

function emptyChildAgeNatRows(): ChildAgeNatFormRow[] {
  return [
    { ageMin: '0', ageMax: '5', nationality: 'IN', withBed: '', withoutBed: '' },
    { ageMin: '0', ageMax: '5', nationality: 'INTL', withBed: '', withoutBed: '' },
    { ageMin: '6', ageMax: '11', nationality: 'IN', withBed: '', withoutBed: '' },
    { ageMin: '6', ageMax: '11', nationality: 'INTL', withBed: '', withoutBed: '' },
  ];
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
    adultBandRows: emptyAdultBandRows(),
    childAgeNatRows: emptyChildAgeNatRows(),
    /** Up to 3 gala / date supplements (single night + amount). */
    galaRows: emptyGalaRows(),
    minStayNights: '',
    maxStayNights: '',
    nationality: '',
    placeOfSupply: '',
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
      adultBandRows: emptyAdultBandRows(),
      childAgeNatRows: emptyChildAgeNatRows(),
      galaRows: emptyGalaRows(),
      minStayNights: '',
      maxStayNights: '',
      nationality: '',
      placeOfSupply: '',
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
  const bands = Array.isArray(o.adultBands) ? o.adultBands : [];
  const adultBandRows = emptyAdultBandRows().map((blank) => {
    const match = bands.find(
      (b) =>
        b &&
        typeof b === 'object' &&
        Number((b as { adults?: unknown }).adults) === blank.adults,
    ) as
      | {
          unitCostPerNight?: unknown;
          unitCost?: unknown;
          weekendUnitCostPerNight?: unknown;
          weekendUnitCost?: unknown;
        }
      | undefined;
    const cost = match?.unitCostPerNight ?? match?.unitCost;
    const weekend =
      match?.weekendUnitCostPerNight ?? match?.weekendUnitCost;
    return {
      ...blank,
      unitCost: cost != null && Number(cost) >= 0 ? String(cost) : '',
      weekendUnitCost:
        weekend != null && Number(weekend) >= 0 ? String(weekend) : '',
    };
  });
  const rawChildAge = Array.isArray(o.childAgeNationalityRates)
    ? o.childAgeNationalityRates
    : [];
  const childAgeNatRows =
    rawChildAge.length > 0
      ? rawChildAge.slice(0, 12).map((row) => {
          const r = row as Record<string, unknown>;
          return {
            ageMin: r.ageMin != null ? String(r.ageMin) : '',
            ageMax: r.ageMax != null ? String(r.ageMax) : '',
            nationality:
              typeof r.nationality === 'string' ? r.nationality : '',
            withBed:
              r.withBedPerNight != null ? String(r.withBedPerNight) : '',
            withoutBed:
              r.withoutBedPerNight != null
                ? String(r.withoutBedPerNight)
                : '',
          };
        })
      : emptyChildAgeNatRows();
  return {
    baseAdults: o.baseAdults != null ? String(o.baseAdults) : '2',
    childAgeMax: o.childAgeMax != null ? String(o.childAgeMax) : '',
    extraAdultPerNight:
      o.extraAdultPerNight != null ? String(o.extraAdultPerNight) : '',
    childWithBedPerNight:
      o.childWithBedPerNight != null ? String(o.childWithBedPerNight) : '',
    childWithoutBedPerNight:
      o.childWithoutBedPerNight != null ? String(o.childWithoutBedPerNight) : '',
    adultBandRows,
    childAgeNatRows,
    galaRows,
    minStayNights:
      o.minStayNights != null && Number(o.minStayNights) >= 1
        ? String(Math.floor(Number(o.minStayNights)))
        : '',
    maxStayNights:
      o.maxStayNights != null && Number(o.maxStayNights) >= 1
        ? String(Math.floor(Number(o.maxStayNights)))
        : '',
    nationality: normalizeHotelNationalityUi(
      typeof o.nationality === 'string' ? o.nationality : '',
    ),
    placeOfSupply: normalizeHotelPlaceOfSupplyUi(
      typeof o.placeOfSupply === 'string' ? o.placeOfSupply : '',
    ),
  };
}

function occupancyHint(rate: HotelRate): string | null {
  const o = rate.occupancyPricingJson;
  if (!o || typeof o !== 'object') return null;
  const parts: string[] = [];
  const bands = Array.isArray(o.adultBands) ? o.adultBands.length : 0;
  if (bands > 0) {
    const withWeekend = Array.isArray(o.adultBands)
      ? o.adultBands.filter(
          (b) =>
            b &&
            typeof b === 'object' &&
            (b as { weekendUnitCostPerNight?: unknown }).weekendUnitCostPerNight !=
              null,
        ).length
      : 0;
    parts.push(
      withWeekend > 0
        ? `${bands} adult band${bands === 1 ? '' : 's'} (we)`
        : `${bands} adult band${bands === 1 ? '' : 's'}`,
    );
  }
  const baseA = o.baseAdults ?? 2;
  if (bands === 0) parts.push(`${baseA}A base`);
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
  if (o.minStayNights != null && Number(o.minStayNights) >= 1) {
    parts.push(`min ${Math.floor(Number(o.minStayNights))}n`);
  }
  if (o.maxStayNights != null && Number(o.maxStayNights) >= 1) {
    parts.push(`max ${Math.floor(Number(o.maxStayNights))}n`);
  }
  const nat = normalizeHotelNationalityUi(
    typeof o.nationality === 'string' ? o.nationality : '',
  );
  if (nat === 'IN') parts.push('IN');
  if (nat === 'INTL') parts.push('INTL');
  if (
    parts.length <= 1 &&
    !o.extraAdultPerNight &&
    !o.childWithBedPerNight &&
    bands === 0 &&
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
  const { hasAny } = usePermissions();
  const canActivateRates = hasAny(CAP.ratesApprove);
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
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixAnchor, setMatrixAnchor] = useState<HotelRate | null>(null);
  const [matrixCells, setMatrixCells] = useState<MealOccupancyMatrixCell[]>([]);
  const [matrixByMeal, setMatrixByMeal] = useState<
    Partial<Record<MealMatrixPlan, MealOccupancyMatrixRate>>
  >({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyAnchorId, setHistoryAnchorId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<
    HotelRateVersionListItem[]
  >([]);
  const [historyDiffOpenId, setHistoryDiffOpenId] = useState<string | null>(
    null,
  );
  const [versioningId, setVersioningId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

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
    return [...rates]
      .filter(
        (r) =>
          r.isActive !== false ||
          hotelRateLooksPendingActivation(r, rates),
      )
      .sort((a, b) => {
        const room = (a.roomType || '').localeCompare(b.roomType || '');
        if (room) return room;
        const meal = (a.mealPlan || '').localeCompare(b.mealPlan || '');
        if (meal) return meal;
        return isoDate(a.startDate).localeCompare(isoDate(b.startDate));
      });
  }, [rates]);

  async function createRateVersion(rate: HotelRate) {
    setVersioningId(rate.id);
    try {
      const created = await api<
        HotelRate & {
          pendingActivation?: boolean;
          versionMeta?: {
            versionNumber?: number;
            pendingActivation?: boolean;
          };
        }
      >(`/hotel-rates/${rate.id}/new-version`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const pending =
        created.pendingActivation === true ||
        created.versionMeta?.pendingActivation === true;
      toastSuccess(
        pending
          ? `Submitted ${hotelRateVersionLabel(created.versionMeta?.versionNumber ?? created.versionNumber)} for activation — edit buy, then a manager Activates`
          : `Created ${hotelRateVersionLabel(created.versionMeta?.versionNumber ?? created.versionNumber)} — edit costs then Save`,
      );
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create rate version');
    } finally {
      setVersioningId(null);
    }
  }

  async function activateRateVersion(rateId: string) {
    setActivatingId(rateId);
    try {
      const updated = await api<HotelRate>(`/hotel-rates/${rateId}/activate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess(
        `Activated ${hotelRateVersionLabel(updated.versionNumber)} — Match uses this tip`,
      );
      await load();
      if (historyOpen && historyAnchorId) {
        const res = await api<{
          versions: HotelRateVersionListItem[];
        }>(`/hotel-rates/${historyAnchorId}/versions`);
        setHistoryVersions(res.versions || []);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not activate rate');
    } finally {
      setActivatingId(null);
    }
  }

  async function openRateHistory(rate: HotelRate) {
    setHistoryAnchorId(rate.id);
    setHistoryOpen(true);
    setHistoryDiffOpenId(null);
    setHistoryLoading(true);
    try {
      const res = await api<{
        versions: HotelRateVersionListItem[];
        activeRateId?: string;
      }>(`/hotel-rates/${rate.id}/versions`);
      setHistoryVersions(res.versions || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load rate history');
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function restoreRateVersion(sourceVersionId: string) {
    if (!historyAnchorId) return;
    setHistorySaving(true);
    try {
      const created = await api<HotelRate & { pendingActivation?: boolean }>(
        `/hotel-rates/${historyAnchorId}/restore-version`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceVersionId }),
        },
      );
      toastSuccess(
        created.pendingActivation
          ? `Restored as ${hotelRateVersionLabel(created.versionNumber)} — pending activation`
          : `Restored as ${hotelRateVersionLabel(created.versionNumber)}`,
      );
      setHistoryOpen(false);
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore version');
    } finally {
      setHistorySaving(false);
    }
  }

  async function restoreRateField(
    sourceVersionId: string,
    field: NonNullable<HotelRateTipDiffRow['restoreField']>,
  ) {
    if (!historyAnchorId || !field) return;
    setHistorySaving(true);
    try {
      const created = await api<HotelRate & { pendingActivation?: boolean }>(
        `/hotel-rates/${historyAnchorId}/restore-field`,
        {
          method: 'POST',
          body: JSON.stringify({ sourceVersionId, field }),
        },
      );
      toastSuccess(
        created.pendingActivation
          ? `Field restored as ${hotelRateVersionLabel(created.versionNumber)} — pending activation`
          : `Field restored as ${hotelRateVersionLabel(created.versionNumber)}`,
      );
      setHistoryOpen(false);
      await load();
      startEdit(created);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore field');
    } finally {
      setHistorySaving(false);
    }
  }

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

  function openMealOccupancyMatrix(rate: HotelRate) {
    const built = buildMealOccupancyMatrix(rates, rate);
    setMatrixAnchor(rate);
    setMatrixCells(built.cells);
    setMatrixByMeal(built.byMeal);
    setMatrixOpen(true);
  }

  function closeMatrix() {
    setMatrixOpen(false);
    setMatrixAnchor(null);
    setMatrixCells([]);
    setMatrixByMeal({});
  }

  async function saveMealOccupancyMatrix() {
    if (!matrixAnchor) return;
    const { upserts, deletes, errors } = diffMealOccupancyMatrix({
      cells: matrixCells,
      byMeal: matrixByMeal,
      anchor: matrixAnchor,
    });
    if (errors.length) {
      toastError(errors[0]!);
      return;
    }
    const changed = upserts.filter((u) => u.changed);
    if (!changed.length && !deletes.length) {
      toastSuccess('Matrix unchanged');
      closeMatrix();
      return;
    }
    setMatrixSaving(true);
    try {
      let created = 0;
      let updated = 0;
      let removed = 0;
      for (const row of changed) {
        const existing = row.existingId
          ? rates.find((r) => r.id === row.existingId) || null
          : null;
        const occupancyPricing = occupancyJsonWithAdultBands(
          existing?.occupancyPricingJson ??
            matrixAnchor.occupancyPricingJson ??
            null,
          row.adultBands,
          {
            weekendRatio:
              row.weekendUnitCost != null && row.unitCost > 0
                ? row.weekendUnitCost / row.unitCost
                : null,
          },
        );
        const body = {
          supplierId,
          placeId:
            matrixAnchor.placeId ||
            matrixAnchor.place?.id ||
            null,
          roomProductId:
            matrixAnchor.roomProductId ||
            matrixAnchor.roomProduct?.id ||
            null,
          contractId: matrixAnchor.contractId || null,
          roomType:
            matrixAnchor.roomType ||
            matrixAnchor.roomProduct?.name ||
            null,
          mealPlan: row.mealPlan,
          unitCost: row.unitCost,
          weekendUnitCost: row.weekendUnitCost,
          occupancyPricing,
          startDate: isoDate(matrixAnchor.startDate) || null,
          endDate: isoDate(matrixAnchor.endDate) || null,
        };
        if (row.existingId) {
          await api(`/hotel-rates/${row.existingId}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          updated += 1;
        } else {
          await api('/hotel-rates', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          created += 1;
        }
      }
      for (const row of deletes) {
        await api(`/hotel-rates/${row.existingId}`, { method: 'DELETE' });
        removed += 1;
      }
      const parts: string[] = [];
      if (created) parts.push(`${created} meal plan${created === 1 ? '' : 's'} added`);
      if (updated) parts.push(`${updated} updated`);
      if (removed) {
        parts.push(
          `${removed} meal plan${removed === 1 ? '' : 's'} removed`,
        );
      }
      toastSuccess(parts.join(' · ') || 'Matrix saved');
      closeMatrix();
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save matrix');
    } finally {
      setMatrixSaving(false);
    }
  }

  /** Same season window + occupancy; next meal plan with nudged costs. */
  function duplicateAsMealPlan(rate: HotelRate) {
    const clone = cloneHotelRateFormForMealPlan(rate, {
      defaultContractId: activeContract?.id || '',
    });
    const occ = occupancyFromRate(rate);
    setEditingId(null);
    setForm({
      ...emptyForm(activeContract?.id || ''),
      ...occ,
      roomType: clone.roomType,
      roomProductId: clone.roomProductId,
      contractId: clone.contractId || activeContract?.id || '',
      mealPlan: clone.mealPlan,
      unitCost: clone.unitCost,
      weekendUnitCost: clone.weekendUnitCost,
      adultBandRows: clone.adultBandRows ?? occ.adultBandRows,
      childAgeNatRows: clone.childAgeNatRows ?? occ.childAgeNatRows,
      extraAdultPerNight:
        clone.extraAdultPerNight !== undefined && clone.extraAdultPerNight !== ''
          ? clone.extraAdultPerNight
          : occ.extraAdultPerNight,
      childWithBedPerNight:
        clone.childWithBedPerNight !== undefined && clone.childWithBedPerNight !== ''
          ? clone.childWithBedPerNight
          : occ.childWithBedPerNight,
      childWithoutBedPerNight:
        clone.childWithoutBedPerNight !== undefined &&
        clone.childWithoutBedPerNight !== ''
          ? clone.childWithoutBedPerNight
          : occ.childWithoutBedPerNight,
      place: clone.place,
      startDate: clone.startDate,
      endDate: clone.endDate,
    });
    setShowPlace(Boolean(clone.place));
    setFormOpen(true);
    toastSuccess(
      `Draft ${clone.mealPlan} copy — review costs, then Save (same season as ${rate.mealPlan || 'source'})`,
    );
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
    const adultBands: Array<{
      adults: number;
      unitCostPerNight: number;
      weekendUnitCostPerNight?: number;
    }> = [];
    for (const row of form.adultBandRows) {
      const raw = row.unitCost.trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        toastError(`${row.adults}A band cost must be a valid number`);
        return;
      }
      const weekendRaw = row.weekendUnitCost.trim();
      let weekendUnitCostPerNight: number | undefined;
      if (weekendRaw) {
        const w = Number(weekendRaw);
        if (!Number.isFinite(w) || w < 0) {
          toastError(`${row.adults}A weekend cost must be a valid number`);
          return;
        }
        weekendUnitCostPerNight = w;
      }
      adultBands.push({
        adults: row.adults,
        unitCostPerNight: n,
        ...(weekendUnitCostPerNight != null
          ? { weekendUnitCostPerNight }
          : {}),
      });
    }
    const childAgeNationalityRates: Array<{
      ageMin: number;
      ageMax: number;
      nationality?: string;
      withBedPerNight: number;
      withoutBedPerNight?: number;
    }> = [];
    for (const row of form.childAgeNatRows ?? []) {
      const withRaw = row.withBed.trim();
      if (!withRaw && !row.withoutBed.trim()) continue;
      const ageMin = Number(row.ageMin);
      const ageMax = Number(row.ageMax);
      if (
        !Number.isFinite(ageMin) ||
        !Number.isFinite(ageMax) ||
        ageMin < 0 ||
        ageMax < ageMin ||
        ageMax > 17
      ) {
        toastError('Child age band ages must be 0–17 with min ≤ max');
        return;
      }
      const withBed = Number(withRaw);
      if (!Number.isFinite(withBed) || withBed < 0) {
        toastError('Child age×market with-bed cost must be a valid number');
        return;
      }
      const withoutRaw = row.withoutBed.trim();
      let withoutBedPerNight: number | undefined;
      if (withoutRaw) {
        const w = Number(withoutRaw);
        if (!Number.isFinite(w) || w < 0) {
          toastError('Child age×market without-bed cost must be a valid number');
          return;
        }
        withoutBedPerNight = w;
      }
      const nat = row.nationality.trim().toUpperCase();
      childAgeNationalityRates.push({
        ageMin: Math.floor(ageMin),
        ageMax: Math.floor(ageMax),
        ...(nat ? { nationality: nat } : {}),
        withBedPerNight: withBed,
        ...(withoutBedPerNight != null ? { withoutBedPerNight } : {}),
      });
    }
    const minStayRaw = form.minStayNights.trim();
    let minStayNights: number | undefined;
    if (minStayRaw) {
      const n = Number(minStayRaw);
      if (!Number.isFinite(n) || n < 1 || n > 30) {
        toastError('Min stay must be between 1 and 30 nights');
        return;
      }
      minStayNights = Math.floor(n);
    }
    const maxStayRaw = form.maxStayNights.trim();
    let maxStayNights: number | undefined;
    if (maxStayRaw) {
      const n = Number(maxStayRaw);
      if (!Number.isFinite(n) || n < 1 || n > 30) {
        toastError('Max stay must be between 1 and 30 nights');
        return;
      }
      maxStayNights = Math.floor(n);
    }
    if (
      minStayNights != null &&
      maxStayNights != null &&
      maxStayNights < minStayNights
    ) {
      toastError('Max stay must be at least min stay');
      return;
    }
    const nationality = normalizeHotelNationalityUi(form.nationality) || undefined;
    const placeOfSupply =
      normalizeHotelPlaceOfSupplyUi(form.placeOfSupply) || undefined;
    const dblBand = adultBands.find((b) => b.adults === 2);
    const chartWeekendFromBand =
      dblBand?.weekendUnitCostPerNight ??
      adultBands.find((b) => b.weekendUnitCostPerNight != null)
        ?.weekendUnitCostPerNight;
    const weekendUnitCostResolved =
      weekendUnitCost ??
      (chartWeekendFromBand != null ? chartWeekendFromBand : null);
    const hasOcc =
      extraAdult != null ||
      childBed != null ||
      childNoBed != null ||
      baseAdults !== 2 ||
      childAgeMax != null ||
      dateSupplements.length > 0 ||
      adultBands.length > 0 ||
      childAgeNationalityRates.length > 0 ||
      minStayNights != null ||
      maxStayNights != null ||
      nationality != null ||
      placeOfSupply != null;
    const occupancyPricing = hasOcc
      ? {
          baseAdults,
          ...(childAgeMax != null ? { childAgeMax } : {}),
          ...(extraAdult != null ? { extraAdultPerNight: extraAdult } : {}),
          ...(childBed != null ? { childWithBedPerNight: childBed } : {}),
          ...(childNoBed != null ? { childWithoutBedPerNight: childNoBed } : {}),
          ...(adultBands.length ? { adultBands } : {}),
          ...(childAgeNationalityRates.length
            ? { childAgeNationalityRates }
            : {}),
          ...(minStayNights != null ? { minStayNights } : {}),
          ...(maxStayNights != null ? { maxStayNights } : {}),
          ...(nationality ? { nationality } : {}),
          ...(placeOfSupply ? { placeOfSupply } : {}),
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
        weekendUnitCost: weekendUnitCostResolved,
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
              weekend nights and occupancy extras apply when set. Use the grid for
              EP/CP/MAP/AP × SGL/DBL/TPL, or New version to supersede a tip while keeping
              history.
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
        <div role="status" aria-busy="true" className="space-y-2 py-1">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-full" />
        </div>
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
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {hotelRateVersionLabel(r.versionNumber)}
                  </span>
                  {(() => {
                    const nat = normalizeHotelNationalityUi(
                      typeof r.occupancyPricingJson?.nationality === 'string'
                        ? r.occupancyPricingJson.nationality
                        : '',
                    );
                    return nat ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {nat}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const pos = normalizeHotelPlaceOfSupplyUi(
                      typeof r.occupancyPricingJson?.placeOfSupply === 'string'
                        ? r.occupancyPricingJson.placeOfSupply
                        : '',
                    );
                    return pos ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        POS {pos}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const pending = hotelRateLooksPendingActivation(r, rates);
                    if (pending) {
                      return (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Pending activation
                        </span>
                      );
                    }
                    if (!r.isActive) {
                      return (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400">
                          Inactive
                        </span>
                      );
                    }
                    return null;
                  })()}
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
                  {hotelRateLooksPendingActivation(r, rates) && canActivateRates ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={activatingId === r.id}
                      onClick={() => void activateRateVersion(r.id)}
                    >
                      Activate
                    </Button>
                  ) : null}
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
                    aria-label="Meal × occupancy matrix"
                    title="Edit meal × occupancy matrix (same season)"
                    onClick={() => openMealOccupancyMatrix(r)}
                  >
                    <Grid2x2 className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Copy as other meal plan"
                    title="Copy as other meal plan (same dates)"
                    onClick={() => duplicateAsMealPlan(r)}
                  >
                    <Utensils className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="New rate version"
                    title="New version (keeps history)"
                    disabled={
                      versioningId === r.id ||
                      hotelRateLooksPendingActivation(r, rates) ||
                      r.isActive === false
                    }
                    onClick={() => void createRateVersion(r)}
                  >
                    <GitBranch className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Rate version history"
                    title="Version history"
                    onClick={() => void openRateHistory(r)}
                  >
                    <History className="size-3.5" />
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

            <FormField
              label="Nationality market"
              description="IN = Indian · INTL = foreign catch-all · or search any ISO-3166 country. Sister seasons can share dates when markets differ. Match prefers exact ISO, then INTL, then any."
            >
              <div className="space-y-2">
                <SuggestionChips
                  aria-label="Nationality market quick picks"
                  allowDeselect
                  options={[...HOTEL_NATIONALITY_QUICK_OPTIONS]}
                  value={form.nationality}
                  onChange={(nationality) =>
                    setForm({
                      ...form,
                      nationality: normalizeHotelNationalityUi(nationality),
                    })
                  }
                />
                <Combobox
                  value={normalizeHotelNationalityUi(form.nationality)}
                  onChange={(nationality) =>
                    setForm({
                      ...form,
                      nationality: normalizeHotelNationalityUi(nationality),
                    })
                  }
                  options={HOTEL_NATIONALITY_OPTIONS}
                  placeholder="Search all countries…"
                  searchable
                />
              </div>
            </FormField>

            <FormField
              label="Place of supply tip"
              description="Optional dest POS for this buy tip (e.g. KA). Match prefers the tip matching the trip destination POS, then any blank tip. Does not change tax filing."
            >
              <Combobox
                value={normalizeHotelPlaceOfSupplyUi(form.placeOfSupply)}
                onChange={(placeOfSupply) =>
                  setForm({
                    ...form,
                    placeOfSupply: normalizeHotelPlaceOfSupplyUi(placeOfSupply),
                  })
                }
                options={HOTEL_PLACE_OF_SUPPLY_OPTIONS}
                placeholder="Any (no POS tip)"
                searchable
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
              description="SGL–HEX weekday bases (1A–6A) replace chart cost on Match by adults/room. Optional weekend per band. Child age×market columns override flat child rates when ages are on the quote."
            >
              <div className="space-y-3">
                <div className="space-y-2">
                  {form.adultBandRows.map((row, idx) => {
                    const bandLabel =
                      row.adults === 1
                        ? 'Single (1A)'
                        : row.adults === 2
                          ? 'Double (2A)'
                          : row.adults === 3
                            ? 'Triple (3A)'
                            : row.adults === 4
                              ? 'Quad (4A)'
                              : `${row.adults}A`;
                    return (
                    <FormGrid key={row.adults}>
                      <FormField label={`${bandLabel} weekday`}>
                        <PriceField
                          value={row.unitCost}
                          onChange={(unitCost) => {
                            const next = [...form.adultBandRows];
                            next[idx] = { ...row, unitCost };
                            setForm({ ...form, adultBandRows: next });
                          }}
                          placeholder={
                            row.adults === 2 ? form.unitCost || '4500' : ''
                          }
                        />
                      </FormField>
                      <FormField
                        label={`${bandLabel} weekend`}
                        description={
                          idx === 0
                            ? 'Optional. Blank = scale from chart weekend.'
                            : undefined
                        }
                      >
                        <PriceField
                          value={row.weekendUnitCost}
                          onChange={(weekendUnitCost) => {
                            const next = [...form.adultBandRows];
                            next[idx] = { ...row, weekendUnitCost };
                            setForm({ ...form, adultBandRows: next });
                          }}
                          placeholder={
                            row.adults === 2
                              ? form.weekendUnitCost || ''
                              : ''
                          }
                        />
                      </FormField>
                    </FormGrid>
                    );
                  })}
                </div>
                <div className="space-y-2 rounded-lg border border-border/50 p-3">
                  <div className="text-xs font-medium text-foreground">
                    Child age × nationality matrix
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Contract child with/without bed by age band and market (IN /
                    INTL). Match uses traveller ages + nationalities; blank rows
                    are ignored. Flat child rates below remain fallback.
                  </p>
                  {(form.childAgeNatRows ?? emptyChildAgeNatRows()).map(
                    (row, idx) => (
                      <FormGrid key={idx}>
                        <FormField label={idx === 0 ? 'Age min' : ' '}>
                          <NumberField
                            min={0}
                            max={17}
                            value={row.ageMin}
                            onChange={(ageMin) => {
                              const next = [
                                ...(form.childAgeNatRows ??
                                  emptyChildAgeNatRows()),
                              ];
                              next[idx] = { ...row, ageMin };
                              setForm({ ...form, childAgeNatRows: next });
                            }}
                          />
                        </FormField>
                        <FormField label={idx === 0 ? 'Age max' : ' '}>
                          <NumberField
                            min={0}
                            max={17}
                            value={row.ageMax}
                            onChange={(ageMax) => {
                              const next = [
                                ...(form.childAgeNatRows ??
                                  emptyChildAgeNatRows()),
                              ];
                              next[idx] = { ...row, ageMax };
                              setForm({ ...form, childAgeNatRows: next });
                            }}
                          />
                        </FormField>
                        <FormField label={idx === 0 ? 'Market' : ' '}>
                          <Input
                            value={row.nationality}
                            onChange={(e) => {
                              const next = [
                                ...(form.childAgeNatRows ??
                                  emptyChildAgeNatRows()),
                              ];
                              next[idx] = {
                                ...row,
                                nationality: e.target.value,
                              };
                              setForm({ ...form, childAgeNatRows: next });
                            }}
                            placeholder="IN"
                          />
                        </FormField>
                        <FormField label={idx === 0 ? 'With bed' : ' '}>
                          <PriceField
                            value={row.withBed}
                            onChange={(withBed) => {
                              const next = [
                                ...(form.childAgeNatRows ??
                                  emptyChildAgeNatRows()),
                              ];
                              next[idx] = { ...row, withBed };
                              setForm({ ...form, childAgeNatRows: next });
                            }}
                          />
                        </FormField>
                        <FormField label={idx === 0 ? 'No bed' : ' '}>
                          <PriceField
                            value={row.withoutBed}
                            onChange={(withoutBed) => {
                              const next = [
                                ...(form.childAgeNatRows ??
                                  emptyChildAgeNatRows()),
                              ];
                              next[idx] = { ...row, withoutBed };
                              setForm({ ...form, childAgeNatRows: next });
                            }}
                          />
                        </FormField>
                      </FormGrid>
                    ),
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        ...form,
                        childAgeNatRows: [
                          ...(form.childAgeNatRows ?? emptyChildAgeNatRows()),
                          {
                            ageMin: '',
                            ageMax: '',
                            nationality: '',
                            withBed: '',
                            withoutBed: '',
                          },
                        ],
                      })
                    }
                  >
                    Add child column
                  </Button>
                </div>
                <FormGrid>
                  <FormField label="Base adults / room">
                    <NumberField
                      min={1}
                      max={12}
                      value={form.baseAdults}
                      onChange={(baseAdults) =>
                        setForm({ ...form, baseAdults })
                      }
                      placeholder="2"
                    />
                  </FormField>
                  <FormField label="Child age max">
                    <NumberField
                      min={0}
                      max={17}
                      value={form.childAgeMax}
                      onChange={(childAgeMax) =>
                        setForm({ ...form, childAgeMax })
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
                  <FormField
                    label="Min stay (nights)"
                    description="Blocks send when stay is shorter unless a manager acknowledges."
                  >
                    <NumberField
                      min={1}
                      max={30}
                      value={form.minStayNights}
                      onChange={(minStayNights) =>
                        setForm({ ...form, minStayNights })
                      }
                      placeholder="2"
                    />
                  </FormField>
                  <FormField
                    label="Max stay (nights)"
                    description="Blocks send when stay is longer unless a manager acknowledges."
                  >
                    <NumberField
                      min={1}
                      max={90}
                      value={form.maxStayNights}
                      onChange={(maxStayNights) =>
                        setForm({ ...form, maxStayNights })
                      }
                      placeholder="7"
                    />
                  </FormField>
                </FormGrid>
              </div>
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

        <RecordSheet
          open={matrixOpen}
          onOpenChange={(open) => {
            if (!open) closeMatrix();
            else setMatrixOpen(true);
          }}
          title="Meal × occupancy matrix"
          description={
            matrixAnchor
              ? `${matrixAnchor.roomType?.trim() || 'Default room'} · ${seasonLabel(matrixAnchor)}. Fill EP/CP/MAP/AP × Single/Double/Triple weekday + weekend. Blank weekend keeps prior or scales from chart; empty meal rows are skipped.`
              : 'Compact buy grid for one season window.'
          }
          submitting={matrixSaving}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => closeMatrix()}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void saveMealOccupancyMatrix()}
                disabled={matrixSaving || !matrixAnchor}
              >
                {matrixSaving ? 'Saving…' : 'Save matrix'}
              </Button>
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Meal</th>
                  {MATRIX_ADULT_BANDS.map((adults) => (
                    <th key={adults} className="pb-2 px-1 font-medium">
                      {adults === 1
                        ? 'SGL'
                        : adults === 2
                          ? 'DBL'
                          : adults === 3
                            ? 'TPL'
                            : adults === 4
                              ? 'QAD'
                              : `${adults}A`}
                      <span className="mt-0.5 block font-normal text-[10px]">
                        Wk / We
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEAL_MATRIX_PLANS.map((meal) => (
                  <tr key={meal} className="border-t border-border/40">
                    <td className="py-2 pr-2 align-middle">
                      <div className="font-medium">{meal}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {MEAL_HINT[meal] || ''}
                        {matrixByMeal[meal] ? ' · exists' : ''}
                      </div>
                    </td>
                    {MATRIX_ADULT_BANDS.map((adults) => {
                      const cell = matrixCells.find(
                        (c) => c.mealPlan === meal && c.adults === adults,
                      );
                      return (
                        <td key={adults} className="py-2 px-1 align-middle">
                          <div className="space-y-1">
                            <PriceField
                              value={cell?.unitCost ?? ''}
                              onChange={(unitCost) =>
                                setMatrixCells((prev) =>
                                  setMatrixCellCost(
                                    prev,
                                    meal,
                                    adults as MatrixAdultBand,
                                    unitCost,
                                  ),
                                )
                              }
                              placeholder="Wk"
                              showCurrency={false}
                            />
                            <PriceField
                              value={cell?.weekendUnitCost ?? ''}
                              onChange={(weekendUnitCost) =>
                                setMatrixCells((prev) =>
                                  setMatrixCellWeekendCost(
                                    prev,
                                    meal,
                                    adults as MatrixAdultBand,
                                    weekendUnitCost,
                                  ),
                                )
                              }
                              placeholder="We"
                              showCurrency={false}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RecordSheet>
      </Can>

      <RecordSheet
        open={historyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryOpen(false);
            setHistoryAnchorId(null);
            setHistoryVersions([]);
            setHistoryDiffOpenId(null);
          } else setHistoryOpen(true);
        }}
        title="Rate version history"
        description="Superseded tips stay on file. Restore copies content into a new tip. Tips without rates.approve stay pending until a manager Activates."
        submitting={historySaving || activatingId != null}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setHistoryOpen(false);
              setHistoryAnchorId(null);
              setHistoryDiffOpenId(null);
            }}
          >
            Close
          </Button>
        }
      >
        {historyLoading ? (
          <div role="status" aria-busy="true" className="space-y-2 py-1">
            <span className="sr-only">Loading</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-4/5" />
          </div>
        ) : historyVersions.length ? (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {(() => {
              const activeTip =
                historyVersions.find((row) => row.isActive) ?? null;
              const hasPending = historyVersions.some(
                (row) => row.pendingActivation,
              );
              const moneyFmt = (n: number) =>
                formatCurrency(n, { maximumFractionDigits: 0 });
              return [...historyVersions].reverse().map((v) => {
                const cue = formatHotelRateTipDiffCue(v.diffVsActive);
                const canDiff = showHotelRateTipDiffExpand(v);
                const diffOpen = historyDiffOpenId === v.id;
                const diffRows =
                  diffOpen && canDiff
                    ? buildHotelRateTipDiffRows(
                        v,
                        activeTip,
                        v.diffVsActive?.changes,
                        { formatAmount: moneyFmt },
                      )
                    : [];
                return (
                  <li key={v.id} className="space-y-2 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatHotelRateVersionHistoryLine(v, {
                          formatAmount: moneyFmt,
                        })}
                        {cue ? (
                          <span className="mt-0.5 block text-[11px] text-amber-800 dark:text-amber-200">
                            Diff vs current · {cue}
                          </span>
                        ) : null}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {canDiff ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setHistoryDiffOpenId(diffOpen ? null : v.id)
                            }
                          >
                            {diffOpen ? 'Hide' : 'Diff'}
                          </Button>
                        ) : null}
                        {v.pendingActivation ? (
                          <Can anyOf={CAP.ratesApprove}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={activatingId === v.id}
                              onClick={() => void activateRateVersion(v.id)}
                            >
                              Activate
                            </Button>
                          </Can>
                        ) : null}
                        {v.pendingActivation && !canActivateRates ? (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            Pending
                          </span>
                        ) : null}
                        <Can anyOf={CAP.ratesWrite}>
                          {!v.isActive && !v.pendingActivation ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={historySaving || hasPending}
                              title={
                                hasPending
                                  ? 'Activate the pending tip before restore'
                                  : undefined
                              }
                              onClick={() => void restoreRateVersion(v.id)}
                            >
                              Restore as new tip
                            </Button>
                          ) : null}
                          {v.isActive ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                              Current
                            </span>
                          ) : null}
                        </Can>
                      </div>
                    </div>
                    {diffOpen && diffRows.length ? (
                      <div className="overflow-x-auto rounded-lg border border-border/50 bg-background/60">
                        <table className="w-full min-w-[280px] text-left text-[11px]">
                          <thead>
                            <tr className="border-b border-border/40 text-muted-foreground">
                              <th className="px-2 py-1.5 font-medium">Field</th>
                              <th className="px-2 py-1.5 font-medium">This tip</th>
                              <th className="px-2 py-1.5 font-medium">Current</th>
                              <th className="px-2 py-1.5 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {diffRows.map((row) => (
                              <tr
                                key={row.field}
                                className="border-b border-border/30 last:border-0"
                              >
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  {row.field}
                                </td>
                                <td className="px-2 py-1.5 text-foreground">
                                  {row.thisTip}
                                </td>
                                <td className="px-2 py-1.5 text-foreground">
                                  {row.current}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {row.restoreField ? (
                                    <Can anyOf={CAP.ratesWrite}>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-[11px]"
                                        disabled={historySaving || hasPending}
                                        title={
                                          hasPending
                                            ? 'Activate the pending tip before restore'
                                            : 'Create a new tip with this field from the prior version'
                                        }
                                        onClick={() =>
                                          void restoreRateField(
                                            v.id,
                                            row.restoreField!,
                                          )
                                        }
                                      >
                                        Restore
                                      </Button>
                                    </Can>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </li>
                );
              });
            })()}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        )}
      </RecordSheet>

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
