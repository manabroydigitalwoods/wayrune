import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MoreHorizontal,
  Plane,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Combobox,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  Input,
  PageHeader,
  PriceField,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastError,
  toastSuccess,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatTime,
} from '@travel/ui';
import { api, apiBlob } from '../api';
import { useAuth } from '../auth';
import { usePermissions } from '../lib/permissions';
import { TRIP_STATUS_OPTIONS, tripStatusLabel } from '../lib/agencyStatusLabels';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useProgressiveDisclosure } from '../hooks/useProgressiveDisclosure';
import { DisclosureSection } from '../components/agency/DisclosureSection';
import { trackExperienceEvent } from '../lib/progressiveComplexity';
import { leadOutcomeMessage, type LeadOutcome } from '../lib/lead-outcome';
import {
  placeName,
  placeRefsFromJson,
  toPlaceRef,
  type PlaceRef,
} from '../lib/placeRefs';
import { PlaceMultiPicker } from '../components/places/PlacePicker';
import { OperationsPanel } from '../components/trips/OperationsPanel';
import { FinancePanel } from '../components/trips/FinancePanel';
import { TripClosurePanel } from '../components/trips/TripClosurePanel';
import { TripTimeline } from '../components/trips/TripTimeline';
import {
  emptyItineraryStory,
  ensureItineraryDays,
  ItineraryBuilder,
  type ItineraryDay,
  type ItineraryStory,
} from '../components/trips/ItineraryBuilder';

const EDITABLE_QUOTE_STATUSES = new Set(['draft', 'pending_approval']);
/** Locked commercial versions that can be copied into a new draft via “Save as new version”. */
const REVISABLE_QUOTE_STATUSES = new Set([
  'approved',
  'sent',
  'rejected',
  'expired',
]);

type QuoteAction =
  | 'requestApproval'
  | 'approve'
  | 'reject'
  | 'send'
  | 'accept'
  | 'edit'
  | 'revise'
  | 'addLines';

function quoteActionsForStatus(status: string | null | undefined): Set<QuoteAction> {
  switch (status) {
    case 'draft':
      return new Set(['requestApproval', 'send', 'edit', 'addLines', 'revise']);
    case 'pending_approval':
      return new Set(['approve', 'reject', 'edit', 'addLines']);
    case 'approved':
      return new Set(['send', 'accept', 'revise']);
    case 'sent':
      return new Set(['accept', 'revise']);
    case 'rejected':
    case 'expired':
      return new Set(['revise']);
    default:
      return new Set();
  }
}

function quoteLineDescription(
  dayNumber: number,
  item: { title?: string; location?: unknown; type?: string },
): string {
  const title = (item.title || '').trim() || 'Item';
  const loc = placeName(item.location);
  const locPart =
    loc && !title.toLowerCase().includes(loc.toLowerCase()) ? ` · ${loc}` : '';
  return `Day ${dayNumber}: ${title}${locPart}`;
}

function pickActiveQuotation(
  quotations: Array<{ id: string; versions?: Array<{ id?: string; status: string; [key: string]: unknown }> }> | undefined,
  preferredId?: string | null,
) {
  if (!quotations?.length) return null;
  if (preferredId) {
    const found = quotations.find((q) => q.id === preferredId);
    if (found) return found;
  }
  const editable = quotations.find((q) =>
    (q.versions || []).some((v) => EDITABLE_QUOTE_STATUSES.has(v.status)),
  );
  return editable || quotations[0] || null;
}

/** Number cell that replaces a leading 0 when typing (focus selects all; strips leading zeros). */
function QuoteNumberInput({
  value,
  onChange,
  className,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <PriceField
      showCurrency={false}
      className={className}
      disabled={disabled}
      value={Number.isFinite(value) ? String(value) : ''}
      onChange={(raw) => {
        if (raw === '' || raw === '-') {
          onChange(0);
          return;
        }
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

type QuoteLine = {
  id: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitSell: number;
  taxPercent: number;
  pricingUnit: string;
  rateKind?: 'hotel' | 'transfer';
  rateId?: string;
  /** True when hotel/transfer had no matching rate card. */
  rateUnmatched?: boolean;
};

const QUOTE_PRICING_UNITS = new Set(['per_person', 'per_room', 'per_service', 'package']);

function sanitizeQuoteDescription(raw: unknown): string {
  return String(raw || 'Line')
    .replace(/\s*[·(-]\s*\[object Object\]\)?/gi, '')
    .replace(/\s*\[object Object\]/gi, '')
    .trim() || 'Line';
}

function quoteLinesFromVersion(version: {
  id?: string;
  itemsJson?: unknown;
} | null): QuoteLine[] {
  const raw = Array.isArray(version?.itemsJson) ? version.itemsJson : [];
  return raw.map((item: any, i: number) => ({
    id: String(item.id || `line-${version?.id || 'x'}-${i}`),
    description: sanitizeQuoteDescription(item.description),
    quantity: Number(item.quantity) || 0,
    unitCost: Number(item.unitCost) || 0,
    unitSell: Number(item.unitSell) || 0,
    taxPercent: Number(item.taxPercent) || 0,
    pricingUnit: QUOTE_PRICING_UNITS.has(item.pricingUnit) ? item.pricingUnit : 'per_service',
    rateKind:
      item.rateKind === 'hotel' || item.rateKind === 'transfer'
        ? item.rateKind
        : undefined,
    rateId: typeof item.rateId === 'string' ? item.rateId : undefined,
    rateUnmatched: Boolean(item.rateUnmatched),
  }));
}

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

const EMPTY_QUOTE_LINES: QuoteLine[] = [];

const TRIP_STATUSES = [...TRIP_STATUS_OPTIONS];

const TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  travellers: 'Travellers',
  itinerary: 'Itinerary',
  quotations: 'Quotations',
  operations: 'Operations',
  finance: 'Finance',
  commerce: 'Changes & incidents',
  timeline: 'Timeline',
};

const STATUS_GUIDANCE: Record<string, string> = {
  planning: 'Build the itinerary, then create a quotation.',
  quoted: 'Send the quote or request approval.',
  awaiting_approval: 'Waiting on client or internal approval.',
  confirmed: 'Move into bookings and readiness in Operations.',
  booking_in_progress: 'Confirm suppliers and vouchers before departure.',
  ready_to_travel: 'Trip is ready — mark In progress when travellers depart.',
  in_progress: 'Trip is underway. Capture payments and feedback when done.',
  completed: 'Trip finished — review finance and client feedback.',
  cancelled: 'This trip was cancelled.',
};

export function TripWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [trip, setTrip] = useState<any>(null);
  const [tripLoadError, setTripLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [story, setStory] = useState<ItineraryStory>(emptyItineraryStory());
  const [itineraryLock, setItineraryLock] = useState<number | null>(null);
  const [itinerarySaveState, setItinerarySaveState] = useState<
    'idle' | 'pending' | 'saving' | 'saved' | 'error'
  >('idle');
  const [itinerarySavedAt, setItinerarySavedAt] = useState<Date | null>(null);
  const itineraryHydrated = useRef(false);
  const itinerarySavingRef = useRef(false);
  const itineraryNeedsResaveRef = useRef(false);
  const daysRef = useRef(days);
  const storyRef = useRef(story);
  const lockRef = useRef(itineraryLock);
  daysRef.current = days;
  storyRef.current = story;
  lockRef.current = itineraryLock;
  const [travellerOpen, setTravellerOpen] = useState(false);
  const [travellerName, setTravellerName] = useState('');
  const [travellerType, setTravellerType] = useState('adult');
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [savingItinerary, setSavingItinerary] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteLine[]>(EMPTY_QUOTE_LINES);
  const [quoteMeta, setQuoteMeta] = useState({
    inclusions: '',
    exclusions: '',
    terms: '',
  });
  const quoteMetaRef = useRef(quoteMeta);
  quoteMetaRef.current = quoteMeta;
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  const selectedQuotationIdRef = useRef<string | null>(null);
  selectedQuotationIdRef.current = selectedQuotationId;
  const [selectedQuoteVersionId, setSelectedQuoteVersionId] = useState<string | null>(null);
  const selectedQuoteVersionIdRef = useRef<string | null>(null);
  selectedQuoteVersionIdRef.current = selectedQuoteVersionId;
  const [quoteSaveState, setQuoteSaveState] = useState<
    'idle' | 'pending' | 'saving' | 'saved' | 'error'
  >('idle');
  const [quoteSavedAt, setQuoteSavedAt] = useState<Date | null>(null);
  const [savingQuoteCheckpoint, setSavingQuoteCheckpoint] = useState(false);
  const quoteHydrated = useRef(false);
  const quoteItemsRef = useRef(quoteItems);
  quoteItemsRef.current = quoteItems;
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const canViewCost = me?.permissions.includes('quote.view_cost');
  const quoteCostDisclosure = useProgressiveDisclosure('advanced');
  const [quoteCostOpen, setQuoteCostOpen] = useState(quoteCostDisclosure.defaultOpen);
  const canApproveQuote = me?.permissions.includes('quote.approve');
  const { has } = usePermissions();
  const canTripWrite = has('trip.write');
  const canItinerary = has('itinerary.edit');
  const canQuoteWrite = has('quote.write');
  const canQuoteRead = has('quote.read');
  const dmcWorkspace = me?.organization.kind === 'dmc';
  useDocumentTitle(trip ? `${trip.tripNumber} · ${trip.title}` : dmcWorkspace ? 'Package' : 'Trip');

  function changeTab(next: string) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== tab) setTab(t);
  }, [searchParams]);

  async function load() {
    try {
      setTripLoadError(null);
      itineraryHydrated.current = false;
      const data = await api<any>(`/trips/${id}`);
      setTrip(data);
      const latest = data.itineraries?.[0]?.versions?.[0];
      const content = latest?.contentJson as
        | { days?: ItineraryDay[]; story?: ItineraryStory }
        | undefined;
      const rawDays = content?.days;
      const ensuredDays = ensureItineraryDays(rawDays, data.startDate);
      const needsPersistEmptyDraft = !rawDays?.length;
      setDays(ensuredDays);
      setStory({
        ...emptyItineraryStory(),
        ...(content?.story || {}),
        highlights: content?.story?.highlights || [],
        packingTips: content?.story?.packingTips || [],
        packingCategories: {
          clothing: content?.story?.packingCategories?.clothing || [],
          electronics: content?.story?.packingCategories?.electronics || [],
          documents: content?.story?.packingCategories?.documents || [],
          medicine: content?.story?.packingCategories?.medicine || [],
        },
        faqs: content?.story?.faqs || [],
        paymentSchedule: content?.story?.paymentSchedule || [],
      });
      setItineraryLock(latest?.versionLock ?? null);
      lockRef.current = latest?.versionLock ?? null;
      setItinerarySaveState('idle');
      setItinerarySavedAt(latest ? new Date(latest.createdAt) : null);

      const activeQ = pickActiveQuotation(
        data.quotations,
        selectedQuotationIdRef.current,
      );
      setSelectedQuotationId(activeQ?.id ?? null);
      const quoteVersions = activeQ?.versions || [];
      const prevId = selectedQuoteVersionIdRef.current;
      const keep = prevId && quoteVersions.some((v: any) => v.id === prevId) ? prevId : null;
      const target =
        (keep ? quoteVersions.find((v: any) => v.id === keep) : null) ||
        quoteVersions.find((v: any) => EDITABLE_QUOTE_STATUSES.has(v.status)) ||
        quoteVersions[0] ||
        null;
      quoteHydrated.current = false;
      setSelectedQuoteVersionId(target?.id ?? null);
      setQuoteItems(target ? quoteLinesFromVersion(target as any) : EMPTY_QUOTE_LINES);
      setQuoteMeta({
        inclusions: String(target?.inclusions || ''),
        exclusions: String(target?.exclusions || ''),
        terms: String(target?.terms || ''),
      });
      setQuoteSaveState('idle');
      setQuoteSavedAt(
        target && typeof target.updatedAt === 'string'
          ? new Date(target.updatedAt)
          : null,
      );

      // Mark hydrated, then persist synthetic default days when DB draft was empty
      // (days-effect alone can miss the hydrate race and leave preview blank).
      requestAnimationFrame(() => {
        itineraryHydrated.current = true;
        quoteHydrated.current = true;
        if (needsPersistEmptyDraft && canItinerary) {
          setItinerarySaveState('pending');
          window.setTimeout(() => {
            void autosaveItinerary();
          }, 400);
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load trip';
      setTripLoadError(msg);
      toastError(msg);
    }
  }

  async function saveTripDestinations(next: PlaceRef[]) {
    if (!id) return;
    try {
      const updated = await api<any>(`/trips/${id}/destinations`, {
        method: 'PATCH',
        body: JSON.stringify({ destinations: next }),
      });
      setTrip((t: any) => (t ? { ...t, destinationsJson: updated.destinationsJson } : t));
      toastSuccess('Destinations updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update destinations');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const autosaveItinerary = useCallback(async () => {
    if (!id) return;
    if (!canItinerary) return;
    if (itinerarySavingRef.current) {
      itineraryNeedsResaveRef.current = true;
      setItinerarySaveState('pending');
      return;
    }
    itinerarySavingRef.current = true;
    itineraryNeedsResaveRef.current = false;
    setItinerarySaveState('saving');

    const runSave = async (allowConflictRetry: boolean): Promise<void> => {
      const snapshot = JSON.stringify({
        days: daysRef.current,
        story: storyRef.current,
      });
      try {
        const version = await api<{
          id: string;
          versionNumber: number;
          versionLock: number;
          createdAt: string;
        }>(`/trips/${id}/itinerary-versions/autosave`, {
          method: 'POST',
          body: JSON.stringify({
            label: 'Draft',
            days: daysRef.current,
            story: storyRef.current,
            expectedLock: lockRef.current ?? undefined,
          }),
        });
        // Keep lock in sync before any follow-up save (state update is async).
        lockRef.current = version.versionLock;
        setItineraryLock(version.versionLock);
        setItinerarySavedAt(new Date());
        setTrip((prev: any) => {
          if (!prev?.itineraries?.[0]) return prev;
          const itin = prev.itineraries[0];
          const versions = [...(itin.versions || [])];
          const idx = versions.findIndex((v: any) => v.id === version.id);
          if (idx >= 0) versions[idx] = { ...versions[idx], ...version };
          else versions.unshift(version);
          return {
            ...prev,
            itineraries: [{ ...itin, versions }],
          };
        });
      } catch (e) {
        const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 0;
        if (allowConflictRetry && status === 409) {
          const data = await api<{
            itineraries?: Array<{ versions?: Array<{ versionLock?: number }> }>;
          }>(`/trips/${id}`);
          const latestLock = data.itineraries?.[0]?.versions?.[0]?.versionLock;
          if (typeof latestLock === 'number') {
            lockRef.current = latestLock;
            setItineraryLock(latestLock);
          }
          await runSave(false);
          return;
        }
        throw e;
      }

      const stillDirty =
        itineraryNeedsResaveRef.current ||
        JSON.stringify({ days: daysRef.current, story: storyRef.current }) !== snapshot;
      itineraryNeedsResaveRef.current = false;
      if (stillDirty) {
        setItinerarySaveState('saving');
        await runSave(true);
      }
    };

    try {
      await runSave(true);
      setItinerarySaveState('saved');
    } catch (e) {
      setItinerarySaveState('error');
      toastError(e instanceof Error ? e.message : 'Could not auto-save itinerary');
    } finally {
      itinerarySavingRef.current = false;
      if (itineraryNeedsResaveRef.current) {
        itineraryNeedsResaveRef.current = false;
        void autosaveItinerary();
      }
    }
  }, [id, canItinerary]);

  useEffect(() => {
    if (!itineraryHydrated.current) return;
    if (!canItinerary) return;
    setItinerarySaveState('pending');
    const t = window.setTimeout(() => {
      void autosaveItinerary();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [days, story, autosaveItinerary, canItinerary]);

  const autosaveQuote = useCallback(async () => {
    if (!id) return;
    if (!canQuoteWrite) return;
    const currentTrip = tripRef.current;
    const activeQ = pickActiveQuotation(
      currentTrip?.quotations,
      selectedQuotationIdRef.current,
    );
    const versions = (activeQ?.versions || []) as Array<{
      id: string;
      status: string;
    }>;
    const selected =
      versions.find((v) => v.id === selectedQuoteVersionIdRef.current) || versions[0];
    if (selected?.status === 'accepted' || selected?.status === 'superseded') return;
    // Do not invent a quotation from an empty form.
    if (!activeQ && quoteItemsRef.current.length === 0) return;
    if (selected && !EDITABLE_QUOTE_STATUSES.has(selected.status)) return;

    setQuoteSaveState('saving');
    const snapshot = JSON.stringify({
      items: quoteItemsRef.current,
      meta: quoteMetaRef.current,
    });
    const allowedUnits = new Set(['per_person', 'per_room', 'per_service', 'package']);
    const items = quoteItemsRef.current.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitSell: item.unitSell,
      taxPercent: item.taxPercent,
      pricingUnit: allowedUnits.has(item.pricingUnit) ? item.pricingUnit : 'per_service',
      ...(item.rateKind ? { rateKind: item.rateKind } : {}),
      ...(item.rateId ? { rateId: item.rateId } : {}),
    }));
    const orgCurrency = (currentTrip?.organization?.currency ||
      me?.organization?.currency ||
      'INR') as string;

    try {
      let quotationId = activeQ?.id as string | undefined;
      let quotationRecord: { id: string; versions?: unknown[] } | null = activeQ
        ? { id: activeQ.id, versions: activeQ.versions }
        : null;
      if (!quotationId) {
        const created = await api<{ id: string; versions?: unknown[] }>(
          `/trips/${id}/quotations`,
          { method: 'POST' },
        );
        quotationRecord = created;
        quotationId = created.id;
        setSelectedQuotationId(quotationId);
      }
      const version = await api<{
        id: string;
        versionNumber: number;
        status: string;
        sellTotal?: number | string;
        marginPercent?: number | string;
        itemsJson?: unknown;
        costHidden?: boolean;
        updatedAt?: string;
        inclusions?: string | null;
        exclusions?: string | null;
        terms?: string | null;
      }>(`/trips/${id}/quotations/${quotationId}/versions/autosave`, {
        method: 'POST',
        body: JSON.stringify({
          currency: orgCurrency,
          items,
          discountTotal: 0,
          versionId: selectedQuoteVersionIdRef.current,
          inclusions: quoteMetaRef.current.inclusions || null,
          exclusions: quoteMetaRef.current.exclusions || null,
          terms: quoteMetaRef.current.terms || null,
        }),
      });
      setSelectedQuoteVersionId(version.id);
      setQuoteSavedAt(new Date());
      setTrip((prev: any) => {
        if (!prev) return prev;
        let quotations = [...(prev.quotations || [])];
        const qi = quotations.findIndex((q: any) => q.id === quotationId);
        if (qi < 0) {
          quotations = [{ ...(quotationRecord || { id: quotationId }), versions: [version] }, ...quotations];
        } else {
          const q = quotations[qi];
          const nextVersions = [...(q.versions || [])];
          const idx = nextVersions.findIndex((v: any) => v.id === version.id);
          if (idx >= 0) nextVersions[idx] = { ...nextVersions[idx], ...version };
          else nextVersions.unshift(version);
          quotations[qi] = { ...q, versions: nextVersions };
        }
        return { ...prev, quotations };
      });
      if (
        JSON.stringify({ items: quoteItemsRef.current, meta: quoteMetaRef.current }) !== snapshot
      ) {
        setQuoteSaveState('pending');
        void autosaveQuote();
        return;
      }
      setQuoteSaveState('saved');
    } catch (e) {
      setQuoteSaveState('error');
      toastError(e instanceof Error ? e.message : 'Could not auto-save quote');
    }
  }, [id, me?.organization?.currency, canQuoteWrite]);

  useEffect(() => {
    if (!quoteHydrated.current) return;
    if (!canQuoteWrite) return;
    const activeQ = pickActiveQuotation(
      tripRef.current?.quotations,
      selectedQuotationIdRef.current,
    );
    const versions = (activeQ?.versions || []) as Array<{
      id: string;
      status: string;
    }>;
    const selected =
      versions.find((v) => v.id === selectedQuoteVersionIdRef.current) || versions[0];
    if (selected?.status === 'accepted' || selected?.status === 'superseded') return;
    if (!activeQ && quoteItems.length === 0) return;
    if (selected && !EDITABLE_QUOTE_STATUSES.has(selected.status)) return;

    setQuoteSaveState('pending');
    const t = window.setTimeout(() => {
      void autosaveQuote();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [quoteItems, quoteMeta, autosaveQuote, canQuoteWrite]);

  async function saveItineraryCheckpoint() {
    setSavingItinerary(true);
    try {
      const version = await api<{
        id: string;
        versionNumber: number;
        versionLock: number;
      }>(`/trips/${id}/itinerary-versions`, {
        method: 'POST',
        body: JSON.stringify({
          label: `Checkpoint`,
          days: daysRef.current,
          story: storyRef.current,
          expectedLock: lockRef.current ?? undefined,
        }),
      });
      lockRef.current = version.versionLock;
      setItineraryLock(version.versionLock);
      setItinerarySaveState('saved');
      setItinerarySavedAt(new Date());
      toastSuccess(`Checkpoint saved as v${version.versionNumber}`);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save itinerary checkpoint');
    } finally {
      setSavingItinerary(false);
    }
  }

  const sellTotal = useMemo(
    () => quoteItems.reduce((s, i) => s + i.quantity * i.unitSell * (1 + i.taxPercent / 100), 0),
    [quoteItems],
  );
  const costTotal = quoteItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const taxTotal = quoteItems.reduce(
    (s, i) => s + i.quantity * i.unitSell * (i.taxPercent / 100),
    0,
  );
  const marginAmount = sellTotal - costTotal;
  const marginPercent = sellTotal > 0 ? (marginAmount / sellTotal) * 100 : 0;

  const destinations = placeRefsFromJson(trip?.destinationsJson);
  const destinationsLabel = destinations.map((d) => d.name).join(', ');
  const dateRange = formatDateRange(trip?.startDate, trip?.endDate);
  const travellerCount = trip?.travellers?.length ?? 0;
  const activeQuotation = pickActiveQuotation(trip?.quotations, selectedQuotationId);
  const quoteVersions = (activeQuotation?.versions || []) as Array<{
    id: string;
    versionNumber: number;
    status: string;
    sellTotal?: number | string;
    marginPercent?: number | string;
    costHidden?: boolean;
    itemsJson?: unknown;
    currency?: string;
    inclusions?: string | null;
    exclusions?: string | null;
    terms?: string | null;
  }>;
  const selectedQuoteVersion =
    quoteVersions.find((v) => v.id === selectedQuoteVersionId) || quoteVersions[0] || null;
  const quoteStatus = selectedQuoteVersion?.status || null;
  const quoteCan = quoteActionsForStatus(quoteStatus);
  const quoteReadOnly = Boolean(
    !canQuoteWrite ||
      (selectedQuoteVersion &&
        (selectedQuoteVersion.status === 'accepted' ||
          selectedQuoteVersion.status === 'superseded' ||
          !EDITABLE_QUOTE_STATUSES.has(selectedQuoteVersion.status))),
  );
  const canReviseLockedVersion = Boolean(
    selectedQuoteVersion &&
      (REVISABLE_QUOTE_STATUSES.has(selectedQuoteVersion.status) ||
        quoteCan.has('revise')),
  );
  const hasAcceptedQuote = (trip?.quotations || []).some((q: any) =>
    (q.versions || []).some((v: any) => v.status === 'accepted'),
  );
  const latestQuote = selectedQuoteVersion || quoteVersions[0] || null;
  const metaParts = [
    destinationsLabel || null,
    dateRange,
    trip?.party?.displayName ? `Client: ${trip.party.displayName}` : null,
    trip?.inquiry?.inquiryNumber ? `Inquiry: ${trip.inquiry.inquiryNumber}` : null,
  ].filter(Boolean);

  function selectQuoteVersion(version: (typeof quoteVersions)[0]) {
    quoteHydrated.current = false;
    setSelectedQuoteVersionId(version.id);
    setQuoteItems(quoteLinesFromVersion(version));
    setQuoteSaveState('idle');
    setQuoteSavedAt(null);
    requestAnimationFrame(() => {
      quoteHydrated.current = true;
    });
  }

  function requireSelectedQuoteVersion() {
    if (!selectedQuoteVersion) {
      toastError('Save a quote version first');
      return null;
    }
    return selectedQuoteVersion;
  }

  async function addTraveller() {
    try {
      await api(`/trips/${id}/travellers`, {
        method: 'POST',
        body: JSON.stringify({ fullName: travellerName, type: travellerType, isLead: true }),
      });
      setTravellerOpen(false);
      setTravellerName('');
      toastSuccess('Traveller added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add traveller');
    }
  }

  async function createAndSaveQuote() {
    if (quoteItems.length === 0) {
      toastError('Add at least one quote line first');
      return;
    }
    const allowedUnits = new Set(['per_person', 'per_room', 'per_service', 'package']);
    const items = quoteItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitSell: item.unitSell,
      taxPercent: item.taxPercent,
      pricingUnit: allowedUnits.has(item.pricingUnit) ? item.pricingUnit : 'per_service',
      ...(item.rateKind ? { rateKind: item.rateKind } : {}),
      ...(item.rateId ? { rateId: item.rateId } : {}),
    }));
    const latest = selectedQuoteVersion;
    const orgCurrency = (trip?.organization?.currency ||
      me?.organization?.currency ||
      'INR') as string;
    setSavingQuoteCheckpoint(true);
    try {
      let quotationId =
        pickActiveQuotation(trip.quotations, selectedQuotationId)?.id ?? null;
      if (!quotationId) {
        const created = await api<{ id: string }>(`/trips/${id}/quotations`, {
          method: 'POST',
        });
        quotationId = created.id;
      }
      setSelectedQuotationId(quotationId);
      const version = await api<{ id: string; versionNumber: number }>(
        `/trips/${id}/quotations/${quotationId}/versions`,
        {
          method: 'POST',
          body: JSON.stringify({
            currency: latest?.currency || orgCurrency,
            items,
            inclusions: quoteMeta.inclusions || latest?.inclusions || null,
            exclusions: quoteMeta.exclusions || latest?.exclusions || null,
            terms: quoteMeta.terms || latest?.terms || null,
            discountTotal: 0,
          }),
        },
      );
      toastSuccess(
        quoteReadOnly && canReviseLockedVersion
          ? `New draft v${version.versionNumber} created from this quote`
          : `Quote saved as v${version.versionNumber}`,
      );
      selectedQuoteVersionIdRef.current = version.id;
      setSelectedQuoteVersionId(version.id);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save quote');
    } finally {
      setSavingQuoteCheckpoint(false);
    }
  }

  async function reviseFromAccepted() {
    try {
      const quotation = await api<{
        id: string;
        versions?: Array<{ id: string; label?: string | null }>;
        resumed?: boolean;
      }>(`/trips/${id}/quotations/from-accepted`, { method: 'POST' });
      setSelectedQuotationId(quotation.id);
      selectedQuoteVersionIdRef.current = quotation.versions?.[0]?.id ?? null;
      setSelectedQuoteVersionId(quotation.versions?.[0]?.id ?? null);
      toastSuccess(
        quotation.resumed
          ? 'Resumed existing revision draft'
          : 'New draft quotation created from accepted quote',
      );
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not revise quote');
    }
  }

  function selectQuotation(quotationId: string) {
    const q = (trip?.quotations || []).find((x: any) => x.id === quotationId);
    if (!q) return;
    setSelectedQuotationId(quotationId);
    const versions = (q.versions || []) as Array<{
      id: string;
      status: string;
      inclusions?: string | null;
      exclusions?: string | null;
      terms?: string | null;
    }>;
    const target =
      versions.find((v) => EDITABLE_QUOTE_STATUSES.has(v.status)) || versions[0] || null;
    quoteHydrated.current = false;
    setSelectedQuoteVersionId(target?.id ?? null);
    setQuoteItems(target ? quoteLinesFromVersion(target) : EMPTY_QUOTE_LINES);
    setQuoteMeta({
      inclusions: String(target?.inclusions || ''),
      exclusions: String(target?.exclusions || ''),
      terms: String(target?.terms || ''),
    });
    setQuoteSaveState('idle');
    setQuoteSavedAt(null);
    requestAnimationFrame(() => {
      quoteHydrated.current = true;
    });
  }

  async function approveQuote() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      await api(`/quotations/${version.id}/approve`, { method: 'POST' });
      toastSuccess('Quote approved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not approve quote');
    }
  }

  async function rejectQuote() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      await api(`/quotations/${version.id}/reject`, { method: 'POST' });
      toastSuccess('Quote rejected');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not reject quote');
    }
  }

  async function acceptLatest() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    setAccepting(true);
    try {
      const res = await api<{ leadOutcome?: LeadOutcome }>(`/quotations/${version.id}/accept`, {
        method: 'POST',
      });
      setAcceptOpen(false);
      toastSuccess(leadOutcomeMessage(res.leadOutcome, 'Quote accepted · Trip confirmed'));
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not accept quote');
    } finally {
      setAccepting(false);
    }
  }

  async function updateTripStatus(status: string, cancellationReason?: string) {
    if (status === 'cancelled' && !cancellationReason?.trim()) {
      setCancelOpen(true);
      return;
    }
    try {
      await api(`/trips/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, cancellationReason }),
      });
      toastSuccess(`Trip status: ${status.replace(/_/g, ' ')}`);
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update status');
    }
  }

  async function addQuoteLinesFromItinerary() {
    const pending: Array<{
      line: QuoteLine;
      resolveItem?: {
        itemId: string;
        type: string;
        date?: string | null;
        details?: Record<string, unknown>;
      };
    }> = [];
    for (const day of days) {
      for (const item of day.items || []) {
        if (item.customerVisible === false) continue;
        if (item.type === 'note' || item.type === 'free_time') continue;
        const type = item.type === 'activity' ? 'sightseeing' : item.type;
        const pricingUnit =
          type === 'hotel'
            ? 'per_room'
            : type === 'meal' || type === 'sightseeing'
              ? 'per_person'
              : 'per_service';
        const lineId = `itin-${item.id}`;
        const line: QuoteLine = {
          id: lineId,
          description: quoteLineDescription(day.dayNumber, item),
          quantity: 1,
          unitCost: 0,
          unitSell: 0,
          taxPercent: 0,
          pricingUnit,
        };
        if (type === 'hotel' || type === 'transfer') {
          pending.push({
            line,
            resolveItem: {
              itemId: lineId,
              type,
              date: day.date || trip?.startDate || null,
              details: {
                supplierId: item.details?.supplierId,
                placeId:
                  item.details?.catalogPlaceId ||
                  toPlaceRef(item.location)?.placeId ||
                  toPlaceRef(day.destination)?.placeId ||
                  undefined,
                roomType: item.details?.roomType,
                nights: item.details?.nights,
                vehicleTypeId: item.details?.vehicleTypeId,
                fromPlaceId: item.details?.fromPlaceId,
                toPlaceId: item.details?.toPlaceId,
              },
            },
          });
        } else {
          pending.push({ line });
        }
      }
    }
    if (!pending.length) {
      toastError('Add itinerary items first');
      return;
    }
    const existing = new Set(quoteItems.map((p) => p.id));
    const freshPending = pending.filter((p) => !existing.has(p.line.id));
    if (!freshPending.length) {
      toastError('Those itinerary items are already on the quote');
      changeTab('quotations');
      return;
    }

    const toResolve = freshPending
      .map((p) => p.resolveItem)
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    let resolveMap = new Map<string, RateResolveRow>();
    const partyAdults = Number(trip?.inquiry?.adults) || 0;
    const partyChildren = Number(trip?.inquiry?.children) || 0;
    const partyInfants = Number(trip?.inquiry?.infants) || 0;
    if (toResolve.length) {
      try {
        const res = await api<{
          items: RateResolveRow[];
          matchedCount: number;
          unmatchedCount: number;
        }>('/rates/resolve', {
          method: 'POST',
          body: JSON.stringify({
            startDate: trip?.startDate || undefined,
            adults: partyAdults || undefined,
            children: partyChildren || undefined,
            infants: partyInfants || undefined,
            items: toResolve,
          }),
        });
        resolveMap = new Map(res.items.map((r) => [r.itemId, r]));
      } catch (e) {
        toastError(
          e instanceof Error ? e.message : 'Could not price from rate directory',
        );
      }
    }

    let matched = 0;
    let unmatched = 0;
    let partyPriced = 0;
    const fresh = freshPending.map(({ line, resolveItem }) => {
      if (!resolveItem) return line;
      const hit = resolveMap.get(line.id);
      if (!hit) {
        unmatched += 1;
        return { ...line, rateKind: resolveItem.type as 'hotel' | 'transfer', rateUnmatched: true };
      }
      if (hit.matched) {
        matched += 1;
        if (
          hit.rateMeta &&
          typeof hit.rateMeta === 'object' &&
          (hit.rateMeta as { pricingMode?: string }).pricingMode === 'per_adult'
        ) {
          partyPriced += 1;
        }
      } else unmatched += 1;
      return {
        ...line,
        quantity: hit.quantity || line.quantity,
        unitCost: hit.unitCost,
        unitSell: hit.unitSell,
        taxPercent: hit.taxPercent,
        pricingUnit: QUOTE_PRICING_UNITS.has(hit.pricingUnit)
          ? hit.pricingUnit
          : line.pricingUnit,
        rateKind: hit.rateKind || undefined,
        rateId: hit.rateId || undefined,
        rateUnmatched: !hit.matched,
      };
    });

    setQuoteItems((prev) => [...prev, ...fresh]);
    const pricedNote =
      toResolve.length > 0
        ? ` · ${matched} priced from rates${unmatched ? ` · ${unmatched} unmatched` : ''}${
            partyPriced
              ? ` · ${partyPriced} party-based`
              : ''
          }`
        : '';
    toastSuccess(`Added ${fresh.length} line(s) from itinerary${pricedNote}`);
    changeTab('quotations');
  }

  async function refreshPricesFromRates() {
    if (quoteReadOnly) {
      toastError('Switch to a draft version to refresh prices');
      return;
    }
    const pricedCandidates = quoteItems.filter(
      (line) =>
        line.rateKind === 'hotel' ||
        line.rateKind === 'transfer' ||
        line.id.startsWith('itin-'),
    );
    if (!pricedCandidates.length) {
      toastError('No hotel/transfer lines to refresh — add from itinerary first');
      return;
    }

    const resolveItems = pricedCandidates
      .map((line) => {
        const itinId = line.id.startsWith('itin-') ? line.id.slice(5) : null;
        let dayItem: { item: ItineraryDay['items'][0]; day: ItineraryDay } | null =
          null;
        if (itinId) {
          for (const day of days) {
            const item = (day.items || []).find((i) => i.id === itinId);
            if (item) {
              dayItem = { item, day };
              break;
            }
          }
        }
        if (!dayItem) return null;
        const type =
          dayItem.item.type === 'activity' ? 'sightseeing' : dayItem.item.type;
        if (type !== 'hotel' && type !== 'transfer') return null;
        return {
          itemId: line.id,
          type,
          date: dayItem.day.date || trip?.startDate || null,
          details: {
            supplierId: dayItem.item.details?.supplierId,
            placeId:
              dayItem.item.details?.catalogPlaceId ||
              toPlaceRef(dayItem.item.location)?.placeId ||
              toPlaceRef(dayItem.day.destination)?.placeId ||
              undefined,
            roomType: dayItem.item.details?.roomType,
            nights: dayItem.item.details?.nights,
            vehicleTypeId: dayItem.item.details?.vehicleTypeId,
            fromPlaceId: dayItem.item.details?.fromPlaceId,
            toPlaceId: dayItem.item.details?.toPlaceId,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (!resolveItems.length) {
      toastError('Could not match quote lines back to itinerary hotel/transfer items');
      return;
    }

    try {
      const res = await api<{
        items: RateResolveRow[];
        matchedCount: number;
        unmatchedCount: number;
      }>('/rates/resolve', {
        method: 'POST',
        body: JSON.stringify({
          startDate: trip?.startDate || undefined,
          adults: Number(trip?.inquiry?.adults) || undefined,
          children: Number(trip?.inquiry?.children) || undefined,
          infants: Number(trip?.inquiry?.infants) || undefined,
          items: resolveItems,
        }),
      });
      const map = new Map(res.items.map((r) => [r.itemId, r]));
      setQuoteItems((prev) =>
        prev.map((line) => {
          const hit = map.get(line.id);
          if (!hit) return line;
          if (!hit.matched) {
            return {
              ...line,
              rateKind: hit.rateKind || line.rateKind,
              rateId: undefined,
              rateUnmatched: true,
            };
          }
          return {
            ...line,
            quantity: hit.quantity || line.quantity,
            unitCost: hit.unitCost,
            unitSell: hit.unitSell,
            taxPercent: hit.taxPercent,
            pricingUnit: QUOTE_PRICING_UNITS.has(hit.pricingUnit)
              ? hit.pricingUnit
              : line.pricingUnit,
            rateKind: hit.rateKind || undefined,
            rateId: hit.rateId || undefined,
            rateUnmatched: false,
          };
        }),
      );
      toastSuccess(
        `Refreshed prices · ${res.matchedCount} matched${
          res.unmatchedCount ? ` · ${res.unmatchedCount} unmatched` : ''
        }`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not refresh prices');
    }
  }

  async function sendLatest() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    if (!sendEmail.trim()) {
      toastError('Enter a recipient email');
      return;
    }
    try {
      await api(`/quotations/${version.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ toEmail: sendEmail.trim() }),
      });
      toastSuccess('Email queued — PDF will be attached when delivered');
      setSendOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send quote');
    }
  }

  async function requestApproval() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      await api(`/quotations/${version.id}/request-approval`, { method: 'POST' });
      toastSuccess('Approval requested');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not request approval');
    }
  }

  async function pdfLatest() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      const res = await api<{
        documentId: string;
        contentUrl?: string;
        delivery?: string;
      }>(`/quotations/${version.id}/pdf`, {
        method: 'POST',
      });
      const contentPath = `/files/${res.documentId}/content`;
      const blob = await apiBlob(contentPath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-v${version.versionNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastSuccess('Branded proposal PDF downloaded');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not generate proposal');
    }
  }

  function updateQuoteLine(id: string, patch: Partial<(typeof quoteItems)[0]>) {
    setQuoteItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeQuoteLine(id: string) {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  }

  const travellerColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        size: 180,
        accessorFn: (r) => r.traveller?.fullName || '',
        cell: ({ row }) => (
          <span className="font-medium">{row.original.traveller?.fullName || '—'}</span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        size: 100,
        cell: ({ row }) => <StatusBadge value={row.original.traveller?.type || 'adult'} />,
      },
      {
        id: 'lead',
        header: 'Role',
        size: 120,
        cell: ({ row }) =>
          row.original.isLead ? (
            <StatusBadge value="qualified" label="Lead" tone="info" />
          ) : (
            <span className="text-muted-foreground">Companion</span>
          ),
      },
      {
        id: 'contact',
        header: 'Contact',
        size: 180,
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.traveller?.email || row.original.traveller?.phone || '—'}
          </span>
        ),
      },
    ],
    [],
  );

  const quoteColumns = useMemo<ColumnDef<(typeof quoteItems)[0]>[]>(
    () => [
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <Input
              value={row.original.description}
              disabled={quoteReadOnly}
              onChange={(e) =>
                updateQuoteLine(row.original.id, { description: e.target.value })
              }
            />
            {row.original.rateUnmatched ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                No rate card match
              </p>
            ) : row.original.rateId ? (
              <p className="text-[10px] text-muted-foreground">From rate directory</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        size: 80,
        cell: ({ row }) => (
          <QuoteNumberInput
            className="w-full"
            disabled={quoteReadOnly}
            value={row.original.quantity}
            onChange={(quantity) => updateQuoteLine(row.original.id, { quantity })}
          />
        ),
      },
      {
        accessorKey: 'unitSell',
        header: dmcWorkspace ? 'Sell (to buyer)' : 'Sell',
        size: 110,
        cell: ({ row }) => (
          <QuoteNumberInput
            className="w-full"
            disabled={quoteReadOnly}
            value={row.original.unitSell}
            onChange={(unitSell) => updateQuoteLine(row.original.id, { unitSell })}
          />
        ),
      },
      ...(canViewCost && quoteCostOpen
        ? [
            {
              accessorKey: 'unitCost',
              header: dmcWorkspace ? 'Net' : 'Cost',
              size: 110,
              cell: ({ row }: { row: { original: QuoteLine } }) => (
                <QuoteNumberInput
                  className="w-full"
                  disabled={quoteReadOnly}
                  value={row.original.unitCost}
                  onChange={(unitCost) => updateQuoteLine(row.original.id, { unitCost })}
                />
              ),
            } as ColumnDef<QuoteLine>,
          ]
        : []),
      {
        accessorKey: 'taxPercent',
        header: 'Tax %',
        size: 90,
        cell: ({ row }) => (
          <QuoteNumberInput
            className="w-full"
            disabled={quoteReadOnly}
            value={row.original.taxPercent}
            onChange={(taxPercent) => updateQuoteLine(row.original.id, { taxPercent })}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground"
            aria-label="Remove line"
            disabled={quoteReadOnly}
            onClick={() => removeQuoteLine(row.original.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ),
      },
    ],
    [canViewCost, quoteCostOpen, dmcWorkspace, quoteReadOnly],
  );

  if (tripLoadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{tripLoadError}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/trips')}>
            Back to trips
          </Button>
          <Button type="button" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  if (!trip) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Trips', onClick: () => navigate('/trips') },
          { label: trip.tripNumber },
        ]}
      />
      <PageHeader
        icon={Plane}
        title={`${trip.tripNumber} · ${trip.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {metaParts.length ? (
              metaParts.map((part, i) => (
                <span key={`${part}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 ? <span className="text-border">·</span> : null}
                  {typeof part === 'string' && part.startsWith('Client:') && trip.party?.id ? (
                    <Link className="text-primary hover:underline" to={`/parties/${trip.party.id}`}>
                      {trip.party.displayName}
                    </Link>
                  ) : typeof part === 'string' && part.startsWith('Inquiry:') && trip.inquiry?.id ? (
                    <Link className="text-primary hover:underline" to={`/inquiries/${trip.inquiry.id}`}>
                      {trip.inquiry.inquiryNumber}
                    </Link>
                  ) : (
                    <span>{part?.replace(/^Client:\s*/, '').replace(/^Inquiry:\s*/, '')}</span>
                  )}
                </span>
              ))
            ) : (
              <span>Destinations TBD</span>
            )}
          </span>
        }
        actions={
          canTripWrite ? (
            <Combobox
              className="w-56"
              value={trip.status}
              onChange={(status) => void updateTripStatus(status)}
              options={TRIP_STATUSES}
              placeholder="Trip status"
            />
          ) : (
            <StatusBadge
              value={trip.status}
              label={tripStatusLabel(trip.status)}
              showIcon
              size="md"
            />
          )
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {Object.entries(TAB_LABELS).map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {STATUS_GUIDANCE[trip.status] || 'Continue working this trip in the tabs below.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1.5">
                    <StatusBadge value={trip.status} label={tripStatusLabel(trip.status)} showIcon />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Travellers</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{travellerCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Latest quote</div>
                  <div className="mt-1.5">
                    {latestQuote ? (
                      <StatusBadge value={latestQuote.status} showIcon />
                    ) : (
                      <span className="text-sm text-muted-foreground">None yet</span>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Destinations</div>
                    {canTripWrite ? (
                      <PlaceMultiPicker
                        label="Trip places"
                        value={destinations}
                        onChange={(next) => void saveTripDestinations(next)}
                        placeholder="Add cities or regions…"
                      />
                    ) : (
                      <p className="text-sm text-foreground/90">{destinationsLabel || '—'}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="flex flex-wrap gap-2 p-4">
                {trip.party?.id ? (
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/parties/${trip.party.id}`}>Open client</Link>
                  </Button>
                ) : null}
                {trip.inquiry?.id ? (
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/inquiries/${trip.inquiry.id}`}>Open inquiry</Link>
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => changeTab('quotations')}>
                  Go to quotations
                </Button>
                <Button variant="secondary" size="sm" onClick={() => changeTab('operations')}>
                  Go to operations
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="travellers">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {travellerCount
                ? `${travellerCount} traveller${travellerCount === 1 ? '' : 's'}`
                : 'Add the lead traveller to start.'}
            </p>
            {canTripWrite ? (
              <Button onClick={() => setTravellerOpen(true)}>
                <UserPlus className="size-4" />
                Add traveller
              </Button>
            ) : null}
          </div>
          <DataTable
            columns={travellerColumns}
            data={trip.travellers || []}
            fillHeight={false}
            pageSize={25}
            searchKey={travellerCount ? 'name' : undefined}
            searchPlaceholder={travellerCount ? 'Search travellers…' : undefined}
            emptyTitle="No travellers"
            emptyDescription="Add the lead traveller to start."
          />
        </TabsContent>

        <TabsContent value="itinerary">
          <ItineraryBuilder
            tripId={id}
            days={days}
            onChange={setDays}
            story={story}
            onStoryChange={setStory}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            destinations={destinations}
            versions={trip.itineraries?.[0]?.versions || []}
            saving={savingItinerary}
            saveState={itinerarySaveState}
            savedAt={itinerarySavedAt}
            onSaveCheckpoint={() => void saveItineraryCheckpoint()}
            onPreparePreview={async () => {
              await autosaveItinerary();
            }}
            readOnly={!canItinerary}
            onRestoreVersion={async (versionId) => {
              const restored = await api<{
                id: string;
                versionNumber: number;
                versionLock: number;
                contentJson?: { days?: typeof days; story?: typeof story };
              }>(`/trips/${id}/itinerary-versions/${versionId}/restore`, {
                method: 'POST',
              });
              const content = restored.contentJson || {};
              if (Array.isArray(content.days)) setDays(content.days);
              if (content.story) setStory(content.story);
              lockRef.current = restored.versionLock;
              setItineraryLock(restored.versionLock);
              await load();
            }}
          />
        </TabsContent>

        <TabsContent value="quotations">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="rounded-xl border px-4 py-3 text-sm glass">
              <div className="font-medium tabular-nums">
                Sell {formatCurrency(sellTotal)}
                {taxTotal ? ` · tax ${formatCurrency(taxTotal)}` : ''}
              </div>
            </div>
            {canViewCost ? (
              <DisclosureSection
                title="Cost & margin"
                description="Line costs, markup, and margin — permissioned commercial detail."
                level="advanced"
                defaultOpen={quoteCostDisclosure.defaultOpen}
                open={quoteCostOpen}
                onOpenChange={(open) => {
                  setQuoteCostOpen(open);
                  if (open) trackExperienceEvent('advanced_section_opened', { surface: 'quotation' });
                }}
                className="min-w-[220px] flex-1"
              >
                <div className="text-sm tabular-nums">
                  Cost {formatCurrency(costTotal)} · margin {formatCurrency(marginAmount)} (
                  {formatPercent(marginPercent)})
                </div>
              </DisclosureSection>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {canQuoteWrite ? (
                <span
                  className={
                    quoteSaveState === 'error'
                      ? 'text-xs text-destructive'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {quoteReadOnly
                    ? 'Locked'
                    : quoteSaveState === 'pending'
                      ? 'Unsaved…'
                      : quoteSaveState === 'saving'
                        ? 'Saving…'
                        : quoteSaveState === 'saved'
                          ? `Saved${quoteSavedAt ? ` · ${formatTime(quoteSavedAt)}` : ''}`
                          : quoteSaveState === 'error'
                            ? 'Auto-save failed'
                            : 'Auto-saves drafts'}
                </span>
              ) : null}
              {canQuoteRead ? (
                <Button
                  variant="secondary"
                  onClick={() => void pdfLatest()}
                  disabled={!selectedQuoteVersion}
                >
                  Download proposal
                </Button>
              ) : null}
              {canQuoteWrite ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void addQuoteLinesFromItinerary()}
                    disabled={!quoteCan.has('addLines')}
                  >
                    Add from itinerary
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void refreshPricesFromRates()}
                    disabled={!quoteCan.has('addLines') || quoteItems.length === 0}
                  >
                    Refresh prices from rates
                  </Button>
                  <Button
                    onClick={() => void createAndSaveQuote()}
                    disabled={
                      savingQuoteCheckpoint ||
                      quoteItems.length === 0 ||
                      (!quoteCan.has('revise') && quoteReadOnly)
                    }
                  >
                    {savingQuoteCheckpoint
                      ? 'Saving…'
                      : quoteReadOnly && canReviseLockedVersion
                        ? 'Revise as new draft'
                        : 'Save as new version'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setAcceptOpen(true)}
                    disabled={!selectedQuoteVersion || !quoteCan.has('accept')}
                  >
                    Accept quote
                  </Button>
                  {quoteStatus === 'accepted' && hasAcceptedQuote ? (
                    <Button variant="secondary" onClick={() => void reviseFromAccepted()}>
                      Revise from accepted
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" aria-label="More quote actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        disabled={!quoteCan.has('send')}
                        onClick={() => setSendOpen(true)}
                      >
                        Send email
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!quoteCan.has('requestApproval')}
                        onClick={() => void requestApproval()}
                      >
                        Request approval
                      </DropdownMenuItem>
                      {canApproveQuote ? (
                        <>
                          <DropdownMenuItem
                            disabled={!quoteCan.has('approve')}
                            onClick={() => void approveQuote()}
                          >
                            Approve quote
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!quoteCan.has('reject')}
                            onClick={() => void rejectQuote()}
                          >
                            Reject quote
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!quoteCan.has('addLines')}
                        onClick={() =>
                          setQuoteItems([
                            ...quoteItems,
                            {
                              id: `line-${Date.now()}`,
                              description: 'New line',
                              quantity: 1,
                              unitCost: 0,
                              unitSell: 0,
                              taxPercent: 5,
                              pricingUnit: 'per_service',
                            },
                          ])
                        }
                      >
                        Add blank line
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : null}
            </div>
          </div>
          {(trip?.quotations?.length ?? 0) > 1 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Quotation</span>
              {(trip?.quotations || []).map((q: any) => {
                const active = activeQuotation?.id === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => selectQuotation(q.id)}
                    className={
                      active
                        ? 'rounded-lg border border-primary bg-primary/10 px-2.5 py-1 text-xs'
                        : 'rounded-xl border px-2.5 py-1 text-xs glass-row'
                    }
                  >
                    {q.quoteNumber}
                  </button>
                );
              })}
            </div>
          ) : null}
          {quoteVersions.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {quoteVersions.map((v) => {
                const active = selectedQuoteVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectQuoteVersion(v)}
                    className={
                      active
                        ? 'inline-flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs shadow-sm'
                        : 'inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs glass-row hover:border-primary/25'
                    }
                  >
                    <StatusBadge value={v.status} showIcon />
                    <span>
                      v{v.versionNumber} · sell {formatCurrency(v.sellTotal)}
                      {v.costHidden
                        ? ' · cost hidden'
                        : canViewCost
                          ? ` · margin ${formatPercent(v.marginPercent)}`
                          : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {quoteStatus === 'accepted' || quoteStatus === 'superseded' ? (
            <p className="mb-2 text-xs text-muted-foreground">
              This version is locked
              {quoteStatus === 'accepted'
                ? '. Use “Revise from accepted” to open a new draft quotation.'
                : '. Select another quotation or version to continue.'}
            </p>
          ) : quoteReadOnly && canReviseLockedVersion ? (
            <p className="mb-2 text-xs text-muted-foreground">
              This version is locked (
              {selectedQuoteVersion?.status.replace(/_/g, ' ')}). Use “Revise as new draft” to copy
              lines into a new editable draft on this quotation.
            </p>
          ) : selectedQuoteVersion ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Viewing v{selectedQuoteVersion.versionNumber} (
              {selectedQuoteVersion.status.replace(/_/g, ' ')}). Edits auto-save to this version;
              use “Save as new version” for a checkpoint.
              {quoteStatus === 'draft'
                ? ' Next: Request approval, or Send email / Accept after approval.'
                : quoteStatus === 'pending_approval'
                  ? ' Waiting on Approve or Reject.'
                  : ''}
            </p>
          ) : null}
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <FormField label="Inclusions">
              <Input
                value={quoteMeta.inclusions}
                disabled={quoteReadOnly}
                onChange={(e) => setQuoteMeta((m) => ({ ...m, inclusions: e.target.value }))}
                placeholder="Accommodation, breakfast…"
              />
            </FormField>
            <FormField label="Exclusions">
              <Input
                value={quoteMeta.exclusions}
                disabled={quoteReadOnly}
                onChange={(e) => setQuoteMeta((m) => ({ ...m, exclusions: e.target.value }))}
                placeholder="Flights, visas…"
              />
            </FormField>
            <FormField label="Terms">
              <Input
                value={quoteMeta.terms}
                disabled={quoteReadOnly}
                onChange={(e) => setQuoteMeta((m) => ({ ...m, terms: e.target.value }))}
                placeholder="Valid for 7 days…"
              />
            </FormField>
          </div>
          <DataTable
            columns={quoteColumns}
            data={quoteItems}
            fillHeight={false}
            pageSize={25}
            searchPlaceholder="Filter lines…"
          />
        </TabsContent>

        <TabsContent value="operations">
          <OperationsPanel tripId={trip.id} status={trip.status} onChanged={load} />
        </TabsContent>

        <TabsContent value="finance">
          <FinancePanel
            tripId={trip.id}
            tripStatus={trip.status}
            orgCurrency={trip.organization?.currency || 'INR'}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="commerce">
          <TripClosurePanel
            tripId={trip.id}
            tripStatus={trip.status}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <TripTimeline tripId={trip.id} />
        </TabsContent>
      </Tabs>

      <RecordSheet
        open={travellerOpen}
        onOpenChange={setTravellerOpen}
        title="Add traveller"
        submitLabel="Add"
        onSubmit={addTraveller}
      >
        <FormField label="Full name" required>
          <Input
            value={travellerName}
            onChange={(e) => setTravellerName(e.target.value)}
            placeholder="Full name"
            required
          />
        </FormField>
        <FormField label="Type">
          <SuggestionChips
            aria-label="Traveller type"
            allowDeselect={false}
            options={[
              { value: 'adult', label: 'Adult' },
              { value: 'child', label: 'Child' },
              { value: 'infant', label: 'Infant' },
            ]}
            value={travellerType}
            onChange={setTravellerType}
          />
        </FormField>
      </RecordSheet>

      <ConfirmDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="Accept this quote?"
        description="Accepted quotes become immutable. Continue only if the client has confirmed."
        confirmLabel="Accept quote"
        loading={accepting}
        onConfirm={acceptLatest}
      />

      <RecordDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Send quotation email"
        description="Queues an email with the proposal PDF attached. Delivery requires SMTP to be configured on the worker."
        submitLabel="Send email"
        onSubmit={() => void sendLatest()}
      >
        <FormField label="Recipient email" required>
          <EmailInput
            value={sendEmail}
            onChange={setSendEmail}
            placeholder={trip.party?.email || 'client@example.com'}
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel trip"
        description="Record why this trip was cancelled."
        submitLabel="Cancel trip"
        onSubmit={() => void updateTripStatus('cancelled', cancelReason.trim())}
      >
        <FormField label="Cancellation reason" required>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Client postponed indefinitely"
          />
        </FormField>
      </RecordDialog>
    </div>
  );
}
