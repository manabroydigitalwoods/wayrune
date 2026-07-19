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
  NumberField,
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
import { api, type SupplierHotelRateRow } from '../../api';
import { PlaceSinglePicker } from '../places/PlacePicker';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { serviceTypeLabel } from '../../lib/quoteImportFromItinerary';
import {
  EXPERIENCE_SUPPLIER_TYPE_QUERY,
  STAY_SUPPLIER_TYPE_QUERY,
  supplierTypeLabel,
} from '../../lib/supplierTypes';
import {
  formatHotelAllotmentNote,
  hotelAllotmentBlocksSend,
  hotelAllotmentTone,
  withAllotmentProvenance,
} from '../../lib/hotelAllotmentNote';
import { formatHotelOccupancyExtraNote } from '../../lib/hotelOccupancyExtraNote';
import { formatHotelDateSupplementNote } from '../../lib/hotelDateSupplementNote';
import { formatHotelWeekendNightNote } from '../../lib/hotelWeekendNightNote';
import { formatHotelCancellationNote } from '../../lib/hotelCancellationNote';
import {
  activityChildAgeCalcFromProvenance,
  formatActivityChildAgeNote,
} from '../../lib/activityChildAgeNote';
import {
  swapTransferEnds,
  transferReverseCorridorHint,
} from '../../lib/transferReverseCorridorHint';
import {
  bumpAndRestampTransferCapacity,
  restampTransferCapacity,
  transferCapacityBlocksSend,
  transferCapacityTone,
  withCapacityProvenance,
} from '../../lib/transferCapacityNote';
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
  rateBlockReasonMessage,
  rateChartPath,
  supplierContractsPath,
  rateMatchFingerprint,
  rateProvenanceSourceLabel,
  resolvePayloadFromQuoteDetails,
  shouldAutoRematchRate,
  suggestedSellFromMarkup,
  unitSellFromSuggestedTotal,
  clampHotelChildrenWithoutBed,
  hotelAutoDescription,
  hotelMatchKeysChanged,
  shouldReplaceHotelDescription,
  validateHotelV1,
  withCalculatedHotelNights,
  transferAutoDescription,
  transferBaseCost,
  transferMatchKeysChanged,
  transferUnitSellFromSuggestedTotal,
  trimChildAgesForChildrenCount,
  shouldReplaceTransferDescription,
  validateTransferV1,
  activityAutoDescription,
  activityBaseCost,
  activityMatchKeysChanged,
  activityUnitSellFromSuggestedTotal,
  shouldReplaceActivityDescription,
  validateActivityV1,
  formatTripDateRangeLabel,
  inferPlaceCountry,
  formatRateTimestamp,
  rateBuyChangedMessage,
  rateChartChangedSinceMatch,
  lineNeedsRateDriftAck,
  type QuoteMarkupMode,
  type QuotePriceSource,
  type QuoteRateProvenance,
  type QuoteServiceDetails,
} from '../../lib/quoteServiceDetails';
import { DisclosureSection } from '../agency/DisclosureSection';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
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
  rateKind?: 'hotel' | 'transfer' | 'activity';
  rateId?: string;
  rateUnmatched?: boolean;
  rateBlockReason?: 'blackout' | 'stop_sell';
  rateProvenance?: QuoteRateProvenance;
  details?: QuoteServiceDetails;
};

type RateResolveRow = {
  itemId: string;
  matched: boolean;
  rateKind: 'hotel' | 'transfer' | 'activity' | null;
  rateId: string | null;
  unitCost: number;
  unitSell: number;
  quantity: number;
  taxPercent: number;
  pricingUnit: string;
  rateMeta?: Record<string, unknown> | null;
};

type RateMatchExplain = {
  accepted: string[];
  rejected: Array<{ rateId?: string; label: string; reason: string }>;
};

function parseMatchExplain(meta?: Record<string, unknown> | null): RateMatchExplain | null {
  const raw = meta?.matchExplain;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const accepted = Array.isArray(o.accepted)
    ? o.accepted
        .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
        .map((x) => x.trim())
    : [];
  const rejected = Array.isArray(o.rejected)
    ? o.rejected.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        const label = typeof r.label === 'string' ? r.label.trim() : '';
        const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
        if (!label && !reason) return [];
        return [
          {
            rateId: typeof r.rateId === 'string' ? r.rateId : undefined,
            label: label || 'Rate',
            reason: reason || 'Not selected',
          },
        ];
      })
    : [];
  if (!accepted.length && !rejected.length) return null;
  return { accepted, rejected };
}

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
  params.set('type', `${STAY_SUPPLIER_TYPE_QUERY},dmc`);
  if (placeId) params.set('placeId', placeId);
  let items = await api<
    Array<{ id: string; name: string; type: string; place?: { name?: string } | null }>
  >(`/suppliers?${params.toString()}`);
  if (placeId && items.length === 0) {
    const fallback = new URLSearchParams();
    if (q) fallback.set('q', q);
    fallback.set('type', `${STAY_SUPPLIER_TYPE_QUERY},dmc`);
    items = await api(`/suppliers?${fallback.toString()}`);
  }
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: [supplierTypeLabel(s.type), s.place?.name].filter(Boolean).join(' · '),
  }));
}

async function searchExperienceSuppliers(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', `${EXPERIENCE_SUPPLIER_TYPE_QUERY},dmc`);
  const items = await api<Array<{ id: string; name: string; type: string }>>(
    `/suppliers?${params.toString()}`,
  );
  return items.map((s) => ({
    value: s.id,
    label: s.name,
    description: supplierTypeLabel(s.type),
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
    description: supplierTypeLabel(s.type),
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

async function searchCatalogRoomTypes(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<
    { items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>
  >(`/room-types?${params.toString()}`);
  const items = Array.isArray(res) ? res : res.items || [];
  return items.map((r) => ({ value: r.name, label: r.name }));
}

/** Room name → product id for the last supplier rate-chart search. */
const supplierRoomProductByKey = new Map<string, string>();

/** Prefer this supplier's rate-chart rooms so Match rate can hit contracted seasons. */
async function searchHotelRoomTypesForQuote(
  supplierId: string | undefined,
  q: string,
): Promise<ComboboxOption[]> {
  if (supplierId) {
    try {
      const res = await api<{ items: SupplierHotelRateRow[] }>(
        `/hotel-rates?supplierId=${encodeURIComponent(supplierId)}`,
      );
      const byName = new Map<string, ComboboxOption>();
      for (const r of res.items || []) {
        if (r.isSystem) continue;
        const name = (r.roomProduct?.name || r.roomType || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (byName.has(key)) continue;
        const meal = r.mealPlan?.trim();
        byName.set(key, {
          value: name,
          label: name,
          description: meal ? `Rate chart · ${meal}` : 'Rate chart',
        });
        const productId = r.roomProductId || r.roomProduct?.id;
        if (productId) {
          supplierRoomProductByKey.set(`${supplierId}:${key}`, productId);
        }
      }
      const needle = q.trim().toLowerCase();
      let opts = [...byName.values()];
      if (needle) {
        opts = opts.filter((o) => o.label.toLowerCase().includes(needle));
      }
      if (opts.length > 0) return opts;
    } catch {
      // Fall through to agency catalog.
    }
  }
  return searchCatalogRoomTypes(q);
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

/** Soft blackout / hard stop-sale Match failure with optional Open contracts CTA. */
function MatchBlockReasonBanner({
  blockReason,
  message,
  supplierId,
  readOnly,
  onOpenContracts,
}: {
  blockReason: 'blackout' | 'stop_sell' | null;
  message: string;
  supplierId?: string | null;
  readOnly?: boolean;
  onOpenContracts: (href: string) => void;
}) {
  const contractsHref = supplierContractsPath(supplierId);
  const openContracts =
    contractsHref && !readOnly ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2 cursor-pointer"
        onClick={() => onOpenContracts(contractsHref)}
      >
        Open contracts
      </Button>
    ) : null;

  if (blockReason === 'blackout') {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
        <p>Blackout · {message}</p>
        <p className="mt-1 opacity-90">Manual or on-request pricing remains allowed.</p>
        {openContracts}
      </div>
    );
  }
  if (blockReason === 'stop_sell') {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <p>Stop-sale · {message}</p>
        <p className="mt-1 opacity-90">
          Quoting and booking are blocked — change dates, clear stop-sale, or pick another
          supplier.
        </p>
        {openContracts}
      </div>
    );
  }
  return <p className="text-muted-foreground">{message}</p>;
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
  partyInfants,
  partyId,
  defaultMarkupPercent = 20,
  seedDetails,
  onSave,
  attentionQueue = null,
  onNextAttention,
  quotationVersionId = null,
  canOverrideInventoryRisk = false,
  onInventoryRiskAcked,
  canOverrideRateDrift = false,
  onRateDriftAcked,
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
  partyInfants?: number;
  /** Trip client — enables agent markup on Match rate when org has agentMarkupPercent. */
  partyId?: string | null;
  defaultMarkupPercent?: number;
  seedDetails?: QuoteServiceDetails | null;
  onSave: (patch: Partial<QuoteServiceDetailLine> & { id: string }) => void;
  /** When set, footer shows Next issue · N of M for attention-strip queue. */
  attentionQueue?: {
    index: number;
    total: number;
    nextId: string | null;
  } | null;
  onNextAttention?: (nextId: string) => void;
  /** Draft quotation version — required for manager inventory / rate-drift acks. */
  quotationVersionId?: string | null;
  /** Requires `inventory_risk.approve` for allotment/capacity Send anyway. */
  canOverrideInventoryRisk?: boolean;
  /** Reload quote lines after gated inventory-risk ack. */
  onInventoryRiskAcked?: (updated: {
    id: string;
    versionLock?: number;
    itemsJson?: unknown;
  }) => void | Promise<void>;
  /** Requires `rate_drift.approve` for Keep buy. */
  canOverrideRateDrift?: boolean;
  /** Reload quote lines after gated rate-drift ack. */
  onRateDriftAcked?: (updated: {
    id: string;
    versionLock?: number;
    itemsJson?: unknown;
  }) => void | Promise<void>;
}) {
  const { navigate } = useOrgNavigate();
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
  const [rateProvenance, setRateProvenance] = useState<QuoteRateProvenance | undefined>(
    undefined,
  );
  const [rateMatchStale, setRateMatchStale] = useState(false);
  /** Buy unit captured when match became outdated — for keep-as-manual confirmation. */
  const [staleBuyUnit, setStaleBuyUnit] = useState<number | null>(null);
  const [keepManualConfirmed, setKeepManualConfirmed] = useState(false);
  const [keepManualConfirmOpen, setKeepManualConfirmOpen] = useState(false);
  const [lastMatchFailure, setLastMatchFailure] = useState<string | null>(null);
  const [lastMatchExplain, setLastMatchExplain] = useState<RateMatchExplain | null>(null);
  const [lastMatchBlockReason, setLastMatchBlockReason] = useState<
    'blackout' | 'stop_sell' | null
  >(null);
  const [chartDriftUpdatedAt, setChartDriftUpdatedAt] = useState<string | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [unusualVehiclesConfirmOpen, setUnusualVehiclesConfirmOpen] = useState(false);
  const [allotmentNote, setAllotmentNote] = useState<string | null>(null);
  const [capacityNote, setCapacityNote] = useState<string | null>(null);
  const [allotmentAckReason, setAllotmentAckReason] = useState('');
  const [capacityAckReason, setCapacityAckReason] = useState('');
  const [rateDriftAckReason, setRateDriftAckReason] = useState('');
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
      if (parsed.infants == null && partyInfants != null) parsed.infants = partyInfants;
      if (!parsed.rateBasis) parsed.rateBasis = 'per_room_night';
      parsed.rateBasis = 'per_room_night';
      if (!parsed.markupMode) parsed.markupMode = 'percent';
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
      if (parsed.markupValue == null) parsed.markupValue = defaultMarkupPercent;
      if (!parsed.vehicles) parsed.vehicles = 1;
      if (parsed.adults == null && partyAdults) parsed.adults = partyAdults;
      if (parsed.children == null && partyChildren != null) parsed.children = partyChildren;
      if (parsed.infants == null && partyInfants != null) parsed.infants = partyInfants;
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
    setRateProvenance(line.rateProvenance);
    const openExpired = parsed.priceSource === 'expired';
    setRateMatchStale(openExpired);
    setStaleBuyUnit(
      openExpired && line.unitCost != null && Number.isFinite(line.unitCost)
        ? line.unitCost
        : null,
    );
    setKeepManualConfirmed(false);
    setLastMatchFailure(null);
    setLastMatchExplain(
      line.rateProvenance?.matchSummary
        ? { accepted: [line.rateProvenance.matchSummary], rejected: [] }
        : null,
    );
    setLastMatchBlockReason(line.rateBlockReason ?? null);
    setChartDriftUpdatedAt(null);
    setAllotmentNote(line.rateProvenance?.allotmentNote?.trim() || null);
    setCapacityNote(line.rateProvenance?.capacityNote?.trim() || null);
    setAllotmentAckReason(line.rateProvenance?.allotmentRiskAckReason?.trim() || '');
    setCapacityAckReason(line.rateProvenance?.capacityRiskAckReason?.trim() || '');
    setRateDriftAckReason(line.rateProvenance?.rateDriftAckReason?.trim() || '');
    setRouteDistanceKm(null);
  }, [open, line, seedDetails, partyAdults, partyChildren, partyInfants, defaultMarkupPercent, tripStartDate]);

  /** Soft detect: chart row edited after this line was matched. */
  useEffect(() => {
    if (!open || rateMatchStale || keepManualConfirmed) {
      setChartDriftUpdatedAt(null);
      return;
    }
    const rateId = matchedRateId || rateProvenance?.rateId;
    if (!rateId || details.priceSource !== 'matched') {
      setChartDriftUpdatedAt(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let currentUpdatedAt: string | null = null;
        if (serviceType === 'hotel' && details.supplierId) {
          const res = await api<{ items: SupplierHotelRateRow[] }>(
            `/hotel-rates?supplierId=${encodeURIComponent(details.supplierId)}`,
          );
          const row = (res.items || []).find((r) => r.id === rateId);
          currentUpdatedAt = row?.updatedAt ? String(row.updatedAt) : null;
        } else if (serviceType === 'transfer') {
          const res = await api<{
            items: Array<{ id: string; updatedAt?: string | null }>;
          }>('/transfer-fares?includeSystem=true');
          const row = (res.items || []).find((r) => r.id === rateId);
          currentUpdatedAt = row?.updatedAt ? String(row.updatedAt) : null;
        } else if (serviceType === 'activity' && details.supplierId) {
          const res = await api<{
            items: Array<{ id: string; updatedAt?: string | null }>;
          }>(
            `/activity-rates?supplierId=${encodeURIComponent(details.supplierId)}`,
          );
          const row = (res.items || []).find((r) => r.id === rateId);
          currentUpdatedAt = row?.updatedAt ? String(row.updatedAt) : null;
        }
        if (cancelled) return;
        const needsAck = lineNeedsRateDriftAck({
          matchedAt: rateProvenance?.matchedAt,
          rateUpdatedAtAtMatch: rateProvenance?.rateUpdatedAt || details.rateLastUpdated,
          currentUpdatedAt,
          ackForUpdatedAt: rateProvenance?.rateDriftAckForUpdatedAt,
          ackReason: rateProvenance?.rateDriftAckReason,
        });
        setChartDriftUpdatedAt(needsAck ? currentUpdatedAt : null);
      } catch {
        if (!cancelled) setChartDriftUpdatedAt(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    serviceType,
    details.priceSource,
    details.supplierId,
    details.rateLastUpdated,
    matchedRateId,
    rateProvenance?.rateId,
    rateProvenance?.matchedAt,
    rateProvenance?.rateUpdatedAt,
    rateProvenance?.rateDriftAckForUpdatedAt,
    rateProvenance?.rateDriftAckReason,
    rateMatchStale,
    keepManualConfirmed,
  ]);

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

  const searchHotelRooms = useCallback(
    (q: string) => searchHotelRoomTypesForQuote(details.supplierId, q),
    [details.supplierId],
  );

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
              : serviceType === 'activity'
                ? activityMatchKeysChanged(prev, patch)
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
        serviceType === 'hotel' ||
        serviceType === 'transfer' ||
        serviceType === 'activity'
          ? serviceType
          : undefined,
      rateUnmatched: rateUnmatched || undefined,
      ...overrides,
    };
  }

  function save(opts?: { advanceTo?: string | null }) {
    if (!line || readOnly) return;
    if (serviceType === 'hotel') {
      const next = withCalculatedHotelNights({
        ...details,
        rateBasis: 'per_room_night',
        markupMode: details.markupMode === 'fixed' ? 'fixed' : 'percent',
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
    let transferSaveCapacity: ReturnType<
      typeof bumpAndRestampTransferCapacity
    > | null = null;
    if (serviceType === 'transfer') {
      const party =
        Math.max(0, Number(details.adults) || 0) +
        Math.max(0, Number(details.children) || 0);
      transferSaveCapacity = bumpAndRestampTransferCapacity({
        provenance: rateProvenance,
        party,
        vehicles: details.vehicles,
      });
      const next = {
        ...details,
        markupMode: (details.markupMode === 'fixed' ? 'fixed' : 'percent') as const,
        vehicles: transferSaveCapacity.vehicles,
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
        setCapacityNote(transferSaveCapacity.note);
        if (transferSaveCapacity.provenance) {
          setRateProvenance(transferSaveCapacity.provenance);
        }
        return;
      }
      if (!check.ok) {
        toastError(check.errors[0] || 'Fix transport details before saving');
        setDetails(next);
        setCapacityNote(transferSaveCapacity.note);
        if (transferSaveCapacity.provenance) {
          setRateProvenance(transferSaveCapacity.provenance);
        }
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
      setCapacityNote(transferSaveCapacity.note);
      if (transferSaveCapacity.provenance) {
        setRateProvenance(transferSaveCapacity.provenance);
      }
    }
    if (serviceType === 'activity') {
      const next = {
        ...details,
        markupMode: (details.markupMode === 'fixed' ? 'fixed' : 'percent') as const,
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
    const patch = buildSavePatch(
      serviceType === 'hotel' || serviceType === 'transfer'
        ? {
            rateId: keepManualConfirmed ? undefined : matchedRateId,
            rateUnmatched: false,
            rateProvenance: keepManualConfirmed
              ? undefined
              : serviceType === 'hotel'
                ? withAllotmentProvenance(rateProvenance, allotmentNote) ??
                  rateProvenance
                : (() => {
                    const live =
                      transferSaveCapacity ??
                      bumpAndRestampTransferCapacity({
                        provenance: rateProvenance,
                        party:
                          Math.max(0, Number(details.adults) || 0) +
                          Math.max(0, Number(details.children) || 0),
                        vehicles: details.vehicles,
                      });
                    return (
                      live.provenance ??
                      withCapacityProvenance(rateProvenance, capacityNote) ??
                      rateProvenance
                    );
                  })(),
            rateBlockReason: undefined,
          }
        : undefined,
    );
    if (!patch) return;
    if (
      serviceType === 'transfer' &&
      patch.details &&
      transferSaveCapacity != null
    ) {
      patch.details = {
        ...patch.details,
        vehicles: transferSaveCapacity.vehicles,
      };
    }
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
        markupMode: patch.details.markupMode === 'fixed' ? 'fixed' : 'percent',
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
        markupMode: patch.details.markupMode === 'fixed' ? 'fixed' : 'percent',
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
        markupMode: patch.details.markupMode === 'fixed' ? 'fixed' : 'percent',
        sellManual: Boolean(patch.details.sellManual) || keepManualConfirmed,
        priceSource: keepManualConfirmed
          ? 'manual'
          : patch.details.priceSource || 'manual',
        rateSupplierLabel: keepManualConfirmed
          ? `Manual — kept from matched rate${
              staleBuyUnit != null ? ` (₹${staleBuyUnit})` : ''
            }`
          : patch.details.rateSupplierLabel,
      };
      if (shouldReplaceActivityDescription(patch.description, patch.details)) {
        const auto = activityAutoDescription(patch.details);
        if (auto) patch.description = auto;
      }
    }
    onSave(patch);
    toastSuccess('Service details saved');
    const advanceTo = opts?.advanceTo ?? null;
    if (advanceTo && onNextAttention) {
      onNextAttention(advanceTo);
    } else {
      onOpenChange(false);
    }
  }

  function goNextAttentionIssue() {
    const nextId = attentionQueue?.nextId ?? null;
    if (!nextId || !onNextAttention) return;
    if (readOnly) {
      onNextAttention(nextId);
      return;
    }
    save({ advanceTo: nextId });
  }

  async function acknowledgeRateDrift() {
    if (!line || readOnly || !chartDriftUpdatedAt || !rateProvenance) return;
    if (!canOverrideRateDrift) {
      toastError('A manager with rate_drift.approve must acknowledge this chart change');
      return;
    }
    if (!quotationVersionId) {
      toastError('Save the quotation draft before acknowledging rate drift');
      return;
    }
    const reason = rateDriftAckReason.trim();
    if (!reason) return;
    try {
      const updated = await api<{
        id: string;
        versionLock?: number;
        itemsJson?: unknown;
      }>(`/quotations/${quotationVersionId}/rate-drift-acks`, {
        method: 'POST',
        body: JSON.stringify({ reason, lineIds: [line.id] }),
      });
      toastSuccess('Chart change acknowledged — send will keep the current buy');
      await onRateDriftAcked?.(updated);
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : 'Could not record rate-drift acknowledgement',
      );
    }
  }

  async function recordInventoryRiskAck(kind: 'allotment' | 'capacity') {
    if (!line || readOnly || !rateProvenance) return;
    if (!canOverrideInventoryRisk) {
      toastError('A manager with inventory_risk.approve must acknowledge this shortfall');
      return;
    }
    if (!quotationVersionId) {
      toastError('Save the quotation draft before acknowledging inventory risk');
      return;
    }
    const reason =
      kind === 'allotment' ? allotmentAckReason.trim() : capacityAckReason.trim();
    const note =
      kind === 'allotment'
        ? allotmentNote?.trim() || rateProvenance.allotmentNote?.trim() || ''
        : capacityNote?.trim() || rateProvenance.capacityNote?.trim() || '';
    const blocks =
      kind === 'allotment'
        ? hotelAllotmentBlocksSend(rateProvenance)
        : transferCapacityBlocksSend(rateProvenance);
    if (!note || !reason || !blocks) return;
    try {
      const updated = await api<{
        id: string;
        versionLock?: number;
        itemsJson?: unknown;
      }>(`/quotations/${quotationVersionId}/inventory-risk-acks`, {
        method: 'POST',
        body: JSON.stringify({ reason, lineIds: [line.id] }),
      });
      toastSuccess(
        kind === 'allotment'
          ? 'Allotment shortfall acknowledged — send is allowed'
          : 'Capacity shortfall acknowledged — send is allowed',
      );
      await onInventoryRiskAcked?.(updated);
    } catch (e) {
      toastError(
        e instanceof Error ? e.message : 'Could not record inventory risk acknowledgement',
      );
    }
  }

  async function matchRate(opts?: {
    auto?: boolean;
    detailsOverride?: QuoteServiceDetails;
  }) {
    if (!line || readOnly) return;
    const auto = Boolean(opts?.auto);
    const baseDetails = opts?.detailsOverride ?? details;
    const withNights =
      serviceType === 'hotel'
        ? withCalculatedHotelNights({
            ...baseDetails,
            rateBasis: 'per_room_night',
          })
        : {
            ...baseDetails,
            vehicles: Math.max(1, Math.round(baseDetails.vehicles ?? 1)),
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
    if (serviceType === 'activity') {
      const check = validateActivityV1(withNights, {
        tripStartDate,
        tripEndDate,
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
      if (!auto) toastError('Add hotel, transport, or activity details before matching a rate');
      return;
    }
    setMatching(true);
    const defaultNoMatch =
      serviceType === 'transfer'
        ? 'No active transport rate found for this route, vehicle and date.'
        : serviceType === 'activity'
          ? 'No active activity rate found for this name, date and supplier.'
          : 'No active matching rate found for these dates and meal plan.';
    try {
      const res = await api<{ items: RateResolveRow[] }>('/rates/resolve', {
        method: 'POST',
        body: JSON.stringify({
          startDate: tripStartDate || undefined,
          adults: partyAdults || baseDetails.adults || undefined,
          children: partyChildren || baseDetails.children || undefined,
          infants:
            partyInfants ||
            baseDetails.infants ||
            withNights.infants ||
            undefined,
          partyId: partyId || undefined,
          items: [payload],
        }),
      });
      const hit = res.items[0];
      if (!hit) {
        toastError(defaultNoMatch);
        return;
      }
      setLastMatchExplain(parseMatchExplain(hit.rateMeta));

      const appliedForced = applyRateResolveHit({
        serviceType,
        details: {
          ...withNights,
          adults: withNights.adults ?? partyAdults ?? undefined,
          children: withNights.children ?? partyChildren ?? undefined,
          infants: withNights.infants ?? partyInfants ?? undefined,
        },
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
      setRateProvenance(appliedForced.rateProvenance);
      setCapacityNote(appliedForced.rateProvenance?.capacityNote?.trim() || null);
      setRateMatchStale(false);
      setKeepManualConfirmed(false);
      setStaleBuyUnit(null);
      setChartDriftUpdatedAt(null);
      setLastMatchBlockReason(appliedForced.rateBlockReason ?? null);

      if (!hit.matched) {
        const noMatchMessage = appliedForced.rateBlockReason
          ? rateBlockReasonMessage(appliedForced.rateBlockReason)
          : defaultNoMatch;
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
          rateBlockReason: appliedForced.rateBlockReason,
          rateProvenance: undefined,
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
        rateBlockReason: undefined,
        rateProvenance: appliedForced.rateProvenance,
      });
      if (matchedDescription) setDescription(matchedDescription);
      if (appliedForced.unitSell != null) setUnitSell(String(appliedForced.unitSell));
      const buyChange = rateBuyChangedMessage({
        previousBuy: rateProvenance?.unitCostAtMatch,
        nextBuy: appliedForced.unitCost,
        currency: appliedForced.rateProvenance?.currency || currency,
      });
      const bump = appliedForced.vehiclesBumped;
      const bumpNote = bump
        ? `vehicles set to ${bump.to} for party of ${
            Math.max(0, Number(appliedForced.details.adults) || 0) +
            Math.max(0, Number(appliedForced.details.children) || 0)
          }`
        : null;
      if (auto) {
        toastSuccess(
          bumpNote
            ? `Rate updated — ${bumpNote}`
            : buyChange
              ? `Rate updated — ${buyChange}`
              : 'Rate updated for new details',
        );
      } else {
        toastSuccess(
          bumpNote
            ? `Rate matched — ${bumpNote}`
            : buyChange
              ? `Rate matched — ${buyChange}`
              : 'Rate matched from directory',
        );
      }

      if (
        serviceType === 'hotel' &&
        appliedForced.details.supplierId &&
        appliedForced.details.checkIn &&
        appliedForced.details.checkOut
      ) {
        void api<{
          products?: Array<{ remaining: number; name: string }>;
          message?: string;
        }>(
          `/inventory/availability?supplierId=${encodeURIComponent(
            appliedForced.details.supplierId,
          )}&from=${encodeURIComponent(appliedForced.details.checkIn)}&to=${encodeURIComponent(
            appliedForced.details.checkOut,
          )}`,
        )
          .then((avail) => {
            const note = formatHotelAllotmentNote({
              products: avail.products,
              message: avail.message,
              roomsRequested: appliedForced.details.rooms,
            });
            setAllotmentNote(note);
            const stamped = withAllotmentProvenance(
              appliedForced.rateProvenance,
              note,
            );
            if (stamped) {
              setRateProvenance(stamped);
              onSave({
                id: line.id,
                rateProvenance: stamped,
              });
            }
          })
          .catch(() => {
            /* soft cue only */
          });
      }
    } catch (e) {
      if (!auto) toastError(e instanceof Error ? e.message : 'Rate match failed');
    } finally {
      setMatching(false);
    }
  }

  const matchFingerprint = rateMatchFingerprint(serviceType, details);

  useEffect(() => {
    if (!open || serviceType !== 'hotel') {
      return;
    }
    const supplierId = details.supplierId;
    const checkIn = details.checkIn;
    const checkOut = details.checkOut;
    if (!supplierId || !checkIn || !checkOut) {
      setAllotmentNote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const avail = await api<{
          products?: Array<{ remaining: number; name: string }>;
          message?: string;
        }>(
          `/inventory/availability?supplierId=${encodeURIComponent(
            supplierId,
          )}&from=${encodeURIComponent(checkIn)}&to=${encodeURIComponent(checkOut)}`,
        );
        if (cancelled) return;
        setAllotmentNote(
          formatHotelAllotmentNote({
            products: avail.products,
            message: avail.message,
            roomsRequested: details.rooms,
          }),
        );
      } catch {
        if (!cancelled) setAllotmentNote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    serviceType,
    details.supplierId,
    details.checkIn,
    details.checkOut,
    details.rooms,
  ]);

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
  const canMatch = showHotel || showTransfer || showActivity;
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
        : showActivity && activityValidation.matchBlockedReasons.length > 0
          ? `Match rate unavailable: ${activityValidation.matchBlockedReasons.join(', ')}.`
          : null;
  const matchHint =
    matchPrereqBlocked ||
    ((showHotel || showTransfer || showActivity) && lastMatchFailure
      ? lastMatchFailure
      : null);
  // Only disable for missing prerequisites or in-flight match — never for a prior failed attempt.
  const matchDisabled =
    matching ||
    Boolean(showHotel && hotelValidation.matchBlockedReasons.length > 0) ||
    Boolean(showTransfer && transferValidation.matchBlockedReasons.length > 0) ||
    Boolean(showActivity && activityValidation.matchBlockedReasons.length > 0);
  const saveBlockedStale =
    (showHotel || showTransfer || showActivity) &&
    rateMatchStale &&
    !keepManualConfirmed;
  const staleBuyLabel =
    staleBuyUnit != null
      ? formatCurrency(staleBuyUnit)
      : buyUnit != null
        ? formatCurrency(buyUnit)
        : 'previous buy rate';
  const matchAccepted =
    lastMatchExplain?.accepted.length
      ? lastMatchExplain.accepted
      : rateProvenance?.matchSummary
        ? [rateProvenance.matchSummary]
        : [];
  const matchRejected = lastMatchExplain?.rejected ?? [];
  const reverseCorridorHint =
    lastMatchFailure || !matchedRateId
      ? transferReverseCorridorHint(matchRejected)
      : null;

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
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {attentionQueue && attentionQueue.total > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mr-auto cursor-pointer"
                  disabled={!attentionQueue.nextId}
                  onClick={() => goNextAttentionIssue()}
                >
                  {attentionQueue.nextId
                    ? `Next issue · ${attentionQueue.index || 1} of ${attentionQueue.total}`
                    : `Done · ${attentionQueue.total} of ${attentionQueue.total}`}
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
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
                {attentionQueue && attentionQueue.total > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="cursor-pointer"
                    disabled={
                      !attentionQueue.nextId ||
                      (showHotel && !hotelValidation.ok) ||
                      (showTransfer && !transferValidation.ok) ||
                      (showActivity && !activityValidation.ok) ||
                      saveBlockedStale
                    }
                    title={
                      attentionQueue.nextId
                        ? 'Save this line and open the next issue'
                        : 'No further issues'
                    }
                    onClick={() => goNextAttentionIssue()}
                  >
                    {attentionQueue.nextId
                      ? `Save & next · ${attentionQueue.index || 1} of ${attentionQueue.total}`
                      : `Done · ${attentionQueue.total} of ${attentionQueue.total}`}
                  </Button>
                ) : null}
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
                  onClick={() => save()}
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
                      ...(id !== details.supplierId
                        ? { roomType: undefined, roomProductId: undefined }
                        : {}),
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
              {(() => {
                const note = formatHotelWeekendNightNote(
                  rateProvenance?.calculation,
                  {
                    formatAmount: (n) =>
                      formatCurrency(n, {
                        currency: rateProvenance?.currency || currency,
                        maximumFractionDigits: 0,
                      }),
                  },
                );
                return note ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Weekend · {note}
                  </p>
                ) : null;
              })()}
              {(() => {
                const note = formatHotelDateSupplementNote(
                  rateProvenance?.calculation,
                  {
                    formatAmount: (n) =>
                      formatCurrency(n, {
                        currency: rateProvenance?.currency || currency,
                        maximumFractionDigits: 0,
                      }),
                  },
                );
                return note ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Gala · {note}
                  </p>
                ) : null;
              })()}
              <FormGrid>
                <FormField
                  label="Room type"
                  description={
                    details.supplierId
                      ? 'Rooms from this supplier’s rate chart (must match to price).'
                      : 'Pick a supplier first to see contracted room types.'
                  }
                >
                  <EntityCombobox
                    value={details.roomType || ''}
                    selectedLabel={details.roomType}
                    disabled={readOnly}
                    onChange={(name) => {
                      const key =
                        details.supplierId && name
                          ? `${details.supplierId}:${name.toLowerCase()}`
                          : '';
                      patchDetails({
                        roomType: name || undefined,
                        roomProductId: key
                          ? supplierRoomProductByKey.get(key)
                          : undefined,
                      });
                    }}
                    onSearch={searchHotelRooms}
                    placeholder={
                      details.supplierId
                        ? 'Deluxe mountain view, Heritage suite…'
                        : 'Select supplier first…'
                    }
                    emptyText={
                      details.supplierId
                        ? 'No rooms on this supplier’s rate chart'
                        : 'Select a supplier to load rate-chart rooms'
                    }
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
              {allotmentNote ? (
                <div
                  className={
                    hotelAllotmentTone(allotmentNote) === 'block'
                      ? 'space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                      : 'rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground'
                  }
                >
                  <p>Allotment · {allotmentNote}</p>
                  {!readOnly &&
                  hotelAllotmentBlocksSend(
                    rateProvenance ?? {
                      allotmentNote,
                      allotmentWarn: true,
                    },
                  ) ? (
                    <div className="space-y-2">
                      {canOverrideInventoryRisk ? (
                        <>
                          <Input
                            placeholder="Reason for sending anyway…"
                            value={allotmentAckReason}
                            onChange={(e) => setAllotmentAckReason(e.target.value)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!allotmentAckReason.trim() || !quotationVersionId}
                            onClick={() => void recordInventoryRiskAck('allotment')}
                          >
                            Send anyway (acknowledge)
                          </Button>
                        </>
                      ) : (
                        <p className="text-[11px] text-destructive/90">
                          Ask a manager with inventory_risk.approve to acknowledge this
                          shortfall before send.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(() => {
                const note = formatHotelCancellationNote(
                  rateProvenance?.calculation?.cancellationSummary,
                  { fallback: details.cancellationPolicy },
                );
                return note ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Cancel · {note}
                  </p>
                ) : null;
              })()}
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
                      patchDetails({
                        children,
                        childAges: trimChildAgesForChildrenCount(
                          children,
                          details.childAges,
                        ),
                        childrenWithoutBed: clampHotelChildrenWithoutBed(
                          children,
                          details.childrenWithoutBed,
                        ),
                      });
                    }}
                  />
                </FormField>
              </FormGrid>
              {(() => {
                const note = formatHotelOccupancyExtraNote(
                  rateProvenance?.calculation,
                  {
                    formatAmount: (n) =>
                      formatCurrency(n, {
                        currency: rateProvenance?.currency || currency,
                        maximumFractionDigits: 0,
                      }),
                  },
                );
                return note ? (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Occupancy · {note}
                  </p>
                ) : null;
              })()}
              {(() => {
                const note = formatActivityChildAgeNote(
                  activityChildAgeCalcFromProvenance({
                    calculation: rateProvenance?.calculation,
                  }),
                );
                return note ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                    Ages · {note}
                  </p>
                ) : null;
              })()}
              {(details.children ?? 0) > 0 ? (
                <>
                  <FormField
                    label="Child ages"
                    description={`Exactly ${details.children} age${details.children === 1 ? '' : 's'}, each 0–17 · ages above the rate card child max are priced as adults`}
                    error={
                      hotelValidation.errors.find(
                        (e) =>
                          e.toLowerCase().includes('child age') ||
                          e.toLowerCase().includes('child ages'),
                      ) || undefined
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
                  <FormField
                    label="Children without bed"
                    description={`0–${details.children} · remaining children priced with bed when the rate chart has extras`}
                    error={
                      hotelValidation.errors.find((e) =>
                        e.toLowerCase().includes('without bed'),
                      ) || undefined
                    }
                  >
                    <NumberField
                      disabled={readOnly}
                      min={0}
                      max={Math.max(0, Math.round(details.children ?? 0))}
                      value={details.childrenWithoutBed ?? ''}
                      onChange={(raw) => {
                        if (raw === '') {
                          patchDetails({ childrenWithoutBed: undefined });
                          return;
                        }
                        patchDetails({
                          childrenWithoutBed: clampHotelChildrenWithoutBed(
                            details.children,
                            Number(raw),
                          ),
                        });
                      }}
                      quickPicks={
                        (details.children ?? 0) >= 1
                          ? Array.from(
                              {
                                length:
                                  Math.min(3, Math.round(details.children ?? 0)) + 1,
                              },
                              (_, i) => i,
                            )
                          : undefined
                      }
                      allowDeselect
                    />
                  </FormField>
                </>
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
                  <div className="mt-1 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-foreground">Matched rate</p>
                      <p className="font-medium">
                        {[
                          details.roomType || rateProvenance?.roomType,
                          details.mealPlan || rateProvenance?.mealPlan,
                        ]
                          .filter(Boolean)
                          .join(' · ') || details.rateLabel}
                      </p>
                      {rateProvenance?.contractTitle ? (
                        <p className="text-muted-foreground">
                          {rateProvenance.contractTitle}
                          {rateProvenance.contractVersionNumber != null
                            ? ` · Contract v${rateProvenance.contractVersionNumber}`
                            : ''}
                        </p>
                      ) : rateProvenanceSourceLabel(rateProvenance) ||
                        details.rateSupplierLabel ? (
                        <p className="text-muted-foreground">
                          Source:{' '}
                          {rateProvenanceSourceLabel(rateProvenance) ||
                            details.rateSupplierLabel}
                        </p>
                      ) : null}
                      {details.checkIn || details.nights ? (
                        <p className="text-muted-foreground">
                          {[
                            details.checkIn
                              ? details.nights
                                ? `${details.checkIn} · ${details.nights} night${details.nights === 1 ? '' : 's'}`
                                : details.checkIn
                              : null,
                            details.rooms
                              ? `${details.rooms} room${details.rooms === 1 ? '' : 's'}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : rateProvenance?.startDate || rateProvenance?.endDate ? (
                        <p className="text-muted-foreground">
                          Season:{' '}
                          {rateProvenance?.startDate || '…'}
                          {' → '}
                          {rateProvenance?.endDate || '…'}
                        </p>
                      ) : null}
                    </div>
                    {(() => {
                      const chartAt = formatRateTimestamp(
                        rateProvenance?.rateUpdatedAt || details.rateLastUpdated,
                      );
                      const matchedAt = formatRateTimestamp(rateProvenance?.matchedAt);
                      if (!chartAt && !matchedAt) return null;
                      return (
                        <p className="text-xs text-muted-foreground">
                          {[
                            chartAt ? `Chart last updated ${chartAt}` : null,
                            matchedAt ? `Matched ${matchedAt}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      );
                    })()}
                    {chartDriftUpdatedAt && !rateMatchStale ? (
                      <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-950 dark:text-amber-100">
                        <p>
                          Rate chart changed since this line was matched
                          {formatRateTimestamp(chartDriftUpdatedAt)
                            ? ` (${formatRateTimestamp(chartDriftUpdatedAt)})`
                            : ''}
                          . Rematch to refresh buy, or acknowledge to keep the current buy
                          before send.
                        </p>
                        {!readOnly ? (
                          <div className="space-y-2">
                            {canOverrideRateDrift ? (
                              <>
                                <Input
                                  placeholder="Reason for keeping current buy…"
                                  value={rateDriftAckReason}
                                  onChange={(e) => setRateDriftAckReason(e.target.value)}
                                />
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={matching}
                                    onClick={() => void matchRate()}
                                  >
                                    {matching ? 'Matching…' : 'Rematch'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!rateDriftAckReason.trim()}
                                    onClick={() => void acknowledgeRateDrift()}
                                  >
                                    Keep buy (acknowledge)
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={matching}
                                    onClick={() => void matchRate()}
                                  >
                                    {matching ? 'Matching…' : 'Rematch'}
                                  </Button>
                                </div>
                                <p className="text-[11px] text-amber-950/80 dark:text-amber-100/80">
                                  Ask a manager with rate_drift.approve to keep the
                                  current buy, or rematch yourself.
                                </p>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {rateProvenance?.calculation ? (
                      <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs tabular-nums text-muted-foreground">
                        {rateProvenance.calculation.weekdayNights != null &&
                        rateProvenance.calculation.weekdayUnit != null ? (
                          <p>
                            {rateProvenance.calculation.weekdayNights} weekday night
                            {rateProvenance.calculation.weekdayNights === 1 ? '' : 's'}{' '}
                            ×{' '}
                            {formatCurrency(rateProvenance.calculation.weekdayUnit, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                            {rateProvenance.calculation.rooms != null &&
                            rateProvenance.calculation.rooms > 1
                              ? ` × ${rateProvenance.calculation.rooms} rooms`
                              : ''}
                          </p>
                        ) : null}
                        {rateProvenance.calculation.weekendNights != null &&
                        rateProvenance.calculation.weekendNights > 0 &&
                        rateProvenance.calculation.weekendUnit != null ? (
                          <p>
                            {rateProvenance.calculation.weekendNights} weekend night
                            {rateProvenance.calculation.weekendNights === 1 ? '' : 's'}{' '}
                            ×{' '}
                            {formatCurrency(rateProvenance.calculation.weekendUnit, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                            {rateProvenance.calculation.rooms != null &&
                            rateProvenance.calculation.rooms > 1
                              ? ` × ${rateProvenance.calculation.rooms} rooms`
                              : ''}
                          </p>
                        ) : null}
                        {rateProvenance.calculation.occupancyExtraTotal != null &&
                        rateProvenance.calculation.occupancyExtraTotal > 0 ? (
                          <p>
                            Occupancy extras{' '}
                            {formatCurrency(rateProvenance.calculation.occupancyExtraTotal, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                            {rateProvenance.calculation.extraAdultCount
                              ? ` · ${rateProvenance.calculation.extraAdultCount} extra adult${
                                  rateProvenance.calculation.extraAdultCount === 1 ? '' : 's'
                                }`
                              : ''}
                            {rateProvenance.calculation.childWithBedCount
                              ? ` · ${rateProvenance.calculation.childWithBedCount} child w/ bed`
                              : ''}
                            {rateProvenance.calculation.childWithoutBedCount
                              ? ` · ${rateProvenance.calculation.childWithoutBedCount} child w/o bed`
                              : ''}
                          </p>
                        ) : null}
                        {rateProvenance.calculation.dateSupplementTotal != null &&
                        rateProvenance.calculation.dateSupplementTotal > 0 ? (
                          <p>
                            Date supplements{' '}
                            {formatCurrency(rateProvenance.calculation.dateSupplementTotal, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        ) : null}
                        {rateProvenance.calculation.cancellationSummary ? (
                          <p>Cancel: {rateProvenance.calculation.cancellationSummary}</p>
                        ) : null}
                        {rateProvenance.calculation.totalBuy != null ? (
                          <p className="mt-0.5 font-medium text-foreground">
                            Total buy:{' '}
                            {formatCurrency(rateProvenance.calculation.totalBuy, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        ) : rateProvenance.unitCostAtMatch != null ? (
                          <p className="mt-0.5 font-medium text-foreground">
                            Buy at match:{' '}
                            {formatCurrency(rateProvenance.unitCostAtMatch, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}
                            /night
                          </p>
                        ) : null}
                      </div>
                    ) : rateProvenance?.unitCostAtMatch != null ? (
                      <p className="tabular-nums text-muted-foreground">
                        Buy at match:{' '}
                        {formatCurrency(rateProvenance.unitCostAtMatch, {
                          currency: rateProvenance.currency || currency,
                          maximumFractionDigits: 0,
                        })}
                        /night
                        {rateProvenance.weekendUnitCost != null
                          ? ` · weekend ${formatCurrency(rateProvenance.weekendUnitCost, {
                              currency: rateProvenance.currency || currency,
                              maximumFractionDigits: 0,
                            })}`
                          : ''}
                      </p>
                    ) : null}
                    {matchAccepted.length ? (
                      <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs">
                        <p className="font-medium text-foreground">Why selected</p>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {matchAccepted.map((reason) => (
                            <li key={reason}>✓ {reason}</li>
                          ))}
                        </ul>
                        {matchRejected.length ? (
                          <DisclosureSection
                            title={`${matchRejected.length} other rate${matchRejected.length === 1 ? '' : 's'} considered`}
                            level="none"
                            defaultOpen={false}
                            className="mt-2 border-0 bg-transparent"
                          >
                            <ul className="space-y-1 text-muted-foreground">
                              {matchRejected.map((row, i) => (
                                <li key={row.rateId || `${row.label}-${i}`}>
                                  <span className="font-medium text-foreground">
                                    {row.label}
                                  </span>
                                  {' — '}
                                  {row.reason}
                                </li>
                              ))}
                            </ul>
                          </DisclosureSection>
                        ) : null}
                      </div>
                    ) : null}
                    {(() => {
                      const href = rateChartPath({
                        rateKind: 'hotel',
                        supplierId: details.supplierId,
                        provenance: rateProvenance,
                      });
                      if (!href) return null;
                      return (
                        <Button
                          type="button"
                          size="sm"
                          variant="link"
                          className="h-auto px-0 py-1 text-xs"
                          onClick={() => navigate(href)}
                        >
                          Open supplier rate chart
                        </Button>
                      );
                    })()}
                  </div>
                ) : lastMatchFailure && !rateMatchStale ? (
                  <div className="mt-1 space-y-2">
                    <MatchBlockReasonBanner
                      blockReason={lastMatchBlockReason}
                      message={lastMatchFailure}
                      supplierId={details.supplierId}
                      readOnly={readOnly}
                      onOpenContracts={navigate}
                    />
                    {!lastMatchBlockReason &&
                    matchAccepted.some((a) =>
                      a.toLowerCase().includes('manual rate'),
                    ) ? (
                      <p className="text-xs text-muted-foreground">
                        Manual or on-request pricing remains allowed.
                      </p>
                    ) : null}
                    {matchRejected.length || matchAccepted.length ? (
                      <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs">
                        {matchAccepted.length ? (
                          <>
                            <p className="font-medium text-foreground">Match notes</p>
                            <ul className="mt-1 space-y-0.5 text-muted-foreground">
                              {matchAccepted.map((reason) => (
                                <li key={reason}>• {reason}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {matchRejected.length ? (
                          <DisclosureSection
                            title={`${matchRejected.length} rate${matchRejected.length === 1 ? '' : 's'} considered`}
                            level="none"
                            defaultOpen={false}
                            className="mt-2 border-0 bg-transparent"
                          >
                            <ul className="space-y-1 text-muted-foreground">
                              {matchRejected.map((row, i) => (
                                <li key={row.rateId || `${row.label}-${i}`}>
                                  <span className="font-medium text-foreground">
                                    {row.label}
                                  </span>
                                  {' — '}
                                  {row.reason}
                                </li>
                              ))}
                            </ul>
                          </DisclosureSection>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
              level="advanced"
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
              {reverseCorridorHint ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  <p className="text-xs">Corridor · {reverseCorridorHint}</p>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2 cursor-pointer"
                      disabled={matching}
                      onClick={() => {
                        const next = swapTransferEnds(details);
                        setDetails(next);
                        void matchRate({ detailsOverride: next });
                      }}
                    >
                      Swap From/To
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
                <FormField label="Adults">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.adults ?? ''}
                    onChange={(e) => {
                      const adults =
                        e.target.value === ''
                          ? undefined
                          : Math.max(0, Number(e.target.value));
                      const party =
                        Math.max(0, Number(adults) || 0) +
                        Math.max(0, Number(details.children) || 0);
                      const live = bumpAndRestampTransferCapacity({
                        provenance: rateProvenance,
                        party,
                        vehicles: details.vehicles,
                      });
                      patchDetails({
                        adults,
                        ...(live.bumped
                          ? {
                              vehicles: live.vehicles,
                              unusualVehiclesConfirmed: undefined,
                            }
                          : {}),
                      });
                      setCapacityNote(live.note);
                      if (live.provenance) setRateProvenance(live.provenance);
                      if (live.bumped) {
                        toastSuccess(
                          `Vehicles set to ${live.vehicles} for party of ${party}`,
                        );
                        if (!details.sellManual) {
                          const buy = parseMoney(unitCost);
                          const nextDetails = {
                            ...details,
                            adults,
                            vehicles: live.vehicles,
                          };
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
                      }
                    }}
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
                      const party =
                        Math.max(0, Number(details.adults) || 0) +
                        Math.max(0, Number(children) || 0);
                      const live = bumpAndRestampTransferCapacity({
                        provenance: rateProvenance,
                        party,
                        vehicles: details.vehicles,
                      });
                      const nextAges = trimChildAgesForChildrenCount(
                        children,
                        details.childAges,
                      );
                      patchDetails({
                        children,
                        childAges: nextAges,
                        ...(live.bumped
                          ? {
                              vehicles: live.vehicles,
                              unusualVehiclesConfirmed: undefined,
                            }
                          : {}),
                      });
                      setCapacityNote(live.note);
                      if (live.provenance) setRateProvenance(live.provenance);
                      if (live.bumped) {
                        toastSuccess(
                          `Vehicles set to ${live.vehicles} for party of ${party}`,
                        );
                        if (!details.sellManual) {
                          const buy = parseMoney(unitCost);
                          const nextDetails = {
                            ...details,
                            children,
                            childAges: nextAges,
                            vehicles: live.vehicles,
                          };
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
                      }
                    }}
                  />
                </FormField>
                <FormField
                  label="Infants"
                  description="Used when child ages are empty — ages below the fare card min count as infants on Match"
                >
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={details.infants ?? ''}
                    onChange={(e) => {
                      const infants =
                        e.target.value === ''
                          ? undefined
                          : Math.max(0, Number(e.target.value));
                      patchDetails({ infants });
                    }}
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
                        const live = restampTransferCapacity({
                          provenance: rateProvenance,
                          party:
                            Math.max(0, Number(details.adults) || 0) +
                            Math.max(0, Number(details.children) || 0),
                          vehicles: 1,
                        });
                        setCapacityNote(live.note);
                        if (live.provenance) setRateProvenance(live.provenance);
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      patchDetails({
                        vehicles: n,
                        unusualVehiclesConfirmed: undefined,
                      });
                      const live = restampTransferCapacity({
                        provenance: rateProvenance,
                        party:
                          Math.max(0, Number(details.adults) || 0) +
                          Math.max(0, Number(details.children) || 0),
                        vehicles: n,
                      });
                      setCapacityNote(live.note);
                      if (live.provenance) setRateProvenance(live.provenance);
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
              {(details.children ?? 0) > 0 ? (
                <FormField
                  label="Child ages"
                  description="Comma-separated ages (0–17) — below card min → infant; above max → adult on per-adult Match"
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
                      patchDetails({
                        childAges: trimChildAgesForChildrenCount(
                          details.children,
                          ages.length ? ages : undefined,
                        ),
                      });
                    }}
                  />
                </FormField>
              ) : null}
              {(() => {
                const note = formatActivityChildAgeNote(
                  activityChildAgeCalcFromProvenance({
                    calculation: rateProvenance?.calculation,
                  }),
                );
                return note ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                    Ages · {note}
                  </p>
                ) : null;
              })()}
              {(() => {
                const infants = Math.max(
                  0,
                  Math.round(
                    Number(
                      rateProvenance?.calculation?.infantsCharged ??
                        rateProvenance?.calculation?.infants ??
                        rateProvenance?.calculation?.partyInfants ??
                        details.infants,
                    ) || 0,
                  ),
                );
                const infantUnit = Number(
                  rateProvenance?.calculation?.infantUnit,
                );
                if (infants <= 0 || !Number.isFinite(infantUnit)) return null;
                const fromAges =
                  rateProvenance?.calculation?.usedChildAges === true;
                return (
                  <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Infants · {infants} @ ₹{infantUnit}
                    {fromAges ? ' (from ages)' : ''}
                  </p>
                );
              })()}
              {capacityNote ? (
                <div
                  className={
                    transferCapacityTone(capacityNote) === 'block'
                      ? 'space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                      : 'rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground'
                  }
                >
                  <p>Capacity · {capacityNote}</p>
                  {!readOnly &&
                  transferCapacityBlocksSend(
                    rateProvenance ?? {
                      capacityNote,
                      capacityWarn: true,
                    },
                  ) ? (
                    <div className="space-y-2">
                      {canOverrideInventoryRisk ? (
                        <>
                          <Input
                            placeholder="Reason for sending anyway…"
                            value={capacityAckReason}
                            onChange={(e) => setCapacityAckReason(e.target.value)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!capacityAckReason.trim() || !quotationVersionId}
                            onClick={() => void recordInventoryRiskAck('capacity')}
                          >
                            Send anyway (acknowledge)
                          </Button>
                        </>
                      ) : (
                        <p className="text-[11px] text-destructive/90">
                          Ask a manager with inventory_risk.approve to acknowledge this
                          shortfall before send.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                    {rateProvenanceSourceLabel(rateProvenance) ||
                    details.supplierName ||
                    details.rateSupplierLabel ? (
                      <p className="text-muted-foreground">
                        Source:{' '}
                        {rateProvenanceSourceLabel(rateProvenance) ||
                          details.supplierName ||
                          details.rateSupplierLabel}
                      </p>
                    ) : null}
                    {rateProvenance?.startDate || rateProvenance?.endDate || details.rateValidTo ? (
                      <p className="text-muted-foreground">
                        Season:{' '}
                        {rateProvenance?.startDate || details.rateValidFrom || '…'}
                        {' → '}
                        {rateProvenance?.endDate || details.rateValidTo || '…'}
                      </p>
                    ) : null}
                    {(() => {
                      const chartAt = formatRateTimestamp(
                        rateProvenance?.rateUpdatedAt || details.rateLastUpdated,
                      );
                      const matchedAt = formatRateTimestamp(rateProvenance?.matchedAt);
                      if (!chartAt && !matchedAt) return null;
                      return (
                        <p className="text-xs text-muted-foreground">
                          {[
                            chartAt ? `Chart last updated ${chartAt}` : null,
                            matchedAt ? `Matched ${matchedAt}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      );
                    })()}
                    {chartDriftUpdatedAt && !rateMatchStale ? (
                      <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-950 dark:text-amber-100">
                        <p>
                          Rate chart changed since this line was matched
                          {formatRateTimestamp(chartDriftUpdatedAt)
                            ? ` (${formatRateTimestamp(chartDriftUpdatedAt)})`
                            : ''}
                          . Rematch to refresh buy, or acknowledge to keep the current buy
                          before send.
                        </p>
                        {!readOnly ? (
                          <div className="space-y-2">
                            {canOverrideRateDrift ? (
                              <>
                                <Input
                                  placeholder="Reason for keeping current buy…"
                                  value={rateDriftAckReason}
                                  onChange={(e) => setRateDriftAckReason(e.target.value)}
                                />
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={matching}
                                    onClick={() => void matchRate()}
                                  >
                                    {matching ? 'Matching…' : 'Rematch'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!rateDriftAckReason.trim()}
                                    onClick={() => void acknowledgeRateDrift()}
                                  >
                                    Keep buy (acknowledge)
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={matching}
                                    onClick={() => void matchRate()}
                                  >
                                    {matching ? 'Matching…' : 'Rematch'}
                                  </Button>
                                </div>
                                <p className="text-[11px] text-amber-950/80 dark:text-amber-100/80">
                                  Ask a manager with rate_drift.approve to keep the
                                  current buy, or rematch yourself.
                                </p>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {rateProvenance?.unitCostAtMatch != null ? (
                      <p className="tabular-nums text-muted-foreground">
                        Buy at match:{' '}
                        {formatCurrency(rateProvenance.unitCostAtMatch, {
                          currency: rateProvenance.currency || currency,
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    ) : buyUnit != null ? (
                      <p className="tabular-nums text-muted-foreground">
                        {formatCurrency(buyUnit)} per vehicle/transfer
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="h-auto px-0 py-1 text-xs"
                      onClick={() => navigate('/rates')}
                    >
                      Open catalog & transfers
                    </Button>
                  </div>
                ) : lastMatchFailure && !rateMatchStale ? (
                  <div className="mt-1 space-y-2">
                    <MatchBlockReasonBanner
                      blockReason={lastMatchBlockReason}
                      message={lastMatchFailure}
                      supplierId={details.supplierId}
                      readOnly={readOnly}
                      onOpenContracts={navigate}
                    />
                  </div>
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
              level="advanced"
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
                  onSearch={searchExperienceSuppliers}
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
                    onChange={(e) => {
                      const children =
                        e.target.value === ''
                          ? undefined
                          : Math.max(0, Number(e.target.value));
                      patchDetails({
                        children,
                        childAges: trimChildAgesForChildrenCount(
                          children,
                          details.childAges,
                        ),
                      });
                    }}
                  />
                </FormField>
                <FormField
                  label="Child ages"
                  description="Comma-separated; ages outside the rate card window pay adult"
                  className="sm:col-span-2"
                >
                  <Input
                    disabled={readOnly}
                    placeholder="e.g. 5, 9"
                    value={(details.childAges || []).join(', ')}
                    onChange={(e) => {
                      const ages = e.target.value
                        .split(/[,\s]+/)
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .map(Number)
                        .filter((n) => Number.isFinite(n));
                      patchDetails({ childAges: ages.length ? ages : undefined });
                    }}
                  />
                </FormField>
              </FormGrid>
              {(() => {
                const note = formatActivityChildAgeNote(
                  activityChildAgeCalcFromProvenance({
                    calculation: rateProvenance?.calculation,
                  }),
                );
                return note ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                    Ages · {note}
                  </p>
                ) : null;
              })()}
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
                Match an activity rate card (adult / optional child) or enter buy per person
                manually. Sell follows markup unless you override.
              </p>
              {details.priceSource === 'matched' && details.rateLabel && !rateMatchStale ? (
                <p className="text-xs text-muted-foreground">
                  Matched: {details.rateLabel}
                  {details.rateSupplierLabel ? ` · ${details.rateSupplierLabel}` : ''}
                </p>
              ) : null}
              {rateMatchStale && !keepManualConfirmed ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Rate match outdated — rematch or keep the previous buy as manual.
                </p>
              ) : null}
              {lastMatchFailure && !rateMatchStale ? (
                <MatchBlockReasonBanner
                  blockReason={lastMatchBlockReason}
                  message={lastMatchFailure}
                  supplierId={details.supplierId}
                  readOnly={readOnly}
                  onOpenContracts={navigate}
                />
              ) : null}
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
