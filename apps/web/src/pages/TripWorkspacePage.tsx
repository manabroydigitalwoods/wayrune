import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MoreHorizontal,
  PackagePlus,
  Plane,
  Plus,
  Send,
  UserPlus,
} from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Combobox,
  ConfirmDialog,
  Checkbox,
  DataTable,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmailInput,
  EmptyState,
  FormGrid,
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
  Textarea,
  toastError,
  toastSuccess,
  toastWarning,
  BrandTooltip,
  cn,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatTime,
} from '@wayrune/ui';
import {
  UpdateTripDatesSchema,
  tripTravelEndOnOrAfterStart,
} from '@wayrune/contracts';
import { api, apiBlob } from '../api';
import { formatDateInput, parseDateInput } from '../lib/dateInput';
import { useAuth } from '../auth';
import { usePermissions } from '../lib/permissions';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { TRIP_STATUS_OPTIONS, tripStatusLabel } from '../lib/agencyStatusLabels';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useProgressiveDisclosure } from '../hooks/useProgressiveDisclosure';
import {
  recommendedTabForTripStatus,
  tabAttentionCounts,
  tabLabelWithCue,
  type TripWorkspaceTab,
} from '../lib/tripWorkspaceTabs';
import { DisclosureSection } from '../components/agency/DisclosureSection';
import {
  FirstQuoteWalkthrough,
  dismissFirstQuoteWalkthrough,
} from '../components/agency/FirstQuoteWalkthrough';
import {
  formatAgencyFitPackToast,
  installAgencyFitPack,
} from '../lib/agencyFitPack';
import {
  HOTEL_NATIONALITY_OPTIONS,
  hotelNationalityLabelUi,
  normalizeHotelNationalityUi,
} from '../lib/hotelNationalityNote';
import {
  formatOrgTaxDisplaySplitLinesUi,
  formatOrgTaxIdentityLinesUi,
  inferredDestinationPosCueUi,
  orgTaxDisplaySplitCueUi,
  orgTaxTotalsLabelUi,
  parseOrgTaxIdentityUi,
} from '../lib/orgTaxIdentity';
import {
  canUseTemplateHistoryVersion,
  buildTemplateHistoryDiffRows,
  formatTemplateHistoryDiffLines,
  formatTemplateVersionWhen,
  showTemplateHistoryCue,
  showTemplateHistoryDiffCue,
  templateHistoryHasPriors,
  templateHistoryPriorActionsCue,
  type TemplateVersionListItem,
} from '../lib/quoteTemplateHistory';
import {
  buildFolderNav,
  folderPathSegments,
  normalizeTemplateFolderLabel,
  templateMatchesFolderFilter,
  templatesUnderFolder,
} from '../lib/quoteTemplateFolder';
import {
  parseTemplateTagsCsv,
  templateMatchesTagFilter,
} from '../lib/quoteTemplateTags';
import { trackExperienceEvent } from '../lib/progressiveComplexity';
import { leadOutcomeMessage, type LeadOutcome } from '../lib/lead-outcome';
import {
  placeName,
  placeRefsFromJson,
  toPlaceRef,
  type PlaceRef,
} from '../lib/placeRefs';
import { PlaceMultiPicker } from '../components/places/PlacePicker';
import { PackageFolderTree } from '../components/agency/PackageFolderTree';
import { OperationsPanel } from '../components/trips/OperationsPanel';
import { FinancePanel } from '../components/trips/FinancePanel';
import { TripControlCentre } from '../components/trips/TripControlCentre';
import { TripClosurePanel } from '../components/trips/TripClosurePanel';
import { TripTimeline } from '../components/trips/TripTimeline';
import { QuoteImportReviewDialog } from '../components/trips/QuoteImportReviewDialog';
import {
  QuoteServiceDetailSheet,
  seedDetailsFromItineraryItem,
} from '../components/trips/QuoteServiceDetailSheet';
import { ProposalNotesEditor } from '../components/trips/ProposalNotesEditor';
import {
  detailsFromImportCandidate,
  serviceTypeLabel,
  type QuoteImportCandidate,
} from '../lib/quoteImportFromItinerary';
import {
  detailsFromResolveRecord,
  parseQuoteServiceDetails,
  quoteServiceDetailsSummary,
  resolvePayloadFromQuoteDetails,
  applyRateResolveHit,
  rateBlockReasonLabel,
  rateBlockReasonMessage,
  parseQuoteRateProvenance,
  rateProvenanceSourceLabel,
  formatRateTimestamp,
  type QuoteRateProvenance,
  type QuoteServiceDetails,
} from '../lib/quoteServiceDetails';
import {
  clearQuoteLocalDraft,
  readQuoteLocalDraft,
  writeQuoteLocalDraft,
} from '../lib/quoteLocalDraft';
import { parseApplyChildAgesCsv } from '../lib/createTripFromPackage';
import {
  countMarginPolicyViolations,
  lineMarginPolicyViolation,
  parseMinMarginPercent,
} from '../lib/quoteMargin';
import {
  attentionLineIdsForReason,
  listQuoteAttentionLines,
  quoteAttentionQueueMeta,
  quoteAttentionReasonLabel,
} from '../lib/quoteAttentionLines';
import {
  partyMarkupPercentOverride,
  partyUsesAgentMarkup,
  resolveOrgMarkupPercent,
} from '../lib/orgMarkup';
import { normalizeTravellerType } from '../lib/travellerType';
import {
  type MarkupPreset,
  markupPresetSummary,
  resolveOrgMarkupPresets,
  sellFromMarkupPreset,
} from '../lib/markupPresets';
import {
  defaultValidUntilIso,
  formatValiditySendToastSuffix,
  isQuoteValidUntilExpired,
  quoteExpiredGraceCue,
  quoteNearExpiryToastMessage,
  quotePastGraceBlockCue,
  quoteValidityDaysFromSettings,
  quoteValidityGraceHoursFromSettings,
  shouldBlockSendPastGrace,
  syncTermsWithValidUntil,
} from '../lib/quoteValidity';
import {
  fxLockCoversQuote,
  normalizeCurrency,
  parseQuoteFxLock,
  QUOTE_FX_CURRENCY_OPTIONS,
  type QuoteFxLock,
} from '../lib/quoteFx';
import { formatLockFxRefreshCue } from '../lib/orgFxRefresh';
import {
  isWhatsappCloudConfigured,
  pickQuoteProposalTemplate,
  quoteWhatsappSendCue,
} from '../lib/quoteWhatsappTemplate';
import {
  normalizeQuoteVersionLabel,
  QUOTE_VERSION_LABEL_MAX,
  quoteVersionLabelPickerOptions,
  quoteVersionOptionLabel,
} from '../lib/quoteVersionLabel';
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
    case null:
    case undefined:
      // No version yet — allow building the first draft.
      return new Set(['edit', 'addLines', 'revise']);
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
  placeholder,
  showCurrency = false,
  currency = 'INR',
  invalid,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  showCurrency?: boolean;
  currency?: string;
  invalid?: boolean;
}) {
  return (
    <PriceField
      showCurrency={showCurrency}
      currency={currency}
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      value={value == null || !Number.isFinite(value) ? '' : String(value)}
      onChange={(raw) => {
        if (raw === '' || raw === '-') {
          onChange(null);
          return;
        }
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}

/** Keeps qty/cost/sell/tax aligned with the description input (below the badge row). */
function QuoteLineFieldShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 py-0.5', className)}>
      <div className="h-5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type QuoteLine = {
  id: string;
  description: string;
  quantity: number;
  /** null = missing; 0 = intentionally free. */
  unitCost: number | null;
  /** null = missing; 0 = intentionally free. */
  unitSell: number | null;
  taxPercent: number;
  pricingUnit: string;
  serviceType?: import('@wayrune/contracts').QuoteServiceType;
  rateKind?: 'hotel' | 'transfer' | 'activity';
  rateId?: string;
  /** True when hotel/transfer/activity had no matching rate card. */
  rateUnmatched?: boolean;
  /** Why resolve blocked the match (blackout / stop-sell). */
  rateBlockReason?: 'blackout' | 'stop_sell';
  /** Durable snapshot of the matched rate card. */
  rateProvenance?: QuoteRateProvenance;
  details?: QuoteServiceDetails;
  includedMeta?: {
    at: string;
    reason: string;
    previousUnitCost?: number | null;
    previousUnitSell?: number | null;
    byUserId?: string;
  };
  marginOverride?: {
    at: string;
    reason: string;
    byUserId?: string;
    unitCost?: number;
    unitSell?: number;
  };
};

const QUOTE_PRICING_UNITS = new Set(['per_person', 'per_room', 'per_service', 'package']);

function sanitizeQuoteDescription(raw: unknown): string {
  return String(raw || 'Line')
    .replace(/\s*[·(-]\s*\[object Object\]\)?/gi, '')
    .replace(/\s*\[object Object\]/gi, '')
    .trim() || 'Line';
}

function parseQuoteMoney(raw: unknown, unmatched: boolean): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Legacy unmatched zeros mean "not priced", not free.
  if (n === 0 && unmatched) return null;
  return n;
}

function quoteLinesFromVersion(version: {
  id?: string;
  itemsJson?: unknown;
} | null): QuoteLine[] {
  const raw = Array.isArray(version?.itemsJson) ? version.itemsJson : [];
  return raw.map((item: any, i: number) => {
    const unmatched = Boolean(item.rateUnmatched);
    return {
      id: String(item.id || `line-${version?.id || 'x'}-${i}`),
      description: sanitizeQuoteDescription(item.description),
      quantity: Number(item.quantity) || 0,
      unitCost: parseQuoteMoney(item.unitCost, unmatched),
      unitSell: parseQuoteMoney(item.unitSell, unmatched),
      taxPercent: Number(item.taxPercent) || 0,
      pricingUnit: QUOTE_PRICING_UNITS.has(item.pricingUnit) ? item.pricingUnit : 'per_service',
      serviceType: item.serviceType,
      rateKind:
        item.rateKind === 'hotel' ||
        item.rateKind === 'transfer' ||
        item.rateKind === 'activity'
          ? item.rateKind
          : undefined,
      rateId: typeof item.rateId === 'string' ? item.rateId : undefined,
      rateUnmatched: unmatched,
      rateBlockReason:
        item.rateBlockReason === 'blackout' || item.rateBlockReason === 'stop_sell'
          ? item.rateBlockReason
          : undefined,
      rateProvenance: parseQuoteRateProvenance(item.rateProvenance),
      details: parseQuoteServiceDetails(item.details),
      includedMeta:
        item.includedMeta && typeof item.includedMeta === 'object'
          ? {
              at: String(item.includedMeta.at || ''),
              reason: String(item.includedMeta.reason || ''),
              previousUnitCost:
                item.includedMeta.previousUnitCost == null
                  ? item.includedMeta.previousUnitCost
                  : Number(item.includedMeta.previousUnitCost),
              previousUnitSell:
                item.includedMeta.previousUnitSell == null
                  ? item.includedMeta.previousUnitSell
                  : Number(item.includedMeta.previousUnitSell),
              byUserId:
                typeof item.includedMeta.byUserId === 'string'
                  ? item.includedMeta.byUserId
                  : undefined,
            }
          : undefined,
      marginOverride:
        item.marginOverride && typeof item.marginOverride === 'object'
          ? {
              at: String(item.marginOverride.at || ''),
              reason: String(item.marginOverride.reason || ''),
              byUserId:
                typeof item.marginOverride.byUserId === 'string'
                  ? item.marginOverride.byUserId
                  : undefined,
              unitCost:
                item.marginOverride.unitCost == null
                  ? undefined
                  : Number(item.marginOverride.unitCost),
              unitSell:
                item.marginOverride.unitSell == null
                  ? undefined
                  : Number(item.marginOverride.unitSell),
            }
          : undefined,
    };
  });
}

function serializeQuoteLine(item: QuoteLine) {
  return {
    id: item.id,
    description: item.description.trim() || 'Service',
    quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
    unitCost: item.unitCost,
    unitSell: item.unitSell,
    taxPercent: Number.isFinite(item.taxPercent) ? item.taxPercent : 0,
    pricingUnit: QUOTE_PRICING_UNITS.has(item.pricingUnit) ? item.pricingUnit : 'per_service',
    ...(item.serviceType ? { serviceType: item.serviceType } : {}),
    ...(item.rateKind ? { rateKind: item.rateKind } : {}),
    ...(item.rateId ? { rateId: item.rateId } : {}),
    ...(item.rateUnmatched ? { rateUnmatched: true } : {}),
    ...(item.rateBlockReason ? { rateBlockReason: item.rateBlockReason } : {}),
    ...(item.rateProvenance ? { rateProvenance: item.rateProvenance } : {}),
    ...(item.details ? { details: item.details } : {}),
    ...(item.includedMeta ? { includedMeta: item.includedMeta } : {}),
    ...(item.marginOverride?.reason?.trim()
      ? { marginOverride: item.marginOverride }
      : {}),
  };
}

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

const EMPTY_QUOTE_LINES: QuoteLine[] = [];

function quoteProposalNotesSummary(meta: {
  inclusions: string;
  exclusions: string;
  terms: string;
}): string {
  const set: string[] = [];
  if (meta.inclusions.trim()) set.push('Inclusions');
  if (meta.exclusions.trim()) set.push('Exclusions');
  if (meta.terms.trim()) set.push('Terms');
  if (!set.length) return 'Optional — appears on the proposal PDF';
  return `${set.join(' · ')} filled`;
}

function quoteLinesMissingCost(
  items: Array<{ unitCost: number | null; quantity: number }>,
): { missingCount: number; knownCost: number; incomplete: boolean } {
  let missingCount = 0;
  let knownCost = 0;
  for (const i of items) {
    const qty = Number(i.quantity) || 0;
    if (i.unitCost == null) missingCount += 1;
    else knownCost += i.unitCost * qty;
  }
  return {
    missingCount,
    knownCost,
    incomplete: items.length > 0 && missingCount > 0,
  };
}

function quoteLinesMissingSell(
  items: Array<{ unitSell: number | null }>,
): number {
  return items.filter((i) => i.unitSell == null).length;
}

/** Human-readable reason Send must stay disabled (empty = ready). */
function quoteSendBlockedReason(input: {
  itemCount: number;
  missingSellCount: number;
  missingCostCount: number;
  marginGateCount: number;
  rateDriftCount?: number;
  allotmentBlockCount?: number;
  capacityBlockCount?: number;
  minStayBlockCount?: number;
  maxStayBlockCount?: number;
  stopSaleBlockCount?: number;
  fxMissing?: boolean;
  quoteCurrency?: string;
  orgCurrency?: string;
  minMarginPercent: number;
  canViewCost: boolean;
  hasValidUntil: boolean;
  validUntilExpired?: boolean;
  /** Expired outside post-expiry grace — hard-block Send. */
  validUntilBlocksSend?: boolean;
  travellerCount: number;
  statusAllowsSend: boolean;
}): string {
  if (!input.statusAllowsSend) {
    return 'This version cannot be sent yet';
  }
  if (input.itemCount === 0) {
    return 'Add at least one commercial service before sending';
  }
  const parts: string[] = [];
  if (input.missingSellCount > 0) {
    parts.push(
      `${input.missingSellCount} service price${input.missingSellCount === 1 ? '' : 's'}`,
    );
  }
  if (input.missingCostCount > 0) {
    parts.push(
      `${input.missingCostCount} buy rate${input.missingCostCount === 1 ? '' : 's'}`,
    );
  }
  if (input.marginGateCount > 0) {
    parts.push(
      input.minMarginPercent > 0
        ? `${input.marginGateCount} below-margin service${input.marginGateCount === 1 ? '' : 's'}`
        : `${input.marginGateCount} negative-margin service${input.marginGateCount === 1 ? '' : 's'}`,
    );
  }
  if ((input.rateDriftCount ?? 0) > 0) {
    parts.push(
      `${input.rateDriftCount} rate chart change${input.rateDriftCount === 1 ? '' : 's'} to rematch or acknowledge`,
    );
  }
  if ((input.allotmentBlockCount ?? 0) > 0) {
    parts.push(
      `${input.allotmentBlockCount} allotment shortfall${input.allotmentBlockCount === 1 ? '' : 's'} (reduce rooms or change property)`,
    );
  }
  if ((input.capacityBlockCount ?? 0) > 0) {
    parts.push(
      `${input.capacityBlockCount} capacity shortfall${input.capacityBlockCount === 1 ? '' : 's'} (add vehicles or reduce party)`,
    );
  }
  if ((input.minStayBlockCount ?? 0) > 0) {
    parts.push(
      `${input.minStayBlockCount} min-stay shortfall${input.minStayBlockCount === 1 ? '' : 's'} (extend nights or acknowledge)`,
    );
  }
  if ((input.maxStayBlockCount ?? 0) > 0) {
    parts.push(
      `${input.maxStayBlockCount} max-stay overage${input.maxStayBlockCount === 1 ? '' : 's'} (shorten nights or acknowledge)`,
    );
  }
  if ((input.stopSaleBlockCount ?? 0) > 0) {
    parts.push(
      `${input.stopSaleBlockCount} stop-sale block${input.stopSaleBlockCount === 1 ? '' : 's'} (change dates or supplier)`,
    );
  }
  if (input.fxMissing) {
    parts.push(
      `an FX lock for ${input.quoteCurrency || 'foreign currency'} (org books in ${input.orgCurrency || 'INR'})`,
    );
  }
  if (!input.hasValidUntil) parts.push('a validity date');
  else if (input.validUntilBlocksSend) {
    parts.push('a fresh validity date (expired past grace)');
  }
  if (input.travellerCount <= 0) parts.push('at least one traveller');
  if (!parts.length) return '';
  if (parts.length === 1) return `Complete ${parts[0]} before sending`;
  if (parts.length === 2) return `Complete ${parts[0]} and ${parts[1]} before sending`;
  return `Complete ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]} before sending`;
}

function quoteReadinessLabel(input: {
  itemCount: number;
  missingSellCount: number;
  missingCostCount: number;
  marginGateCount: number;
  minMarginPercent: number;
  costIncomplete: boolean;
  canViewCost: boolean;
  hasValidUntil: boolean;
  validUntilExpired?: boolean;
  validUntilBlocksSend?: boolean;
  validUntilInGrace?: boolean;
  canSend: boolean;
}): { tone: 'neutral' | 'warn' | 'ok'; label: string; hint: string } {
  if (input.itemCount === 0) {
    return {
      tone: 'neutral',
      label: 'Setup required',
      hint: 'Add at least one service to begin.',
    };
  }
  const parts: string[] = [];
  if (input.missingSellCount > 0) {
    parts.push(
      `${input.missingSellCount} sell price${input.missingSellCount === 1 ? '' : 's'} missing`,
    );
  }
  if (input.canViewCost && input.missingCostCount > 0) {
    parts.push(
      `${input.missingCostCount} buy rate${input.missingCostCount === 1 ? '' : 's'} missing`,
    );
  }
  if (input.canViewCost && input.marginGateCount > 0) {
    parts.push(
      input.minMarginPercent > 0
        ? `${input.marginGateCount} service${input.marginGateCount === 1 ? '' : 's'} below margin policy`
        : `${input.marginGateCount} service${input.marginGateCount === 1 ? '' : 's'} with negative margin`,
    );
  }
  if (!input.hasValidUntil) parts.push('Validity date not selected');
  else if (input.validUntilBlocksSend) {
    parts.push('Validity expired past grace — reset before send');
  } else if (input.validUntilInGrace) {
    parts.push('Validity expired — send keeps date (grace)');
  }
  if (parts.length) {
    return {
      tone: 'warn',
      label: 'Pricing incomplete',
      hint: parts.join(' · '),
    };
  }
  if (input.canSend) {
    return {
      tone: 'ok',
      label: 'Ready to send',
      hint: 'Preview looks good — send when the client is ready.',
    };
  }
  return {
    tone: 'ok',
    label: 'Ready for preview',
    hint: 'Quotation is priced; send when status allows.',
  };
}

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
  const { navigate, toOrgPath } = useOrgNavigate();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [trip, setTrip] = useState<any>(null);
  const [tripLoadError, setTripLoadError] = useState<string | null>(null);
  const [controlRefreshKey, setControlRefreshKey] = useState(0);
  const [tabAttention, setTabAttention] = useState<Partial<Record<string, number>>>({});
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
  const [travellerNationality, setTravellerNationality] = useState('');
  const [editTravellerOpen, setEditTravellerOpen] = useState(false);
  const [editTravellerSaving, setEditTravellerSaving] = useState(false);
  const [editTravellerId, setEditTravellerId] = useState<string | null>(null);
  const [editTravellerName, setEditTravellerName] = useState('');
  const [editTravellerType, setEditTravellerType] = useState('adult');
  const [editTravellerNationality, setEditTravellerNationality] = useState('');
  const [editTravellerIsLead, setEditTravellerIsLead] = useState(false);
  const [travelDatesOpen, setTravelDatesOpen] = useState(false);
  const [travelDatesSaving, setTravelDatesSaving] = useState(false);
  const [travelDatesShiftQuote, setTravelDatesShiftQuote] = useState(true);
  const [travelDatesForm, setTravelDatesForm] = useState({
    startDate: '',
    endDate: '',
  });
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendChannel, setSendChannel] = useState<'email' | 'whatsapp'>('email');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendExtendValidity, setSendExtendValidity] = useState(false);
  const [requestApprovalOpen, setRequestApprovalOpen] = useState(false);
  const [approvalExtendValidity, setApprovalExtendValidity] = useState(false);
  const [waMarkSentPending, setWaMarkSentPending] = useState(false);
  const [waMarkSentBusy, setWaMarkSentBusy] = useState(false);
  const [waSendTemplates, setWaSendTemplates] = useState<
    Array<{ id: string; name: string; metaTemplateName: string; isActive: boolean }>
  >([]);
  const quoteWorkspaceOpenedAtMsRef = useRef<number | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateTagsCsv, setTemplateTagsCsv] = useState('');
  const [templateFolder, setTemplateFolder] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [useTemplateOpen, setUseTemplateOpen] = useState(false);
  const [templateTagFilter, setTemplateTagFilter] = useState('');
  const [templateFolderFilter, setTemplateFolderFilter] = useState('');
  const [templateApplyStartDate, setTemplateApplyStartDate] = useState('');
  const [templateApplyAdults, setTemplateApplyAdults] = useState(2);
  const [templateApplyChildren, setTemplateApplyChildren] = useState(0);
  const [templateApplyChildAgesCsv, setTemplateApplyChildAgesCsv] = useState('');
  const [templateApplyChildrenWithoutBed, setTemplateApplyChildrenWithoutBed] =
    useState(0);
  const [quoteTemplates, setQuoteTemplates] = useState<
    Array<{
      id: string;
      name: string;
      versionNumber?: number;
      content?: {
        items?: unknown[];
        inclusions?: unknown;
        exclusions?: unknown;
        destinationHint?: string | null;
        tags?: string[];
        folder?: string | null;
      };
    }>
  >([]);
  const [packageFolderIndex, setPackageFolderIndex] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSaveAsNew, setTemplateSaveAsNew] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [templateHistoryForId, setTemplateHistoryForId] = useState<string | null>(null);
  const [templateHistoryItems, setTemplateHistoryItems] = useState<
    TemplateVersionListItem[]
  >([]);
  const [loadingTemplateHistory, setLoadingTemplateHistory] = useState(false);
  const [restoringTemplateId, setRestoringTemplateId] = useState<string | null>(null);
  const [templateDiffOpenId, setTemplateDiffOpenId] = useState<string | null>(null);
  const [installingFitPack, setInstallingFitPack] = useState(false);
  const [cloningQuote, setCloningQuote] = useState(false);
  const [savingItinerary, setSavingItinerary] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteLine[]>(EMPTY_QUOTE_LINES);
  const [quoteMeta, setQuoteMeta] = useState({
    inclusions: '',
    exclusions: '',
    terms: '',
    validUntil: '',
    label: '',
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
  const [quoteSaveError, setQuoteSaveError] = useState<string | null>(null);
  const [fxRateInput, setFxRateInput] = useState('');
  const [lockingFx, setLockingFx] = useState(false);
  const [markupConfirmOpen, setMarkupConfirmOpen] = useState(false);
  const [markupApplyTarget, setMarkupApplyTarget] = useState<
    { kind: 'default' } | { kind: 'preset'; preset: MarkupPreset }
  >({ kind: 'default' });
  const [taxConfirmOpen, setTaxConfirmOpen] = useState(false);
  const [includedConfirmOpen, setIncludedConfirmOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  /** Live chart updatedAt by rateId from POST /rates/chart-freshness. */
  const [chartUpdatedAtByRateId, setChartUpdatedAtByRateId] = useState<
    Record<string, string>
  >({});
  const [marginOverrideOpen, setMarginOverrideOpen] = useState(false);
  const [marginOverrideReason, setMarginOverrideReason] = useState('');
  const [marginOverrideLineIds, setMarginOverrideLineIds] = useState<string[]>([]);
  const [marginOverridePending, setMarginOverridePending] = useState<
    'send' | 'requestApproval' | null
  >(null);
  const [marginOverrideSaving, setMarginOverrideSaving] = useState(false);
  const quoteHydrated = useRef(false);
  const quoteItemsRef = useRef(quoteItems);
  quoteItemsRef.current = quoteItems;
  const quoteLockRef = useRef<number | null>(null);
  const quoteSavingRef = useRef(false);
  const quoteNeedsResaveRef = useRef(false);
  const quoteRetryAttemptRef = useRef(0);
  const quoteRetryTimerRef = useRef<number | null>(null);
  const quoteNeedsServerSyncRef = useRef(false);
  const tripRef = useRef(trip);
  tripRef.current = trip;
  const canViewCost = me?.permissions.includes('quote.view_cost');
  const quoteNotesDisclosure = useProgressiveDisclosure('secondary');
  const [quoteNotesOpen, setQuoteNotesOpen] = useState(quoteNotesDisclosure.defaultOpen);
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [quoteDetailLineId, setQuoteDetailLineId] = useState<string | null>(null);
  const canApproveQuote = me?.permissions.includes('quote.approve');
  const canOverrideBelowMargin = me?.permissions.includes('below_margin.approve');
  const canOverrideInventoryRisk = me?.permissions.includes('inventory_risk.approve');
  const canOverrideRateDrift = me?.permissions.includes('rate_drift.approve');
  const { has } = usePermissions();
  const canTripWrite = has('trip.write');
  const canItinerary = has('itinerary.edit');
  const canQuoteWrite = has('quote.write');
  const canQuoteRead = has('quote.read');
  const dmcWorkspace = me?.organization.kind === 'dmc';
  useDocumentTitle(trip ? `${trip.tripNumber} · ${trip.title}` : dmcWorkspace ? 'Package' : 'Trip');

  function changeTab(next: string) {
    const safe = next in TAB_LABELS ? next : 'overview';
    setTab(safe);
    const params = new URLSearchParams(searchParams);
    if (safe === 'overview') params.delete('tab');
    else params.set('tab', safe);
    setSearchParams(params, { replace: true });
  }

  /** Keep quotation + version in the URL so reload / share restores the same quote view. */
  function writeQuoteQuery(quotationId: string | null, versionId: string | null) {
    const params = new URLSearchParams(window.location.search);
    const prevQ = params.get('quotation');
    const prevV = params.get('version');
    if (quotationId) params.set('quotation', quotationId);
    else params.delete('quotation');
    if (versionId) params.set('version', versionId);
    else params.delete('version');
    if (params.get('quotation') === prevQ && params.get('version') === prevV) return;
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    const raw = searchParams.get('tab');
    const next = raw && raw in TAB_LABELS ? raw : 'overview';
    setTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    if (!trip?.id) return;
    let cancelled = false;
    void api<{ flags: Array<{ tab: string; severity: 'danger' | 'warn' | 'info' }> }>(
      `/trips/${trip.id}/control`,
    )
      .then((res) => {
        if (!cancelled) setTabAttention(tabAttentionCounts(res.flags));
      })
      .catch(() => {
        if (!cancelled) setTabAttention({});
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.id, controlRefreshKey]);

  async function load() {
    try {
      setTripLoadError(null);
      itineraryHydrated.current = false;
      const data = await api<any>(`/trips/${id}`);
      setTrip(data);
      setControlRefreshKey((k) => k + 1);
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

      const urlParams = new URLSearchParams(window.location.search);
      const urlQuotation = urlParams.get('quotation');
      const urlVersion = urlParams.get('version');
      const preferredQuotation =
        (selectedQuotationIdRef.current &&
        data.quotations?.some((q: any) => q.id === selectedQuotationIdRef.current)
          ? selectedQuotationIdRef.current
          : null) ||
        (urlQuotation && data.quotations?.some((q: any) => q.id === urlQuotation)
          ? urlQuotation
          : null) ||
        null;
      const activeQ = pickActiveQuotation(data.quotations, preferredQuotation);
      setSelectedQuotationId(activeQ?.id ?? null);
      selectedQuotationIdRef.current = activeQ?.id ?? null;
      const quoteVersions = activeQ?.versions || [];
      const prevId = selectedQuoteVersionIdRef.current;
      const preferredVersion =
        (prevId && quoteVersions.some((v: any) => v.id === prevId) ? prevId : null) ||
        (urlVersion && quoteVersions.some((v: any) => v.id === urlVersion)
          ? urlVersion
          : null) ||
        null;
      const target =
        (preferredVersion
          ? quoteVersions.find((v: any) => v.id === preferredVersion)
          : null) ||
        quoteVersions.find((v: any) => EDITABLE_QUOTE_STATUSES.has(v.status)) ||
        quoteVersions[0] ||
        null;
      quoteHydrated.current = false;
      setSelectedQuoteVersionId(target?.id ?? null);
      selectedQuoteVersionIdRef.current = target?.id ?? null;
      writeQuoteQuery(activeQ?.id ?? null, target?.id ?? null);
      {
        const lockRaw =
          target && typeof target === 'object'
            ? (target as Record<string, unknown>).versionLock
            : undefined;
        quoteLockRef.current = typeof lockRaw === 'number' ? lockRaw : null;
      }

      const validityDays = quoteValidityDaysFromSettings(
        data.organization?.settingsJson,
      );
      let nextItems = target ? quoteLinesFromVersion(target as any) : EMPTY_QUOTE_LINES;
      let nextMeta = {
        inclusions: String(target?.inclusions || ''),
        exclusions: String(target?.exclusions || ''),
        terms: String(target?.terms || ''),
        validUntil: target?.validUntil
          ? String(target.validUntil).slice(0, 10)
          : '',
        label: String((target as { label?: string | null } | null)?.label || ''),
      };

      // Prefer a newer unsaved local draft over the last server snapshot.
      if (id) {
        const local = readQuoteLocalDraft(id);
        const serverUpdated = target?.updatedAt
          ? new Date(String(target.updatedAt)).getTime()
          : 0;
        if (
          local &&
          local.updatedAt > serverUpdated &&
          (local.versionId === (target?.id ?? null) ||
            (!target && local.items.length > 0))
        ) {
          nextItems = quoteLinesFromVersion({
            id: local.versionId || 'local',
            itemsJson: local.items,
          });
          nextMeta = { ...local.meta };
          // Keep the server lock so the first sync does not 409 on a stale local lock.
          const lockVal = target
            ? (target as Record<string, unknown>).versionLock
            : undefined;
          quoteLockRef.current =
            (typeof lockVal === 'number' ? lockVal : null) ?? local.versionLock ?? null;
          setQuoteSaveState('pending');
          setQuoteSaveError(null);
          quoteNeedsServerSyncRef.current = true;
        } else {
          setQuoteSaveState('idle');
          setQuoteSaveError(null);
          quoteNeedsServerSyncRef.current = false;
          if (local && local.updatedAt <= serverUpdated) clearQuoteLocalDraft(id);
        }
      } else {
        setQuoteSaveState('idle');
        setQuoteSaveError(null);
        quoteNeedsServerSyncRef.current = false;
      }

      if (!nextMeta.validUntil.trim() && (nextItems.length > 0 || target)) {
        const vu = defaultValidUntilIso(validityDays);
        nextMeta = {
          ...nextMeta,
          validUntil: vu,
          terms: syncTermsWithValidUntil(nextMeta.terms, vu),
        };
      }

      setQuoteItems(nextItems);
      setQuoteMeta({
        inclusions: String(nextMeta.inclusions || ''),
        exclusions: String(nextMeta.exclusions || ''),
        terms: String(nextMeta.terms || ''),
        validUntil: String(nextMeta.validUntil || ''),
        label: String(nextMeta.label || ''),
      });
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
        if (quoteNeedsServerSyncRef.current) {
          quoteNeedsServerSyncRef.current = false;
          setQuoteSaveState('pending');
          window.setTimeout(() => {
            void autosaveQuote({ attempt: 0 });
          }, 350);
        }
        if (needsPersistEmptyDraft && canItinerary) {
          setItinerarySaveState('pending');
          window.setTimeout(() => {
            void autosaveItinerary();
          }, 400);
        }
      });
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load trip';
      setTripLoadError(msg);
      toastError(msg);
      return null;
    }
  }

  async function saveTripDestinations(next: PlaceRef[]) {
    if (!id) return;
    try {
      const updated = await api<any>(`/trips/${id}/destinations`, {
        method: 'PATCH',
        body: JSON.stringify({ destinations: next }),
      });
      setTrip((t: any) =>
        t
          ? {
              ...t,
              destinationsJson: updated.destinationsJson,
              inferredDestinationPlaceOfSupply:
                updated.inferredDestinationPlaceOfSupply ?? null,
            }
          : t,
      );
      toastSuccess('Destinations updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update destinations');
    }
  }

  async function saveTripDestinationPlaceOfSupply(raw: string) {
    if (!id) return;
    const value = raw.trim() || null;
    try {
      const updated = await api<{ destinationPlaceOfSupply: string | null }>(
        `/trips/${id}/destination-place-of-supply`,
        {
          method: 'PATCH',
          body: JSON.stringify({ destinationPlaceOfSupply: value }),
        },
      );
      setTrip((t: any) =>
        t
          ? {
              ...t,
              destinationPlaceOfSupply: updated.destinationPlaceOfSupply,
            }
          : t,
      );
      toastSuccess(
        updated.destinationPlaceOfSupply
          ? 'Destination place of supply updated'
          : 'Using org default destination POS',
      );
    } catch (e) {
      toastError(
        e instanceof Error
          ? e.message
          : 'Could not update destination place of supply',
      );
    }
  }

  function openTravelDatesSheet() {
    setTravelDatesForm({
      startDate: String(trip?.startDate || '').slice(0, 10),
      endDate: String(trip?.endDate || '').slice(0, 10),
    });
    const hasQuotes =
      quoteItems.length > 0 ||
      (Array.isArray(trip?.quotations) && trip.quotations.length > 0);
    setTravelDatesShiftQuote(hasQuotes);
    setTravelDatesOpen(true);
  }

  async function saveTravelDates() {
    if (!id) return;
    if (!tripTravelEndOnOrAfterStart(travelDatesForm.startDate, travelDatesForm.endDate)) {
      toastError('Travel end must be on or after travel start');
      return;
    }
    const parsed = UpdateTripDatesSchema.safeParse({
      startDate: travelDatesForm.startDate || null,
      endDate: travelDatesForm.endDate || null,
      shiftQuoteDates: travelDatesShiftQuote,
    });
    if (!parsed.success) {
      toastError(parsed.error.errors[0]?.message || 'Check travel dates');
      return;
    }
    setTravelDatesSaving(true);
    try {
      const updated = await api<{
        startDate?: string | null;
        endDate?: string | null;
        dateShiftDays?: number;
        quoteVersionsShifted?: number;
        itineraryDaysReanchored?: boolean;
        quoteRewriteFromStatus?: string | null;
        quoteRewriteQuotationId?: string | null;
        quoteRewriteVersionId?: string | null;
        rematchMatched?: number;
        rematchUnmatched?: number;
      }>(`/trips/${id}/dates`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      setTrip((t: any) =>
        t
          ? {
              ...t,
              startDate: updated.startDate ?? null,
              endDate: updated.endDate ?? null,
            }
          : t,
      );
      setTravelDatesOpen(false);
      const shifted = (updated.quoteVersionsShifted ?? 0) > 0;
      if (shifted) clearQuoteLocalDraft(id);
      if (updated.quoteRewriteQuotationId) {
        setSelectedQuotationId(updated.quoteRewriteQuotationId);
        selectedQuotationIdRef.current = updated.quoteRewriteQuotationId;
        selectedQuoteVersionIdRef.current =
          updated.quoteRewriteVersionId ?? null;
        setSelectedQuoteVersionId(updated.quoteRewriteVersionId ?? null);
        writeQuoteQuery(
          updated.quoteRewriteQuotationId,
          updated.quoteRewriteVersionId ?? null,
        );
      }
      const bits = ['Travel dates updated'];
      const shiftDays = Number(updated.dateShiftDays) || 0;
      if (shifted && shiftDays) {
        bits.push(`quote dates shifted ${shiftDays > 0 ? '+' : ''}${shiftDays}d`);
      } else if (shifted) {
        bits.push('quote rates rematched');
      }
      if (updated.quoteRewriteFromStatus) {
        bits.push(`new draft from ${updated.quoteRewriteFromStatus}`);
      }
      const rematchMatched = Number(updated.rematchMatched) || 0;
      const rematchUnmatched = Number(updated.rematchUnmatched) || 0;
      if (rematchMatched > 0 || rematchUnmatched > 0) {
        bits.push(
          `${rematchMatched} rate-matched${
            rematchUnmatched ? ` · ${rematchUnmatched} need rates` : ''
          }`,
        );
      }
      if (updated.itineraryDaysReanchored) {
        bits.push('story days aligned');
      }
      toastSuccess(bits.join(' · '));
      if (!travelDatesShiftQuote && quoteItems.length > 0) {
        toastWarning(
          'Quote service dates were not shifted — rematch or edit lines if the stay window changed',
        );
      }
      const data = await load();
      if (
        shifted &&
        data &&
        rematchMatched <= 0 &&
        rematchUnmatched <= 0
      ) {
        const activeQ = pickActiveQuotation(
          data.quotations,
          selectedQuotationIdRef.current,
        );
        const versions = activeQ?.versions || [];
        const target =
          versions.find(
            (v: { id?: string }) => v.id === selectedQuoteVersionIdRef.current,
          ) ||
          versions.find((v: { status?: string }) =>
            EDITABLE_QUOTE_STATUSES.has(String(v.status || '')),
          ) ||
          versions[0] ||
          null;
        const seeded = target ? quoteLinesFromVersion(target as any) : [];
        if (seeded.length) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          await refreshPricesFromRates(undefined, seeded);
        }
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update travel dates');
    } finally {
      setTravelDatesSaving(false);
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

  const persistQuoteLocalDraft = useCallback(() => {
    if (!id) return;
    writeQuoteLocalDraft({
      tripId: id,
      quotationId: selectedQuotationIdRef.current,
      versionId: selectedQuoteVersionIdRef.current,
      versionLock: quoteLockRef.current,
      items: quoteItemsRef.current.map((item) => serializeQuoteLine(item)),
      meta: quoteMetaRef.current,
      updatedAt: Date.now(),
    });
  }, [id]);

  const autosaveQuote = useCallback(
    async (opts?: { manual?: boolean; attempt?: number }) => {
      if (!id) return;
      if (!canQuoteWrite) return;
      if (quoteRetryTimerRef.current != null) {
        window.clearTimeout(quoteRetryTimerRef.current);
        quoteRetryTimerRef.current = null;
      }

      const currentTrip = tripRef.current;
      const activeQ = pickActiveQuotation(
        currentTrip?.quotations,
        selectedQuotationIdRef.current,
      );
      const versions = (activeQ?.versions || []) as Array<{
        id: string;
        status: string;
        versionLock?: number;
      }>;
      const selected =
        versions.find((v) => v.id === selectedQuoteVersionIdRef.current) || versions[0];
      if (selected?.status === 'accepted' || selected?.status === 'superseded') return;
      // Do not invent a quotation from an empty form.
      if (!activeQ && quoteItemsRef.current.length === 0) return;
      if (selected && !EDITABLE_QUOTE_STATUSES.has(selected.status)) return;

      if (quoteSavingRef.current) {
        quoteNeedsResaveRef.current = true;
        return;
      }
      quoteSavingRef.current = true;
      setQuoteSaveState('saving');
      persistQuoteLocalDraft();

      const snapshot = JSON.stringify({
        items: quoteItemsRef.current,
        meta: quoteMetaRef.current,
      });
      const items = quoteItemsRef.current.map((item) => serializeQuoteLine(item));
      const orgCurrency = (currentTrip?.organization?.currency ||
        me?.organization?.currency ||
        'INR') as string;
      const attempt = opts?.attempt ?? 0;
      let quotationId = activeQ?.id as string | undefined;
      let quotationRecord: { id: string; versions?: unknown[] } | null = activeQ
        ? { id: activeQ.id, versions: activeQ.versions }
        : null;

      try {
        if (!quotationId) {
          const created = await api<{ id: string; versions?: unknown[] }>(
            `/trips/${id}/quotations`,
            { method: 'POST' },
          );
          quotationRecord = created;
          quotationId = created.id;
          setSelectedQuotationId(quotationId);
          selectedQuotationIdRef.current = quotationId;
        }
        const version = await api<{
          id: string;
          versionNumber: number;
          status: string;
          versionLock?: number;
          sellTotal?: number | string;
          marginPercent?: number | string;
          itemsJson?: unknown;
          costHidden?: boolean;
          updatedAt?: string;
          inclusions?: string | null;
          exclusions?: string | null;
          terms?: string | null;
          validUntil?: string | null;
        }>(`/trips/${id}/quotations/${quotationId}/versions/autosave`, {
          method: 'POST',
          body: JSON.stringify({
            currency: orgCurrency,
            items,
            discountTotal: 0,
            versionId: selectedQuoteVersionIdRef.current,
            expectedLock: quoteLockRef.current ?? undefined,
            inclusions: quoteMetaRef.current.inclusions || null,
            exclusions: quoteMetaRef.current.exclusions || null,
            terms: quoteMetaRef.current.terms || null,
            validUntil: quoteMetaRef.current.validUntil || null,
            label: normalizeQuoteVersionLabel(quoteMetaRef.current.label),
          }),
        });
        setSelectedQuoteVersionId(version.id);
        selectedQuoteVersionIdRef.current = version.id;
        writeQuoteQuery(quotationId ?? null, version.id);
        if (typeof version.versionLock === 'number') {
          quoteLockRef.current = version.versionLock;
        } else if (quoteLockRef.current != null) {
          quoteLockRef.current += 1;
        } else {
          quoteLockRef.current = 1;
        }
        setQuoteSavedAt(new Date());
        setQuoteSaveError(null);
        clearQuoteLocalDraft(id);
        setTrip((prev: any) => {
          if (!prev) return prev;
          let quotations = [...(prev.quotations || [])];
          const qi = quotations.findIndex((q: any) => q.id === quotationId);
          if (qi < 0) {
            quotations = [
              { ...(quotationRecord || { id: quotationId }), versions: [version] },
              ...quotations,
            ];
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
          JSON.stringify({ items: quoteItemsRef.current, meta: quoteMetaRef.current }) !==
          snapshot
        ) {
          setQuoteSaveState('pending');
          quoteNeedsResaveRef.current = true;
        } else {
          setQuoteSaveState('saved');
        }
        if (opts?.manual) toastSuccess('Quotation saved');
      } catch (e) {
        const status = (e as { status?: number })?.status;
        const msg = e instanceof Error ? e.message : 'Could not auto-save quote';
        persistQuoteLocalDraft();

        // Version-lock races are common during rematch / override bursts — refresh lock and retry quietly.
        if (status === 409 && attempt < 3 && quotationId) {
          try {
            const fresh = await api<{
              quotations?: Array<{
                id: string;
                versions?: Array<{ id: string; versionLock?: number }>;
              }>;
            }>(`/trips/${id}`);
            const q =
              fresh.quotations?.find((row) => row.id === quotationId) ||
              fresh.quotations?.[0];
            const v =
              q?.versions?.find((row) => row.id === selectedQuoteVersionIdRef.current) ||
              q?.versions?.[0];
            if (typeof v?.versionLock === 'number') {
              quoteLockRef.current = v.versionLock;
            }
            setQuoteSaveState('pending');
            setQuoteSaveError(null);
            quoteRetryAttemptRef.current = attempt + 1;
            quoteNeedsResaveRef.current = true;
            return;
          } catch {
            /* fall through to normal error handling */
          }
        }

        if (status === 409) {
          setQuoteSaveState('error');
          setQuoteSaveError(
            'This quotation was changed elsewhere. Retry save to keep your latest edits, or reload to take the other version.',
          );
          if (opts?.manual) toastError(msg);
        } else if (!opts?.manual && attempt < 3) {
          const delay = Math.min(8000, 1000 * 2 ** attempt);
          setQuoteSaveState('pending');
          setQuoteSaveError(`Save interrupted — retrying in ${Math.round(delay / 1000)}s…`);
          quoteRetryTimerRef.current = window.setTimeout(() => {
            quoteRetryTimerRef.current = null;
            void autosaveQuote({ attempt: attempt + 1 });
          }, delay);
        } else {
          setQuoteSaveState('error');
          setQuoteSaveError(msg);
          if (opts?.manual || attempt >= 3) {
            toastError(msg);
          }
        }
      } finally {
        quoteSavingRef.current = false;
        if (quoteNeedsResaveRef.current) {
          quoteNeedsResaveRef.current = false;
          const nextAttempt = quoteRetryAttemptRef.current;
          quoteRetryAttemptRef.current = 0;
          void autosaveQuote({ attempt: nextAttempt, manual: opts?.manual });
        }
      }
    },
    [id, me?.organization?.currency, canQuoteWrite, persistQuoteLocalDraft],
  );

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

    // Keep retrying quietly while error — don't trap the user in a red state.
    setQuoteSaveState((prev) => (prev === 'saving' ? prev : 'pending'));
    persistQuoteLocalDraft();
    const t = window.setTimeout(() => {
      void autosaveQuote();
    }, 1400);
    return () => window.clearTimeout(t);
  }, [quoteItems, quoteMeta, autosaveQuote, canQuoteWrite, persistQuoteLocalDraft]);

  const quoteDirty =
    quoteSaveState === 'pending' ||
    quoteSaveState === 'saving' ||
    quoteSaveState === 'error';

  useEffect(() => {
    if (!quoteDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [quoteDirty]);

  useEffect(() => {
    return () => {
      if (quoteRetryTimerRef.current != null) {
        window.clearTimeout(quoteRetryTimerRef.current);
      }
    };
  }, []);

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
    () =>
      quoteItems.reduce((s, i) => {
        if (i.unitSell == null) return s;
        return s + i.quantity * i.unitSell * (1 + i.taxPercent / 100);
      }, 0),
    [quoteItems],
  );
  const costTotal = quoteItems.reduce((s, i) => {
    if (i.unitCost == null) return s;
    return s + i.quantity * i.unitCost;
  }, 0);
  const taxTotal = quoteItems.reduce((s, i) => {
    if (i.unitSell == null) return s;
    return s + i.quantity * i.unitSell * (i.taxPercent / 100);
  }, 0);
  const sellExTax = sellTotal - taxTotal;
  const marginAmount = sellExTax - costTotal;
  const marginPercent = sellExTax > 0 ? (marginAmount / sellExTax) * 100 : 0;
  const orgTaxIdentity = useMemo(
    () =>
      parseOrgTaxIdentityUi(
        trip?.organization?.taxLabel,
        trip?.organization?.settingsJson,
        {
          destinationPlaceOfSupply: trip?.destinationPlaceOfSupply ?? null,
          inferredDestinationPlaceOfSupply:
            trip?.inferredDestinationPlaceOfSupply ?? null,
        },
      ),
    [
      trip?.organization?.taxLabel,
      trip?.organization?.settingsJson,
      trip?.destinationPlaceOfSupply,
      trip?.inferredDestinationPlaceOfSupply,
    ],
  );
  const taxTotalsLabel = orgTaxTotalsLabelUi(orgTaxIdentity);
  const taxIdentityLines = formatOrgTaxIdentityLinesUi(orgTaxIdentity);
  const taxSplitLines = formatOrgTaxDisplaySplitLinesUi(
    orgTaxIdentity,
    taxTotal,
    { formatAmount: (n) => formatCurrency(n) },
  );
  const taxSplitCue = orgTaxDisplaySplitCueUi(orgTaxIdentity, taxTotal);
  const inferredPosCue = inferredDestinationPosCueUi(orgTaxIdentity);
  const costGaps = useMemo(() => quoteLinesMissingCost(quoteItems), [quoteItems]);
  const missingSellCount = useMemo(() => quoteLinesMissingSell(quoteItems), [quoteItems]);
  const sellComplete = quoteItems.length > 0 && missingSellCount === 0;
  const marginReady = quoteItems.length > 0 && !costGaps.incomplete && sellComplete;
  const quoteHasServices = quoteItems.length > 0;
  const pricedServiceCount = quoteItems.length - missingSellCount;
  const partialSellOnly = quoteHasServices && missingSellCount > 0;
  const quoteMinMarginPercent = parseMinMarginPercent(trip?.organization?.settingsJson);
  const marginGateCount = useMemo(
    () =>
      countMarginPolicyViolations(quoteItems, quoteMinMarginPercent, {
        ignoreOverridden: true,
      }),
    [quoteItems, quoteMinMarginPercent],
  );
  const missingPricingCount = useMemo(
    () =>
      quoteItems.filter(
        (line) => line.unitSell == null || line.unitCost == null,
      ).length,
    [quoteItems],
  );
  const attentionLineInputs = useMemo(
    () =>
      quoteItems.map((line) => {
        const rateId =
          line.rateProvenance?.rateId?.trim() || line.rateId?.trim() || '';
        return {
          ...line,
          chartUpdatedAt: rateId ? chartUpdatedAtByRateId[rateId] ?? null : null,
        };
      }),
    [quoteItems, chartUpdatedAtByRateId],
  );
  const attentionLines = useMemo(
    () =>
      listQuoteAttentionLines(attentionLineInputs, {
        canViewCost,
        minMarginPercent: quoteMinMarginPercent,
      }),
    [attentionLineInputs, canViewCost, quoteMinMarginPercent],
  );
  const needsAttentionCount = attentionLines.length;
  const rateDriftCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('rate_drift')).length,
    [attentionLines],
  );
  const rateDriftIds = useMemo(
    () => attentionLineIdsForReason(attentionLines, 'rate_drift'),
    [attentionLines],
  );
  const allotmentWarnCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('allotment_risk')).length,
    [attentionLines],
  );
  const capacityWarnCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('capacity_risk')).length,
    [attentionLines],
  );
  const minStayWarnCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('min_stay')).length,
    [attentionLines],
  );
  const maxStayWarnCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('max_stay')).length,
    [attentionLines],
  );
  const stopSaleBlockCount = useMemo(
    () => attentionLines.filter((r) => r.reasons.includes('stop_sell')).length,
    [attentionLines],
  );
  const attentionIds = useMemo(
    () => attentionLines.map((r) => r.id),
    [attentionLines],
  );
  const attentionQueue = useMemo(
    () => quoteAttentionQueueMeta(attentionIds, quoteDetailLineId),
    [attentionIds, quoteDetailLineId],
  );

  useEffect(() => {
    const candidates = quoteItems
      .map((line) => {
        const rateId =
          line.rateProvenance?.rateId?.trim() || line.rateId?.trim() || '';
        if (!rateId) return null;
        const rateKind =
          line.rateProvenance?.rateKind ||
          line.rateKind ||
          (line.serviceType === 'hotel' ||
          line.serviceType === 'transfer' ||
          line.serviceType === 'activity'
            ? line.serviceType
            : null);
        return { rateId, rateKind };
      })
      .filter(Boolean) as Array<{
      rateId: string;
      rateKind: string | null;
    }>;
    if (!candidates.length) {
      setChartUpdatedAtByRateId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{
          items: Array<{ rateId: string; updatedAt?: string | null }>;
        }>('/rates/chart-freshness', {
          method: 'POST',
          body: JSON.stringify({ items: candidates }),
        });
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const row of res.items || []) {
          if (row.updatedAt) next[row.rateId] = String(row.updatedAt);
        }
        setChartUpdatedAtByRateId(next);
      } catch {
        if (!cancelled) setChartUpdatedAtByRateId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    quoteItems
      .map(
        (l) =>
          `${l.rateProvenance?.rateId || l.rateId || ''}:${l.rateProvenance?.rateUpdatedAt || ''}:${l.rateProvenance?.rateDriftAckForUpdatedAt || ''}:${l.rateProvenance?.rateDriftAckReason || ''}`,
      )
      .join('|'),
  ]);

  const existingQuoteLineIds = useMemo(
    () => new Set(quoteItems.map((l) => l.id)),
    [quoteItems],
  );

  const destinations = placeRefsFromJson(trip?.destinationsJson);
  const destinationsLabel = destinations.map((d) => d.name).join(', ');
  const dateRange = formatDateRange(trip?.startDate, trip?.endDate);
  const travellerCount = trip?.travellers?.length ?? 0;
  const activeQuotation = pickActiveQuotation(trip?.quotations, selectedQuotationId);
  const quoteVersions = (activeQuotation?.versions || []) as Array<{
    id: string;
    versionNumber: number;
    label?: string | null;
    status: string;
    versionLock?: number;
    sellTotal?: number | string;
    marginPercent?: number | string;
    costHidden?: boolean;
    itemsJson?: unknown;
    currency?: string;
    validUntil?: string | null;
    inclusions?: string | null;
    exclusions?: string | null;
    terms?: string | null;
    updatedAt?: string;
    exchangeRatesJson?: unknown;
    fx?: QuoteFxLock | null;
  }>;
  const selectedQuoteVersion =
    quoteVersions.find((v) => v.id === selectedQuoteVersionId) || quoteVersions[0] || null;
  const quoteCurrency =
    selectedQuoteVersion?.currency ||
    trip?.organization?.currency ||
    me?.organization?.currency ||
    'INR';
  const orgCurrency = normalizeCurrency(
    trip?.organization?.currency || me?.organization?.currency || 'INR',
  );
  const quoteFxLock =
    selectedQuoteVersion?.fx ||
    parseQuoteFxLock(selectedQuoteVersion?.exchangeRatesJson);
  const fxMissing = !fxLockCoversQuote(
    quoteFxLock,
    quoteCurrency,
    orgCurrency,
  );
  const quoteWaSendCue = useMemo(() => {
    const settings = trip?.organization?.settingsJson;
    const cloudConfigured = isWhatsappCloudConfigured(settings);
    const templateReady = Boolean(
      pickQuoteProposalTemplate(waSendTemplates, settings),
    );
    return quoteWhatsappSendCue({ cloudConfigured, templateReady });
  }, [trip?.organization?.settingsJson, waSendTemplates]);
  const quoteStatus = selectedQuoteVersion?.status || null;
  const quoteCan = quoteActionsForStatus(quoteStatus);
  const canPreviewQuote = quoteHasServices && Boolean(selectedQuoteVersion);
  const hasValidUntil = Boolean(quoteMeta.validUntil?.trim());
  const validUntilExpired = isQuoteValidUntilExpired(quoteMeta.validUntil);
  const validUntilNearExpiryMessage = quoteNearExpiryToastMessage(quoteMeta.validUntil);
  const orgSettings = trip?.organization?.settingsJson;
  const validityGraceHours = quoteValidityGraceHoursFromSettings(orgSettings);
  const validUntilBlocksSend = shouldBlockSendPastGrace(
    quoteMeta.validUntil,
    validityGraceHours,
  );
  const validUntilGraceCue = quoteExpiredGraceCue(quoteMeta.validUntil, orgSettings);
  const validUntilPastGraceCue = quotePastGraceBlockCue(
    quoteMeta.validUntil,
    orgSettings,
  );
  const pricingBlockedReason = quoteSendBlockedReason({
    itemCount: quoteItems.length,
    missingSellCount,
    missingCostCount: costGaps.missingCount,
    marginGateCount,
    rateDriftCount,
    allotmentBlockCount: allotmentWarnCount,
    capacityBlockCount: capacityWarnCount,
    minStayBlockCount: minStayWarnCount,
    maxStayBlockCount: maxStayWarnCount,
    stopSaleBlockCount,
    fxMissing,
    quoteCurrency,
    orgCurrency,
    minMarginPercent: quoteMinMarginPercent,
    canViewCost: Boolean(canViewCost),
    hasValidUntil,
    validUntilExpired,
    validUntilBlocksSend,
    travellerCount,
    statusAllowsSend: true,
  });
  const pricingBlockedIgnoringMargin = quoteSendBlockedReason({
    itemCount: quoteItems.length,
    missingSellCount,
    missingCostCount: costGaps.missingCount,
    marginGateCount: 0,
    rateDriftCount,
    allotmentBlockCount: allotmentWarnCount,
    capacityBlockCount: capacityWarnCount,
    minStayBlockCount: minStayWarnCount,
    maxStayBlockCount: maxStayWarnCount,
    stopSaleBlockCount,
    fxMissing,
    quoteCurrency,
    orgCurrency,
    minMarginPercent: quoteMinMarginPercent,
    canViewCost: Boolean(canViewCost),
    hasValidUntil,
    validUntilExpired,
    validUntilBlocksSend,
    travellerCount,
    statusAllowsSend: true,
  });
  const sendBlockedReason =
    !selectedQuoteVersion || !quoteCan.has('send')
      ? selectedQuoteVersion
        ? 'This version cannot be sent yet'
        : 'Save a draft before sending'
      : pricingBlockedReason;
  const canSendQuote = !sendBlockedReason;
  /** Pricing complete except margin policy — Send should open override, not stay dead. */
  const canSendViaMarginOverride =
    Boolean(selectedQuoteVersion) &&
    quoteCan.has('send') &&
    !pricingBlockedIgnoringMargin &&
    marginGateCount > 0;
  const canClickSend = canSendQuote || canSendViaMarginOverride;
  const canRequestApproval =
    quoteCan.has('requestApproval') && !pricingBlockedReason;
  const canClickRequestApproval =
    (quoteCan.has('requestApproval') && canRequestApproval) ||
    (quoteCan.has('requestApproval') &&
      !pricingBlockedIgnoringMargin &&
      marginGateCount > 0);
  const quoteReady = quoteReadinessLabel({
    itemCount: quoteItems.length,
    missingSellCount,
    missingCostCount: costGaps.missingCount,
    marginGateCount,
    minMarginPercent: quoteMinMarginPercent,
    costIncomplete: costGaps.incomplete,
    canViewCost: Boolean(canViewCost),
    hasValidUntil,
    validUntilExpired,
    validUntilBlocksSend,
    validUntilInGrace: Boolean(validUntilGraceCue),
    canSend: canSendQuote,
  });
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
    dateRange || (canTripWrite ? 'Set travel dates' : null),
    trip?.party?.displayName ? `Client: ${trip.party.displayName}` : null,
    trip?.inquiry?.inquiryNumber ? `Inquiry: ${trip.inquiry.inquiryNumber}` : null,
  ].filter(Boolean);

  function selectQuoteVersion(version: (typeof quoteVersions)[0]) {
    quoteHydrated.current = false;
    setSelectedQuoteVersionId(version.id);
    selectedQuoteVersionIdRef.current = version.id;
    writeQuoteQuery(selectedQuotationIdRef.current, version.id);
    quoteLockRef.current =
      typeof version.versionLock === 'number' ? version.versionLock : null;
    const validityDays = quoteValidityDaysFromSettings(trip?.organization?.settingsJson);
    let validUntil = version.validUntil ? String(version.validUntil).slice(0, 10) : '';
    let terms = String(version.terms || '');
    if (!validUntil) {
      validUntil = defaultValidUntilIso(validityDays);
      terms = syncTermsWithValidUntil(terms, validUntil);
    }
    setQuoteItems(quoteLinesFromVersion(version));
    setQuoteMeta({
      inclusions: String(version.inclusions || ''),
      exclusions: String(version.exclusions || ''),
      terms,
      validUntil,
      label: String(version.label || ''),
    });
    setQuoteSaveState('idle');
    setQuoteSaveError(null);
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
      const nationality = normalizeHotelNationalityUi(travellerNationality) || null;
      await api(`/trips/${id}/travellers`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: travellerName,
          type: travellerType,
          isLead: true,
          ...(nationality ? { nationality } : {}),
        }),
      });
      setTravellerOpen(false);
      setTravellerName('');
      setTravellerType('adult');
      setTravellerNationality('');
      toastSuccess('Traveller added');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add traveller');
    }
  }

  function openEditTraveller(row: {
    isLead?: boolean;
    traveller?: {
      id?: string;
      fullName?: string;
      type?: string | null;
      nationality?: string | null;
    };
  }) {
    const tid = row.traveller?.id;
    if (!tid) return;
    setEditTravellerId(tid);
    setEditTravellerName(row.traveller?.fullName || '');
    setEditTravellerType(normalizeTravellerType(row.traveller?.type));
    setEditTravellerNationality(
      normalizeHotelNationalityUi(row.traveller?.nationality),
    );
    setEditTravellerIsLead(Boolean(row.isLead));
    setEditTravellerOpen(true);
  }

  async function saveEditTraveller() {
    if (!editTravellerId) return;
    setEditTravellerSaving(true);
    try {
      const nationality = normalizeHotelNationalityUi(editTravellerNationality);
      await api(`/trips/${id}/travellers/${editTravellerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editTravellerName.trim() || undefined,
          type: editTravellerType,
          nationality: nationality || null,
          isLead: editTravellerIsLead,
        }),
      });
      setEditTravellerOpen(false);
      setEditTravellerId(null);
      toastSuccess('Traveller updated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update traveller');
    } finally {
      setEditTravellerSaving(false);
    }
  }

  async function createAndSaveQuote() {
    if (quoteItems.length === 0) {
      toastError('Add at least one quote line first');
      return;
    }
    const items = quoteItems.map((item) => serializeQuoteLine(item));
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
      selectedQuotationIdRef.current = quotationId;
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
            validUntil: quoteMeta.validUntil || latest?.validUntil || null,
            label: normalizeQuoteVersionLabel(quoteMeta.label),
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
      writeQuoteQuery(quotationId, version.id);
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
      selectedQuotationIdRef.current = quotation.id;
      selectedQuoteVersionIdRef.current = quotation.versions?.[0]?.id ?? null;
      setSelectedQuoteVersionId(quotation.versions?.[0]?.id ?? null);
      writeQuoteQuery(quotation.id, quotation.versions?.[0]?.id ?? null);
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

  async function cloneActiveQuotation() {
    const quotationId = activeQuotation?.id;
    if (!id || !quotationId) {
      toastError('Save or select a quotation first');
      return;
    }
    setCloningQuote(true);
    try {
      const quotation = await api<{
        id: string;
        quoteNumber?: string;
        versions?: Array<{ id: string }>;
      }>(`/trips/${id}/quotations/${quotationId}/clone`, {
        method: 'POST',
        body: JSON.stringify({
          versionId: selectedQuoteVersion?.id || undefined,
        }),
      });
      setSelectedQuotationId(quotation.id);
      selectedQuotationIdRef.current = quotation.id;
      selectedQuoteVersionIdRef.current = quotation.versions?.[0]?.id ?? null;
      setSelectedQuoteVersionId(quotation.versions?.[0]?.id ?? null);
      writeQuoteQuery(quotation.id, quotation.versions?.[0]?.id ?? null);
      toastSuccess(
        quotation.quoteNumber
          ? `Cloned as ${quotation.quoteNumber}`
          : 'Quotation cloned as new draft',
      );
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not clone quotation');
    } finally {
      setCloningQuote(false);
    }
  }

  async function loadQuoteTemplates() {
    setLoadingTemplates(true);
    try {
      const res = await api<{
        items: typeof quoteTemplates;
        folderIndex?: string[];
      }>('/quote-templates');
      setQuoteTemplates(res.items || []);
      setPackageFolderIndex(res.folderIndex || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load templates');
      setQuoteTemplates([]);
      setPackageFolderIndex([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function renameQuoteTemplateFolder(fromFolder: string) {
    const from = normalizeTemplateFolderLabel(fromFolder);
    if (!from) return;
    const next = window.prompt(
      `Rename or move folder “${from}”.\nEnter new path (blank clears the prefix):`,
      from,
    );
    if (next == null) return;
    await applyQuoteTemplateFolderRename(from, next);
  }

  async function applyQuoteTemplateFolderRename(
    fromFolder: string,
    toFolderRaw: string,
  ) {
    const from = normalizeTemplateFolderLabel(fromFolder);
    if (!from) return;
    try {
      const res = await api<{ updated: number; toFolder: string | null }>(
        '/quote-templates/rename-folder',
        {
          method: 'POST',
          body: JSON.stringify({ fromFolder: from, toFolder: toFolderRaw }),
        },
      );
      toastSuccess(
        res.updated
          ? `Updated ${res.updated} package${res.updated === 1 ? '' : 's'}`
          : 'No packages in that folder',
      );
      setTemplateFolderFilter(
        normalizeTemplateFolderLabel(res.toFolder ?? toFolderRaw) || '',
      );
      await loadQuoteTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not rename folder');
    }
  }

  async function addQuoteTemplateFolder() {
    const raw = window.prompt(
      'New empty folder path (e.g. Beach/New shelf):',
      templateFolderFilter.trim() ? `${templateFolderFilter.trim()}/` : '',
    );
    if (raw == null) return;
    const folder = normalizeTemplateFolderLabel(raw);
    if (!folder) {
      toastError('Enter a folder path');
      return;
    }
    try {
      await api('/quote-templates/folders', {
        method: 'POST',
        body: JSON.stringify({ folder }),
      });
      toastSuccess(`Folder “${folder}” added`);
      setTemplateFolderFilter(folder);
      await loadQuoteTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add folder');
    }
  }

  async function removeEmptyQuoteTemplateFolder(folderRaw: string) {
    const folder = normalizeTemplateFolderLabel(folderRaw);
    if (!folder) return;
    if (
      !window.confirm(
        `Remove empty folder “${folder}” from the package library nav? Packages are not deleted.`,
      )
    ) {
      return;
    }
    try {
      await api('/quote-templates/folders/remove', {
        method: 'POST',
        body: JSON.stringify({ folder }),
      });
      toastSuccess(`Removed “${folder}” from folder nav`);
      setTemplateFolderFilter('');
      await loadQuoteTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove folder');
    }
  }

  async function toggleTemplateHistory(templateId: string) {
    if (templateHistoryForId === templateId) {
      setTemplateHistoryForId(null);
      setTemplateHistoryItems([]);
      setTemplateDiffOpenId(null);
      return;
    }
    setTemplateHistoryForId(templateId);
    setTemplateDiffOpenId(null);
    setLoadingTemplateHistory(true);
    setTemplateHistoryItems([]);
    try {
      const res = await api<{ items: TemplateVersionListItem[] }>(
        `/quote-templates/${templateId}/versions`,
      );
      setTemplateHistoryItems(res.items || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load template history');
      setTemplateHistoryForId(null);
    } finally {
      setLoadingTemplateHistory(false);
    }
  }

  async function restoreTemplateVersion(chainTemplateId: string, fromTemplateId: string) {
    if (!canQuoteWrite) return;
    setRestoringTemplateId(fromTemplateId);
    try {
      const saved = await api<{
        id: string;
        versionNumber?: number;
        restoredFromTemplateId?: string;
      }>(`/quote-templates/${chainTemplateId}/restore`, {
        method: 'POST',
        body: JSON.stringify({ fromTemplateId }),
      });
      toastSuccess(
        `Restored as v${saved.versionNumber ?? '?'} — Use the new active version`,
      );
      await loadQuoteTemplates();
      setTemplateHistoryForId(saved.id);
      const res = await api<{ items: TemplateVersionListItem[] }>(
        `/quote-templates/${saved.id}/versions`,
      );
      setTemplateHistoryItems(res.items || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore template');
    } finally {
      setRestoringTemplateId(null);
    }
  }

  async function openUseTemplateDialog() {
    const existing = String(trip?.startDate || '').slice(0, 10);
    setTemplateApplyStartDate(/^\d{4}-\d{2}-\d{2}$/.test(existing) ? existing : '');
    setTemplateApplyAdults(2);
    setTemplateApplyChildren(0);
    setTemplateHistoryForId(null);
    setTemplateHistoryItems([]);
    setUseTemplateOpen(true);
    await loadQuoteTemplates();
  }

  /** Install Darjeeling/Goa pack in place — stay on this trip (do not follow demo walkthroughHref). */
  async function installFitPackOnTrip() {
    setInstallingFitPack(true);
    try {
      const res = await installAgencyFitPack();
      toastSuccess(formatAgencyFitPackToast(res));
      await loadQuoteTemplates();
      if (!useTemplateOpen) {
        await openUseTemplateDialog();
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not install sample pack');
    } finally {
      setInstallingFitPack(false);
    }
  }

  const walkthroughOpenedRef = useRef(false);
  useEffect(() => {
    if (walkthroughOpenedRef.current) return;
    if (searchParams.get('walkthrough') !== '1') return;
    if (!canQuoteWrite) return;
    if (tab !== 'quotations') {
      setTab('quotations');
      return;
    }
    walkthroughOpenedRef.current = true;
    void openUseTemplateDialog();
    const params = new URLSearchParams(searchParams);
    params.delete('walkthrough');
    setSearchParams(params, { replace: true });
    // one-shot deep link from onboarding checklist
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tab, canQuoteWrite, setSearchParams]);

  useEffect(() => {
    if (tab !== 'quotations' || quoteItems.length > 0 || !canQuoteWrite) return;
    if (quoteTemplates.length > 0) return;
    let cancelled = false;
    api<{ items: typeof quoteTemplates; folderIndex?: string[] }>('/quote-templates')
      .then((res) => {
        if (cancelled) return;
        setQuoteTemplates(res.items || []);
        setPackageFolderIndex(res.folderIndex || []);
      })
      .catch(() => {
        /* non-blocking prefetch for walkthrough CTA */
      });
    return () => {
      cancelled = true;
    };
  }, [tab, quoteItems.length, canQuoteWrite, quoteTemplates.length]);
  useEffect(() => {
    if (tab !== 'quotations') return;
    if (quoteWorkspaceOpenedAtMsRef.current == null) {
      quoteWorkspaceOpenedAtMsRef.current = Date.now();
    }
  }, [tab]);

  useEffect(() => {
    if (!sendOpen || sendChannel !== 'whatsapp') return;
    let cancelled = false;
    api<
      Array<{ id: string; name: string; metaTemplateName: string; isActive: boolean }>
    >('/lead-sources/whatsapp-templates')
      .then((rows) => {
        if (!cancelled) setWaSendTemplates(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setWaSendTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sendOpen, sendChannel]);

  async function saveCurrentAsTemplate() {
    const name = templateName.trim();
    if (!name) {
      toastError('Enter a template name');
      return;
    }
    setSavingTemplate(true);
    try {
      const items = quoteItems.map((item) => serializeQuoteLine(item));
      const asNew = templateSaveAsNew;
      const tags = parseTemplateTagsCsv(templateTagsCsv);
      const folder = normalizeTemplateFolderLabel(templateFolder);
      let saved: { name?: string; versionNumber?: number; supersededTemplateId?: string | null };
      if (selectedQuoteVersion?.id && items.length === 0 && !quoteMeta.inclusions) {
        saved = await api('/quote-templates', {
          method: 'POST',
          body: JSON.stringify({
            name,
            versionId: selectedQuoteVersion.id,
            ...((tags.length || folder)
              ? { contentJson: { ...(tags.length ? { tags } : {}), ...(folder ? { folder } : {}) } }
              : {}),
            ...(id ? { tripId: id } : {}),
            ...(asNew ? { asNew: true } : {}),
          }),
        });
      } else {
        saved = await api('/quote-templates', {
          method: 'POST',
          body: JSON.stringify({
            name,
            contentJson: {
              currency:
                (selectedQuoteVersion as { currency?: string } | null)?.currency ||
                trip?.organization?.currency ||
                'INR',
              items,
              inclusions: quoteMeta.inclusions || undefined,
              exclusions: quoteMeta.exclusions || undefined,
              terms: quoteMeta.terms || null,
              destinationHint: destinations[0]?.name || undefined,
              ...(tags.length ? { tags } : {}),
              ...(folder ? { folder } : {}),
            },
            ...(selectedQuoteVersion?.id && items.length === 0
              ? { versionId: selectedQuoteVersion.id }
              : {}),
            ...(id ? { tripId: id } : {}),
            ...(asNew ? { asNew: true } : {}),
          }),
        });
      }
      const ver = saved.versionNumber ?? 1;
      toastSuccess(
        saved.supersededTemplateId
          ? `Template “${saved.name || name}” v${ver} saved (previous retired)`
          : `Template “${saved.name || name}” v${ver} saved`,
      );
      setSaveTemplateOpen(false);
      setTemplateName('');
      setTemplateTagsCsv('');
      setTemplateFolder('');
      setTemplateSaveAsNew(false);
      await loadQuoteTemplates();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save template');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function applyQuoteTemplate(templateId: string) {
    if (!id) return;
    const startDate = templateApplyStartDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      toastError('Set a travel start date before applying a template');
      return;
    }
    setApplyingTemplateId(templateId);
    try {
      const children = Math.max(0, Math.round(templateApplyChildren) || 0);
      const childAges = parseApplyChildAgesCsv(templateApplyChildAgesCsv);
      const childrenWithoutBed =
        children > 0
          ? Math.min(
              children,
              Math.max(0, Math.round(templateApplyChildrenWithoutBed) || 0),
            )
          : 0;
      const quotation = await api<{
        id: string;
        quoteNumber?: string;
        dateShiftDays?: number;
        tripStartDate?: string;
        tripStartStamped?: boolean;
        applyAdults?: number | null;
        applyChildren?: number | null;
        applyChildAges?: number[] | null;
        paxStampedCount?: number;
        rematchMatched?: number;
        rematchUnmatched?: number;
        itineraryDaysReanchored?: boolean;
        itineraryDaysSeeded?: boolean;
        itineraryDaysBuiltFromHotels?: boolean;
        versions?: Array<{ id: string; itemsJson?: unknown }>;
      }>(`/trips/${id}/quotations/from-template`, {
        method: 'POST',
        body: JSON.stringify({
          templateId,
          startDate,
          adults: Math.max(1, Math.round(templateApplyAdults) || 2),
          children,
          ...(children > 0 && childAges.length ? { childAges } : {}),
          ...(childrenWithoutBed > 0 ? { childrenWithoutBed } : {}),
        }),
      });
      setSelectedQuotationId(quotation.id);
      selectedQuotationIdRef.current = quotation.id;
      selectedQuoteVersionIdRef.current = quotation.versions?.[0]?.id ?? null;
      setSelectedQuoteVersionId(quotation.versions?.[0]?.id ?? null);
      writeQuoteQuery(quotation.id, quotation.versions?.[0]?.id ?? null);
      setUseTemplateOpen(false);
      dismissFirstQuoteWalkthrough();
      const shiftDays = Number(quotation.dateShiftDays) || 0;
      const bits = [
        quotation.quoteNumber
          ? `Started ${quotation.quoteNumber} from template`
          : 'Quotation created from template',
      ];
      if (quotation.tripStartStamped) {
        bits.push(`travel start ${quotation.tripStartDate || startDate}`);
      }
      if (
        quotation.paxStampedCount &&
        quotation.applyAdults != null
      ) {
        const kids = quotation.applyChildren ?? 0;
        const ages = quotation.applyChildAges?.length
          ? ` ages ${quotation.applyChildAges.join(',')}`
          : '';
        bits.push(
          `${quotation.applyAdults}A${kids ? `+${kids}C` : ''}${ages} on ${quotation.paxStampedCount} lines`,
        );
      }
      if (shiftDays) {
        bits.push(`dates shifted ${shiftDays > 0 ? '+' : ''}${shiftDays}d`);
      }
      const rematchMatched = Number(quotation.rematchMatched) || 0;
      const rematchUnmatched = Number(quotation.rematchUnmatched) || 0;
      if (rematchMatched > 0 || rematchUnmatched > 0) {
        bits.push(
          `${rematchMatched} rate-matched${
            rematchUnmatched ? ` · ${rematchUnmatched} need rates` : ''
          }`,
        );
      }
      if (quotation.itineraryDaysSeeded) {
        bits.push('story itinerary seeded');
      } else if (quotation.itineraryDaysBuiltFromHotels) {
        bits.push('story days built from hotels');
      } else if (quotation.itineraryDaysReanchored) {
        bits.push('itinerary days aligned to trip start');
      }
      toastSuccess(bits.join(' · '));
      await load();
      // Server rematch already priced the draft; skip client refresh when counts present.
      const seeded = quotation.versions?.[0]
        ? quoteLinesFromVersion(quotation.versions[0])
        : [];
      if (
        seeded.length &&
        rematchMatched <= 0 &&
        rematchUnmatched <= 0
      ) {
        // Win the race against load() hydration setState.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        await refreshPricesFromRates(undefined, seeded);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not apply template');
    } finally {
      setApplyingTemplateId(null);
    }
  }

  function selectQuotation(quotationId: string) {
    const q = (trip?.quotations || []).find((x: any) => x.id === quotationId);
    if (!q) return;
    setSelectedQuotationId(quotationId);
    selectedQuotationIdRef.current = quotationId;
    const versions = (q.versions || []) as Array<{
      id: string;
      status: string;
      label?: string | null;
      inclusions?: string | null;
      exclusions?: string | null;
      terms?: string | null;
      validUntil?: string | null;
    }>;
    const target =
      versions.find((v) => EDITABLE_QUOTE_STATUSES.has(v.status)) || versions[0] || null;
    quoteHydrated.current = false;
    setSelectedQuoteVersionId(target?.id ?? null);
    selectedQuoteVersionIdRef.current = target?.id ?? null;
    writeQuoteQuery(quotationId, target?.id ?? null);
    setQuoteItems(target ? quoteLinesFromVersion(target) : EMPTY_QUOTE_LINES);
    setQuoteMeta({
      inclusions: String(target?.inclusions || ''),
      exclusions: String(target?.exclusions || ''),
      terms: String(target?.terms || ''),
      validUntil: target?.validUntil ? String(target.validUntil).slice(0, 10) : '',
      label: String(target?.label || ''),
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

  async function lockQuoteFx(quoteCurrencyCode: string) {
    if (!selectedQuoteVersion?.id || quoteReadOnly) return;
    setLockingFx(true);
    try {
      await flushQuoteAutosaveBeforeSend();
      const rateRaw = fxRateInput.trim();
      const rate = rateRaw ? Number(rateRaw) : undefined;
      if (rateRaw && (!Number.isFinite(rate) || (rate as number) <= 0)) {
        toastError('Enter a positive FX rate (org currency per 1 quote unit)');
        return;
      }
      const res = await api<{
        currency?: string;
        fx?: QuoteFxLock | null;
        convertCount?: number;
        fxRefresh?: 'market' | 'stale';
      }>(`/quotations/${selectedQuoteVersion.id}/fx/lock`, {
        method: 'POST',
        body: JSON.stringify({
          quoteCurrency: quoteCurrencyCode,
          ...(rate != null ? { rate } : {}),
          convertLines: true,
        }),
      });
      const refreshCue = formatLockFxRefreshCue(res.fxRefresh);
      toastSuccess(
        res.convertCount
          ? `FX locked · ${res.convertCount} line amount${res.convertCount === 1 ? '' : 's'} converted${refreshCue}`
          : `FX locked for ${quoteCurrencyCode}${refreshCue}`,
      );
      setFxRateInput('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not lock FX');
    } finally {
      setLockingFx(false);
    }
  }

  async function acceptLatest() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    setAccepting(true);
    try {
      const res = await api<{
        leadOutcome?: LeadOutcome;
        hotelBookings?: {
          created: number;
          skipped: number;
          bookingIds: string[];
          warnings?: string[];
          allotmentHolds?: number;
        } | null;
        transferBookings?: {
          created: number;
          skipped: number;
          bookingIds: string[];
          warnings?: string[];
        } | null;
        activityBookings?: {
          created: number;
          skipped: number;
          bookingIds: string[];
          warnings?: string[];
        } | null;
        materializeFailures?: string[];
      }>(`/quotations/${version.id}/accept`, {
        method: 'POST',
      });
      setAcceptOpen(false);
      const hb = res.hotelBookings;
      const tb = res.transferBookings;
      const ab = res.activityBookings;
      const created =
        (hb?.created ?? 0) + (tb?.created ?? 0) + (ab?.created ?? 0);
      const skipped =
        (hb?.skipped ?? 0) + (tb?.skipped ?? 0) + (ab?.skipped ?? 0);
      const allotmentHolds = hb?.allotmentHolds ?? 0;
      const failures = res.materializeFailures || [];
      let base = 'Quote accepted · Trip confirmed';
      if (created > 0) {
        const bits = [
          hb && hb.created > 0 ? `${hb.created} hotel` : null,
          tb && tb.created > 0 ? `${tb.created} transfer` : null,
          ab && ab.created > 0 ? `${ab.created} activity` : null,
        ].filter(Boolean);
        base = `Quote accepted · ${bits.join(' + ')} enquir${created === 1 ? 'y' : 'ies'} created · Trip confirmed`;
      } else if (skipped > 0 && created === 0) {
        base = 'Quote accepted · Enquiries already linked · Trip confirmed';
      } else if (created === 0 && skipped === 0) {
        base =
          'Quote accepted · Trip confirmed · No hotel/transfer/activity lines with suppliers (add in Operations)';
      }
      if (allotmentHolds > 0) {
        base = `${base} · ${allotmentHolds} allotment hold${allotmentHolds === 1 ? '' : 's'}`;
      }
      if (failures.length) {
        toastWarning(
          `${leadOutcomeMessage(res.leadOutcome, base)} · ${failures.length} ops warning${failures.length === 1 ? '' : 's'}: ${failures[0]}${failures.length > 1 ? '…' : ''}`,
        );
      } else {
        toastSuccess(leadOutcomeMessage(res.leadOutcome, base));
      }
      await load();
      if (created > 0 || skipped > 0 || failures.length > 0) {
        changeTab('operations');
      }
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

  function openImportItineraryReview() {
    setImportReviewOpen(true);
  }

  async function confirmImportFromItinerary(selected: QuoteImportCandidate[]) {
    if (!selected.length) {
      toastError('Select at least one commercial service');
      return;
    }

    const partyAdults = Number(trip?.inquiry?.adults) || 0;
    const partyChildren = Number(trip?.inquiry?.children) || 0;
    let matched = 0;
    let unmatched = 0;
    let rateLookups = 0;

    const fresh = selected.map((c) => {
      const pricingUnit =
        c.serviceType === 'hotel'
          ? 'per_room'
          : c.serviceType === 'meal' || c.serviceType === 'activity'
            ? 'per_person'
            : 'per_service';
      const detailsRaw = detailsFromImportCandidate(c);
      if (c.serviceType === 'hotel' || c.serviceType === 'activity') {
        if (partyAdults > 0 && detailsRaw.adults == null) detailsRaw.adults = partyAdults;
        if (partyChildren > 0 && detailsRaw.children == null) {
          detailsRaw.children = partyChildren;
        }
      }
      const details = detailsFromResolveRecord(detailsRaw);
      const defaultTax = quoteDefaultTaxPercent();
      const preview = c.ratePreview;
      const line: QuoteLine = {
        id: c.lineId,
        description: `Day ${c.dayNumber}: ${c.title}`,
        quantity: 1,
        unitCost: null,
        unitSell: null,
        taxPercent: defaultTax,
        pricingUnit,
        serviceType: c.serviceType,
        details,
      };

      if (!c.resolveItem) return line;
      rateLookups += 1;

      if (preview?.status === 'matched') {
        matched += 1;
        const rateKind =
          preview.rateKind === 'hotel' ||
          preview.rateKind === 'transfer' ||
          preview.rateKind === 'activity'
            ? preview.rateKind
            : c.resolveItem.type === 'hotel' ||
                c.resolveItem.type === 'transfer' ||
                c.resolveItem.type === 'activity'
              ? c.resolveItem.type
              : undefined;
        const applied = applyRateResolveHit({
          serviceType: rateKind || c.serviceType,
          details,
          hit: {
            matched: true,
            rateKind: rateKind || null,
            rateId: preview.rateId,
            unitCost: preview.unitCost ?? 0,
            unitSell: preview.unitSell ?? 0,
            quantity: preview.quantity || 1,
            taxPercent: preview.taxPercent ?? 0,
            pricingUnit: preview.pricingUnit,
            rateMeta: preview.rateMeta,
          },
          forceSell: true,
        });
        return {
          ...line,
          details: applied.details,
          quantity: applied.quantity,
          unitCost: applied.unitCost,
          unitSell: applied.unitSell,
          taxPercent: applied.taxPercent,
          pricingUnit: QUOTE_PRICING_UNITS.has(applied.pricingUnit || '')
            ? (applied.pricingUnit as QuoteLine['pricingUnit'])
            : line.pricingUnit,
          rateKind: applied.rateKind || rateKind,
          rateId: applied.rateId,
          rateUnmatched: false,
          rateProvenance: applied.rateProvenance,
        };
      }

      unmatched += 1;
      const unmatchedApplied = applyRateResolveHit({
        serviceType:
          c.resolveItem.type === 'hotel' || c.resolveItem.type === 'transfer'
            ? c.resolveItem.type
            : c.serviceType,
        details,
        hit: {
          matched: false,
          rateKind:
            c.resolveItem.type === 'hotel' || c.resolveItem.type === 'transfer'
              ? c.resolveItem.type
              : null,
          rateId: null,
          unitCost: 0,
          unitSell: 0,
          quantity: 1,
          taxPercent: defaultTax,
          rateMeta: preview?.rateMeta,
        },
      });
      return {
        ...line,
        rateKind:
          unmatchedApplied.rateKind ||
          (c.resolveItem.type as 'hotel' | 'transfer' | 'activity'),
        rateUnmatched: true,
        rateBlockReason: unmatchedApplied.rateBlockReason,
        rateProvenance: undefined,
        unitCost: null,
        unitSell: null,
        details: unmatchedApplied.details,
      };
    });

    setQuoteItems((prev) => [...prev, ...fresh]);
    toastSuccess(
      `Imported ${fresh.length} commercial service${fresh.length === 1 ? '' : 's'}` +
        (rateLookups
          ? ` · ${matched} rate-matched${unmatched ? ` · ${unmatched} need rates` : ''}`
          : ''),
    );
    changeTab('quotations');
  }

  async function refreshPricesFromRates(
    lineIds?: string[],
    linesOverride?: QuoteLine[],
  ) {
    if (quoteReadOnly) {
      toastError('Switch to a draft version to refresh prices');
      return;
    }
    const sourceItems = linesOverride ?? quoteItems;
    const targetIds = lineIds ? new Set(lineIds) : null;
    const pricedCandidates = sourceItems.filter((line) => {
      if (targetIds && !targetIds.has(line.id)) return false;
      return (
        line.rateKind === 'hotel' ||
        line.rateKind === 'transfer' ||
        line.rateKind === 'activity' ||
        line.serviceType === 'activity' ||
        line.id.startsWith('itin-')
      );
    });
    if (!pricedCandidates.length) {
      if (linesOverride) return;
      toastError(
        targetIds
          ? 'Could not match this line back to an itinerary hotel/transfer'
          : 'No hotel/transfer lines to refresh — add from itinerary first',
      );
      return;
    }

    const resolveItems = pricedCandidates
      .map((line) => {
        const fromDetails = resolvePayloadFromQuoteDetails(
          line.id,
          line.serviceType || line.rateKind,
          line.details,
          trip?.startDate,
        );
        if (fromDetails) return fromDetails;

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
            mealPlan: dayItem.item.details?.mealPlan,
            nights: dayItem.item.details?.nights,
            vehicleTypeId: dayItem.item.details?.vehicleTypeId,
            fromPlaceId: dayItem.item.details?.fromPlaceId,
            toPlaceId: dayItem.item.details?.toPlaceId,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (!resolveItems.length) {
      if (linesOverride) return;
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
          partyId: trip?.party?.id || undefined,
          destinationPlaceOfSupply:
            trip?.destinationPlaceOfSupply || undefined,
          items: resolveItems,
        }),
      });
      const map = new Map(res.items.map((r) => [r.itemId, r]));
      const markupDefault = quoteDefaultMarkupPercent();
      const applyHit = (line: QuoteLine): QuoteLine => {
        const hit = map.get(line.id);
        if (!hit) return line;
        const resolveRow = resolveItems.find((r) => r.itemId === line.id);
        const baseDetails =
          line.details ||
          detailsFromResolveRecord(
            resolveRow?.details as Record<string, unknown> | undefined,
          );
        const serviceType =
          line.serviceType ||
          line.rateKind ||
          (hit.rateKind === 'hotel' ||
          hit.rateKind === 'transfer' ||
          hit.rateKind === 'activity'
            ? hit.rateKind
            : undefined);
        const applied = applyRateResolveHit({
          serviceType,
          details: baseDetails,
          hit,
          defaultMarkupPercent: markupDefault,
          previousUnitSell: line.unitSell,
          forceSell: !line.details?.sellManual,
        });
        return {
          ...line,
          details: applied.details,
          quantity: applied.quantity,
          unitCost: applied.unitCost,
          unitSell: applied.unitSell,
          taxPercent: applied.taxPercent,
          pricingUnit: QUOTE_PRICING_UNITS.has(applied.pricingUnit || '')
            ? (applied.pricingUnit as QuoteLine['pricingUnit'])
            : line.pricingUnit,
          rateKind: applied.rateKind || line.rateKind,
          rateId: applied.rateId,
          rateUnmatched: applied.rateUnmatched,
          rateBlockReason: applied.rateBlockReason,
          rateProvenance: applied.rateProvenance,
        };
      };
      if (linesOverride) {
        setQuoteItems(linesOverride.map(applyHit));
      } else {
        setQuoteItems((prev) => prev.map(applyHit));
      }
      toastSuccess(
        `Refreshed prices · ${res.matchedCount} matched${
          res.unmatchedCount ? ` · ${res.unmatchedCount} unmatched` : ''
        }`,
      );
    } catch (e) {
      if (!linesOverride) {
        toastError(e instanceof Error ? e.message : 'Could not refresh prices');
      }
    }
  }


  async function flushQuoteAutosaveBeforeSend(): Promise<boolean> {
    for (let i = 0; i < 6; i++) {
      while (quoteSavingRef.current) {
        await new Promise((r) => setTimeout(r, 40));
      }
      const dirty =
        quoteSaveState === 'pending' ||
        quoteSaveState === 'saving' ||
        quoteSaveState === 'error';
      if (!dirty) return true;
      if (quoteSaveState === 'error' && i > 0) {
        toastError(quoteSaveError || 'Save the quotation before sending');
        return false;
      }
      await autosaveQuote({ manual: true, attempt: 0 });
      await new Promise((r) => setTimeout(r, 80));
    }
    if (quoteSaveState === 'error' || quoteSaveState === 'pending' || quoteSaveState === 'saving') {
      toastError(quoteSaveError || 'Save the quotation before sending');
      return false;
    }
    return true;
  }

  async function recordFitTimingIfNeeded(versionId: string) {
    const openedAtMs = quoteWorkspaceOpenedAtMsRef.current;
    if (openedAtMs == null) return;
    try {
      await api('/quotations/fit-timing', {
        method: 'POST',
        body: JSON.stringify({
          quotationVersionId: versionId,
          openedAtMs,
          milestone: 'first_send',
        }),
      });
    } catch {
      /* non-blocking telemetry */
    }
  }

  async function sendLatest() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    if (!(await flushQuoteAutosaveBeforeSend())) return;
    if (sendChannel === 'whatsapp') {
      const phone = sendPhone.trim() || trip?.party?.phone || '';
      if (!phone.trim()) {
        toastError('Enter a WhatsApp mobile number');
        return;
      }
      if (!canSendQuote) {
        toastError(sendBlockedReason || 'Complete pricing before sending');
        return;
      }
      try {
        const res = await api<{
          sent?: boolean;
          cloudConfigured?: boolean;
          fallbackWaMeUrl?: string;
          demo?: boolean;
          message?: string;
          requiresMarkSent?: boolean;
          validityExtendedTo?: string | null;
          validityGraceUsed?: boolean;
        }>(`/quotations/${version.id}/send-whatsapp`, {
          method: 'POST',
          body: JSON.stringify({
            toPhone: phone.trim(),
            ...(sendExtendValidity ? { extendValidity: true } : {}),
          }),
        });
        if (res.sent) {
          toastSuccess(
            res.validityExtendedTo || res.validityGraceUsed
              ? `Proposal sent on WhatsApp${formatValiditySendToastSuffix(res)}`
              : res.demo
                ? 'Quote marked sent (WhatsApp demo mode — Cloud token is seed-demo)'
                : 'Proposal sent on WhatsApp',
          );
          void recordFitTimingIfNeeded(version.id);
          setSendOpen(false);
          setWaMarkSentPending(false);
          await load();
          return;
        }
        if (res.fallbackWaMeUrl) {
          window.open(res.fallbackWaMeUrl, '_blank', 'noopener,noreferrer');
          setWaMarkSentPending(true);
          toastWarning(
            res.message ||
              'Opened WhatsApp — confirm Mark as sent after you send the message',
          );
          return;
        }
        toastError('Could not send on WhatsApp');
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Could not send on WhatsApp');
      }
      return;
    }
    if (!sendEmail.trim()) {
      toastError('Enter a recipient email');
      return;
    }
    if (!canSendQuote) {
      toastError(sendBlockedReason || 'Complete pricing before sending');
      return;
    }
    try {
      const res = await api<{
        validityExtendedTo?: string | null;
        validityGraceUsed?: boolean;
      }>(`/quotations/${version.id}/send`, {
        method: 'POST',
        body: JSON.stringify({
          toEmail: sendEmail.trim(),
          ...(sendExtendValidity ? { extendValidity: true } : {}),
        }),
      });
      toastSuccess(
        res.validityExtendedTo || res.validityGraceUsed
          ? `Email queued${formatValiditySendToastSuffix(res)}`
          : 'Email queued — PDF will be attached when delivered',
      );
      void recordFitTimingIfNeeded(version.id);
      setSendOpen(false);
      setWaMarkSentPending(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send quote');
    }
  }

  async function markWhatsappSent() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    if (!(await flushQuoteAutosaveBeforeSend())) return;
    if (!canSendQuote) {
      toastError(sendBlockedReason || 'Complete pricing before marking sent');
      return;
    }
    setWaMarkSentBusy(true);
    try {
      const res = await api<{
        validityExtendedTo?: string | null;
        validityGraceUsed?: boolean;
      }>(`/quotations/${version.id}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'whatsapp',
          ...(sendExtendValidity ? { extendValidity: true } : {}),
        }),
      });
      toastSuccess(
        res.validityExtendedTo || res.validityGraceUsed
          ? `Marked sent${formatValiditySendToastSuffix(res)}`
          : 'Quote marked as sent',
      );
      void recordFitTimingIfNeeded(version.id);
      setWaMarkSentPending(false);
      setSendOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark as sent');
    } finally {
      setWaMarkSentBusy(false);
    }
  }

  function marginGateLineIds() {
    return quoteItems
      .filter((line) => {
        const v = lineMarginPolicyViolation(
          line.unitCost,
          line.unitSell,
          quoteMinMarginPercent,
        );
        return Boolean(v) && !line.marginOverride?.reason?.trim();
      })
      .map((line) => line.id);
  }

  function openMarginOverrideDialog(pending: 'send' | 'requestApproval' | null) {
    if (!canOverrideBelowMargin) {
      toastError(
        quoteMinMarginPercent > 0
          ? `Services below the ${quoteMinMarginPercent}% margin floor need a manager with below-margin approval. Adjust sell prices or ask them to override selected services.`
          : 'Selling below cost requires a manager with below-margin approval. Adjust sell prices or ask them to override selected services.',
      );
      return;
    }
    const ids = marginGateLineIds();
    if (!ids.length) {
      toastError('No services breach margin policy');
      return;
    }
    setMarginOverridePending(pending);
    setMarginOverrideReason('');
    setMarginOverrideLineIds(ids);
    setMarginOverrideOpen(true);
  }

  async function submitRequestApproval(extendValidity: boolean) {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      const res = await api<{
        validityExtendedTo?: string | null;
        validityGraceUsed?: boolean;
      }>(`/quotations/${version.id}/request-approval`, {
        method: 'POST',
        body: JSON.stringify({
          ...(extendValidity ? { extendValidity: true } : {}),
        }),
      });
      toastSuccess(
        res.validityExtendedTo || res.validityGraceUsed
          ? `Approval requested${formatValiditySendToastSuffix(res)}`
          : 'Approval requested',
      );
      setRequestApprovalOpen(false);
      setApprovalExtendValidity(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not request approval');
    }
  }

  async function requestApproval() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    if (!(await flushQuoteAutosaveBeforeSend())) return;
    if (!canRequestApproval) {
      const withoutLoss = quoteSendBlockedReason({
        itemCount: quoteItems.length,
        missingSellCount,
        missingCostCount: costGaps.missingCount,
        marginGateCount: 0,
        rateDriftCount,
        allotmentBlockCount: allotmentWarnCount,
        capacityBlockCount: capacityWarnCount,
        minStayBlockCount: minStayWarnCount,
        maxStayBlockCount: maxStayWarnCount,
        stopSaleBlockCount,
        minMarginPercent: quoteMinMarginPercent,
        canViewCost: Boolean(canViewCost),
        hasValidUntil,
        validUntilExpired,
        validUntilBlocksSend,
        travellerCount,
        statusAllowsSend: true,
      });
      if (!withoutLoss && marginGateCount > 0) {
        openMarginOverrideDialog('requestApproval');
        return;
      }
      toastError(pricingBlockedReason || 'Complete pricing before requesting approval');
      return;
    }
    if (validUntilGraceCue || validUntilNearExpiryMessage) {
      setApprovalExtendValidity(false);
      setRequestApprovalOpen(true);
      return;
    }
    await submitRequestApproval(false);
  }

  function openSendFlow() {
    if (!selectedQuoteVersion || !quoteCan.has('send')) {
      toastError(sendBlockedReason || 'Complete pricing before sending');
      return;
    }
    if (canSendQuote) {
      const nearExpiry = validUntilNearExpiryMessage;
      if (nearExpiry) toastWarning(nearExpiry);
      setSendEmail(trip?.party?.email || sendEmail);
      setSendPhone(trip?.party?.phone || sendPhone);
      setSendOpen(true);
      return;
    }
    const withoutLoss = quoteSendBlockedReason({
      itemCount: quoteItems.length,
      missingSellCount,
      missingCostCount: costGaps.missingCount,
      marginGateCount: 0,
      rateDriftCount,
      allotmentBlockCount: allotmentWarnCount,
      capacityBlockCount: capacityWarnCount,
      minStayBlockCount: minStayWarnCount,
      maxStayBlockCount: maxStayWarnCount,
      stopSaleBlockCount,
      minMarginPercent: quoteMinMarginPercent,
      canViewCost: Boolean(canViewCost),
      hasValidUntil,
      validUntilExpired,
      validUntilBlocksSend,
      travellerCount,
      statusAllowsSend: true,
    });
    if (!withoutLoss && marginGateCount > 0) {
      openMarginOverrideDialog('send');
      return;
    }
    toastError(sendBlockedReason || 'Complete pricing before sending');
  }

  async function applyNegativeMarginOverride() {
    const reason = marginOverrideReason.trim();
    if (!reason) {
      toastError('Enter a reason for selling below cost');
      return;
    }
    if (!canOverrideBelowMargin) {
      toastError('You need below-margin approval permission');
      return;
    }
    if (!marginOverrideLineIds.length) {
      toastError('Select at least one loss-making service');
      return;
    }
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    const pending = marginOverridePending;
    setMarginOverrideSaving(true);
    try {
      const updated = await api<{
        id: string;
        versionLock?: number;
        itemsJson?: unknown;
      }>(`/quotations/${version.id}/margin-overrides`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          lineIds: marginOverrideLineIds,
        }),
      });
      if (typeof updated.versionLock === 'number') {
        quoteLockRef.current = updated.versionLock;
      }
      setQuoteItems(quoteLinesFromVersion(updated));
      setTrip((prev: any) => {
        if (!prev) return prev;
        const quotations = (prev.quotations || []).map((q: any) => {
          const versions = (q.versions || []).map((v: any) =>
            v.id === updated.id ? { ...v, ...updated } : v,
          );
          return { ...q, versions };
        });
        return { ...prev, quotations };
      });
      setMarginOverrideOpen(false);
      setMarginOverrideReason('');
      const overriddenCount = marginOverrideLineIds.length;
      setMarginOverrideLineIds([]);
      setMarginOverridePending(null);
      toastSuccess(
        `Override recorded for ${overriddenCount} service${overriddenCount === 1 ? '' : 's'}`,
      );
      if (pending === 'send') {
        setSendEmail(trip?.party?.email || sendEmail);
        setSendOpen(true);
        return;
      }
      if (pending === 'requestApproval') {
        if (validUntilGraceCue || validUntilNearExpiryMessage) {
          setApprovalExtendValidity(false);
          setRequestApprovalOpen(true);
          return;
        }
        await submitRequestApproval(false);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not record margin override');
    } finally {
      setMarginOverrideSaving(false);
    }
  }

  function addBlankQuoteLine() {
    if (!quoteCan.has('addLines') || quoteReadOnly) return;
    setQuoteItems((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}`,
        description: 'New service',
        quantity: 1,
        unitCost: null,
        unitSell: null,
        taxPercent: quoteDefaultTaxPercent(),
        pricingUnit: 'per_service',
        serviceType: 'custom',
      },
    ]);
  }

  function markLineIncluded(id: string) {
    setQuoteItems((prev) =>
      prev.map((line) =>
        line.id === id
          ? {
              ...line,
              unitCost: 0,
              unitSell: 0,
              rateUnmatched: false,
              rateId: undefined,
              rateProvenance: undefined,
              rateBlockReason: undefined,
              includedMeta: {
                at: new Date().toISOString(),
                reason: 'Marked as included (no customer charge)',
                previousUnitCost: line.unitCost,
                previousUnitSell: line.unitSell,
                byUserId: me?.id,
              },
            }
          : line,
      ),
    );
    toastSuccess('Marked as included (₹0)');
  }

  function confirmMarkUnpricedAsIncluded() {
    const targets = quoteItems.filter(
      (line) => line.unitSell == null || (canViewCost && line.unitCost == null),
    );
    if (!targets.length) {
      toastError('No unpriced services to mark');
      setIncludedConfirmOpen(false);
      return;
    }
    const ids = new Set(targets.map((t) => t.id));
    const at = new Date().toISOString();
    setQuoteItems((prev) =>
      prev.map((line) =>
        ids.has(line.id)
          ? {
              ...line,
              unitCost: line.unitCost == null ? 0 : line.unitCost,
              unitSell: line.unitSell == null ? 0 : line.unitSell,
              rateUnmatched: false,
              includedMeta: {
                at,
                reason: 'Bulk marked as included — appears on proposal without increasing total',
                previousUnitCost: line.unitCost,
                previousUnitSell: line.unitSell,
                byUserId: me?.id,
              },
            }
          : line,
      ),
    );
    setIncludedConfirmOpen(false);
    toastSuccess(
      `${targets.length} service${targets.length === 1 ? '' : 's'} marked as included (₹0)`,
    );
  }

  function quoteMarkupSourceLabel(): string {
    const party = trip?.party as {
      businessType?: string | null;
      metadataJson?: unknown;
    } | null;
    if (partyMarkupPercentOverride(party) != null) return 'client override';
    if (partyUsesAgentMarkup(party)) return 'agent / B2B';
    return 'org default';
  }

  function confirmApplyDefaultMarkup() {
    confirmApplyMarkup({
      mode: 'percent',
      value: quoteDefaultMarkupPercent(),
      label: quoteMarkupSourceLabel(),
    });
  }

  function confirmApplyMarkupPreset(preset: MarkupPreset) {
    confirmApplyMarkup({
      mode: preset.mode,
      value: preset.value,
      label: preset.label,
    });
  }

  function confirmApplyMarkup(input: {
    mode: 'percent' | 'fixed';
    value: number;
    label: string;
  }) {
    const targets = quoteItems.filter(
      (line) => line.unitCost != null && line.unitSell == null,
    );
    if (!targets.length) {
      toastError('No lines with cost and missing sell price');
      setMarkupConfirmOpen(false);
      return;
    }
    const ids = new Set(targets.map((t) => t.id));
    setQuoteItems((prev) =>
      prev.map((line) => {
        if (!ids.has(line.id) || line.unitCost == null) return line;
        const sell = sellFromMarkupPreset(line.unitCost, {
          mode: input.mode,
          value: input.value,
        });
        return {
          ...line,
          unitSell: sell,
          rateUnmatched: false,
          details: {
            ...(line.details || {}),
            markupMode: input.mode,
            markupValue: input.value,
            sellManual: false,
          },
        };
      }),
    );
    setMarkupConfirmOpen(false);
    toastSuccess(
      `Applied ${input.label} markup to ${targets.length} service${targets.length === 1 ? '' : 's'}`,
    );
  }

  function confirmApplyDefaultTax(taxPercent = quoteDefaultTaxPercent()) {
    const targets = quoteItems.filter(
      (line) => !line.includedMeta && Number(line.taxPercent) === 0,
    );
    if (!targets.length) {
      toastError('No billable lines at 0% tax');
      setTaxConfirmOpen(false);
      return;
    }
    const ids = new Set(targets.map((t) => t.id));
    setQuoteItems((prev) =>
      prev.map((line) =>
        ids.has(line.id) ? { ...line, taxPercent } : line,
      ),
    );
    setTaxConfirmOpen(false);
    toastSuccess(
      `Applied ${taxPercent}% tax to ${targets.length} service${targets.length === 1 ? '' : 's'}`,
    );
  }

  function markUnpricedAsIncluded() {
    setIncludedConfirmOpen(true);
  }

  function applyDefaultMarkup() {
    const targets = quoteItems.filter(
      (line) => line.unitCost != null && line.unitSell == null,
    );
    if (!targets.length) {
      toastError('No lines with cost and missing sell price');
      return;
    }
    setMarkupApplyTarget({ kind: 'default' });
    setMarkupConfirmOpen(true);
  }

  function applyMarkupPreset(preset: MarkupPreset) {
    const targets = quoteItems.filter(
      (line) => line.unitCost != null && line.unitSell == null,
    );
    if (!targets.length) {
      toastError('No lines with cost and missing sell price');
      return;
    }
    setMarkupApplyTarget({ kind: 'preset', preset });
    setMarkupConfirmOpen(true);
  }

  function quoteMarkupPresets(): MarkupPreset[] {
    return resolveOrgMarkupPresets(
      trip?.organization?.settingsJson as { markupPresets?: unknown } | null,
    );
  }

  function applyDefaultTax() {
    const targets = quoteItems.filter(
      (line) => !line.includedMeta && Number(line.taxPercent) === 0,
    );
    if (!targets.length) {
      toastError('No billable lines at 0% tax');
      return;
    }
    setTaxConfirmOpen(true);
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

  async function savePdfToDrive() {
    const version = requireSelectedQuoteVersion();
    if (!version) return;
    try {
      const res = await api<{ drive?: { webViewLink?: string; name?: string } }>(
        `/quotations/${version.id}/save-to-drive`,
        { method: 'POST' },
      );
      toastSuccess(
        res.drive?.name ? `Saved to Drive: ${res.drive.name}` : 'Proposal saved to Google Drive',
      );
      if (res.drive?.webViewLink) {
        window.open(res.drive.webViewLink, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save to Drive');
    }
  }

  function quoteDefaultMarkupPercent(): number {
    const settings = trip?.organization?.settingsJson as
      | { defaultMarkupPercent?: number; agentMarkupPercent?: number }
      | null
      | undefined;
    return resolveOrgMarkupPercent(settings, {
      party: trip?.party as {
        businessType?: string | null;
        metadataJson?: unknown;
      } | null,
    });
  }

  function quoteDefaultTaxPercent(): number {
    const settings = trip?.organization?.settingsJson as
      | { defaultTaxPercent?: number }
      | null
      | undefined;
    const n = Number(settings?.defaultTaxPercent);
    return Number.isFinite(n) ? n : 5;
  }

  function updateQuoteLine(id: string, patch: Partial<(typeof quoteItems)[0]>) {
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        let next = { ...item, ...patch };

        // Typing sell in the table marks it manual so cost edits do not overwrite it.
        // Clearing sell re-enables auto markup from cost.
        if ('unitSell' in patch && !('unitCost' in patch)) {
          next.details = {
            ...(next.details || {}),
            sellManual: patch.unitSell != null,
          };
        }

        // Entering / changing cost auto-fills sell from markup unless sell was typed manually.
        if ('unitCost' in patch && !('unitSell' in patch)) {
          const cost = next.unitCost;
          const sellManual = Boolean(next.details?.sellManual);
          const markupPercent =
            next.details?.markupMode === 'fixed'
              ? quoteDefaultMarkupPercent()
              : next.details?.markupValue ?? quoteDefaultMarkupPercent();
          if (cost != null && Number.isFinite(cost) && !sellManual) {
            const sell =
              next.details?.markupMode === 'fixed'
                ? Math.round((cost + (next.details?.markupValue ?? 0)) * 100) / 100
                : Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
            next = {
              ...next,
              unitSell: sell,
              rateUnmatched: false,
              details: {
                ...(next.details || {}),
                markupMode: next.details?.markupMode || 'percent',
                markupValue:
                  next.details?.markupMode === 'fixed'
                    ? next.details?.markupValue
                    : markupPercent,
                sellManual: false,
              },
            };
          }
        }

        if ('unitCost' in patch || 'unitSell' in patch) {
          const violation = lineMarginPolicyViolation(
            next.unitCost,
            next.unitSell,
            quoteMinMarginPercent,
          );
          if (!violation) {
            next.marginOverride = undefined;
          } else if (
            next.marginOverride &&
            (next.marginOverride.unitCost !== next.unitCost ||
              next.marginOverride.unitSell !== next.unitSell)
          ) {
            // Prices changed after override — require a fresh authorisation.
            next.marginOverride = undefined;
          }
        }
        return next;
      }),
    );
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
        id: 'nationality',
        header: 'Nationality',
        size: 140,
        cell: ({ row }) => {
          const code = row.original.traveller?.nationality;
          if (!code) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <span className="text-muted-foreground">
              {hotelNationalityLabelUi(code)}
            </span>
          );
        },
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
      ...(canTripWrite
        ? [
            {
              id: 'actions',
              header: '',
              size: 88,
              cell: ({ row }: { row: { original: any } }) => (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditTraveller(row.original)}
                >
                  Edit
                </Button>
              ),
            } as ColumnDef<any>,
          ]
        : []),
    ],
    [canTripWrite],
  );

  const quoteColumns = useMemo<ColumnDef<(typeof quoteItems)[0]>[]>(
    () => [
      {
        accessorKey: 'description',
        header: 'Description',
        size: 200,
        minSize: 120,
        meta: { fill: true },
        cell: ({ row }) => {
          const violation = canViewCost
            ? lineMarginPolicyViolation(
                row.original.unitCost,
                row.original.unitSell,
                quoteMinMarginPercent,
              )
            : null;
          const badgeTitle = violation
            ? violation.kind === 'loss'
              ? `Sell is ${formatCurrency(violation.belowBy)} below cost · Profit ${formatCurrency(violation.profit)} · Margin ${formatPercent(violation.marginPercent)}`
              : `Margin ${formatPercent(violation.marginPercent)} is below the ${violation.floorPercent}% floor · Profit ${formatCurrency(violation.profit)}`
            : undefined;
          const summary = quoteServiceDetailsSummary(
            row.original.serviceType || row.original.rateKind,
            row.original.details,
          );
          const statusBits = (
            <>
              {violation?.kind === 'loss' ? (
                <BrandTooltip
                  label={badgeTitle}
                  side="top"
                  align="start"
                  className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                >
                  <span className="rounded bg-destructive/15 px-1.5 py-px text-[10px] font-medium text-destructive">
                    Loss
                  </span>
                </BrandTooltip>
              ) : violation?.kind === 'below_floor' ? (
                <BrandTooltip
                  label={badgeTitle}
                  side="top"
                  align="start"
                  className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                >
                  <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:text-amber-300">
                    Below floor
                  </span>
                </BrandTooltip>
              ) : null}
              {row.original.marginOverride?.reason?.trim() ? (
                <BrandTooltip
                  label={row.original.marginOverride.reason}
                  side="top"
                  align="start"
                  className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                >
                  <span className="text-[10px] text-muted-foreground">Override</span>
                </BrandTooltip>
              ) : null}
              {row.original.details?.priceSource === 'expired' ? (
                <span className="text-[10px] text-amber-700 dark:text-amber-400">Rematch</span>
              ) : row.original.details?.priceSource === 'manual' ||
                row.original.details?.priceSource === 'overridden' ? (
                <span className="text-[10px] text-muted-foreground">Manual</span>
              ) : row.original.rateBlockReason ? (
                <BrandTooltip
                  label={rateBlockReasonMessage(row.original.rateBlockReason)}
                  side="top"
                  align="start"
                  className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                >
                  <span className="text-[10px] text-amber-700 dark:text-amber-400">
                    {rateBlockReasonLabel(row.original.rateBlockReason)}
                  </span>
                </BrandTooltip>
              ) : row.original.rateUnmatched ? (
                <span className="text-[10px] text-amber-700 dark:text-amber-400">No rate</span>
              ) : row.original.rateId || row.original.details?.priceSource === 'matched' ? (
                <BrandTooltip
                  label={[
                    rateProvenanceSourceLabel(row.original.rateProvenance),
                    row.original.details?.rateLabel,
                    row.original.rateProvenance?.startDate ||
                    row.original.rateProvenance?.endDate
                      ? `Season ${row.original.rateProvenance.startDate || '…'} → ${row.original.rateProvenance.endDate || '…'}`
                      : null,
                    row.original.rateProvenance?.unitCostAtMatch != null
                      ? `Buy at match ${row.original.rateProvenance.unitCostAtMatch}`
                      : null,
                    formatRateTimestamp(
                      row.original.rateProvenance?.rateUpdatedAt ||
                        row.original.details?.rateLastUpdated,
                    )
                      ? `Chart updated ${formatRateTimestamp(
                          row.original.rateProvenance?.rateUpdatedAt ||
                            row.original.details?.rateLastUpdated,
                        )}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  side="top"
                  align="start"
                  className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                >
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    {row.original.rateProvenance?.isSystem ? 'Catalog' : 'Contract'}
                  </span>
                </BrandTooltip>
              ) : null}
            </>
          );
          return (
            <div className="min-w-0 space-y-1 py-0.5">
              <div className="flex h-5 min-w-0 items-center gap-1.5">
                <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {serviceTypeLabel(row.original.serviceType || row.original.rateKind || 'custom')}
                </span>
                {statusBits}
                {summary ? (
                  <div className="ml-auto min-w-0 max-w-[55%]">
                    <BrandTooltip
                      label={summary}
                      side="top"
                      align="end"
                      className="max-w-sm whitespace-normal break-words text-left font-normal leading-snug"
                    >
                      <button
                        type="button"
                        className="block w-full cursor-pointer truncate text-right text-[10px] leading-[14px] text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setQuoteDetailLineId(row.original.id)}
                      >
                        {summary}
                      </button>
                    </BrandTooltip>
                  </div>
                ) : null}
              </div>
              <BrandTooltip
                label={row.original.description}
                side="top"
                align="start"
                disabled={!row.original.description?.trim()}
                className="max-w-sm whitespace-normal break-words text-left font-normal leading-snug"
              >
                <div className="min-w-0">
                  <Input
                    className="h-9"
                    value={row.original.description}
                    disabled={quoteReadOnly}
                    onChange={(e) =>
                      updateQuoteLine(row.original.id, { description: e.target.value })
                    }
                  />
                </div>
              </BrandTooltip>
            </div>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        size: 52,
        minSize: 52,
        maxSize: 52,
        cell: ({ row }) => (
          <QuoteLineFieldShell>
            <QuoteNumberInput
              className="w-full"
              disabled={quoteReadOnly}
              value={row.original.quantity}
              onChange={(quantity) =>
                updateQuoteLine(row.original.id, { quantity: quantity ?? 0 })
              }
            />
          </QuoteLineFieldShell>
        ),
      },
      ...(canViewCost
        ? [
            {
              accessorKey: 'unitCost',
              header: dmcWorkspace ? 'Net / cost' : 'Cost',
              size: 108,
              minSize: 108,
              maxSize: 108,
              cell: ({ row }: { row: { original: QuoteLine } }) => (
                <QuoteLineFieldShell>
                  <BrandTooltip
                    label="Buy rate missing — enter cost"
                    side="top"
                    align="start"
                    disabled={row.original.unitCost != null}
                    className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
                  >
                    <div className="min-w-0">
                      <QuoteNumberInput
                        className="w-full"
                        disabled={quoteReadOnly}
                        showCurrency
                        currency={quoteCurrency}
                        placeholder="Enter cost"
                        value={row.original.unitCost}
                        onChange={(unitCost) => updateQuoteLine(row.original.id, { unitCost })}
                      />
                    </div>
                  </BrandTooltip>
                </QuoteLineFieldShell>
              ),
            } as ColumnDef<QuoteLine>,
          ]
        : []),
      {
        accessorKey: 'unitSell',
        header: dmcWorkspace ? 'Sell (to buyer)' : 'Sell',
        size: 108,
        minSize: 108,
        maxSize: 108,
        cell: ({ row }) => {
          const violation = canViewCost
            ? lineMarginPolicyViolation(
                row.original.unitCost,
                row.original.unitSell,
                quoteMinMarginPercent,
              )
            : null;
          const tip =
            row.original.unitSell == null
              ? 'Sell price missing'
              : violation?.kind === 'loss'
                ? `Sell is ${formatCurrency(violation.belowBy)} below cost · Profit ${formatCurrency(violation.profit)} · Margin ${formatPercent(violation.marginPercent)}`
                : violation?.kind === 'below_floor'
                  ? `Margin ${formatPercent(violation.marginPercent)} is below the ${violation.floorPercent}% floor`
                  : undefined;
          return (
            <QuoteLineFieldShell>
              <BrandTooltip
                label={tip}
                side="top"
                align="start"
                disabled={!tip}
                className="max-w-xs whitespace-normal break-words text-left font-normal leading-snug"
              >
                <div className="min-w-0">
                  <QuoteNumberInput
                    className="w-full"
                    disabled={quoteReadOnly}
                    showCurrency
                    currency={quoteCurrency}
                    invalid={Boolean(violation)}
                    placeholder="Enter sell"
                    value={row.original.unitSell}
                    onChange={(unitSell) => updateQuoteLine(row.original.id, { unitSell })}
                  />
                </div>
              </BrandTooltip>
            </QuoteLineFieldShell>
          );
        },
      },
      {
        accessorKey: 'taxPercent',
        header: `${taxTotalsLabel} %`,
        size: 56,
        minSize: 56,
        maxSize: 56,
        cell: ({ row }) => (
          <QuoteLineFieldShell>
            <QuoteNumberInput
              className="w-full"
              disabled={quoteReadOnly}
              value={row.original.taxPercent}
              onChange={(taxPercent) =>
                updateQuoteLine(row.original.id, { taxPercent: taxPercent ?? 0 })
              }
            />
          </QuoteLineFieldShell>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 36,
        minSize: 36,
        maxSize: 36,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <QuoteLineFieldShell className="items-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground"
                  aria-label="Service actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setQuoteDetailLineId(row.original.id)}>
                  Edit details
                </DropdownMenuItem>
                {!quoteReadOnly &&
                (row.original.rateUnmatched ||
                  row.original.rateKind === 'hotel' ||
                  row.original.rateKind === 'transfer' ||
                  row.original.serviceType === 'hotel' ||
                  row.original.serviceType === 'transfer' ||
                  row.original.id.startsWith('itin-')) ? (
                  <DropdownMenuItem
                    onClick={() => void refreshPricesFromRates([row.original.id])}
                  >
                    Match rate
                  </DropdownMenuItem>
                ) : null}
                {!quoteReadOnly ? (
                  <DropdownMenuItem onClick={() => markLineIncluded(row.original.id)}>
                    Mark as included (₹0)
                  </DropdownMenuItem>
                ) : null}
                {!quoteReadOnly ? (
                  <DropdownMenuItem
                    onClick={() => {
                      removeQuoteLine(row.original.id);
                      toastSuccess('Removed from quote');
                    }}
                  >
                    Mark non-billable / remove
                  </DropdownMenuItem>
                ) : null}
                {!quoteReadOnly ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => removeQuoteLine(row.original.id)}
                    >
                      Remove
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </QuoteLineFieldShell>
        ),
      },
    ],
    [
      canViewCost,
      dmcWorkspace,
      quoteReadOnly,
      quoteCurrency,
      quoteMinMarginPercent,
      taxTotalsLabel,
    ],
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

  const quoteTableLeading =
    (trip.quotations?.length ?? 0) > 1 || quoteVersions.length > 1 ? (
      <>
        {(trip.quotations?.length ?? 0) > 1 ? (
          <Combobox
            className="w-[9.5rem] shrink-0"
            size="sm"
            value={activeQuotation?.id || ''}
            onChange={(qid) => selectQuotation(qid)}
            options={(trip.quotations || []).map(
              (q: { id: string; quoteNumber?: string }) => ({
                value: q.id,
                label: q.quoteNumber || q.id,
              }),
            )}
            placeholder="Quotation"
            searchable={(trip.quotations?.length ?? 0) > 6}
          />
        ) : null}
        {quoteVersions.length > 1 ? (
          <Combobox
            className="w-[14rem] shrink-0"
            size="sm"
            value={selectedQuoteVersion?.id || ''}
            onChange={(vid) => {
              const v = quoteVersions.find((x) => x.id === vid);
              if (v) selectQuoteVersion(v);
            }}
            options={quoteVersions.map((v) => ({
              value: v.id,
              label: quoteVersionOptionLabel(v),
              description: `${String(v.status).replace(/_/g, ' ')} · ${formatCurrency(v.sellTotal)}`,
            }))}
            placeholder="Version"
            searchable={quoteVersions.length > 6}
          />
        ) : null}
      </>
    ) : null;

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
                  ) : typeof part === 'string' &&
                    (part === dateRange || part === 'Set travel dates') &&
                    canTripWrite ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => openTravelDatesSheet()}
                    >
                      {part}
                    </button>
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
            <div className="flex min-w-[14rem] flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Trip stage
              </span>
              <Combobox
                className="w-56"
                value={trip.status}
                onChange={(status) => void updateTripStatus(status)}
                options={TRIP_STATUSES}
                placeholder="Trip stage"
              />
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Trip stage
              </span>
              <StatusBadge
                value={trip.status}
                label={tripStatusLabel(trip.status)}
                showIcon
                size="md"
              />
            </div>
          )
        }
      />

      <TripControlCentre
        tripId={trip.id}
        compact
        activeTab={tab}
        refreshKey={controlRefreshKey}
        onOpenTab={(t) => changeTab(t)}
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {Object.entries(TAB_LABELS).map(([value, label]) => {
            const attention = tabAttention[value] ?? 0;
            const displayLabel = tabLabelWithCue(label, value as TripWorkspaceTab, {
              activeTab: tab,
              tripStatus: trip.status,
              attention,
            });
            return (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <span>{displayLabel}</span>
                {attention > 0 ? (
                  <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-warning-soft px-1 text-[10px] font-semibold tabular-nums text-warning">
                    {attention}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {STATUS_GUIDANCE[trip.status] || 'Continue working this trip in the tabs below.'}
              </p>
              {(() => {
                const nextTab = recommendedTabForTripStatus(trip.status);
                if (nextTab === 'overview' || nextTab === tab) return null;
                return (
                  <Button size="sm" variant="secondary" onClick={() => changeTab(nextTab)}>
                    Continue in {TAB_LABELS[nextTab]}
                  </Button>
                );
              })()}
            </div>
            <TripControlCentre
              tripId={trip.id}
              refreshKey={controlRefreshKey}
              onOpenTab={(t) => changeTab(t)}
            />
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">Travel dates</div>
                      {canTripWrite ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => openTravelDatesSheet()}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm text-foreground/90">
                      {dateRange || 'Not set'}
                    </p>
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
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <FormField
                      label="Destination place of supply"
                      description="Overrides org default for CGST/SGST/IGST display only. Clear to use suggested destinations or org default."
                    >
                      {canTripWrite ? (
                        <Input
                          key={String(trip?.destinationPlaceOfSupply ?? '')}
                          defaultValue={trip?.destinationPlaceOfSupply ?? ''}
                          placeholder={
                            (() => {
                              const inferred =
                                typeof trip?.inferredDestinationPlaceOfSupply ===
                                'string'
                                  ? trip.inferredDestinationPlaceOfSupply.trim()
                                  : '';
                              if (inferred) {
                                return `Suggested: ${inferred}`;
                              }
                              const biz =
                                trip?.organization?.settingsJson &&
                                typeof trip.organization.settingsJson ===
                                  'object' &&
                                !Array.isArray(trip.organization.settingsJson)
                                  ? (
                                      trip.organization.settingsJson as {
                                        business?: {
                                          destinationPlaceOfSupply?: string;
                                        };
                                      }
                                    ).business
                                  : undefined;
                              const orgDefault =
                                typeof biz?.destinationPlaceOfSupply === 'string'
                                  ? biz.destinationPlaceOfSupply.trim()
                                  : '';
                              return orgDefault
                                ? `Org default: ${orgDefault}`
                                : 'e.g. MH or Maharashtra';
                            })()
                          }
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            const prev = String(
                              trip?.destinationPlaceOfSupply || '',
                            ).trim();
                            if (next === prev) return;
                            void saveTripDestinationPlaceOfSupply(next);
                          }}
                        />
                      ) : (
                        <p className="text-sm text-foreground/90">
                          {trip?.destinationPlaceOfSupply?.trim() ||
                            trip?.inferredDestinationPlaceOfSupply?.trim() ||
                            'Org default'}
                        </p>
                      )}
                    </FormField>
                    {inferredPosCue &&
                    !trip?.destinationPlaceOfSupply?.trim() ? (
                      <p className="text-xs text-muted-foreground">
                        {inferredPosCue}
                      </p>
                    ) : null}
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
          <div className="space-y-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight">
                    {(activeQuotation as { quoteNumber?: string } | null)?.quoteNumber ||
                      'New quotation'}
                    {selectedQuoteVersion ? (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        · {quoteVersionOptionLabel(selectedQuoteVersion)}
                      </span>
                    ) : null}
                  </h2>
                  {selectedQuoteVersion ? (
                    <StatusBadge value={selectedQuoteVersion.status} showIcon />
                  ) : (
                    <StatusBadge value="draft" label="Draft" showIcon />
                  )}
                  <span
                    className={
                      quoteReady.tone === 'warn'
                        ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200'
                        : quoteReady.tone === 'ok'
                          ? 'rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200'
                          : 'rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                    }
                    title={quoteReady.hint}
                  >
                    {quoteReady.label}
                  </span>
                  {canQuoteWrite && quoteSaveState !== 'idle' ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={
                          quoteSaveState === 'error'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }
                      >
                        {quoteReadOnly
                          ? 'Locked'
                          : quoteSaveState === 'pending'
                            ? quoteSaveError?.startsWith('Save interrupted')
                              ? 'Syncing…'
                              : 'Saving soon…'
                            : quoteSaveState === 'saving'
                              ? 'Saving…'
                              : quoteSaveState === 'saved'
                                ? `Saved${quoteSavedAt ? ` · ${formatTime(quoteSavedAt)}` : ''}`
                                : quoteSaveState === 'error'
                                  ? 'Couldn’t sync — retry'
                                  : null}
                      </span>
                      {quoteSaveState === 'error' ? (
                        <>
                          <span className="text-muted-foreground">
                            Your edits are kept on this device.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7"
                            onClick={() => void autosaveQuote({ manual: true, attempt: 0 })}
                          >
                            Retry now
                          </Button>
                        </>
                      ) : quoteSaveState === 'pending' || quoteSaveState === 'saving' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={quoteSaveState === 'saving'}
                          onClick={() => void autosaveQuote({ manual: true, attempt: 0 })}
                        >
                          Save now
                        </Button>
                      ) : null}
                    </div>
                  ) : canQuoteWrite && quoteSavedAt ? (
                    <span className="text-xs text-muted-foreground">
                      Saved · {formatTime(quoteSavedAt)}
                    </span>
                  ) : null}
                  {quoteStatus === 'accepted' || quoteStatus === 'superseded' ? (
                    <span className="text-xs text-muted-foreground">
                      This version is locked
                      {quoteStatus === 'accepted'
                        ? '. Revise from accepted (⋯) to open a new draft.'
                        : '. Pick another quotation or version to continue.'}
                    </span>
                  ) : quoteReadOnly && canReviseLockedVersion ? (
                    <span className="text-xs text-muted-foreground">
                      Locked ({selectedQuoteVersion?.status.replace(/_/g, ' ')}). Use ⋯ → Revise
                      as new draft to edit.
                    </span>
                  ) : null}
                </div>
                {quoteSaveError && quoteSaveState === 'error' ? (
                  <p className="text-xs text-destructive">{quoteSaveError}</p>
                ) : quoteSaveError && quoteSaveState === 'pending' ? (
                  <p className="text-xs text-muted-foreground">{quoteSaveError}</p>
                ) : null}
              </div>

            {canQuoteWrite && !quoteReadOnly && needsAttentionCount > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="font-medium text-amber-900 dark:text-amber-100"
                    onClick={() => setAttentionOpen((v) => !v)}
                    aria-expanded={attentionOpen}
                  >
                    {needsAttentionCount} service{needsAttentionCount === 1 ? '' : 's'} need
                    attention
                    <span className="ml-1 text-xs font-normal text-amber-800/80 dark:text-amber-200/80">
                      {attentionOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    onClick={() => void refreshPricesFromRates()}
                  >
                    Resolve missing rates
                  </Button>
                  {rateDriftCount > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      onClick={() => void refreshPricesFromRates(rateDriftIds)}
                    >
                      Rematch drifted ({rateDriftCount})
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    onClick={() => applyDefaultMarkup()}
                  >
                    Apply default markup
                  </Button>
                  {quoteMarkupPresets().map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => applyMarkupPreset(preset)}
                    >
                      {markupPresetSummary(preset)}
                    </Button>
                  ))}
                  {quoteItems.some(
                    (l) => !l.includedMeta && Number(l.taxPercent) === 0,
                  ) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      onClick={() => applyDefaultTax()}
                    >
                      Apply default tax
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => markUnpricedAsIncluded()}
                  >
                    Mark unpriced as included
                  </Button>
                  {marginGateCount > 0 && canOverrideBelowMargin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => openMarginOverrideDialog(null)}
                    >
                      Override margin policy…
                    </Button>
                  ) : null}
                  {marginGateCount > 0 && !canOverrideBelowMargin ? (
                    <span className="text-xs text-amber-900/90 dark:text-amber-100/90">
                      Below-margin services need a manager override
                    </span>
                  ) : null}
                </div>
                {attentionOpen ? (
                  <ul className="mt-2 space-y-1">
                    {attentionLines.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs text-amber-900 transition-colors hover:bg-amber-500/15 dark:text-amber-100"
                          onClick={() => {
                            setQuoteDetailLineId(row.id);
                            setAttentionOpen(true);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {row.serviceType ? (
                              <span className="mr-1.5 font-normal uppercase tracking-wide text-amber-800/70 dark:text-amber-200/70">
                                {row.serviceType}
                              </span>
                            ) : null}
                            {row.description}
                          </span>
                          <span className="flex shrink-0 flex-wrap justify-end gap-1">
                            {row.reasons.map((reason) => (
                              <span
                                key={reason}
                                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-950 dark:text-amber-50"
                              >
                                {quoteAttentionReasonLabel(reason)}
                              </span>
                            ))}
                          </span>
                        </button>
                      </li>
                    ))}
                    {missingPricingCount > 0 || marginGateCount > 0 ? (
                      <li className="px-1.5 pt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                        Click a line to open details
                        {quoteMinMarginPercent > 0 && marginGateCount > 0
                          ? ` · min margin ${quoteMinMarginPercent}%`
                          : ''}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
              <div className="min-w-0 space-y-3">
                {quoteItems.length === 0 ? (
                  <>
                    {quoteTableLeading ? (
                      <div className="flex flex-wrap items-center gap-1.5">{quoteTableLeading}</div>
                    ) : null}
                    <FirstQuoteWalkthrough
                      canWrite={canQuoteWrite}
                      hasTemplates={quoteTemplates.length > 0}
                      installingPack={installingFitPack}
                      onUseTemplate={() => void openUseTemplateDialog()}
                      onInstallPack={() => void installFitPackOnTrip()}
                      onImportItinerary={() => openImportItineraryReview()}
                      onAddService={() => addBlankQuoteLine()}
                    />
                    <EmptyState
                      className="py-8"
                      title="Build this quotation"
                      description={
                        quoteTemplates.length > 0
                          ? 'Start from a template for the fastest FIT, import from the itinerary, or add a service manually.'
                          : 'Install the sample FIT pack for Darjeeling / Goa packages, then set travel start and apply a template.'
                      }
                      action={
                        canQuoteWrite ? (
                          <div className="flex flex-wrap justify-center gap-2">
                            {quoteTemplates.length > 0 ? (
                              <Button onClick={() => void openUseTemplateDialog()}>
                                Use template
                              </Button>
                            ) : (
                              <Button
                                disabled={installingFitPack}
                                onClick={() => void installFitPackOnTrip()}
                              >
                                <PackagePlus className="size-4" />
                                {installingFitPack
                                  ? 'Installing…'
                                  : 'Install sample FIT pack'}
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              onClick={() => openImportItineraryReview()}
                            >
                              Import itinerary
                            </Button>
                            <Button variant="secondary" onClick={() => addBlankQuoteLine()}>
                              Add service
                            </Button>
                          </div>
                        ) : undefined
                      }
                    />
                  </>
                ) : (
                  <DataTable
                    columns={quoteColumns}
                    data={quoteItems}
                    fillHeight={false}
                    alignTop
                    wrapCells
                    pageSize={25}
                    searchPlaceholder="Filter lines…"
                    showColumnsMenu={false}
                    getDataRowId={(row) => row.id}
                    highlightedRowId={quoteDetailLineId}
                    leading={quoteTableLeading}
                    toolbar={
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {canQuoteWrite ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8"
                            disabled={!quoteCan.has('addLines') || quoteReadOnly}
                            onClick={() => addBlankQuoteLine()}
                          >
                            <Plus className="size-3.5" />
                            Add
                          </Button>
                        ) : null}
                        {canQuoteWrite ? (
                          <Button
                            size="sm"
                            variant={canSendQuote ? 'default' : 'secondary'}
                            className={
                              canClickSend
                                ? 'h-8'
                                : 'h-8 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100'
                            }
                            disabled={!canClickSend}
                            title={
                              canSendViaMarginOverride && !canSendQuote
                                ? 'Margin policy blocks send — override or adjust sell'
                                : sendBlockedReason || 'Send proposal by email'
                            }
                            aria-disabled={!canClickSend}
                            onClick={() => openSendFlow()}
                          >
                            <Send className="size-3.5" />
                            Send
                          </Button>
                        ) : null}
                        {(canQuoteRead || canQuoteWrite) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                aria-label="More quote actions"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {canQuoteWrite ? (
                                <DropdownMenuItem
                                  disabled={!quoteCan.has('addLines') || quoteReadOnly}
                                  onClick={() => openImportItineraryReview()}
                                >
                                  Import itinerary
                                </DropdownMenuItem>
                              ) : null}
                              {canQuoteRead ? (
                                <DropdownMenuItem
                                  disabled={!canPreviewQuote}
                                  onClick={() => void pdfLatest()}
                                >
                                  {canSendQuote ? 'Preview PDF' : 'Preview draft PDF'}
                                </DropdownMenuItem>
                              ) : null}
                              {canQuoteWrite || canQuoteRead ? <DropdownMenuSeparator /> : null}
                              {canQuoteWrite ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => void createAndSaveQuote()}
                                    disabled={
                                      savingQuoteCheckpoint ||
                                      quoteItems.length === 0 ||
                                      (!quoteCan.has('revise') && quoteReadOnly)
                                    }
                                  >
                                    {quoteReadOnly && canReviseLockedVersion
                                      ? 'Revise as new draft'
                                      : 'Save as new version'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!canClickRequestApproval}
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
                                  {quoteCan.has('accept') ? (
                                    <DropdownMenuItem onClick={() => setAcceptOpen(true)}>
                                      Accept quote
                                    </DropdownMenuItem>
                                  ) : null}
                                  {quoteStatus === 'accepted' && hasAcceptedQuote ? (
                                    <DropdownMenuItem onClick={() => void reviseFromAccepted()}>
                                      Revise from accepted
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => void openUseTemplateDialog()}>
                                    Start from template…
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={quoteItems.length === 0}
                                    onClick={() => {
                                      const hint =
                                        trip?.title || destinationsLabel || 'Quote template';
                                      setTemplateName(String(hint).slice(0, 80));
                                      setTemplateSaveAsNew(false);
                                      void loadQuoteTemplates();
                                      setSaveTemplateOpen(true);
                                    }}
                                  >
                                    Save as template…
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      cloningQuote || !activeQuotation || quoteItems.length === 0
                                    }
                                    onClick={() => void cloneActiveQuotation()}
                                  >
                                    {cloningQuote ? 'Cloning…' : 'Clone quotation'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={
                                      !quoteCan.has('addLines') || quoteItems.length === 0
                                    }
                                    onClick={() => void refreshPricesFromRates()}
                                  >
                                    Refresh prices from rates
                                  </DropdownMenuItem>
                                  {rateDriftCount > 0 ? (
                                    <DropdownMenuItem
                                      disabled={!quoteCan.has('addLines')}
                                      onClick={() =>
                                        void refreshPricesFromRates(rateDriftIds)
                                      }
                                    >
                                      Rematch drifted rates ({rateDriftCount})
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem
                                    disabled={quoteReadOnly || quoteItems.length === 0}
                                    onClick={() => applyDefaultTax()}
                                  >
                                    Apply default tax…
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              ) : null}
                              {canQuoteWrite ? (
                                <DropdownMenuItem
                                  disabled={!canPreviewQuote}
                                  onClick={() => void savePdfToDrive()}
                                >
                                  Save to Drive
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    }
                  />
                )}
              </div>

              <div className="space-y-3 lg:sticky lg:top-4">
                <aside className="rounded-xl border border-border/70 bg-card/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pricing summary
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  {partialSellOnly ? (
                    <>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Priced subtotal</dt>
                        <dd>{formatCurrency(sellExTax)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">{taxTotalsLabel} on priced</dt>
                        <dd>{formatCurrency(taxTotal)}</dd>
                      </div>
                      {taxSplitLines.map((line) => (
                        <div
                          key={line}
                          className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground"
                        >
                          <dt>{line.split(' ')[0]}</dt>
                          <dd>{line.replace(/^\S+\s+/, '')}</dd>
                        </div>
                      ))}
                      {taxSplitCue ? (
                        <p className="text-[11px] text-muted-foreground">{taxSplitCue}</p>
                      ) : null}
                      <div className="flex justify-between gap-3 border-t border-border/60 pt-2 font-semibold tabular-nums">
                        <dt>Partial total</dt>
                        <dd>{formatCurrency(sellTotal)}</dd>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Excludes {missingSellCount} unpriced service
                        {missingSellCount === 1 ? '' : 's'} ({pricedServiceCount} of{' '}
                        {quoteItems.length} priced)
                      </p>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Final customer total</dt>
                        <dd className="text-amber-700 dark:text-amber-400">Not available</dd>
                      </div>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Per traveller</dt>
                        <dd className="text-amber-700 dark:text-amber-400">Not available</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Sell before tax</dt>
                        <dd>{formatCurrency(sellExTax)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">{taxTotalsLabel}</dt>
                        <dd>{formatCurrency(taxTotal)}</dd>
                      </div>
                      {taxSplitLines.map((line) => (
                        <div
                          key={line}
                          className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground"
                        >
                          <dt>{line.split(' ')[0]}</dt>
                          <dd>{line.replace(/^\S+\s+/, '')}</dd>
                        </div>
                      ))}
                      {taxSplitCue ? (
                        <p className="text-[11px] text-muted-foreground">{taxSplitCue}</p>
                      ) : null}
                      <div className="flex justify-between gap-3 border-t border-border/60 pt-2 text-base font-semibold tabular-nums">
                        <dt>Customer total</dt>
                        <dd>{formatCurrency(sellTotal)}</dd>
                      </div>
                      {taxIdentityLines.map((line) => (
                        <p key={line} className="text-xs text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </>
                  )}
                  {canViewCost ? (
                    <>
                      <div className="flex justify-between gap-3 border-t border-border/60 pt-2 tabular-nums">
                        <dt className="text-muted-foreground">Cost status</dt>
                        <dd>
                          {!quoteHasServices ? (
                            <span className="text-muted-foreground">—</span>
                          ) : costGaps.incomplete ? (
                            <span className="text-amber-700 dark:text-amber-400">Incomplete</span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">Complete</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Known cost</dt>
                        <dd>{formatCurrency(costGaps.knownCost)}</dd>
                      </div>
                      {costGaps.incomplete ? (
                        <div className="flex justify-between gap-3 tabular-nums">
                          <dt className="text-muted-foreground">Missing cost</dt>
                          <dd className="text-amber-700 dark:text-amber-400">
                            {costGaps.missingCount} service
                            {costGaps.missingCount === 1 ? '' : 's'}
                          </dd>
                        </div>
                      ) : null}
                      {missingSellCount > 0 ? (
                        <div className="flex justify-between gap-3 tabular-nums">
                          <dt className="text-muted-foreground">Missing sell</dt>
                          <dd className="text-amber-700 dark:text-amber-400">
                            {missingSellCount} service{missingSellCount === 1 ? '' : 's'}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Profit</dt>
                        <dd>
                          {marginReady ? (
                            formatCurrency(marginAmount)
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Not calculated</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Margin</dt>
                        <dd>
                          {marginReady ? (
                            formatPercent(marginPercent)
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Not calculated</span>
                          )}
                        </dd>
                      </div>
                      {!marginReady && quoteHasServices ? (
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Add sell prices and buy rates on every service to calculate margin.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <div className="border-t border-border/60 pt-2 space-y-2">
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">Version label</dt>
                      <dd className="space-y-2">
                        {quoteReadOnly ? (
                          <span className="text-sm">
                            {quoteVersionOptionLabel({
                              versionNumber: selectedQuoteVersion?.versionNumber,
                              label: quoteMeta.label,
                            })}
                          </span>
                        ) : (
                          <>
                            <Input
                              className="h-8"
                              value={quoteMeta.label}
                              maxLength={QUOTE_VERSION_LABEL_MAX}
                              placeholder={
                                selectedQuoteVersion?.versionNumber
                                  ? `v${selectedQuoteVersion.versionNumber}`
                                  : 'e.g. Peak season FIT'
                              }
                              onChange={(e) =>
                                setQuoteMeta((m) => ({
                                  ...m,
                                  label: e.target.value.slice(0, QUOTE_VERSION_LABEL_MAX),
                                }))
                              }
                            />
                            <SuggestionChips
                              aria-label="Version label presets"
                              className="gap-1.5"
                              allowDeselect={false}
                              value={quoteMeta.label}
                              options={quoteVersionLabelPickerOptions({
                                versionNumber: selectedQuoteVersion?.versionNumber,
                              })}
                              onChange={(label) =>
                                setQuoteMeta((m) => ({
                                  ...m,
                                  label: label.slice(0, QUOTE_VERSION_LABEL_MAX),
                                }))
                              }
                            />
                          </>
                        )}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">Valid until</dt>
                      <dd>
                        <DatePicker
                          className="h-8"
                          disabled={quoteReadOnly}
                          placeholder="Set validity date"
                          value={
                            quoteMeta.validUntil?.trim()
                              ? new Date(`${quoteMeta.validUntil}T12:00:00`)
                              : undefined
                          }
                          onChange={(date) => {
                            const validUntil = date
                              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              : '';
                            setQuoteMeta((m) => ({
                              ...m,
                              validUntil,
                              terms: syncTermsWithValidUntil(m.terms, validUntil),
                            }));
                          }}
                        />
                      </dd>
                      {validUntilExpired && !quoteReadOnly ? (
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          {validUntilPastGraceCue
                            ? `${validUntilPastGraceCue}, or `
                            : validUntilGraceCue
                              ? `${validUntilGraceCue}, or `
                              : 'Expired — reset validity, or '}
                          <button
                            type="button"
                            className="font-medium underline underline-offset-2"
                            onClick={() => {
                              const days = quoteValidityDaysFromSettings(
                                trip?.organization?.settingsJson,
                              );
                              const validUntil = defaultValidUntilIso(days);
                              setQuoteMeta((m) => ({
                                ...m,
                                validUntil,
                                terms: syncTermsWithValidUntil(m.terms, validUntil),
                              }));
                              toastSuccess(`Validity reset to +${days} days`);
                            }}
                          >
                            Reset to org default
                          </button>
                        </p>
                      ) : validUntilNearExpiryMessage && !quoteReadOnly ? (
                        <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                          {validUntilNearExpiryMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">Quote currency</dt>
                      <dd className="space-y-2">
                        {quoteReadOnly ? (
                          <span className="text-sm tabular-nums">
                            {quoteCurrency}
                            {quoteFxLock && quoteCurrency !== orgCurrency
                              ? ` · ${quoteFxLock.rate} ${orgCurrency}/${quoteCurrency}`
                              : ''}
                          </span>
                        ) : (
                          <>
                            <Combobox
                              value={quoteCurrency}
                              options={QUOTE_FX_CURRENCY_OPTIONS}
                              onChange={(code) => {
                                if (!code || code === quoteCurrency) return;
                                void lockQuoteFx(code);
                              }}
                              placeholder="Currency"
                              className="h-8"
                            />
                            {quoteCurrency !== orgCurrency ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  className="h-8 w-28 tabular-nums"
                                  inputMode="decimal"
                                  placeholder={`${orgCurrency} per 1 ${quoteCurrency}`}
                                  value={fxRateInput}
                                  onChange={(e) => setFxRateInput(e.target.value)}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={lockingFx}
                                  onClick={() => void lockQuoteFx(quoteCurrency)}
                                >
                                  {lockingFx ? 'Locking…' : 'Lock FX'}
                                </Button>
                              </div>
                            ) : null}
                            {quoteCurrency !== orgCurrency && !fxRateInput.trim() && !quoteFxLock ? (
                              <p className="text-xs text-muted-foreground">
                                Blank rate uses{' '}
                                <Link
                                  className="text-primary hover:underline"
                                  to={toOrgPath(`${AGENCY_ROUTES.settings}?section=general`)}
                                >
                                  Settings → General
                                </Link>{' '}
                                FX rates (or platform defaults).
                              </p>
                            ) : null}
                            {fxMissing ? (
                              <p className="text-xs text-amber-800 dark:text-amber-200">
                                Lock FX before send — org books in {orgCurrency}.
                              </p>
                            ) : quoteFxLock && quoteCurrency !== orgCurrency ? (
                              <p className="text-xs text-muted-foreground">
                                Locked {quoteFxLock.rate} {orgCurrency} per 1{' '}
                                {quoteCurrency} ({quoteFxLock.source})
                              </p>
                            ) : null}
                          </>
                        )}
                      </dd>
                    </div>
                    {travellerCount > 0 ? (
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Pricing basis</dt>
                        <dd>
                          {travellerCount} traveller{travellerCount === 1 ? '' : 's'}
                        </dd>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Add travellers for per-person pricing.</p>
                    )}
                    {travellerCount > 0 && sellTotal > 0 && sellComplete ? (
                      <div className="flex justify-between gap-3 tabular-nums">
                        <dt className="text-muted-foreground">Per traveller</dt>
                        <dd>{formatCurrency(sellTotal / travellerCount)}</dd>
                      </div>
                    ) : null}
                  </div>
                </dl>
                </aside>

                {canSendQuote || quoteHasServices || quoteReady.tone !== 'ok' ? (
                  <aside className="rounded-xl border border-border/70 bg-card/40 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Send readiness
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{quoteReady.hint}</p>
                    {canSendQuote ? (
                      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
                            ✓
                          </span>
                          <span>
                            {quoteItems.length} service{quoteItems.length === 1 ? '' : 's'} priced
                          </span>
                        </li>
                        {canViewCost ? (
                          <li className="flex items-start gap-2">
                            <span
                              className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                              aria-hidden
                            >
                              ✓
                            </span>
                            <span>Costs complete</span>
                          </li>
                        ) : null}
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
                            ✓
                          </span>
                          <span>
                            Valid until{' '}
                            {quoteMeta.validUntil
                              ? new Date(`${quoteMeta.validUntil}T12:00:00`).toLocaleDateString(
                                  undefined,
                                  { day: 'numeric', month: 'short', year: 'numeric' },
                                )
                              : '—'}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
                            ✓
                          </span>
                          <span>{travellerCount}-traveller pricing basis</span>
                        </li>
                      </ul>
                    ) : (
                      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        {quoteHasServices ? (
                          <li className="flex items-start gap-2">
                            <span
                              className={
                                missingSellCount === 0
                                  ? 'mt-0.5 text-emerald-600 dark:text-emerald-400'
                                  : 'mt-0.5 text-amber-700 dark:text-amber-400'
                              }
                              aria-hidden
                            >
                              {missingSellCount === 0 ? '✓' : '✕'}
                            </span>
                            <span>
                              {pricedServiceCount} of {quoteItems.length} services have sell prices
                              {missingSellCount > 0
                                ? ` · ${missingSellCount} sell price${missingSellCount === 1 ? '' : 's'} missing`
                                : ''}
                            </span>
                          </li>
                        ) : (
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-amber-700 dark:text-amber-400" aria-hidden>
                              ✕
                            </span>
                            <span>Add at least one service</span>
                          </li>
                        )}
                        {canViewCost && quoteHasServices ? (
                          <li className="flex items-start gap-2">
                            <span
                              className={
                                costGaps.incomplete
                                  ? 'mt-0.5 text-amber-700 dark:text-amber-400'
                                  : 'mt-0.5 text-emerald-600 dark:text-emerald-400'
                              }
                              aria-hidden
                            >
                              {costGaps.incomplete ? '✕' : '✓'}
                            </span>
                            <span>
                              {quoteItems.length - costGaps.missingCount} of {quoteItems.length}{' '}
                              services have costs
                              {costGaps.incomplete
                                ? ` · ${costGaps.missingCount} buy rate${costGaps.missingCount === 1 ? '' : 's'} missing`
                                : ''}
                            </span>
                          </li>
                        ) : null}
                        {canViewCost && marginGateCount > 0 ? (
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-amber-700 dark:text-amber-400" aria-hidden>
                              ✕
                            </span>
                            <span>
                              {marginGateCount} service{marginGateCount === 1 ? '' : 's'}{' '}
                              {marginGateCount === 1 ? 'breaches' : 'breach'} margin policy
                              {quoteMinMarginPercent > 0
                                ? ` (floor ${quoteMinMarginPercent}%)`
                                : ' (negative margin)'}
                            </span>
                          </li>
                        ) : canViewCost &&
                          quoteHasServices &&
                          !costGaps.incomplete &&
                          sellComplete ? (
                          <li className="flex items-start gap-2">
                            <span
                              className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                              aria-hidden
                            >
                              ✓
                            </span>
                            <span>
                              Margin policy met
                              {quoteMinMarginPercent > 0
                                ? ` (≥ ${quoteMinMarginPercent}%)`
                                : ''}
                            </span>
                          </li>
                        ) : null}
                        <li className="flex items-start gap-2">
                          <span
                            className={
                              quoteMeta.validUntil?.trim() && !validUntilBlocksSend
                                ? 'mt-0.5 text-emerald-600 dark:text-emerald-400'
                                : 'mt-0.5 text-amber-700 dark:text-amber-400'
                            }
                            aria-hidden
                          >
                            {quoteMeta.validUntil?.trim() && !validUntilBlocksSend
                              ? '✓'
                              : '✕'}
                          </span>
                          <span>
                            Validity date
                            {!quoteMeta.validUntil?.trim()
                              ? ' missing'
                              : validUntilBlocksSend
                                ? ' expired past grace — reset before send'
                                : validUntilGraceCue
                                  ? ' expired (grace — send keeps date)'
                                  : ''}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span
                            className={
                              travellerCount > 0
                                ? 'mt-0.5 text-emerald-600 dark:text-emerald-400'
                                : 'mt-0.5 text-amber-700 dark:text-amber-400'
                            }
                            aria-hidden
                          >
                            {travellerCount > 0 ? '✓' : '✕'}
                          </span>
                          <span>
                            Traveller pricing basis
                            {travellerCount > 0
                              ? ` · ${travellerCount} traveller${travellerCount === 1 ? '' : 's'}`
                              : ' missing'}
                          </span>
                        </li>
                      </ul>
                    )}
                  </aside>
                ) : null}
              </div>
            </div>

            <DisclosureSection
              title="Proposal notes"
              description={quoteProposalNotesSummary(quoteMeta)}
              level="secondary"
              open={quoteNotesOpen}
              onOpenChange={setQuoteNotesOpen}
            >
              <ProposalNotesEditor
                inclusions={quoteMeta.inclusions}
                exclusions={quoteMeta.exclusions}
                terms={quoteMeta.terms}
                serviceLines={quoteItems}
                readOnly={quoteReadOnly}
                onChange={(patch) =>
                  setQuoteMeta((m) => ({
                    ...m,
                    ...patch,
                    ...(patch.terms != null && m.validUntil.trim()
                      ? { terms: syncTermsWithValidUntil(patch.terms, m.validUntil) }
                      : {}),
                  }))
                }
              />
            </DisclosureSection>
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <OperationsPanel
            tripId={trip.id}
            status={trip.status}
            onChanged={load}
            onOpenFinance={() => changeTab('finance')}
          />
        </TabsContent>

        <TabsContent value="finance">
          <FinancePanel
            tripId={trip.id}
            tripStatus={trip.status}
            orgCurrency={trip.organization?.currency || 'INR'}
            partyPaymentTerms={trip.party?.paymentTerms}
            partyCreditLimit={
              trip.party?.creditLimit != null
                ? Number(trip.party.creditLimit)
                : null
            }
            tripStartDate={
              trip.startDate ? String(trip.startDate).slice(0, 10) : null
            }
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
        onOpenChange={(open) => {
          setTravellerOpen(open);
          if (!open) {
            setTravellerName('');
            setTravellerType('adult');
            setTravellerNationality('');
          }
        }}
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
        <FormField
          label="Nationality"
          description="Used as the hotel Match default when a quote line has no guest nationality."
        >
          <Combobox
            value={travellerNationality}
            onChange={(v) =>
              setTravellerNationality(normalizeHotelNationalityUi(v))
            }
            options={HOTEL_NATIONALITY_OPTIONS}
            placeholder="Search country / Any"
            searchable
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={editTravellerOpen}
        onOpenChange={(open) => {
          setEditTravellerOpen(open);
          if (!open) {
            setEditTravellerId(null);
            setEditTravellerName('');
            setEditTravellerType('adult');
            setEditTravellerNationality('');
            setEditTravellerIsLead(false);
          }
        }}
        title="Edit traveller"
        submitLabel="Save"
        submitting={editTravellerSaving}
        onSubmit={() => void saveEditTraveller()}
      >
        <FormField label="Full name" required>
          <Input
            value={editTravellerName}
            onChange={(e) => setEditTravellerName(e.target.value)}
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
            value={editTravellerType}
            onChange={setEditTravellerType}
          />
        </FormField>
        <FormField
          label="Nationality"
          description="Hotel Match uses this when the quote line has no guest nationality."
        >
          <Combobox
            value={editTravellerNationality}
            onChange={(v) =>
              setEditTravellerNationality(normalizeHotelNationalityUi(v))
            }
            options={HOTEL_NATIONALITY_OPTIONS}
            placeholder="Search country / Any"
            searchable
          />
        </FormField>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={editTravellerIsLead}
            onCheckedChange={(v) => setEditTravellerIsLead(v === true)}
          />
          <span>
            Lead traveller
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Lead nationality is preferred when seeding hotel Match.
            </span>
          </span>
        </label>
      </RecordSheet>

      <RecordSheet
        open={travelDatesOpen}
        onOpenChange={setTravelDatesOpen}
        title="Travel dates"
        description="Updates the trip window. Optionally shift draft quote lines and story days onto the new travel start (locked sent/accepted quotes become a new rematched draft)."
        submitLabel="Save dates"
        submitting={travelDatesSaving}
        onSubmit={() => void saveTravelDates()}
      >
        <FormGrid>
          <FormField label="Travel start">
            <DatePicker
              placeholder="Trip start"
              value={parseDateInput(travelDatesForm.startDate)}
              onChange={(date) =>
                setTravelDatesForm((f) => ({
                  ...f,
                  startDate: formatDateInput(date),
                }))
              }
            />
          </FormField>
          <FormField label="Travel end">
            <DatePicker
              placeholder="Trip end"
              value={parseDateInput(travelDatesForm.endDate)}
              onChange={(date) =>
                setTravelDatesForm((f) => ({
                  ...f,
                  endDate: formatDateInput(date),
                }))
              }
            />
          </FormField>
        </FormGrid>
        {(quoteItems.length > 0 ||
          (Array.isArray(trip?.quotations) && trip.quotations.length > 0)) ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={travelDatesShiftQuote}
              onCheckedChange={(v) => setTravelDatesShiftQuote(v === true)}
              className="mt-0.5"
            />
            <span>
              Shift quote &amp; story dates to the new travel start (drafts update
              in place; sent/accepted become a new rematched draft)
            </span>
          </label>
        ) : null}
        {!tripTravelEndOnOrAfterStart(
          travelDatesForm.startDate,
          travelDatesForm.endDate,
        ) ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Travel end must be on or after travel start.
          </p>
        ) : null}
      </RecordSheet>

      <QuoteImportReviewDialog
        open={importReviewOpen}
        onOpenChange={setImportReviewOpen}
        days={days}
        tripStartDate={trip?.startDate}
        existingLineIds={existingQuoteLineIds}
        partyAdults={Number(trip?.inquiry?.adults) || undefined}
        partyChildren={Number(trip?.inquiry?.children) || undefined}
        partyInfants={Number(trip?.inquiry?.infants) || undefined}
        partyId={trip?.party?.id}
        destinationPlaceOfSupply={trip?.destinationPlaceOfSupply}
        onConfirm={confirmImportFromItinerary}
      />

      <QuoteServiceDetailSheet
        open={Boolean(quoteDetailLineId)}
        onOpenChange={(open) => {
          if (!open) setQuoteDetailLineId(null);
        }}
        line={
          quoteDetailLineId
            ? quoteItems.find((l) => l.id === quoteDetailLineId) || null
            : null
        }
        readOnly={quoteReadOnly}
        currency={quoteCurrency}
        tripStartDate={trip?.startDate}
        tripEndDate={trip?.endDate}
        partyAdults={Number(trip?.inquiry?.adults) || undefined}
        partyChildren={Number(trip?.inquiry?.children) || undefined}
        partyInfants={Number(trip?.inquiry?.infants) || undefined}
        defaultMarkupPercent={quoteDefaultMarkupPercent()}
        markupPresets={quoteMarkupPresets()}
        partyId={trip?.party?.id}
        tripTravellers={trip?.travellers || null}
        destinationPlaceOfSupply={trip?.destinationPlaceOfSupply}
        seedDetails={(() => {
          if (!quoteDetailLineId?.startsWith('itin-')) return null;
          const itinId = quoteDetailLineId.slice(5);
          for (const day of days) {
            const item = (day.items || []).find((i) => i.id === itinId);
            if (item) return seedDetailsFromItineraryItem(item);
          }
          return null;
        })()}
        attentionQueue={attentionQueue}
        onNextAttention={(nextId) => {
          setAttentionOpen(true);
          setQuoteDetailLineId(nextId);
        }}
        quotationVersionId={selectedQuoteVersion?.id ?? null}
        canOverrideInventoryRisk={Boolean(canOverrideInventoryRisk)}
        onInventoryRiskAcked={(updated) => {
          if (typeof updated.versionLock === 'number') {
            quoteLockRef.current = updated.versionLock;
          }
          setQuoteItems(quoteLinesFromVersion(updated));
          setTrip((prev: any) => {
            if (!prev) return prev;
            const quotations = (prev.quotations || []).map((q: any) => {
              const versions = (q.versions || []).map((v: any) =>
                v.id === updated.id ? { ...v, ...updated } : v,
              );
              return { ...q, versions };
            });
            return { ...prev, quotations };
          });
        }}
        canOverrideRateDrift={Boolean(canOverrideRateDrift)}
        onRateDriftAcked={(updated) => {
          if (typeof updated.versionLock === 'number') {
            quoteLockRef.current = updated.versionLock;
          }
          setQuoteItems(quoteLinesFromVersion(updated));
          setTrip((prev: any) => {
            if (!prev) return prev;
            const quotations = (prev.quotations || []).map((q: any) => {
              const versions = (q.versions || []).map((v: any) =>
                v.id === updated.id ? { ...v, ...updated } : v,
              );
              return { ...q, versions };
            });
            return { ...prev, quotations };
          });
        }}
        onSave={(patch) => {
          const { id, ...rest } = patch;
          updateQuoteLine(id, rest);
        }}
      />

      <ConfirmDialog
        open={markupConfirmOpen}
        onOpenChange={setMarkupConfirmOpen}
        title="Apply markup?"
        description={`Apply ${
          markupApplyTarget.kind === 'preset'
            ? markupPresetSummary(markupApplyTarget.preset)
            : `${quoteDefaultMarkupPercent()}% (${quoteMarkupSourceLabel()})`
        } to ${
          quoteItems.filter((l) => l.unitCost != null && l.unitSell == null).length
        } service(s) that already have a cost? Manually entered sell prices will not be changed.`}
        confirmLabel="Apply markup"
        onConfirm={() =>
          markupApplyTarget.kind === 'preset'
            ? confirmApplyMarkupPreset(markupApplyTarget.preset)
            : confirmApplyDefaultMarkup()
        }
      />

      <ConfirmDialog
        open={taxConfirmOpen}
        onOpenChange={setTaxConfirmOpen}
        title="Apply default tax?"
        description={`Set tax to ${quoteDefaultTaxPercent()}% (org default) on ${
          quoteItems.filter((l) => !l.includedMeta && Number(l.taxPercent) === 0).length
        } billable service(s) currently at 0%? Lines with a tax already set will not change.`}
        confirmLabel="Apply tax"
        onConfirm={() => confirmApplyDefaultTax()}
      />

      <ConfirmDialog
        open={includedConfirmOpen}
        onOpenChange={setIncludedConfirmOpen}
        title="Mark unpriced as included?"
        description={`These ${
          quoteItems.filter(
            (l) => l.unitSell == null || (canViewCost && l.unitCost == null),
          ).length
        } service(s) will appear on the proposal but will not increase the customer total (sell set to ₹0). This cannot silently hide real costs later — review the list before confirming.`}
        confirmLabel="Mark as included"
        onConfirm={() => confirmMarkUnpricedAsIncluded()}
      />

      <RecordDialog
        open={marginOverrideOpen}
        onOpenChange={(open) => {
          setMarginOverrideOpen(open);
          if (!open) {
            setMarginOverridePending(null);
            setMarginOverrideReason('');
            setMarginOverrideLineIds([]);
          }
        }}
        title="Override margin policy?"
        description={
          quoteMinMarginPercent > 0
            ? `Select services below the ${quoteMinMarginPercent}% margin floor (or selling below cost). This writes an audit entry with your user, timestamp, reason, and original cost/sell.`
            : 'Select the loss-making services to authorise. This writes an audit entry with your user, timestamp, reason, and original cost/sell.'
        }
        submitLabel={marginOverrideSaving ? 'Recording…' : 'Record override'}
        submitting={marginOverrideSaving}
        submitDisabled={
          !marginOverrideReason.trim() ||
          !canOverrideBelowMargin ||
          marginOverrideLineIds.length === 0 ||
          marginOverrideSaving
        }
        onSubmit={() => void applyNegativeMarginOverride()}
      >
        <div className="space-y-3">
          <FormField label="Services to override" required>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/60 p-2">
              {quoteItems
                .filter((line) => {
                  const v = lineMarginPolicyViolation(
                    line.unitCost,
                    line.unitSell,
                    quoteMinMarginPercent,
                  );
                  return Boolean(v) && !line.marginOverride?.reason?.trim();
                })
                .map((line) => {
                  const v = lineMarginPolicyViolation(
                    line.unitCost,
                    line.unitSell,
                    quoteMinMarginPercent,
                  )!;
                  const checked = marginOverrideLineIds.includes(line.id);
                  return (
                    <li key={line.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={checked}
                          onChange={(e) => {
                            setMarginOverrideLineIds((prev) =>
                              e.target.checked
                                ? [...prev, line.id]
                                : prev.filter((id) => id !== line.id),
                            );
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{line.description}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                            Cost {formatCurrency(line.unitCost)} · Sell{' '}
                            {formatCurrency(line.unitSell)} · Margin{' '}
                            {formatPercent(v.marginPercent)}
                            {v.kind === 'below_floor'
                              ? ` · below ${v.floorPercent}% floor`
                              : ' · sell below cost'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>
          </FormField>
          <FormField label="Reason" required>
            <Textarea
              value={marginOverrideReason}
              onChange={(e) => setMarginOverrideReason(e.target.value)}
              rows={3}
              placeholder="e.g. Competitive match for repeat client — approved by sales lead"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Approver: {me?.fullName || me?.email || me?.id} · Permission: below_margin.approve
          </p>
        </div>
      </RecordDialog>

      <ConfirmDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="Accept this quote?"
        description="Accepted quotes become immutable. Hotel lines with suppliers become enquiries in Operations: confirm schedules supplier payable, then mark vouchered."
        confirmLabel="Accept quote"
        loading={accepting}
        onConfirm={acceptLatest}
      />

      <RecordDialog
        open={requestApprovalOpen}
        onOpenChange={(open) => {
          setRequestApprovalOpen(open);
          if (!open) setApprovalExtendValidity(false);
        }}
        title="Request approval"
        description="Sends this draft to a manager for approval before customer send."
        submitLabel="Request approval"
        onSubmit={() => void submitRequestApproval(approvalExtendValidity)}
      >
        {(validUntilGraceCue || validUntilNearExpiryMessage) ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={approvalExtendValidity}
              onCheckedChange={(v) => setApprovalExtendValidity(v === true)}
              className="mt-0.5"
            />
            <span>
              Extend validity to org default
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {validUntilGraceCue
                  ? 'Leave unchecked to keep the expired date (grace).'
                  : 'Leave unchecked to keep the current near-expiry date.'}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">Ready to request approval.</p>
        )}
      </RecordDialog>

      <RecordDialog
        open={sendOpen}
        onOpenChange={(open) => {
          setSendOpen(open);
          if (!open) {
            setWaMarkSentPending(false);
            setSendExtendValidity(false);
          }
        }}
        title="Send quotation"
        description={
          sendChannel === 'whatsapp'
            ? waMarkSentPending
              ? 'WhatsApp opened with a prefilled message. After you send it, mark this quote as sent so status and ops stay accurate.'
              : quoteWaSendCue.message
            : 'Queues an email with the proposal PDF attached. Delivery requires SMTP on the worker.'
        }
        submitLabel={
          sendChannel === 'whatsapp'
            ? waMarkSentPending
              ? waMarkSentBusy
                ? 'Marking…'
                : 'Mark as sent'
              : 'Send WhatsApp'
            : 'Send email'
        }
        onSubmit={() => {
          if (sendChannel === 'whatsapp' && waMarkSentPending) {
            void markWhatsappSent();
            return;
          }
          void sendLatest();
        }}
      >
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={sendChannel === 'email' ? 'default' : 'outline'}
            className="h-8"
            disabled={waMarkSentPending}
            onClick={() => setSendChannel('email')}
          >
            Email
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sendChannel === 'whatsapp' ? 'default' : 'outline'}
            className="h-8"
            onClick={() => setSendChannel('whatsapp')}
          >
            WhatsApp
          </Button>
        </div>
        {sendChannel === 'email' ? (
          <FormField label="Recipient email" required>
            <EmailInput
              value={sendEmail}
              onChange={setSendEmail}
              placeholder={trip.party?.email || 'client@example.com'}
            />
          </FormField>
        ) : (
          <FormField label="WhatsApp mobile" required>
            <Input
              value={sendPhone}
              onChange={(e) => setSendPhone(e.target.value)}
              placeholder={trip.party?.phone || '9876543210'}
              inputMode="tel"
              autoComplete="tel"
              disabled={waMarkSentPending}
            />
          </FormField>
        )}
        {(validUntilGraceCue || validUntilNearExpiryMessage) ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={sendExtendValidity}
              onCheckedChange={(v) => setSendExtendValidity(v === true)}
              className="mt-0.5"
            />
            <span>
              Extend validity to org default on send
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {validUntilGraceCue
                  ? 'Leave unchecked to keep the expired date (grace).'
                  : 'Leave unchecked to keep the current near-expiry date.'}
              </span>
            </span>
          </label>
        ) : null}
        {sendChannel === 'whatsapp' && !waMarkSentPending && quoteWaSendCue.linkKind ? (
          <p
            className={
              quoteWaSendCue.tone === 'warn'
                ? 'text-xs text-amber-800 dark:text-amber-200'
                : 'text-xs text-muted-foreground'
            }
          >
            <Link
              className="text-primary hover:underline"
              to={toOrgPath(AGENCY_ROUTES.settingsIntegrations)}
            >
              Open Integrations → WhatsApp
            </Link>{' '}
            to set Cloud credentials or the Quote proposal template.
          </p>
        ) : null}
        {waMarkSentPending ? (
          <p className="text-xs text-muted-foreground">
            Status stays draft until you mark as sent. Cancel closes without changing status.
          </p>
        ) : null}
      </RecordDialog>

      <RecordDialog
        open={saveTemplateOpen}
        onOpenChange={(open) => {
          setSaveTemplateOpen(open);
          if (!open) {
            setTemplateSaveAsNew(false);
            setTemplateTagsCsv('');
            setTemplateFolder('');
          }
        }}
        title="Save as quote template"
        description="Reuse inclusions, exclusions, terms, and line items on future trips. Saving with the same name creates the next version and retires the current one."
        submitLabel={savingTemplate ? 'Saving…' : 'Save template'}
        onSubmit={() => void saveCurrentAsTemplate()}
      >
        <FormField label="Template name" required>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Classic Goa FIT"
            autoFocus
          />
        </FormField>
        <FormField
          label="Folder"
          description="Optional path — use / for nesting (e.g. Hill stations/Darjeeling)"
        >
          <Input
            value={templateFolder}
            onChange={(e) => setTemplateFolder(e.target.value)}
            placeholder="e.g. Hill stations/Darjeeling"
          />
        </FormField>
        <FormField
          label="Tags"
          description="Comma-separated — filter in Use template (e.g. hill, family)"
        >
          <Input
            value={templateTagsCsv}
            onChange={(e) => setTemplateTagsCsv(e.target.value)}
            placeholder="e.g. hill, family"
          />
        </FormField>
        {(() => {
          const match = quoteTemplates.find(
            (t) =>
              t.name.trim().toLowerCase() === templateName.trim().toLowerCase() &&
              templateName.trim().length > 0,
          );
          if (!match || templateSaveAsNew) return null;
          const next = (match.versionNumber ?? 1) + 1;
          return (
            <p className="text-xs text-muted-foreground">
              Will create <span className="font-medium">v{next}</span> and retire current v
              {match.versionNumber ?? 1}.
            </p>
          );
        })()}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={templateSaveAsNew}
            onChange={(e) => setTemplateSaveAsNew(e.target.checked)}
          />
          Keep both (new template with this name)
        </label>
      </RecordDialog>

      <RecordDialog
        open={useTemplateOpen}
        onOpenChange={(open) => {
          setUseTemplateOpen(open);
          if (!open) {
            setTemplateTagFilter('');
            setTemplateFolderFilter('');
          }
        }}
        title="Start from template"
        description="Set travel start and party size so package dates and occupancy rematch onto this trip."
        hideFooter
      >
        <FormField label="Travel start" required>
          <DatePicker
            className="h-9"
            placeholder="Trip start date"
            value={
              /^\d{4}-\d{2}-\d{2}$/.test(templateApplyStartDate)
                ? new Date(`${templateApplyStartDate}T12:00:00`)
                : undefined
            }
            onChange={(date) => {
              setTemplateApplyStartDate(
                date
                  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                  : '',
              );
            }}
          />
        </FormField>
        {!/^\d{4}-\d{2}-\d{2}$/.test(templateApplyStartDate) ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Required so hotel nights and transfers land on the right dates (then auto-rematch).
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Adults" required>
            <Input
              type="number"
              min={1}
              max={99}
              className="h-9"
              value={templateApplyAdults}
              onChange={(e) =>
                setTemplateApplyAdults(
                  Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                )
              }
            />
          </FormField>
          <FormField label="Children">
            <Input
              type="number"
              min={0}
              max={99}
              className="h-9"
              value={templateApplyChildren}
              onChange={(e) => {
                const children = Math.max(
                  0,
                  Math.min(99, Number(e.target.value) || 0),
                );
                setTemplateApplyChildren(children);
                setTemplateApplyChildrenWithoutBed((n) => Math.min(n, children));
              }}
            />
          </FormField>
        </div>
        {templateApplyChildren > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Child ages"
              description="Comma-separated years (0–17). Missing ages default to 8 on apply."
            >
              <Input
                className="h-9"
                placeholder="e.g. 8, 11"
                value={templateApplyChildAgesCsv}
                onChange={(e) => setTemplateApplyChildAgesCsv(e.target.value)}
              />
            </FormField>
            <FormField label="Children without bed">
              <Input
                type="number"
                min={0}
                max={templateApplyChildren}
                className="h-9"
                value={templateApplyChildrenWithoutBed}
                onChange={(e) =>
                  setTemplateApplyChildrenWithoutBed(
                    Math.max(
                      0,
                      Math.min(
                        templateApplyChildren,
                        Number(e.target.value) || 0,
                      ),
                    ),
                  )
                }
              />
            </FormField>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Stamped onto hotel, transfer, and activity lines before rematch.
        </p>
        {loadingTemplates ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : quoteTemplates.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No templates yet. Install the sample FIT pack for Darjeeling and Goa packages
              without leaving this trip.
            </p>
            {canQuoteWrite ? (
              <Button
                size="sm"
                disabled={installingFitPack}
                onClick={() => void installFitPackOnTrip()}
              >
                <PackagePlus className="size-4" />
                {installingFitPack ? 'Installing…' : 'Install sample FIT pack'}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Filter by folder">
                <Input
                  className="h-9"
                  value={templateFolderFilter}
                  onChange={(e) => setTemplateFolderFilter(e.target.value)}
                  placeholder="e.g. Hill stations/Darjeeling…"
                />
              </FormField>
              <FormField label="Filter by tag">
                <Input
                  className="h-9"
                  value={templateTagFilter}
                  onChange={(e) => setTemplateTagFilter(e.target.value)}
                  placeholder="e.g. beach, hill…"
                />
              </FormField>
            </div>
          {(() => {
            const folderNav = buildFolderNav(
              packageFolderIndex,
              templateFolderFilter,
            );
            const rows = [...quoteTemplates]
              .map((t) => {
                const lineCount = Array.isArray(t.content?.items) ? t.content.items.length : 0;
                const hint = String(t.content?.destinationHint || '').trim();
                const tags = Array.isArray(t.content?.tags) ? t.content.tags : [];
                const folder = String(t.content?.folder || '').trim() || undefined;
                const destNames = destinations.map((d) => d.name.toLowerCase());
                const hintLower = hint.toLowerCase();
                const matchesTrip =
                  Boolean(hintLower) &&
                  destNames.some(
                    (name) => name.includes(hintLower) || hintLower.includes(name),
                  );
                const matchesTag = templateMatchesTagFilter(tags, templateTagFilter);
                const matchesFolder = templateMatchesFolderFilter(
                  folder,
                  templateFolderFilter,
                );
                return {
                  t,
                  lineCount,
                  hint,
                  tags,
                  folder,
                  matchesTrip,
                  matchesTag,
                  matchesFolder,
                };
              })
              .filter((row) => row.matchesTag && row.matchesFolder)
              .sort((a, b) => {
                if (a.matchesTrip !== b.matchesTrip) return a.matchesTrip ? -1 : 1;
                if (a.lineCount !== b.lineCount) return b.lineCount - a.lineCount;
                return a.t.name.localeCompare(b.t.name);
              });
            return (
          <div className="space-y-2">
            <div className="space-y-1.5">
                {folderNav.breadcrumbs.length ? (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      className="rounded bg-muted px-1.5 py-px font-medium text-muted-foreground hover:bg-muted/80"
                      onClick={() => setTemplateFolderFilter('')}
                    >
                      All folders
                    </button>
                    {folderNav.breadcrumbs.map((crumb) => {
                      const active =
                        templateFolderFilter.trim().toLowerCase() ===
                        crumb.path.toLowerCase();
                      return (
                        <span key={crumb.path} className="contents">
                          <span className="text-muted-foreground/70">/</span>
                          <button
                            type="button"
                            className={
                              active
                                ? 'rounded bg-primary/20 px-1.5 py-px font-medium text-primary'
                                : 'rounded bg-primary/10 px-1.5 py-px font-medium text-primary hover:bg-primary/15'
                            }
                            onClick={() => setTemplateFolderFilter(crumb.path)}
                          >
                            {crumb.label}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {canQuoteWrite ? (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      className="rounded border border-border/60 px-1.5 py-px font-medium text-muted-foreground hover:bg-muted/80"
                      onClick={() => void addQuoteTemplateFolder()}
                    >
                      New folder…
                    </button>
                  </div>
                ) : null}
                <PackageFolderTree
                  folders={packageFolderIndex}
                  selectedPath={templateFolderFilter}
                  canWrite={canQuoteWrite}
                  onSelect={setTemplateFolderFilter}
                  onMove={(from, to) =>
                    void applyQuoteTemplateFolderRename(from, to)
                  }
                  onRename={(path) => void renameQuoteTemplateFolder(path)}
                  onRemoveEmpty={(path) =>
                    void removeEmptyQuoteTemplateFolder(path)
                  }
                  isEmptyFolder={(path) =>
                    !templatesUnderFolder(
                      quoteTemplates.map((t) => t.content?.folder),
                      path,
                    )
                  }
                />
              </div>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No templates match this folder/tag filter.
                </p>
            ) : (
          <ul className="space-y-2">
            {rows.map(({ t, lineCount, hint, tags, folder, matchesTrip }) => (
                <li
                  key={t.id}
                  className="space-y-2 rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-medium">{t.name}</div>
                        {(t.versionNumber ?? 1) > 1 ? (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                            v{t.versionNumber}
                          </span>
                        ) : null}
                        {matchesTrip ? (
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                            Matches trip
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        v{t.versionNumber ?? 1}
                        {folder ? ` · ${folder}` : ''}
                        {hint ? ` · ${hint}` : ''}
                        {' · '}
                        {lineCount > 0
                          ? `${lineCount} line${lineCount === 1 ? '' : 's'}`
                          : 'Meta only'}
                      </div>
                      {folder || tags.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {folderPathSegments(folder).map((seg, i, segs) => {
                            const path = segs.slice(0, i + 1).join('/');
                            return (
                              <button
                                key={path}
                                type="button"
                                className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary hover:bg-primary/15"
                                onClick={() => setTemplateFolderFilter(path)}
                              >
                                {seg}
                              </button>
                            );
                          })}
                          {tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground hover:bg-muted/80"
                              onClick={() => setTemplateTagFilter(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {showTemplateHistoryCue(t.versionNumber) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleTemplateHistory(t.id)}
                        >
                          {templateHistoryForId === t.id ? 'Hide' : 'History'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={
                          applyingTemplateId === t.id ||
                          !/^\d{4}-\d{2}-\d{2}$/.test(templateApplyStartDate)
                        }
                        onClick={() => void applyQuoteTemplate(t.id)}
                      >
                        {applyingTemplateId === t.id ? 'Applying…' : 'Use'}
                      </Button>
                    </div>
                  </div>
                  {templateHistoryForId === t.id ? (
                    <div className="rounded-md bg-muted/40 px-2 py-2">
                      {loadingTemplateHistory ? (
                        <p className="text-xs text-muted-foreground">Loading history…</p>
                      ) : templateHistoryItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No versions found.</p>
                      ) : (
                        <div className="space-y-2">
                          {templateHistoryHasPriors(templateHistoryItems) ? (
                            <p className="text-[11px] text-muted-foreground">
                              {templateHistoryPriorActionsCue()}
                            </p>
                          ) : null}
                          <ul className="space-y-1.5">
                          {templateHistoryItems.map((v) => {
                            const when = formatTemplateVersionWhen(v.createdAt);
                            const isActive = v.status === 'active';
                            const canUsePrior =
                              canUseTemplateHistoryVersion(v.status) && canQuoteWrite;
                            const canDiff = showTemplateHistoryDiffCue(v);
                            const diffOpen = templateDiffOpenId === v.id;
                            const diffRows = buildTemplateHistoryDiffRows(
                              v.diffVsActive,
                            );
                            const diffLines =
                              diffRows.length === 0
                                ? formatTemplateHistoryDiffLines(v.diffVsActive)
                                : [];
                            return (
                              <li key={v.id} className="space-y-1 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 text-muted-foreground">
                                  <span className="font-medium text-foreground">
                                    v{v.versionNumber}
                                  </span>
                                  {isActive ? ' · current' : ' · prior'}
                                  {when ? ` · ${when}` : ''}
                                  {v.lineCount != null
                                    ? ` · ${v.lineCount} line${v.lineCount === 1 ? '' : 's'}`
                                    : ''}
                                  {!isActive && v.diffVsActive?.summary
                                    ? ` · ${v.diffVsActive.summary}`
                                    : ''}
                                </div>
                                {!isActive && canQuoteWrite ? (
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {canDiff ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          setTemplateDiffOpenId(
                                            diffOpen ? null : v.id,
                                          )
                                        }
                                      >
                                        {diffOpen ? 'Hide' : 'Diff'}
                                      </Button>
                                    ) : null}
                                    {canUsePrior ? (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={
                                          applyingTemplateId === v.id ||
                                          restoringTemplateId != null ||
                                          !/^\d{4}-\d{2}-\d{2}$/.test(
                                            templateApplyStartDate,
                                          )
                                        }
                                        onClick={() => void applyQuoteTemplate(v.id)}
                                      >
                                        {applyingTemplateId === v.id
                                          ? 'Applying…'
                                          : 'Use'}
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        restoringTemplateId === v.id ||
                                        applyingTemplateId != null
                                      }
                                      onClick={() =>
                                        void restoreTemplateVersion(t.id, v.id)
                                      }
                                    >
                                      {restoringTemplateId === v.id
                                        ? 'Restoring…'
                                        : 'Restore'}
                                    </Button>
                                  </div>
                                ) : canDiff ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setTemplateDiffOpenId(diffOpen ? null : v.id)
                                    }
                                  >
                                    {diffOpen ? 'Hide' : 'Diff'}
                                  </Button>
                                ) : null}
                                </div>
                                {diffOpen && diffRows.length ? (
                                  <div className="overflow-x-auto rounded border border-border/50 bg-background/60">
                                    <table className="w-full min-w-[260px] text-left text-[11px]">
                                      <thead>
                                        <tr className="border-b border-border/40 text-muted-foreground">
                                          <th className="px-2 py-1.5 font-medium">
                                            Field
                                          </th>
                                          <th className="px-2 py-1.5 font-medium">
                                            This tip
                                          </th>
                                          <th className="px-2 py-1.5 font-medium">
                                            Current
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {diffRows.map((row) => (
                                          <tr
                                            key={`${row.field}:${row.thisTip}:${row.current}`}
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
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}
                                {diffOpen && !diffRows.length && diffLines.length ? (
                                  <ul className="rounded border border-border/50 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                                    {diffLines.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            );
                          })}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
            )}
          </div>
            );
          })()}
          </div>
        )}
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
