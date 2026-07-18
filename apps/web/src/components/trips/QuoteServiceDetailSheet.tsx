import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { QuoteServiceType } from '@wayrune/contracts';
import {
  Button,
  Combobox,
  ConfirmDialog,
  DatePicker,
  EntityCombobox,
  FormGrid,
  Input,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  Textarea,
  formatCurrency,
  formatPercent,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@wayrune/ui';
import { api } from '../../api';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { serviceTypeLabel } from '../../lib/quoteImportFromItinerary';
import {
  QUOTE_AVAILABILITY_OPTIONS,
  QUOTE_CUSTOM_UNIT_OPTIONS,
  QUOTE_MEAL_PLAN_OPTIONS,
  applyRateResolveHit,
  detailsFromResolveRecord,
  hasMeaningfulTypedDetails,
  hotelBaseCost,
  hotelQuantityFromDetails,
  nightsBetweenIso,
  parseQuoteServiceDetails,
  priceSourceLabel,
  pricingUnitForServiceType,
  quantityFromServiceDetails,
  rateMatchFingerprint,
  resolvePayloadFromQuoteDetails,
  shouldAutoRematchRate,
  suggestedSellFromMarkup,
  unitSellFromSuggestedTotal,
  hotelAutoDescription,
  hotelMatchKeysChanged,
  shouldReplaceHotelDescription,
  validateHotelV1,
  withCalculatedHotelNights,
  transferAutoDescription,
  transferBaseCost,
  transferMatchKeysChanged,
  transferUnitSellFromSuggestedTotal,
  shouldReplaceTransferDescription,
  validateTransferV1,
  activityAutoDescription,
  activityBaseCost,
  activityUnitSellFromSuggestedTotal,
  shouldReplaceActivityDescription,
  validateActivityV1,
  formatTripDateRangeLabel,
  inferPlaceCountry,
  type QuoteMarkupMode,
  type QuotePriceSource,
  type QuoteServiceDetails,
} from '../../lib/quoteServiceDetails';
import { DisclosureSection } from '../agency/DisclosureSection';
import type { PlaceRef } from '../../lib/placeRefs';

export type QuoteServiceDetailLine = {
  id: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  unitSell: number | null;
  taxPercent: number;
  pricingUnit: string;
  serviceType?: QuoteServiceType;
  rateKind?: 'hotel' | 'transfer';
  rateId?: string;
  rateUnmatched?: boolean;
  details?: QuoteServiceDetails;
};

type RateResolveRow = {
  itemId: string;
  matched: boolean;
  rateKind: 'hotel' | 'transfer' | null;
  rateId: string | null;
  unitCost: number;
  unitSell: number;
  quantity: number;
  taxPercent: number;
  pricingUnit: string;
  rateMeta?: Record<string, unknown> | null;
};

const SERVICE_TYPE_OPTIONS: Array<{ value: QuoteServiceType; label: string }> = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transfer', label: 'Transport' },
  { value: 'activity', label: 'Activity' },
  { value: 'custom', label: 'Custom' },
  { value: 'meal', label: 'Meal' },
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'guide', label: 'Guide' },
  { value: 'fee', label: 'Fee' },
];

async function searchStaySuppliers(q: string, placeId?: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', 'hotel,homestay,farmstay,dmc');
  if (placeId) params.set('placeId', placeId);
  let items = await api<
    Array<{ id: string; name: string; type: string; place?: { name?: string } | null }>
  >(`/suppliers?${params.toString()}`);
  if (placeId && items.length === 0) {
    const fallback = new URLSearchParams();
    if (q) fallback.set('q', q);
    fallback.set('type', 'hotel,homestay,farmstay,dmc');
    items = await api(`/suppliers?${fallback.toString()}`);
  }
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: [s.type.replace(/_/g, ' '), s.place?.name].filter(Boolean).join(' · '),
  }));
}

async function searchAnySuppliers(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const items = await api<Array<{ id: string; name: string; type: string }>>(
    `/suppliers?${params.toString()}`,
  );
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: s.type.replace(/_/g, ' '),
  }));
}

/** Transport drawer: fleet, drivers, DMCs — not hotel suppliers. */
async function searchTransportSuppliers(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', 'car_rental,driver,dmc,transport,transfer');
  const items = await api<Array<{ id: string; name: string; type: string }>>(
    `/suppliers?${params.toString()}`,
  );
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: s.type.replace(/_/g, ' '),
  }));
}

async function fetchPlaceMeta(
  placeId: string,
): Promise<{ name?: string; country?: string } | null> {
  try {
    const p = await api<{ name?: string; country?: string | null }>(`/places/${placeId}`);
    return {
      name: p.name?.trim() || undefined,
      country: p.country?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

function looksLikePlaceId(name?: string | null): boolean {
  if (!name) return true;
  // CUID / UUID-ish tokens used as place ids in this product.
  return /^c[a-z0-9]{20,}$/i.test(name.trim()) || /^[0-9a-f-]{32,}$/i.test(name.trim());
}

function placeRefFrom(id?: string, name?: string): PlaceRef | null {
  if (!id) return null;
  const label = name && !looksLikePlaceId(name) ? name : undefined;
  return { placeId: id, name: label || '' };
}

async function searchRoomTypes(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<
    { items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>
  >(`/room-types?${params.toString()}`);
  const items = Array.isArray(res) ? res : res.items || [];
  return items.map((r) => ({ value: r.name, label: r.name }));
}

async function searchVehicleTypes(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<
    { items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>
  >(`/vehicle-types?${params.toString()}`);
  const items = Array.isArray(res) ? res : res.items || [];
  return items.map((v) => ({ value: v.id, label: v.name }));
}

function parseMoney(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function QuoteServiceDetailSheet({
  open,
  onOpenChange,
  line,
  readOnly,
  currency = 'INR',
  tripStartDate,
  tripEndDate,
  partyAdults,
  partyChildren,
  defaultMarkupPercent = 20,
  seedDetails,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: QuoteServiceDetailLine | null;
  readOnly?: boolean;
  currency?: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  partyAdults?: number;
  partyChildren?: number;
  defaultMarkupPercent?: number;
  seedDetails?: QuoteServiceDetails | null;
  onSave: (patch: Partial<QuoteServiceDetailLine> & { id: string }) => void;
}) {
  const [description, setDescription] = useState('');
  const [serviceType, setServiceType] = useState<QuoteServiceType>('custom');
  const [details, setDetails] = useState<QuoteServiceDetails>({});
  const [unitCost, setUnitCost] = useState('');
  const [unitSell, setUnitSell] = useState('');
  const [taxPercent, setTaxPercent] = useState('0');
  const [customQty, setCustomQty] = useState('1');
  const [matching, setMatching] = useState(false);
  const [typeConfirmOpen, setTypeConfirmOpen] = useState(false);
  const [pendingType, setPendingType] = useState<QuoteServiceType | null>(null);
  /** Cleared when match keys change after a directory match. */
  const [matchedRateId, setMatchedRateId] = useState<string | undefined>(undefined);
  const [rateMatchStale, setRateMatchStale] = useState(false);
  /** Buy unit captured when match became outdated — for keep-as-manual confirmation. */
  const [staleBuyUnit, setStaleBuyUnit] = useState<number | null>(null);
  const [keepManualConfirmed, setKeepManualConfirmed] = useState(false);
  const [keepManualConfirmOpen, setKeepManualConfirmOpen] = useState(false);
  const [lastMatchFailure, setLastMatchFailure] = useState<string | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [unusualVehiclesConfirmOpen, setUnusualVehiclesConfirmOpen] = useState(false);
  const unitCostRef = useRef(unitCost);
  unitCostRef.current = unitCost;
  const descriptionRef = useRef(description);
  descriptionRef.current = description;

  useEffect(() => {
    if (!open || !line) return;
    setDescription(line.description);
    setServiceType(line.serviceType || 'custom');
    const merged = { ...(seedDetails || {}), ...(line.details || {}) };
    let parsed = parseQuoteServiceDetails(merged) || {};
    if ((line.serviceType || 'custom') === 'hotel') {
      parsed = withCalculatedHotelNights(parsed);
      if (parsed.adults == null && partyAdults) parsed.adults = partyAdults;
      if (parsed.children == null && partyChildren != null) parsed.children = partyChildren;
      if (!parsed.rateBasis) parsed.rateBasis = 'per_room_night';
      parsed.rateBasis = 'per_room_night';
      if (!parsed.markupMode) parsed.markupMode = 'percent';
      parsed.markupMode = 'percent';
      if (parsed.markupValue == null) parsed.markupValue = defaultMarkupPercent;
      if (!parsed.availability) parsed.availability = 'unknown';
      if (!parsed.rooms) parsed.rooms = 1;
      if (
        !parsed.priceSource &&
        (line.rateId || line.rateUnmatched || line.unitCost != null || line.unitSell != null)
      ) {
        parsed.priceSource = line.rateId
          ? 'matched'
          : line.unitCost != null || line.unitSell != null
            ? 'manual'
            : line.rateUnmatched
              ? 'none'
              : undefined;
      }
    }
    if ((line.serviceType || 'custom') === 'transfer') {
      if (!parsed.markupMode) parsed.markupMode = 'percent';
      parsed.markupMode = 'percent';
      if (parsed.markupValue == null) parsed.markupValue = defaultMarkupPercent;
      if (!parsed.vehicles) parsed.vehicles = 1;
      if (!parsed.serviceDate && tripStartDate) {
        parsed.serviceDate = String(tripStartDate).slice(0, 10);
      }
      if (
        !parsed.priceSource &&
        (line.rateId || line.rateUnmatched || line.unitCost != null || line.unitSell != null)
      ) {
        parsed.priceSource = line.rateId
          ? 'matched'
          : line.unitCost != null || line.unitSell != null
            ? 'manual'
            : line.rateUnmatched
              ? 'none'
              : undefined;
      }
    }
    if (line.serviceType === 'activity') {
      if (parsed.adults == null && partyAdults) parsed.adults = partyAdults;
      if (parsed.children == null && partyChildren != null) parsed.children = partyChildren;
      if (!parsed.markupMode) parsed.markupMode = 'percent';
      parsed.markupMode = 'percent';
      if (parsed.markupValue == null) parsed.markupValue = defaultMarkupPercent;
      if (
        !parsed.priceSource &&
        (line.unitCost != null || line.unitSell != null)
      ) {
        parsed.priceSource = 'manual';
      }
    }
    if ((line.serviceType || 'custom') === 'custom') {
      if (!parsed.unitLabel) parsed.unitLabel = 'service';
      if (parsed.markupMode == null) parsed.markupMode = 'percent';
      if (parsed.markupValue == null) parsed.markupValue = defaultMarkupPercent;
    }
    setDetails(parsed);
    setUnitCost(
      line.unitCost == null || !Number.isFinite(line.unitCost) ? '' : String(line.unitCost),
    );
    setUnitSell(
      line.unitSell == null || !Number.isFinite(line.unitSell) ? '' : String(line.unitSell),
    );
    setTaxPercent(String(line.taxPercent ?? 0));
    setCustomQty(String(line.quantity || 1));
    setMatchedRateId(line.rateId);
    const openExpired = parsed.priceSource === 'expired';
    setRateMatchStale(openExpired);
    setStaleBuyUnit(
      openExpired && line.unitCost != null && Number.isFinite(line.unitCost)
        ? line.unitCost
        : null,
    );
    setKeepManualConfirmed(false);
    setLastMatchFailure(null);
    setRouteDistanceKm(null);
  }, [open, line, seedDetails, partyAdults, partyChildren, defaultMarkupPercent, tripStartDate]);

  useEffect(() => {
    if (!open || serviceType !== 'transfer') return;
    const fromId = details.fromPlaceId;
    const toId = details.toPlaceId;
    if (!fromId || !toId) {
      setRouteDistanceKm(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ distanceKm?: number | null }>(
          `/places/route?fromPlaceId=${encodeURIComponent(fromId)}&toPlaceId=${encodeURIComponent(toId)}`,
        );
        if (!cancelled) {
          setRouteDistanceKm(
            res.distanceKm != null && Number.isFinite(res.distanceKm)
              ? Number(res.distanceKm)
              : null,
          );
        }
      } catch {
        if (!cancelled) setRouteDistanceKm(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, serviceType, details.fromPlaceId, details.toPlaceId]);

  /** Resolve place names when we only have IDs (common after itinerary import). */
  useEffect(() => {
    if (!open || serviceType !== 'transfer') return;
    const needFrom =
      Boolean(details.fromPlaceId) && looksLikePlaceId(details.fromPlaceName);
    const needTo = Boolean(details.toPlaceId) && looksLikePlaceId(details.toPlaceName);
    if (!needFrom && !needTo) return;
    let cancelled = false;
    void (async () => {
      const [fromMeta, toMeta] = await Promise.all([
        needFrom && details.fromPlaceId
          ? fetchPlaceMeta(details.fromPlaceId)
          : Promise.resolve(null),
        needTo && details.toPlaceId
          ? fetchPlaceMeta(details.toPlaceId)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const patch: Partial<QuoteServiceDetails> = {};
      if (fromMeta?.name) {
        patch.fromPlaceName = fromMeta.name;
        if (fromMeta.country) patch.fromCountry = fromMeta.country;
      }
      if (toMeta?.name) {
        patch.toPlaceName = toMeta.name;
        if (toMeta.country) patch.toCountry = toMeta.country;
      }
      if (Object.keys(patch).length) {
        setDetails((prev) => ({ ...prev, ...patch }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    serviceType,
    details.fromPlaceId,
    details.toPlaceId,
    details.fromPlaceName,
    details.toPlaceName,
  ]);

  const patchDetails = useCallback(
    (patch: Partial<QuoteServiceDetails>) => {
      setDetails((prev: QuoteServiceDetails) => {
        let next = { ...prev, ...patch };
        if (
          patch.checkIn !== undefined ||
          patch.checkOut !== undefined ||
          'checkIn' in patch ||
          'checkOut' in patch
        ) {
          next = withCalculatedHotelNights(next);
        }
        const matchKeysChanged =
          serviceType === 'hotel'
            ? hotelMatchKeysChanged(prev, patch)
            : serviceType === 'transfer'
              ? transferMatchKeysChanged(prev, patch)
              : false;
        const wasMatched =
          (prev.priceSource === 'matched' || Boolean(matchedRateId)) && !rateMatchStale;
        if (wasMatched && matchKeysChanged) {
          next = {
            ...next,
            priceSource: 'expired',
          };
          setStaleBuyUnit(parseMoney(unitCostRef.current));
          setMatchedRateId(undefined);
          setRateMatchStale(true);
          setKeepManualConfirmed(false);
          setLastMatchFailure(null);
        } else if (matchKeysChanged) {
          setLastMatchFailure(null);
        }

        if (serviceType === 'hotel') {
          const descKeys = [
            'propertyName',
            'roomType',
            'mealPlan',
            'checkIn',
            'checkOut',
            'nights',
          ] as const;
          const descTouched = descKeys.some((k) => k in patch);
          if (descTouched) {
            const auto = hotelAutoDescription(next);
            if (
              auto &&
              shouldReplaceHotelDescription(descriptionRef.current, next)
            ) {
              setDescription(auto);
            }
          }
        } else if (serviceType === 'transfer') {
          const descKeys = [
            'fromPlaceId',
            'fromPlaceName',
            'toPlaceId',
            'toPlaceName',
            'vehicleTypeId',
            'vehicleLabel',
            'vehicles',
          ] as const;
          const descTouched = descKeys.some((k) => k in patch);
          if (descTouched) {
            const auto = transferAutoDescription(next);
            if (
              auto &&
              shouldReplaceTransferDescription(descriptionRef.current, next)
            ) {
              setDescription(auto);
            }
          }
        } else if (serviceType === 'activity') {
          const descKeys = [
            'propertyName',
            'placeName',
            'placeId',
            'privateOrSic',
            'adults',
            'children',
            'activityDate',
            'activityTime',
          ] as const;
          const descTouched = descKeys.some((k) => k in patch);
          if (descTouched) {
            const auto = activityAutoDescription(next);
            if (
              auto &&
              shouldReplaceActivityDescription(descriptionRef.current, next)
            ) {
              setDescription(auto);
            }
          }
        }
        return next;
      });
    },
    [matchedRateId, rateMatchStale, serviceType],
  );

  const searchHotelSuppliers = useCallback(
    (q: string) => searchStaySuppliers(q, details.placeId),
    [details.placeId],
  );

  const buyUnit = parseMoney(unitCost);
  const hotelQty = hotelQuantityFromDetails(details);
  const transferQty = quantityFromServiceDetails('transfer', details, 1);
  const activityQty = quantityFromServiceDetails('activity', details, 1);
  const baseCost =
    serviceType === 'transfer'
      ? transferBaseCost(buyUnit, details)
      : serviceType === 'activity'
        ? activityBaseCost(buyUnit, details)
        : hotelBaseCost(buyUnit, details);
  const markupMode = (details.markupMode || 'percent') as QuoteMarkupMode;
  const markupValue = details.markupValue ?? defaultMarkupPercent;
  const suggestedTotal = suggestedSellFromMarkup(baseCost, markupMode, markupValue);
  const suggestedUnit =
    serviceType === 'transfer'
      ? transferUnitSellFromSuggestedTotal(suggestedTotal, details)
      : serviceType === 'activity'
        ? activityUnitSellFromSuggestedTotal(suggestedTotal, details)
        : unitSellFromSuggestedTotal(suggestedTotal, details);
  const sellUnit = parseMoney(unitSell);
  const activeQty =
    serviceType === 'transfer'
      ? transferQty
      : serviceType === 'activity'
        ? activityQty
        : hotelQty;
  const sellTotal =
    sellUnit != null && activeQty != null
      ? Math.round(sellUnit * activeQty * 100) / 100
      : null;
  const profit =
    baseCost != null && sellTotal != null ? Math.round((sellTotal - baseCost) * 100) / 100 : null;
  const marginPct =
    sellTotal != null && sellTotal !== 0 && profit != null
      ? Math.round((profit / sellTotal) * 10000) / 100
      : null;

  const customBuy = parseMoney(unitCost);
  const customQtyN = Math.max(1, Number(customQty) || 1);
  const customBase =
    customBuy != null ? Math.round(customBuy * customQtyN * 100) / 100 : null;
  const customSuggested = suggestedSellFromMarkup(
    customBase,
    (details.markupMode || 'percent') as QuoteMarkupMode,
    details.markupValue ?? defaultMarkupPercent,
  );
  const customSuggestedUnit =
    customSuggested != null ? Math.round((customSuggested / customQtyN) * 100) / 100 : null;

  function applySuggestedSell(total: number | null, forHotel: boolean) {
    if (total == null) return;
    if (forHotel) {
      const unit = unitSellFromSuggestedTotal(total, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (customSuggestedUnit != null) {
      setUnitSell(String(customSuggestedUnit));
    }
    patchDetails({ sellManual: false });
  }

  function onBuyUnitChange(raw: string) {
    setUnitCost(raw);
    if (details.sellManual) return;
    const buy = parseMoney(raw);
    if (serviceType === 'hotel') {
      const base = hotelBaseCost(buy, details);
      const suggested = suggestedSellFromMarkup(base, markupMode, markupValue);
      const unit = unitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'transfer') {
      const base = transferBaseCost(buy, details);
      const suggested = suggestedSellFromMarkup(base, markupMode, markupValue);
      const unit = transferUnitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'activity') {
      const base = activityBaseCost(buy, details);
      const suggested = suggestedSellFromMarkup(base, markupMode, markupValue);
      const unit = activityUnitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'custom') {
      const base = buy != null ? Math.round(buy * customQtyN * 100) / 100 : null;
      const suggested = suggestedSellFromMarkup(
        base,
        (details.markupMode || 'percent') as QuoteMarkupMode,
        details.markupValue ?? defaultMarkupPercent,
      );
      if (suggested != null) {
        setUnitSell(String(Math.round((suggested / customQtyN) * 100) / 100));
      }
    }
  }

  function onMarkupChange(mode: QuoteMarkupMode, value: number | undefined) {
    patchDetails({ markupMode: mode, markupValue: value, sellManual: false });
    if (serviceType === 'hotel') {
      const base = hotelBaseCost(buyUnit, { ...details, markupMode: mode, markupValue: value });
      const suggested = suggestedSellFromMarkup(base, mode, value);
      const unit = unitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'transfer') {
      const base = transferBaseCost(buyUnit, {
        ...details,
        markupMode: mode,
        markupValue: value,
      });
      const suggested = suggestedSellFromMarkup(base, mode, value);
      const unit = transferUnitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'activity') {
      const base = activityBaseCost(buyUnit, {
        ...details,
        markupMode: mode,
        markupValue: value,
      });
      const suggested = suggestedSellFromMarkup(base, mode, value);
      const unit = activityUnitSellFromSuggestedTotal(suggested, details);
      if (unit != null) setUnitSell(String(unit));
    } else if (serviceType === 'custom') {
      const base = customBuy != null ? Math.round(customBuy * customQtyN * 100) / 100 : null;
      const suggested = suggestedSellFromMarkup(base, mode, value);
      if (suggested != null) {
        setUnitSell(String(Math.round((suggested / customQtyN) * 100) / 100));
      }
    }
  }

  function requestServiceTypeChange(next: QuoteServiceType) {
    if (next === serviceType) return;
    if (hasMeaningfulTypedDetails(serviceType, details)) {
      setPendingType(next);
      setTypeConfirmOpen(true);
      return;
    }
    setServiceType(next);
  }

  function confirmServiceTypeChange() {
    if (!pendingType) return;
    setServiceType(pendingType);
    setDetails((prev) => {
      const keep = {
        placeId: prev.placeId,
        placeName: prev.placeName,
        supplierId: prev.supplierId,
        supplierName: prev.supplierName,
        internalNotes: prev.internalNotes,
        customerNotes: prev.customerNotes,
      };
      if (pendingType === 'hotel') {
        return {
          ...keep,
          rateBasis: 'per_room_night' as const,
          markupMode: 'percent' as const,
          markupValue: defaultMarkupPercent,
          rooms: 1,
          availability: 'unknown' as const,
          adults: partyAdults,
          children: partyChildren,
        };
      }
      if (pendingType === 'transfer') {
        return {
          ...keep,
          markupMode: 'percent' as const,
          markupValue: defaultMarkupPercent,
          vehicles: 1,
          serviceDate: tripStartDate
            ? String(tripStartDate).slice(0, 10)
            : undefined,
        };
      }
      if (pendingType === 'custom') {
        return {
          ...keep,
          unitLabel: 'service',
          markupMode: 'percent' as const,
          markupValue: defaultMarkupPercent,
        };
      }
      return keep;
    });
    setPendingType(null);
    setTypeConfirmOpen(false);
  }

  function buildSavePatch(overrides?: Partial<QuoteServiceDetailLine>) {
    if (!line) return null;
    const nextDetails = parseQuoteServiceDetails(
      serviceType === 'hotel' ? withCalculatedHotelNights(details) : details,
    );
    const qty =
      serviceType === 'custom'
        ? Math.max(1, Number(customQty) || 1)
        : quantityFromServiceDetails(serviceType, nextDetails, line.quantity || 1);

    let priceSource = nextDetails?.priceSource as QuotePriceSource | undefined;
    const cost = parseMoney(unitCost);
    const sell = parseMoney(unitSell);
    let rateUnmatched = line.rateUnmatched;
    if (overrides?.rateUnmatched != null) rateUnmatched = overrides.rateUnmatched;
    if (overrides?.rateId) {
      priceSource = 'matched';
      rateUnmatched = false;
    } else if (priceSource === 'expired') {
      // Never silently promote an outdated match to manual — save() handles rematch/keep.
      rateUnmatched = false;
    } else if (cost != null || sell != null) {
      if (priceSource === 'none') {
        priceSource = 'manual';
        rateUnmatched = false;
      } else if (!priceSource && !line.rateId && !matchedRateId) {
        priceSource = 'manual';
      }
    }

    return {
      id: line.id,
      description: description.trim() || 'Service',
      serviceType,
      details: nextDetails
        ? { ...nextDetails, priceSource }
        : priceSource
          ? { priceSource }
          : undefined,
      quantity: qty,
      pricingUnit: pricingUnitForServiceType(serviceType, nextDetails),
      unitCost: cost,
      unitSell: sell,
      taxPercent: Number(taxPercent) || 0,
      rateKind:
        serviceType === 'hotel' || serviceType === 'transfer' ? serviceType : undefined,
      rateUnmatched: rateUnmatched || undefined,
      ...overrides,
    };
  }

  function save() {
    if (!line || readOnly) return;
    if (serviceType === 'hotel') {
      const next = withCalculatedHotelNights({
        ...details,
        rateBasis: 'per_room_night',
        markupMode: 'percent',
      });
      const check = validateHotelV1(next, {
        buyUnit: parseMoney(unitCost),
        sellUnit: parseMoney(unitSell),
      });
      if (!check.ok) {
        toastError(check.errors[0] || 'Fix hotel details before saving');
        setDetails(next);
        return;
      }
      if (rateMatchStale && !keepManualConfirmed) {
        toastError('Rate match outdated — rematch or keep the previous buy rate as manual');
        return;
      }
      if (next.priceSource === 'expired' && !keepManualConfirmed) {
        toastError('Rate match outdated — rematch or keep the previous buy rate as manual');
        return;
      }
      setDetails(next);
    }
    if (serviceType === 'transfer') {
      const next = {
        ...details,
        markupMode: 'percent' as const,
        vehicles: Math.max(1, Math.round(details.vehicles ?? 1)),
      };
      const check = validateTransferV1(next, {
        buyUnit: parseMoney(unitCost),
        sellUnit: parseMoney(unitSell),
        tripStartDate,
        tripEndDate,
        routeDistanceKm,
      });
      if (check.requiresUnusualVehiclesConfirm) {
        setUnusualVehiclesConfirmOpen(true);
        setDetails(next);
        return;
      }
      if (!check.ok) {
        toastError(check.errors[0] || 'Fix transport details before saving');
        setDetails(next);
        return;
      }
      if (rateMatchStale && !keepManualConfirmed) {
        toastError('Rate match outdated — rematch or keep the previous buy rate as manual');
        return;
      }
      if (next.priceSource === 'expired' && !keepManualConfirmed) {
        toastError('Rate match outdated — rematch or keep the previous buy rate as manual');
        return;
      }
      setDetails(next);
    }
    if (serviceType === 'activity') {
      const next = {
        ...details,
        markupMode: 'percent' as const,
      };
      const check = validateActivityV1(next, {
        buyUnit: parseMoney(unitCost),
        sellUnit: parseMoney(unitSell),
        tripStartDate,
        tripEndDate,
      });
      if (check.requiresServiceDateOverride && !next.serviceDateOutsideTripOverride) {
        setDetails(next);
        toastError(
          'Activity date is outside the trip window — confirm override below, then save again',
        );
        return;
      }
      if (!check.ok) {
        toastError(check.errors[0] || 'Fix activity details before saving');
        setDetails(next);
        return;
      }
      setDetails(next);
    }
    const patch = buildSavePatch(
      serviceType === 'hotel' || serviceType === 'transfer'
        ? {
            rateId: keepManualConfirmed ? undefined : matchedRateId,
            rateUnmatched: false,
          }
        : undefined,
    );
    if (!patch) return;
    if (serviceType === 'hotel' && patch.details) {
      let priceSource: QuotePriceSource | undefined = patch.details.priceSource;
      if (keepManualConfirmed) {
        priceSource = 'manual';
      } else if (matchedRateId) {
        priceSource = 'matched';
      } else if (priceSource === 'expired') {
        toastError('Rate match outdated — rematch or keep as manual');
        return;
      }
      // Do not invent "manual" from a former match without explicit keep.
      patch.details = {
        ...patch.details,
        rateBasis: 'per_room_night',
        markupMode: 'percent',
        sellManual: keepManualConfirmed ? true : Boolean(patch.details.sellManual),
        priceSource,
        rateSupplierLabel: keepManualConfirmed
          ? `Manual — kept from matched rate${
              staleBuyUnit != null ? ` (₹${staleBuyUnit})` : ''
            }`
          : patch.details.rateSupplierLabel,
      };
      if (shouldReplaceHotelDescription(patch.description, patch.details)) {
        const auto = hotelAutoDescription(patch.details);
        if (auto) patch.description = auto;
      }
    }
    if (serviceType === 'transfer' && patch.details) {
      let priceSource: QuotePriceSource | undefined = patch.details.priceSource;
      if (keepManualConfirmed) {
        priceSource = 'manual';
      } else if (matchedRateId) {
        priceSource = 'matched';
      } else if (priceSource === 'expired') {
        toastError('Rate match outdated — rematch or keep as manual');
        return;
      }
      patch.details = {
        ...patch.details,
        markupMode: 'percent',
        vehicles: Math.max(1, Math.round(patch.details.vehicles ?? 1)),
        sellManual: keepManualConfirmed ? true : Boolean(patch.details.sellManual),
        priceSource,
        rateSupplierLabel: keepManualConfirmed
          ? `Manual — kept from matched rate${
              staleBuyUnit != null ? ` (₹${staleBuyUnit})` : ''
            }`
          : patch.details.rateSupplierLabel,
      };
      if (shouldReplaceTransferDescription(patch.description, patch.details)) {
        const auto = transferAutoDescription(patch.details);
        if (auto) patch.description = auto;
      }
    }
    if (serviceType === 'activity' && patch.details) {
      patch.details = {
        ...patch.details,
        markupMode: 'percent',
        sellManual: Boolean(patch.details.sellManual),
        priceSource: patch.details.priceSource || 'manual',
      };
      if (shouldReplaceActivityDescription(patch.description, patch.details)) {
        const auto = activityAutoDescription(patch.details);
        if (auto) patch.description = auto;
      }
    }
    onSave(patch);
    toastSuccess('Service details saved');
    onOpenChange(false);
  }

  async function matchRate(opts?: { auto?: boolean }) {
    if (!line || readOnly) return;
    const auto = Boolean(opts?.auto);
    const withNights =
      serviceType === 'hotel'
        ? withCalculatedHotelNights({
            ...details,
            rateBasis: 'per_room_night',
          })
        : {
            ...details,
            vehicles: Math.max(1, Math.round(details.vehicles ?? 1)),
          };
    if (serviceType === 'hotel') {
      const check = validateHotelV1(withNights);
      if (check.matchBlockedReasons.length) {
        if (!auto) {
          toastError(
            `Match rate unavailable: ${check.matchBlockedReasons.join(', ')}.`,
          );
        }
        return;
      }
    }
    if (serviceType === 'transfer') {
      const check = validateTransferV1(withNights, {
        tripStartDate,
        tripEndDate,
        routeDistanceKm,
      });
      if (check.matchBlockedReasons.length) {
        if (!auto) {
          toastError(
            `Match rate unavailable: ${check.matchBlockedReasons.join(', ')}.`,
          );
        }
        return;
      }
    }
    const payload = resolvePayloadFromQuoteDetails(
      line.id,
      serviceType,
      withNights,
      tripStartDate,
    );
    if (!payload) {
      if (!auto) toastError('Add hotel or transport details before matching a rate');
      return;
    }
    setMatching(true);
    const noMatchMessage =
      serviceType === 'transfer'
        ? 'No active transport rate found for this route, vehicle and date.'
        : 'No active matching rate found for these dates and meal plan.';
    try {
      const res = await api<{ items: RateResolveRow[] }>('/rates/resolve', {
        method: 'POST',
        body: JSON.stringify({
          startDate: tripStartDate || undefined,
          adults: partyAdults || details.adults || undefined,
          children: partyChildren || details.children || undefined,
          items: [payload],
        }),
      });
      const hit = res.items[0];
      if (!hit) {
        toastError(noMatchMessage);
        return;
      }

      const appliedForced = applyRateResolveHit({
        serviceType,
        details: withNights,
        hit,
        defaultMarkupPercent,
        previousUnitSell: parseMoney(unitSell),
        // Auto rematch and manual Match rate both refresh sell from markup unless
        // the user already confirmed keep-manual (handled separately).
        forceSell: true,
      });

      setDetails(appliedForced.details);
      setUnitCost(
        appliedForced.unitCost != null ? String(appliedForced.unitCost) : '',
      );
      setTaxPercent(String(appliedForced.taxPercent ?? 0));
      setMatchedRateId(appliedForced.rateId);
      setRateMatchStale(false);
      setKeepManualConfirmed(false);
      setStaleBuyUnit(null);

      if (!hit.matched) {
        setLastMatchFailure(noMatchMessage);
        onSave({
          id: line.id,
          description: description.trim() || line.description,
          serviceType,
          details: appliedForced.details,
          quantity: appliedForced.quantity,
          pricingUnit: pricingUnitForServiceType(serviceType, appliedForced.details),
          unitCost: null,
          unitSell: null,
          rateKind: appliedForced.rateKind,
          rateId: undefined,
          rateUnmatched: true,
        });
        toastError(noMatchMessage);
        return;
      }

      setLastMatchFailure(null);
      const matchedDescription =
        serviceType === 'hotel'
          ? shouldReplaceHotelDescription(description, appliedForced.details)
            ? hotelAutoDescription(appliedForced.details)
            : null
          : serviceType === 'transfer'
            ? shouldReplaceTransferDescription(description, appliedForced.details)
              ? transferAutoDescription(appliedForced.details)
              : null
            : null;

      onSave({
        id: line.id,
        description: matchedDescription || description.trim() || line.description,
        serviceType,
        details: appliedForced.details,
        quantity: appliedForced.quantity,
        pricingUnit:
          appliedForced.pricingUnit ||
          pricingUnitForServiceType(serviceType, appliedForced.details),
        unitCost: appliedForced.unitCost,
        unitSell: appliedForced.unitSell,
        taxPercent: appliedForced.taxPercent,
        rateKind: appliedForced.rateKind,
        rateId: appliedForced.rateId,
        rateUnmatched: false,
      });
      if (matchedDescription) setDescription(matchedDescription);
      if (appliedForced.unitSell != null) setUnitSell(String(appliedForced.unitSell));
      toastSuccess(auto ? 'Rate updated for new details' : 'Rate matched from directory');
    } catch (e) {
      if (!auto) toastError(e instanceof Error ? e.message : 'Rate match failed');
    } finally {
      setMatching(false);
    }
  }

  const matchFingerprint = rateMatchFingerprint(serviceType, details);
  useEffect(() => {
    if (
      !shouldAutoRematchRate({
        open,
        readOnly,
        rateMatchStale,
        keepManualConfirmed,
        matching,
        serviceType,
        details,
        tripStartDate,
        tripEndDate,
      })
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void matchRate({ auto: true });
    }, 450);
    return () => window.clearTimeout(timer);
    // Fingerprint + stale gate: rematch when match keys settle after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchRate closes over latest state
  }, [
    open,
    readOnly,
    rateMatchStale,
    keepManualConfirmed,
    matching,
    serviceType,
    matchFingerprint,
    tripStartDate,
    tripEndDate,
  ]);

  if (!line) return null;

  const showHotel = serviceType === 'hotel';
  const showTransfer = serviceType === 'transfer';
  const showActivity = serviceType === 'activity';
  const showCustom = serviceType === 'custom';
  const canMatch = showHotel || showTransfer;
  const calculatedNights = nightsBetweenIso(details.checkIn, details.checkOut);
  const typeLocked = hasMeaningfulTypedDetails(serviceType, details);
  const hotelValidation = validateHotelV1(details, {
    buyUnit: buyUnit,
    sellUnit: sellUnit,
  });
  const transferValidation = validateTransferV1(details, {
    buyUnit: buyUnit,
    sellUnit: sellUnit,
    tripStartDate,
    tripEndDate,
    routeDistanceKm,
  });
  const activityValidation = validateActivityV1(details, {
    buyUnit: buyUnit,
    sellUnit: sellUnit,
    tripStartDate,
    tripEndDate,
  });
  const matchPrereqBlocked =
    showHotel && hotelValidation.matchBlockedReasons.length > 0
      ? `Match rate unavailable: ${hotelValidation.matchBlockedReasons.join(', ')}.`
      : showTransfer && transferValidation.matchBlockedReasons.length > 0
        ? `Match rate unavailable: ${transferValidation.matchBlockedReasons.join(', ')}.`
        : null;
  const matchHint =
    matchPrereqBlocked ||
    ((showHotel || showTransfer) && lastMatchFailure ? lastMatchFailure : null);
  // Only disable for missing prerequisites or in-flight match — never for a prior failed attempt.
  const matchDisabled =
    matching ||
    Boolean(showHotel && hotelValidation.matchBlockedReasons.length > 0) ||
    Boolean(showTransfer && transferValidation.matchBlockedReasons.length > 0);
  const saveBlockedStale =
    (showHotel || showTransfer) && rateMatchStale && !keepManualConfirmed;
  const staleBuyLabel =
    staleBuyUnit != null
      ? formatCurrency(staleBuyUnit)
      : buyUnit != null
        ? formatCurrency(buyUnit)
        : 'previous buy rate';

  return (
    <>
      <RecordSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`${serviceTypeLabel(serviceType)} details`}
        description="Commercial details for this quotation line."
        size="wide"
        footer={
          readOnly ? (
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {canMatch && matchHint ? (
                <p className="text-right text-[11px] leading-snug text-muted-foreground">
                  {matchHint}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto cursor-pointer"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                {canMatch ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="cursor-pointer"
                    disabled={matchDisabled}
                    title={matchPrereqBlocked || lastMatchFailure || undefined}
                    onClick={() => void matchRate()}
                  >
                    {matching ? 'Matching…' : 'Match rate'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="cursor-pointer"
                  disabled={
                    (showHotel && !hotelValidation.ok) ||
                    (showTransfer && !transferValidation.ok) ||
                    (showActivity && !activityValidation.ok) ||
                    saveBlockedStale
                  }
                  title={
                    saveBlockedStale
                      ? 'Rate match outdated — rematch or keep as manual'
                      : showHotel && !hotelValidation.ok
                        ? hotelValidation.errors.join(' · ')
                        : showTransfer && !transferValidation.ok
                          ? transferValidation.errors.join(' · ')
                          : showActivity && !activityValidation.ok
                            ? activityValidation.errors.join(' · ')
                            : undefined
                  }
                  onClick={save}
                >
                  Save details
                </Button>
              </div>
            </div>
          )
        }
      >
        <FormField label="Description" required>
          <Input
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>

        <FormField
          label="Service type"
          description={
            typeLocked
              ? 'Changing type will clear type-specific fields.'
              : undefined
          }
        >
          <Combobox
            value={serviceType}
            disabled={readOnly}
            onChange={(v) => requestServiceTypeChange((v as QuoteServiceType) || 'custom')}
            options={SERVICE_TYPE_OPTIONS}
          />
        </FormField>

        {showHotel ? (
          <>
            <Section title="Hotel and stay">
              <PlaceSinglePicker
                label="Destination"
                value={placeRefFrom(details.placeId, details.placeName)}
                onChange={(ref) =>
                  patchDetails({
                    placeId: ref?.placeId || undefined,
                    placeName: ref?.name || undefined,
                  })
                }
              />
              <FormField label="Property" description="Accommodation sold to the guest.">
                <Input
                  disabled={readOnly}
                  placeholder="Heritage Hotel"
                  value={details.propertyName || ''}
                  onChange={(e) => {
                    const propertyName = e.target.value || undefined;
                    patchDetails({ propertyName });
                    if (propertyName && !description.trim()) setDescription(propertyName);
                  }}
                />
              </FormField>
              <FormField label="Supplier" description="Who provides the commercial rate.">
                <EntityCombobox
                  value={details.supplierId || ''}
                  selectedLabel={details.supplierName}
                  disabled={readOnly}
                  onChange={(id, option) =>
                    patchDetails({
                      supplierId: id || undefined,
                      supplierName: option?.label || undefined,
                    })
                  }
                  onSearch={searchHotelSuppliers}
                  placeholder="Search suppliers…"
                  clearable
                />
              </FormField>
              <FormGrid>
                <FormField
                  label="Check-in"
                  error={
                    details.checkIn && details.checkOut && calculatedNights == null
                      ? 'Must be before check-out'
                      : undefined
                  }
                >
                  <DatePicker
                    className="h-9 cursor-pointer"
                    disabled={readOnly}
                    value={parseDateInput(details.checkIn)}
                    onChange={(d) =>
                      patchDetails({ checkIn: formatDateInput(d) || undefined })
                    }
                  />
                </FormField>
                <FormField
                  label="Check-out"
                  error={
                    details.checkIn && details.checkOut && calculatedNights == null
                      ? 'Must be after check-in'
                      : undefined
                  }
                >
                  <DatePicker
                    className="h-9 cursor-pointer"
                    disabled={readOnly}
                    value={parseDateInput(details.checkOut)}
                    onChange={(d) =>
                      patchDetails({ checkOut: formatDateInput(d) || undefined })
                    }
                  />
                </FormField>
              </FormGrid>
              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Nights</span>
                  <span className="font-medium tabular-nums">
                    {calculatedNights != null ? (
                      <>
                        {calculatedNights}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          (calculated)
                        </span>
                      </>
                    ) : details.checkIn || details.checkOut ? (
                      <span className="text-destructive">Invalid dates</span>
                    ) : (
                      <span className="text-muted-foreground">Set check-in and check-out</span>
                    )}
                  </span>
                </div>
              </div>
              <FormGrid>
                <FormField label="Room type">
                  <EntityCombobox
                    value={details.roomType || ''}
                    selectedLabel={details.roomType}
                    disabled={readOnly}
                    onChange={(name) => patchDetails({ roomType: name || undefined })}
                    onSearch={searchRoomTypes}
                    placeholder="Deluxe, Suite…"
                    clearable
                  />
                </FormField>
                <FormField label="Meal plan">
                  <Combobox
                    value={details.mealPlan || ''}
                    disabled={readOnly}
                    onChange={(v) => patchDetails({ mealPlan: v || undefined })}
                    options={QUOTE_MEAL_PLAN_OPTIONS}
                    placeholder="Select…"
                  />
                </FormField>
              </FormGrid>
              <FormGrid>
                <FormField label="Rooms">
                  <Input
                    type="number"
                    min={1}
                    disabled={readOnly}
                    value={details.rooms ?? 1}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      patchDetails({
                        rooms: e.target.value === '' ? 1 : Math.max(1, n),
                      });
                    }}
                  />
                </FormField>
                <FormField label="Adults">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.adults ?? ''}
                    onChange={(e) =>
                      patchDetails({
                        adults:
                          e.target.value === ''
                            ? undefined
                            : Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </FormField>
                <FormField label="Children">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.children ?? ''}
                    onChange={(e) => {
                      const children =
                        e.target.value === ''
                          ? undefined
                          : Math.max(0, Number(e.target.value));
                      const ages = details.childAges || [];
                      patchDetails({
                        children,
                        childAges:
                          children && children > 0
                            ? ages.slice(0, children)
                            : undefined,
                      });
                    }}
                  />
                </FormField>
              </FormGrid>
              {(details.children ?? 0) > 0 ? (
                <FormField
                  label="Child ages"
                  description={`Exactly ${details.children} age${details.children === 1 ? '' : 's'}, each 0–17`}
                  error={
                    hotelValidation.errors.find((e) => e.toLowerCase().includes('child')) ||
                    undefined
                  }
                >
                  <Input
                    disabled={readOnly}
                    placeholder="e.g. 8, 11"
                    value={(details.childAges || []).join(', ')}
                    onChange={(e) => {
                      const ages = e.target.value
                        .split(/[,\s]+/)
                        .map((x) => Number(x))
                        .filter((n) => Number.isFinite(n));
                      patchDetails({ childAges: ages.length ? ages : undefined });
                    }}
                  />
                </FormField>
              ) : null}
              <FormField label="Availability">
                <Combobox
                  value={details.availability || 'unknown'}
                  disabled={readOnly}
                  onChange={(v) =>
                    patchDetails({
                      availability: (v as QuoteServiceDetails['availability']) || 'unknown',
                    })
                  }
                  options={QUOTE_AVAILABILITY_OPTIONS}
                />
              </FormField>
            </Section>

            <Section title="Pricing">
              <p className="text-xs text-muted-foreground">
                Rate basis: <span className="font-medium text-foreground">Per room / night</span>
              </p>
              <FormField label="Buy unit rate">
                <PriceField
                  currency={currency}
                  disabled={readOnly}
                  placeholder="e.g. 4500"
                  value={unitCost}
                  onChange={onBuyUnitChange}
                />
              </FormField>
              <FormField label="Markup %">
                <Input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={markupValue}
                  onChange={(e) =>
                    onMarkupChange(
                      'percent',
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </FormField>
              <FormField label="Sell unit rate" description="Calculated from buy × markup">
                <PriceField
                  currency={currency}
                  disabled
                  value={unitSell}
                  onChange={() => undefined}
                />
              </FormField>
              <FormField label="Tax %">
                <Input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                />
              </FormField>
              <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total cost</span>
                  <span>{baseCost != null ? formatCurrency(baseCost) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total sell</span>
                  <span>{sellTotal != null ? formatCurrency(sellTotal) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={profit != null && profit < 0 ? 'text-destructive' : undefined}>
                    {profit != null ? formatCurrency(profit) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Margin</span>
                  <span>{marginPct != null ? formatPercent(marginPct) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Table quantity</span>
                  <span>
                    {hotelQty != null ? (
                      <>
                        {hotelQty}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          (rooms × nights)
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Quantity not calculated</span>
                    )}
                  </span>
                </div>
              </div>
              {rateMatchStale ? (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
                  <p className="font-medium">
                    {matching ? 'Updating rate…' : 'Rate match outdated'}
                  </p>
                  <p className="text-xs opacity-90">
                    {matching
                      ? 'Looking up the directory for the new stay details.'
                      : `Stay details changed. Rematch, or explicitly keep ${staleBuyLabel} as a manual buy rate.`}
                  </p>
                  {!readOnly ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        className="cursor-pointer"
                        disabled={matchDisabled || matching}
                        title={matchPrereqBlocked || undefined}
                        onClick={() => void matchRate()}
                      >
                        {matching ? 'Matching…' : 'Rematch rate'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="cursor-pointer"
                        disabled={keepManualConfirmed}
                        onClick={() => setKeepManualConfirmOpen(true)}
                      >
                        {keepManualConfirmed
                          ? `Keeping ${staleBuyLabel} as manual`
                          : `Keep ${staleBuyLabel} as manual price`}
                      </Button>
                    </div>
                  ) : null}
                  {matchPrereqBlocked ? (
                    <p className="text-[11px] opacity-80">{matchPrereqBlocked}</p>
                  ) : lastMatchFailure ? (
                    <p className="text-[11px] opacity-80">{lastMatchFailure}</p>
                  ) : null}
                </div>
              ) : null}
              {hotelValidation.warnings.length ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {hotelValidation.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {hotelValidation.errors.length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {hotelValidation.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {rateMatchStale
                    ? keepManualConfirmed
                      ? 'Manual (pending save)'
                      : 'Match outdated'
                    : priceSourceLabel(details.priceSource)}
                </p>
                {details.priceSource === 'matched' && details.rateLabel && !rateMatchStale ? (
                  <p className="mt-1 font-medium">{details.rateLabel}</p>
                ) : lastMatchFailure && !rateMatchStale ? (
                  <p className="mt-1 text-muted-foreground">{lastMatchFailure}</p>
                ) : details.priceSource === 'none' ? (
                  <p className="mt-1 text-muted-foreground">
                    No directory match — enter buy rate and markup.
                  </p>
                ) : null}
              </div>
            </Section>

            <DisclosureSection
              title="Advanced hotel pricing and policies"
              description="Extra beds, supplements, cancellation and notes — later release."
              defaultOpen={false}
            >
              <p className="text-sm text-muted-foreground">
                Extra beds, child-without-bed pricing, supplements, cancellation policy and
                notes are deferred. Data fields remain in the model for a later iteration.
              </p>
            </DisclosureSection>
          </>
        ) : null}

        {showTransfer ? (
          <>
            <Section title="Route and vehicle">
              <PlaceSinglePicker
                label="From"
                value={placeRefFrom(details.fromPlaceId, details.fromPlaceName)}
                onChange={(ref) => {
                  const name = ref?.name || undefined;
                  patchDetails({
                    fromPlaceId: ref?.placeId || undefined,
                    fromPlaceName: name,
                    fromCountry: inferPlaceCountry(name) || undefined,
                  });
                  if (ref?.placeId) {
                    void fetchPlaceMeta(ref.placeId).then((meta) => {
                      if (!meta) return;
                      patchDetails({
                        fromCountry: meta.country || inferPlaceCountry(name) || undefined,
                        ...(meta.name && looksLikePlaceId(name)
                          ? { fromPlaceName: meta.name }
                          : {}),
                      });
                    });
                  }
                }}
              />
              <PlaceSinglePicker
                label="To"
                value={placeRefFrom(details.toPlaceId, details.toPlaceName)}
                onChange={(ref) => {
                  const name = ref?.name || undefined;
                  patchDetails({
                    toPlaceId: ref?.placeId || undefined,
                    toPlaceName: name,
                    toCountry: inferPlaceCountry(name) || undefined,
                  });
                  if (ref?.placeId) {
                    void fetchPlaceMeta(ref.placeId).then((meta) => {
                      if (!meta) return;
                      patchDetails({
                        toCountry: meta.country || inferPlaceCountry(name) || undefined,
                        ...(meta.name && looksLikePlaceId(name)
                          ? { toPlaceName: meta.name }
                          : {}),
                      });
                    });
                  }
                }}
              />
              {transferValidation.routeWarning ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  {transferValidation.routeWarning}
                </div>
              ) : null}
              <FormField label="Vehicle">
                <EntityCombobox
                  value={details.vehicleTypeId || ''}
                  selectedLabel={details.vehicleLabel}
                  disabled={readOnly}
                  onChange={(id, option) =>
                    patchDetails({
                      vehicleTypeId: id || undefined,
                      vehicleLabel: option?.label || undefined,
                    })
                  }
                  onSearch={searchVehicleTypes}
                  placeholder="Search vehicle types…"
                  clearable
                />
              </FormField>
              <FormField
                label="Supplier"
                description="Transport, driver, fleet or DMC suppliers."
              >
                <EntityCombobox
                  value={details.supplierId || ''}
                  selectedLabel={details.supplierName}
                  disabled={readOnly}
                  onChange={(id, option) =>
                    patchDetails({
                      supplierId: id || undefined,
                      supplierName: option?.label || undefined,
                    })
                  }
                  onSearch={searchTransportSuppliers}
                  placeholder="Search transport suppliers…"
                  clearable
                />
              </FormField>
              <FormGrid>
                <FormField
                  label="Service date"
                  error={
                    transferValidation.requiresServiceDateOverride
                      ? `Service date is outside the trip dates: ${formatTripDateRangeLabel(
                          tripStartDate,
                          tripEndDate,
                        )}.`
                      : undefined
                  }
                >
                  <DatePicker
                    className="h-9 cursor-pointer"
                    disabled={readOnly}
                    value={parseDateInput(details.serviceDate)}
                    preferredMonth={parseDateInput(tripStartDate)}
                    preferredRange={{
                      start: parseDateInput(tripStartDate),
                      end: parseDateInput(tripEndDate) || parseDateInput(tripStartDate),
                    }}
                    onChange={(d) =>
                      patchDetails({
                        serviceDate: formatDateInput(d) || undefined,
                        serviceDateOutsideTripOverride: undefined,
                      })
                    }
                  />
                </FormField>
                <FormField
                  label="Vehicles"
                  error={
                    transferValidation.errors.find((e) =>
                      e.toLowerCase().includes('vehicle'),
                    ) || undefined
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    disabled={readOnly}
                    value={details.vehicles ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        patchDetails({
                          vehicles: undefined,
                          unusualVehiclesConfirmed: undefined,
                        });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      patchDetails({
                        vehicles: n,
                        unusualVehiclesConfirmed: undefined,
                      });
                      if (!details.sellManual && Number.isInteger(n) && n >= 1) {
                        const buy = parseMoney(unitCost);
                        const nextDetails = { ...details, vehicles: n };
                        const base = transferBaseCost(buy, nextDetails);
                        const suggested = suggestedSellFromMarkup(
                          base,
                          markupMode,
                          markupValue,
                        );
                        const unit = transferUnitSellFromSuggestedTotal(
                          suggested,
                          nextDetails,
                        );
                        if (unit != null) setUnitSell(String(unit));
                      }
                    }}
                  />
                </FormField>
              </FormGrid>
              {transferValidation.requiresServiceDateOverride && !readOnly ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                  <p className="text-destructive">
                    Service date is outside the trip dates:{' '}
                    {formatTripDateRangeLabel(tripStartDate, tripEndDate)}.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2 cursor-pointer"
                    onClick={() =>
                      patchDetails({ serviceDateOutsideTripOverride: true })
                    }
                  >
                    Override as pre/post-trip service
                  </Button>
                </div>
              ) : null}
              {transferValidation.requiresUnusualVehiclesConfirm && !readOnly ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  <p>
                    Unusual quantity:{' '}
                    {(details.vehicles ?? 0).toLocaleString()} vehicles. Please verify
                    before saving.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2 cursor-pointer"
                    onClick={() => setUnusualVehiclesConfirmOpen(true)}
                  >
                    Confirm unusual quantity
                  </Button>
                </div>
              ) : null}
            </Section>

            <Section title="Pricing">
              <p className="text-xs text-muted-foreground">
                Rate basis:{' '}
                <span className="font-medium text-foreground">Per vehicle / transfer</span>
              </p>
              <FormField label="Buy unit rate">
                <PriceField
                  currency={currency}
                  disabled={readOnly}
                  placeholder="—"
                  value={unitCost}
                  onChange={(raw) => {
                    onBuyUnitChange(raw);
                    if (!raw.trim()) setUnitSell('');
                  }}
                />
              </FormField>
              <FormField label="Markup %">
                <Input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={markupValue}
                  onChange={(e) =>
                    onMarkupChange(
                      'percent',
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </FormField>
              <FormField label="Sell unit rate" description="Calculated from buy × markup">
                <PriceField
                  currency={currency}
                  disabled
                  placeholder="—"
                  value={buyUnit == null ? '' : unitSell}
                  onChange={() => undefined}
                />
              </FormField>
              <FormField label="Tax %">
                <Input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                />
              </FormField>
              <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total cost</span>
                  <span>
                    {buyUnit != null && baseCost != null ? formatCurrency(baseCost) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total sell</span>
                  <span>
                    {buyUnit != null && sellTotal != null ? formatCurrency(sellTotal) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span
                    className={
                      buyUnit != null && profit != null && profit < 0
                        ? 'text-destructive'
                        : undefined
                    }
                  >
                    {buyUnit != null && profit != null ? formatCurrency(profit) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Margin</span>
                  <span>
                    {buyUnit != null && marginPct != null ? formatPercent(marginPct) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Table quantity</span>
                  <span>
                    {transferQty}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      (vehicles)
                    </span>
                  </span>
                </div>
              </div>
              {rateMatchStale ? (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
                  <p className="font-medium">
                    {matching ? 'Updating rate…' : 'Rate match outdated'}
                  </p>
                  <p className="text-xs opacity-90">
                    {matching
                      ? 'Looking up the directory for the new route or vehicle.'
                      : `Route or vehicle details changed. Rematch, or explicitly keep ${staleBuyLabel} as a manual buy rate.`}
                  </p>
                  {!readOnly ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        className="cursor-pointer"
                        disabled={matchDisabled || matching}
                        title={matchPrereqBlocked || undefined}
                        onClick={() => void matchRate()}
                      >
                        {matching ? 'Matching…' : 'Rematch rate'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="cursor-pointer"
                        disabled={keepManualConfirmed}
                        onClick={() => setKeepManualConfirmOpen(true)}
                      >
                        {keepManualConfirmed
                          ? `Keeping ${staleBuyLabel} as manual`
                          : `Keep ${staleBuyLabel} as manual price`}
                      </Button>
                    </div>
                  ) : null}
                  {matchPrereqBlocked ? (
                    <p className="text-[11px] opacity-80">{matchPrereqBlocked}</p>
                  ) : lastMatchFailure ? (
                    <p className="text-[11px] opacity-80">{lastMatchFailure}</p>
                  ) : null}
                </div>
              ) : null}
              {transferValidation.warnings.filter(
                (w) => w !== transferValidation.routeWarning,
              ).length ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {transferValidation.warnings
                      .filter((w) => w !== transferValidation.routeWarning)
                      .map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {transferValidation.errors.length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {transferValidation.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {rateMatchStale
                    ? keepManualConfirmed
                      ? 'Manual (pending save)'
                      : 'Match outdated'
                    : priceSourceLabel(details.priceSource)}
                </p>
                {details.priceSource === 'matched' && !rateMatchStale ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="font-medium">
                      {details.rateLabel ||
                        `${details.fromPlaceName || '…'} → ${details.toPlaceName || '…'}${
                          details.vehicleLabel ? ` · ${details.vehicleLabel}` : ''
                        }`}
                    </p>
                    {(details.supplierName || details.rateSupplierLabel) && (
                      <p className="text-muted-foreground">
                        Supplier: {details.supplierName || details.rateSupplierLabel}
                      </p>
                    )}
                    {details.rateValidTo ? (
                      <p className="text-muted-foreground">
                        Valid through:{' '}
                        {formatTripDateRangeLabel(details.rateValidTo, details.rateValidTo)}
                      </p>
                    ) : null}
                    {buyUnit != null ? (
                      <p className="tabular-nums text-muted-foreground">
                        {formatCurrency(buyUnit)} per vehicle/transfer
                      </p>
                    ) : null}
                  </div>
                ) : lastMatchFailure && !rateMatchStale ? (
                  <p className="mt-1 text-muted-foreground">{lastMatchFailure}</p>
                ) : details.priceSource === 'none' ? (
                  <p className="mt-1 text-muted-foreground">
                    No directory match — enter buy rate and markup.
                  </p>
                ) : null}
              </div>
            </Section>

            <DisclosureSection
              title="Advanced transport pricing and policies"
              description="Tolls, waiting charges, cancellation and notes — later release."
              defaultOpen={false}
            >
              <p className="text-sm text-muted-foreground">
                Tolls, waiting charges, cancellation policy and notes are deferred. Data
                fields can be added in a later iteration.
              </p>
            </DisclosureSection>
          </>
        ) : null}

        {showActivity ? (
          <>
            <Section title="Activity">
              <FormField
                label="Activity name"
                required
                error={
                  !details.propertyName?.trim() && !details.placeName?.trim()
                    ? 'Required'
                    : undefined
                }
              >
                <Input
                  disabled={readOnly}
                  placeholder="Tiger Hill sunrise"
                  value={details.propertyName || ''}
                  onChange={(e) => {
                    const propertyName = e.target.value || undefined;
                    patchDetails({ propertyName });
                  }}
                />
              </FormField>
              <PlaceSinglePicker
                label="Location"
                value={placeRefFrom(details.placeId, details.placeName)}
                onChange={(ref) =>
                  patchDetails({
                    placeId: ref?.placeId || undefined,
                    placeName: ref?.name || undefined,
                  })
                }
              />
              <FormField label="Supplier">
                <EntityCombobox
                  value={details.supplierId || ''}
                  selectedLabel={details.supplierName}
                  disabled={readOnly}
                  onChange={(id, option) =>
                    patchDetails({
                      supplierId: id || undefined,
                      supplierName: option?.label || undefined,
                    })
                  }
                  onSearch={searchAnySuppliers}
                  placeholder="Search suppliers…"
                  clearable
                />
              </FormField>
              <FormGrid>
                <FormField
                  label="Date"
                  required
                  error={!details.activityDate ? 'Required' : undefined}
                >
                  <DatePicker
                    className="h-9 cursor-pointer"
                    disabled={readOnly}
                    value={parseDateInput(details.activityDate)}
                    onChange={(d) =>
                      patchDetails({
                        activityDate: formatDateInput(d) || undefined,
                        serviceDateOutsideTripOverride: undefined,
                      })
                    }
                  />
                </FormField>
                <FormField label="Time">
                  <Input
                    type="time"
                    disabled={readOnly}
                    value={details.activityTime || ''}
                    onChange={(e) =>
                      patchDetails({ activityTime: e.target.value || undefined })
                    }
                  />
                </FormField>
              </FormGrid>
              {activityValidation.requiresServiceDateOverride ? (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
                  <p className="text-xs opacity-90">
                    Activity date is outside the trip
                    {tripStartDate || tripEndDate
                      ? ` (${formatTripDateRangeLabel(tripStartDate, tripEndDate)})`
                      : ''}
                    .
                  </p>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() =>
                        patchDetails({ serviceDateOutsideTripOverride: true })
                      }
                    >
                      Override as pre/post-trip
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <FormField label="Private / SIC">
                <Combobox
                  value={details.privateOrSic || ''}
                  disabled={readOnly}
                  onChange={(v) =>
                    patchDetails({
                      privateOrSic: v === 'private' || v === 'sic' ? v : undefined,
                    })
                  }
                  options={[
                    { value: 'private', label: 'Private' },
                    { value: 'sic', label: 'SIC (shared)' },
                  ]}
                  placeholder="Select…"
                />
              </FormField>
              <FormGrid>
                <FormField label="Adults">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.adults ?? ''}
                    onChange={(e) =>
                      patchDetails({
                        adults: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </FormField>
                <FormField label="Children">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.children ?? ''}
                    onChange={(e) =>
                      patchDetails({
                        children: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </FormField>
              </FormGrid>
              {activityValidation.warnings.length ? (
                <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                  {activityValidation.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </Section>

            <Section title="Pricing">
              <p className="text-xs text-muted-foreground">
                Manual pricing for V1 — activity rate directory comes later. Rates are per person.
              </p>
              <FormGrid>
                <FormField label="Buy / person">
                  <PriceField
                    currency={currency}
                    disabled={readOnly}
                    placeholder="e.g. 1500"
                    value={unitCost}
                    onChange={onBuyUnitChange}
                  />
                </FormField>
                <FormField label="Markup %">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={markupValue}
                    onChange={(e) =>
                      onMarkupChange(
                        'percent',
                        e.target.value === '' ? undefined : Number(e.target.value),
                      )
                    }
                  />
                </FormField>
                <FormField label="Sell / person" description="Calculated from buy × markup">
                  <PriceField
                    currency={currency}
                    disabled={readOnly}
                    value={unitSell}
                    onChange={(raw) => {
                      setUnitSell(raw);
                      patchDetails({ sellManual: true, priceSource: 'manual' });
                    }}
                  />
                </FormField>
                <FormField label="Tax %">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(e.target.value)}
                  />
                </FormField>
              </FormGrid>
              <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total cost</span>
                  <span>{baseCost != null ? formatCurrency(baseCost) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Total sell</span>
                  <span>{sellTotal != null ? formatCurrency(sellTotal) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={profit != null && profit < 0 ? 'text-destructive' : undefined}>
                    {profit != null ? formatCurrency(profit) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Margin</span>
                  <span>{marginPct != null ? formatPercent(marginPct) : '—'}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Table quantity</span>
                  <span>
                    {activityQty}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      (adults + children)
                    </span>
                  </span>
                </div>
              </div>
            </Section>
          </>
        ) : null}

        {showCustom ? (
          <Section title="Custom service">
            <FormGrid>
              <FormField label="Unit label">
                <Combobox
                  value={details.unitLabel || 'service'}
                  disabled={readOnly}
                  onChange={(v) => patchDetails({ unitLabel: v || 'service' })}
                  options={QUOTE_CUSTOM_UNIT_OPTIONS}
                />
              </FormField>
              <FormField label="Quantity">
                <Input
                  type="number"
                  min={1}
                  disabled={readOnly}
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                />
              </FormField>
            </FormGrid>
            <FormField label="Unit cost">
              <PriceField
                currency={currency}
                disabled={readOnly}
                value={unitCost}
                onChange={onBuyUnitChange}
              />
            </FormField>
            <FormGrid>
              <FormField label="Markup mode">
                <Combobox
                  value={details.markupMode || 'percent'}
                  disabled={readOnly}
                  onChange={(v) =>
                    onMarkupChange(
                      (v as QuoteMarkupMode) || 'percent',
                      details.markupValue ?? defaultMarkupPercent,
                    )
                  }
                  options={[
                    { value: 'percent', label: 'Percentage' },
                    { value: 'fixed', label: 'Fixed amount' },
                  ]}
                />
              </FormField>
              <FormField
                label={
                  (details.markupMode || 'percent') === 'fixed' ? 'Markup amount' : 'Markup %'
                }
              >
                <Input
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={details.markupValue ?? defaultMarkupPercent}
                  onChange={(e) =>
                    onMarkupChange(
                      (details.markupMode || 'percent') as QuoteMarkupMode,
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                />
              </FormField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              Suggested sell:{' '}
              {customSuggested != null ? formatCurrency(customSuggested) : '—'}
              {!readOnly && customSuggested != null ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="cursor-pointer text-primary hover:underline"
                    onClick={() => applySuggestedSell(customSuggested, false)}
                  >
                    Use suggested
                  </button>
                </>
              ) : null}
            </p>
            <FormField label="Unit sell">
              <PriceField
                currency={currency}
                disabled={readOnly}
                value={unitSell}
                onChange={(raw) => {
                  setUnitSell(raw);
                  patchDetails({ sellManual: true, priceSource: 'manual' });
                }}
              />
            </FormField>
            <FormField label="Tax %">
              <Input
                type="number"
                min={0}
                disabled={readOnly}
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </FormField>
          </Section>
        ) : null}

        {!showHotel && !showTransfer && !showActivity && !showCustom ? (
          <Section title="Pricing">
            <FormGrid>
              <FormField label="Unit cost">
                <PriceField
                  currency={currency}
                  disabled={readOnly}
                  value={unitCost}
                  onChange={setUnitCost}
                />
              </FormField>
              <FormField label="Unit sell">
                <PriceField
                  currency={currency}
                  disabled={readOnly}
                  value={unitSell}
                  onChange={setUnitSell}
                />
              </FormField>
            </FormGrid>
            <FormField label="Tax %">
              <Input
                type="number"
                min={0}
                disabled={readOnly}
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </FormField>
          </Section>
        ) : null}
      </RecordSheet>

      <ConfirmDialog
        open={typeConfirmOpen}
        onOpenChange={(o) => {
          setTypeConfirmOpen(o);
          if (!o) setPendingType(null);
        }}
        title="Change service type?"
        description={`Changing the service type will remove ${serviceTypeLabel(serviceType).toLowerCase()}-specific fields. Continue?`}
        confirmLabel="Change type"
        onConfirm={confirmServiceTypeChange}
      />

      <ConfirmDialog
        open={keepManualConfirmOpen}
        onOpenChange={setKeepManualConfirmOpen}
        title="Keep as manual price?"
        description={`Keep the previous buy rate (${staleBuyLabel}) as a manual rate after the change? This is not a directory match.`}
        confirmLabel="Keep as manual"
        onConfirm={() => {
          setKeepManualConfirmed(true);
          setRateMatchStale(false);
          setMatchedRateId(undefined);
          setKeepManualConfirmOpen(false);
          setDetails((prev) => ({
            ...prev,
            priceSource: 'manual',
            sellManual: true,
            rateSupplierLabel: `Manual — kept from matched rate (${staleBuyLabel})`,
          }));
          toastSuccess('Previous buy rate kept as manual — save to confirm');
        }}
      />

      <ConfirmDialog
        open={unusualVehiclesConfirmOpen}
        onOpenChange={setUnusualVehiclesConfirmOpen}
        title="Confirm unusual vehicle quantity?"
        description={`Unusual quantity: ${(details.vehicles ?? 0).toLocaleString()} vehicles. Please verify before saving.`}
        confirmLabel="Confirm quantity"
        onConfirm={() => {
          patchDetails({ unusualVehiclesConfirmed: true });
          setUnusualVehiclesConfirmOpen(false);
          toastSuccess('Unusual quantity confirmed — save to continue');
        }}
      />
    </>
  );
}

export function seedDetailsFromItineraryItem(item: {
  details?: Record<string, unknown> | null;
  location?: unknown;
  title?: string;
  type?: string;
}): QuoteServiceDetails | undefined {
  const d = item.details || {};
  const fromName =
    (typeof d.fromPlaceName === 'string' && d.fromPlaceName) ||
    (typeof d.from === 'string' && d.from) ||
    undefined;
  const toName =
    (typeof d.toPlaceName === 'string' && d.toPlaceName) ||
    (typeof d.to === 'string' && d.to) ||
    undefined;
  const parsed = detailsFromResolveRecord({
    ...d,
    placeId:
      (typeof d.catalogPlaceId === 'string' && d.catalogPlaceId) ||
      (typeof d.placeId === 'string' && d.placeId) ||
      undefined,
    propertyName:
      (typeof d.propertyName === 'string' && d.propertyName) ||
      (item.type === 'hotel' ? item.title : undefined),
    fromPlaceName: fromName,
    toPlaceName: toName,
    vehicles:
      item.type === 'transfer'
        ? Math.max(1, Number(d.vehicles) || 1)
        : d.vehicles,
  });
  if (!parsed) return undefined;
  if (item.type === 'hotel') return withCalculatedHotelNights(parsed);
  return parsed;
}
