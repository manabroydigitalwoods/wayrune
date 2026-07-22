/** Inquiry → proposal workspace seeding (shared domain). */

import { assignSeedDestinationRefs } from './itinerary-place-refs';

export const PROPOSAL_TRIP_STATUSES = [
  'planning',
  'quoted',
  'awaiting_approval',
] as const;

export const CONFIRMED_OPS_TRIP_STATUSES = [
  'confirmed',
  'booking_in_progress',
  'ready_to_travel',
  'in_progress',
  'completed',
] as const;

export type ProposalTripStatus = (typeof PROPOSAL_TRIP_STATUSES)[number];
export type ConfirmedOpsTripStatus = (typeof CONFIRMED_OPS_TRIP_STATUSES)[number];

export type InquiryLinkedTrip = {
  id: string;
  tripNumber: string;
  title: string;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export function isProposalTrip(status: string): boolean {
  return (PROPOSAL_TRIP_STATUSES as readonly string[]).includes(status as ProposalTripStatus);
}

export function isConfirmedOpsTrip(status: string): boolean {
  return (CONFIRMED_OPS_TRIP_STATUSES as readonly string[]).includes(
    status as ConfirmedOpsTripStatus,
  );
}

function updatedAtMs(trip: InquiryLinkedTrip): number {
  const raw = trip.updatedAt || trip.createdAt;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function newestFirst(a: InquiryLinkedTrip, b: InquiryLinkedTrip): number {
  return updatedAtMs(b) - updatedAtMs(a);
}

/** Active proposal: awaiting_approval → quoted → planning, then most recently updated. */
export function pickActiveInquiryProposalTrip(
  trips: InquiryLinkedTrip[] | null | undefined,
): InquiryLinkedTrip | null {
  const proposals = (trips || []).filter((t) => isProposalTrip(t.status));
  if (!proposals.length) return null;
  const priority: ProposalTripStatus[] = [
    'awaiting_approval',
    'quoted',
    'planning',
  ];
  for (const status of priority) {
    const matches = proposals.filter((t) => t.status === status).sort(newestFirst);
    if (matches[0]) return matches[0];
  }
  return proposals.sort(newestFirst)[0] ?? null;
}

/** @deprecated Prefer pickActiveInquiryProposalTrip */
export const pickActiveProposalTrip = pickActiveInquiryProposalTrip;

export function pickPrimaryOpsTrip(
  trips: InquiryLinkedTrip[] | null | undefined,
): InquiryLinkedTrip | null {
  const ops = (trips || []).filter((t) => isConfirmedOpsTrip(t.status)).sort(newestFirst);
  return ops[0] ?? null;
}

export function proposalTrips(
  trips: InquiryLinkedTrip[] | null | undefined,
): InquiryLinkedTrip[] {
  return (trips || []).filter((t) => isProposalTrip(t.status)).sort(newestFirst);
}

export function confirmedOpsTrips(
  trips: InquiryLinkedTrip[] | null | undefined,
): InquiryLinkedTrip[] {
  return (trips || []).filter((t) => isConfirmedOpsTrip(t.status)).sort(newestFirst);
}

export type ProposalAssumptionKey =
  | 'hotel_category'
  | 'room_configuration'
  | 'meal_plan'
  | 'transport_mode'
  | 'flight_inclusion'
  | 'itinerary_pace';

export type ProposalAssumptionSource = 'inquiry' | 'agency_default' | 'system_inference';

export type ProposalAssumption = {
  key: ProposalAssumptionKey;
  value: string;
  source: ProposalAssumptionSource;
  requiresConfirmation: boolean;
  confirmedAt?: string | null;
};

export type ProposalSeedStepState = 'pending' | 'completed' | 'failed' | 'skipped';

export type ProposalSeedSteps = {
  trip: Exclude<ProposalSeedStepState, 'skipped'>;
  itinerary: ProposalSeedStepState;
  quotation: Exclude<ProposalSeedStepState, 'skipped'>;
  assumptions: Exclude<ProposalSeedStepState, 'skipped'>;
};

export type ProposalSeedPricing = {
  pricingStatus: 'not_started' | 'in_progress' | 'priced';
  customerBudgetTarget: number | null;
  customerBudgetCurrency: string | null;
  sellingTotal: null;
  supplierCostTotal: null;
  adults: number | null;
  children: number | null;
  infants: number | null;
};

export type InquiryProposalSeed = {
  sourceInquiryId: string;
  version: 1;
  sourceSnapshot: Record<string, unknown>;
  seededAt: string;
  steps: ProposalSeedSteps;
  completedAt?: string | null;
  dateConflict?: boolean;
  assumptions: ProposalAssumption[];
  pricing: ProposalSeedPricing;
  itineraryDaysCreated?: number;
  quotationId?: string | null;
};

export type InquiryProposalReadiness = {
  draftable: boolean;
  draftableGaps: string[];
  itinerarySeedable: boolean;
  itineraryGaps: string[];
  quotationReadiness: {
    missingPreferences: string[];
    pricingSensitive: string[];
    operationalOnly: string[];
  };
};

export type InquiryProposalReadinessInput = {
  destinations?: unknown;
  stops?: unknown;
  adults?: number | null;
  children?: number | null;
  travelType?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  nights?: number | null;
  budgetAmount?: number | null;
  hotelCategory?: string | null;
  meals?: string | null;
  transportPref?: string | null;
  flightsRequired?: boolean | null;
  roomRequirements?: string | null;
  /** PlaceRef or legacy display string */
  origin?: string | { name?: string | null } | null;
};

function hasDestinations(data: InquiryProposalReadinessInput): boolean {
  const dest = data.destinations;
  const stops = data.stops;
  const destOk = Array.isArray(dest) && dest.length > 0;
  const stopsOk = Array.isArray(stops) && stops.length > 0;
  return destOk || stopsOk;
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object' && !Array.isArray(v) && 'name' in v) {
    const name = (v as { name?: unknown }).name;
    return typeof name === 'string' && name.trim().length > 0;
  }
  return true;
}

export function computeInquiryProposalReadiness(
  data: InquiryProposalReadinessInput,
): InquiryProposalReadiness {
  const draftableGaps: string[] = [];
  if (!hasDestinations(data)) draftableGaps.push('destinations');
  if (!data.adults || data.adults < 1) draftableGaps.push('adults');
  if (!hasValue(data.travelType)) draftableGaps.push('travelType');

  const itineraryGaps: string[] = [];
  if (!hasValue(data.startDate)) itineraryGaps.push('startDate');
  const hasNights = data.nights != null && data.nights >= 1;
  const hasEnd = hasValue(data.endDate);
  if (!hasNights && !hasEnd) itineraryGaps.push('duration');

  const missingPreferences: string[] = [];
  const pricingSensitive: string[] = [];
  const operationalOnly: string[] = [];

  if (!hasValue(data.hotelCategory)) missingPreferences.push('hotelCategory');
  if (!hasValue(data.meals)) missingPreferences.push('meals');
  if (!hasValue(data.transportPref)) missingPreferences.push('transportPref');
  if (data.flightsRequired == null) missingPreferences.push('flightsRequired');

  if (!hasValue(data.roomRequirements)) pricingSensitive.push('roomRequirements');
  if (itineraryGaps.length) pricingSensitive.push('exactDates');
  if ((data.children ?? 0) > 0) pricingSensitive.push('childAges');
  if (
    (data.flightsRequired === true || hasValue(data.transportPref)) &&
    !hasValue(data.origin)
  ) {
    pricingSensitive.push('origin');
  }

  // Operational fields are never collected on inquiry today — reserved for UI clarity.
  operationalOnly.push('passport', 'pickupAddress', 'documents');

  return {
    draftable: draftableGaps.length === 0,
    draftableGaps,
    itinerarySeedable: itineraryGaps.length === 0,
    itineraryGaps,
    quotationReadiness: {
      missingPreferences,
      pricingSensitive,
      operationalOnly,
    },
  };
}

export type ResolveTripDayCountInput = {
  startDate: string | Date | null | undefined;
  endDate?: string | Date | null;
  nights?: number | null;
};

export type ResolveTripDayCountResult = {
  dayCount: number;
  nightsUsed: number;
  dateConflict: boolean;
  sameDay: boolean;
};

function toYmd(value: string | Date): string {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1]!;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function daysBetweenYmd(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const a = Date.UTC(sy!, sm! - 1, sd!);
  const b = Date.UTC(ey!, em! - 1, ed!);
  return Math.round((b - a) / 86_400_000);
}

/** Nights ≥1 → n+1 days; start===end → 1 day. Prefer nights when conflicting with end. */
export function resolveTripDayCount(input: ResolveTripDayCountInput): ResolveTripDayCountResult | null {
  if (!input.startDate) return null;
  const start = toYmd(input.startDate);
  const end = input.endDate ? toYmd(input.endDate) : null;

  if (end && end === start) {
    const nightsFromField = input.nights != null && input.nights >= 1 ? input.nights : null;
    return {
      dayCount: 1,
      nightsUsed: 0,
      dateConflict: nightsFromField != null && nightsFromField !== 0,
      sameDay: true,
    };
  }

  if (input.nights != null && input.nights >= 1) {
    const nightsUsed = input.nights;
    let dateConflict = false;
    if (end) {
      const spanNights = daysBetweenYmd(start, end);
      if (spanNights !== nightsUsed) dateConflict = true;
    }
    return {
      dayCount: nightsUsed + 1,
      nightsUsed,
      dateConflict,
      sameDay: false,
    };
  }

  if (end) {
    const span = daysBetweenYmd(start, end);
    if (span < 0) return null;
    if (span === 0) {
      return { dayCount: 1, nightsUsed: 0, dateConflict: false, sameDay: true };
    }
    return {
      dayCount: span + 1,
      nightsUsed: span,
      dateConflict: false,
      sameDay: false,
    };
  }

  return null;
}

export type BuildProposalAssumptionsInput = {
  adults?: number | null;
  hotelCategory?: string | null;
  meals?: string | null;
  transportPref?: string | null;
  flightsRequired?: boolean | null;
  roomRequirements?: string | null;
};

export function buildProposalAssumptions(
  input: BuildProposalAssumptionsInput,
): ProposalAssumption[] {
  const assumptions: ProposalAssumption[] = [];

  if (hasValue(input.hotelCategory)) {
    assumptions.push({
      key: 'hotel_category',
      value: String(input.hotelCategory).trim(),
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else {
    assumptions.push({
      key: 'hotel_category',
      value: '3-star',
      source: 'agency_default',
      requiresConfirmation: true,
    });
  }

  if (hasValue(input.roomRequirements)) {
    assumptions.push({
      key: 'room_configuration',
      value: String(input.roomRequirements).trim(),
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else {
    const adults = Math.max(1, Math.round(Number(input.adults) || 2));
    const doubles = Math.max(1, Math.ceil(adults / 2));
    assumptions.push({
      key: 'room_configuration',
      value: doubles === 1 ? '1 double room' : `${doubles} double rooms`,
      source: 'system_inference',
      requiresConfirmation: true,
    });
  }

  if (hasValue(input.meals)) {
    assumptions.push({
      key: 'meal_plan',
      value: String(input.meals).trim(),
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else {
    assumptions.push({
      key: 'meal_plan',
      value: 'Breakfast',
      source: 'agency_default',
      requiresConfirmation: true,
    });
  }

  if (hasValue(input.transportPref)) {
    assumptions.push({
      key: 'transport_mode',
      value: String(input.transportPref).trim(),
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else {
    assumptions.push({
      key: 'transport_mode',
      value: 'Private vehicle',
      source: 'agency_default',
      requiresConfirmation: true,
    });
  }

  if (input.flightsRequired === true) {
    assumptions.push({
      key: 'flight_inclusion',
      value: 'Flights included',
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else if (input.flightsRequired === false) {
    assumptions.push({
      key: 'flight_inclusion',
      value: 'Flights excluded',
      source: 'inquiry',
      requiresConfirmation: false,
    });
  } else {
    assumptions.push({
      key: 'flight_inclusion',
      value: 'Flights excluded',
      source: 'agency_default',
      requiresConfirmation: true,
    });
  }

  assumptions.push({
    key: 'itinerary_pace',
    value: 'Moderate',
    source: 'agency_default',
    requiresConfirmation: false,
  });

  return assumptions;
}

export type SeededItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  date: string | null;
  destinationRef?: {
    placeId: string | null;
    name: string;
    kind?: string | null;
  } | null;
  items: unknown[];
};

export function buildSeededItineraryDays(input: {
  dayCount: number;
  startYmd: string | null;
  /** Full PlaceRefs when available (preferred). */
  destinations?: Array<{ placeId?: string | null; name: string; kind?: string }>;
  /** @deprecated Prefer destinations — names only. */
  destinationNames?: string[];
  multiStop: boolean;
}): SeededItineraryDay[] {
  const { dayCount, startYmd, multiStop } = input;
  const destRefs: Array<{ placeId: string | null; name: string; kind?: string }> =
    input.destinations?.length
      ? input.destinations
          .filter((d) => d.name?.trim())
          .map((d) => ({
            placeId: d.placeId ?? null,
            name: d.name.trim(),
            kind: d.kind,
          }))
      : (input.destinationNames || [])
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => ({ placeId: null as string | null, name }));

  const primary = destRefs[0]?.name || 'destination';

  const days: SeededItineraryDay[] = [];
  for (let i = 1; i <= dayCount; i++) {
    let title: string;
    if (dayCount === 1) {
      title = multiStop ? `Day trip — ${primary}` : `Day in ${primary}`;
    } else if (multiStop) {
      if (i === 1) title = 'Arrival';
      else if (i === dayCount) title = 'Departure';
      else title = 'Plan day';
    } else if (i === 1) {
      title = `Arrival in ${primary}`;
    } else if (i === dayCount) {
      title = `Departure from ${primary}`;
    } else {
      title = `${primary} experience`;
    }

    let date: string | null = null;
    if (startYmd) {
      const [y, m, d] = startYmd.split('-').map(Number);
      const dt = new Date(Date.UTC(y!, m! - 1, d! + (i - 1)));
      date = dt.toISOString().slice(0, 10);
    }

    const destinationRef = assignSeedDestinationRefs(dayCount, i, destRefs);

    days.push({
      id: `seed-day-${i}`,
      dayNumber: i,
      title,
      date,
      destinationRef,
      items: [],
    });
  }
  return days;
}

export function parseTripProposalSeed(raw: unknown): InquiryProposalSeed | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const settings = raw as Record<string, unknown>;
  const seed = settings.proposalSeed;
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return null;
  return seed as InquiryProposalSeed;
}

export function proposalSeedPublicSummary(seed: InquiryProposalSeed | null | undefined) {
  if (!seed) {
    return {
      status: 'none' as const,
      itineraryDaysCreated: 0,
      quotationCreated: false,
      assumptionsCount: 0,
      assumptionsRequiringConfirmation: 0,
      quotationGaps: [] as string[],
      dateConflict: false,
      failedSteps: [] as string[],
    };
  }
  const failedSteps = (Object.entries(seed.steps) as Array<[string, ProposalSeedStepState]>)
    .filter(([, v]) => v === 'failed')
    .map(([k]) => k);
  const anyFailed = failedSteps.length > 0;
  const pending = (Object.values(seed.steps) as ProposalSeedStepState[]).some(
    (s) => s === 'pending',
  );
  const status = anyFailed ? ('partial' as const) : pending ? ('partial' as const) : ('completed' as const);
  return {
    status,
    itineraryDaysCreated: seed.itineraryDaysCreated ?? 0,
    quotationCreated: seed.steps.quotation === 'completed',
    assumptionsCount: seed.assumptions?.length ?? 0,
    assumptionsRequiringConfirmation:
      seed.assumptions?.filter((a) => a.requiresConfirmation && !a.confirmedAt).length ?? 0,
    quotationGaps: [] as string[],
    dateConflict: Boolean(seed.dateConflict),
    failedSteps,
  };
}
