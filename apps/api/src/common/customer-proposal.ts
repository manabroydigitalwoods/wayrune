/** Shared helpers for customer-facing itinerary + quotation proposal payloads. */

import {
  looksLikeIdealSeasonRange,
  pickSeasonalKnowledgeBody,
  tripClimateSeason,
  tripWindowHeadline,
} from '@travel/contracts';

export type ContentDay = {
  id?: string;
  dayNumber?: number;
  title?: string;
  date?: string | null;
  destination?: unknown;
  items?: Array<{
    id?: string;
    type?: string;
    title?: string;
    description?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    location?: unknown;
    notes?: string | null;
    internalNotes?: string | null;
    customerVisible?: boolean;
    details?: Record<string, unknown>;
  }>;
};

export type PaymentScheduleStep = {
  label: string;
  percent?: number;
  amountHint?: string;
};

export type PackingCategories = {
  clothing?: string[];
  electronics?: string[];
  documents?: string[];
  medicine?: string[];
};

export type ItineraryStory = {
  heroImageUrl?: string;
  headline?: string;
  tagline?: string;
  highlights?: string[];
  bestTime?: string;
  weatherNote?: string;
  packingTips?: string[];
  packingCategories?: PackingCategories;
  faqs?: Array<{ question: string; answer: string }>;
  consultantNote?: string;
  cancellationNote?: string;
  paymentSchedule?: PaymentScheduleStep[];
};

export type RouteStop = {
  label: string;
  kind: 'pickup' | 'stay' | 'drop';
  nights?: number;
  /** Travel time / drive label from the previous stop (e.g. "3h 20m drive"). */
  legFromPrevious?: string;
};

export type PackageSummary = {
  days: number;
  nights: number;
  destinations: string[];
  transportLabel: string | null;
  mealLabels: string[];
  hotelCount: number;
  activityCount: number;
  pickup: string | null;
  drop: string | null;
  sellTotal: number | null;
  currency: string | null;
  bestTime: string | null;
  /** Nighted journey for the proposal route section. */
  routeStops: RouteStop[];
  /** Seats / includes from the primary transfer, for vehicle chips. */
  vehicleSeats: number | null;
  vehicleIncludes: string[];
};

export type OrgBrandingPayload = {
  companyName: string;
  tagline: string | null;
  primaryColor: string;
  logoUrl: string | null;
  previewFooter: string | null;
};

export type BusinessContactPayload = {
  phone: string | null;
  supportEmail: string | null;
  website: string | null;
  legalName: string | null;
  emergencyPhone: string | null;
};

export type OrgTrustPayload = {
  licensed: boolean;
  yearsExperience: number | null;
  travellerCountLabel: string | null;
  support247: boolean;
  verifiedHotels: boolean;
  defaultCancellationNote: string | null;
  /** Pre-built chips for the proposal trust strip. */
  chips: string[];
};

export function placeLabel(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s || null;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'name' in raw) {
    const name = (raw as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

export function placeIdOf(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'placeId' in raw) {
    const id = (raw as { placeId?: unknown }).placeId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function parsePaymentSchedule(raw: unknown): PaymentScheduleStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentScheduleStep[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    if (!label) continue;
    const percent = Number(r.percent);
    const amountHint =
      typeof r.amountHint === 'string' && r.amountHint.trim()
        ? r.amountHint.trim()
        : undefined;
    out.push({
      label,
      percent: Number.isFinite(percent) && percent > 0 ? percent : undefined,
      amountHint,
    });
  }
  return out;
}

function parsePackingCategories(raw: unknown): PackingCategories | undefined {
  const cats = asRecord(raw);
  const out: PackingCategories = {
    clothing: strList(cats.clothing),
    electronics: strList(cats.electronics),
    documents: strList(cats.documents),
    medicine: strList(cats.medicine),
  };
  const hasAny =
    (out.clothing && out.clothing.length > 0) ||
    (out.electronics && out.electronics.length > 0) ||
    (out.documents && out.documents.length > 0) ||
    (out.medicine && out.medicine.length > 0);
  return hasAny ? out : undefined;
}

function packingCategoriesHasItems(cats: PackingCategories | undefined): boolean {
  if (!cats) return false;
  return Boolean(
    cats.clothing?.length ||
      cats.electronics?.length ||
      cats.documents?.length ||
      cats.medicine?.length,
  );
}

/** Parse story meta from itinerary contentJson. */
export function parseItineraryStory(contentJson: unknown): ItineraryStory | null {
  const root = asRecord(contentJson);
  const story = asRecord(root.story);
  if (Object.keys(story).length === 0) return null;
  const faqsRaw = Array.isArray(story.faqs) ? story.faqs : [];
  const faqs = faqsRaw
    .map((row) => {
      const r = asRecord(row);
      const question = typeof r.question === 'string' ? r.question.trim() : '';
      const answer = typeof r.answer === 'string' ? r.answer.trim() : '';
      if (!question && !answer) return null;
      return { question, answer };
    })
    .filter((f): f is { question: string; answer: string } => Boolean(f));

  const paymentSchedule = parsePaymentSchedule(story.paymentSchedule);
  const packingCategories = parsePackingCategories(story.packingCategories);

  const out: ItineraryStory = {
    heroImageUrl: typeof story.heroImageUrl === 'string' ? story.heroImageUrl.trim() || undefined : undefined,
    headline: typeof story.headline === 'string' ? story.headline.trim() || undefined : undefined,
    tagline: typeof story.tagline === 'string' ? story.tagline.trim() || undefined : undefined,
    highlights: strList(story.highlights),
    bestTime: typeof story.bestTime === 'string' ? story.bestTime.trim() || undefined : undefined,
    weatherNote:
      typeof story.weatherNote === 'string' ? story.weatherNote.trim() || undefined : undefined,
    packingTips: strList(story.packingTips),
    packingCategories,
    faqs,
    consultantNote:
      typeof story.consultantNote === 'string' ? story.consultantNote.trim() || undefined : undefined,
    cancellationNote:
      typeof story.cancellationNote === 'string'
        ? story.cancellationNote.trim() || undefined
        : undefined,
    paymentSchedule: paymentSchedule.length ? paymentSchedule : undefined,
  };
  if (
    !out.heroImageUrl &&
    !out.headline &&
    !out.tagline &&
    !(out.highlights && out.highlights.length) &&
    !out.bestTime &&
    !out.weatherNote &&
    !(out.packingTips && out.packingTips.length) &&
    !packingCategoriesHasItems(out.packingCategories) &&
    !(out.faqs && out.faqs.length) &&
    !out.consultantNote &&
    !out.cancellationNote &&
    !(out.paymentSchedule && out.paymentSchedule.length)
  ) {
    return null;
  }
  return out;
}

/** Arrow titles like "IXB → Darjeeling" or "Bagdogra -> Kalimpong". */
function parseArrowTitle(title: string): { from: string; to: string } | null {
  const m = title.match(/^(.+?)\s*(?:→|->|—|–)\s*(.+)$/);
  if (!m) return null;
  const from = m[1].trim();
  const to = m[2].trim();
  if (!from || !to) return null;
  return { from, to };
}

/**
 * Resolve payment steps from story, or lightly parse quote terms
 * (e.g. "40% to confirm; balance before travel").
 */
export function resolvePaymentSchedule(
  story: ItineraryStory | null | undefined,
  terms: string | null | undefined,
): PaymentScheduleStep[] {
  if (story?.paymentSchedule && story.paymentSchedule.length) {
    return story.paymentSchedule;
  }
  if (!terms?.trim()) return [];
  const pctMatches = [...terms.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
  if (pctMatches.length >= 2) {
    const [first, second] = pctMatches;
    return [
      { label: 'Today', percent: first },
      { label: 'Before travel', percent: second },
    ];
  }
  if (pctMatches.length === 1) {
    const first = pctMatches[0];
    const rest = Math.max(0, 100 - first);
    return [
      { label: 'Today', percent: first },
      ...(rest > 0 ? [{ label: 'Before travel', percent: rest }] : []),
    ];
  }
  return [];
}

const KEY_COVERAGE = [
  { id: 'flights', match: /flight/i, label: 'Flights' },
  { id: 'lunch', match: /lunch/i, label: 'Lunch' },
  { id: 'dinner', match: /dinner/i, label: 'Dinner' },
] as const;

/** Top-of-proposal answers: included vs not for flights / lunch / dinner. */
export function keyCoverageHints(
  includeLines: string[],
  excludeLines: string[],
): Array<{ label: string; included: boolean }> {
  const out: Array<{ label: string; included: boolean }> = [];
  for (const key of KEY_COVERAGE) {
    const inInc = includeLines.some((l) => key.match.test(l));
    const inExc = excludeLines.some((l) => key.match.test(l));
    if (inInc) out.push({ label: key.label, included: true });
    else if (inExc) out.push({ label: key.label, included: false });
  }
  return out;
}

function minutesBetweenTimes(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parse(start);
  const b = parse(end);
  if (a == null || b == null || b <= a) return null;
  return b - a;
}

function formatDriveLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m drive`;
  if (h > 0) return `${h}h drive`;
  return `${m}m drive`;
}

function transferLegLabel(item: {
  startTime?: string | null;
  endTime?: string | null;
  details?: Record<string, unknown>;
}): string | null {
  const explicit = item.details?.driveDuration;
  if (typeof explicit === 'string' && explicit.trim()) {
    const raw = explicit.trim();
    return /drive/i.test(raw) ? raw : `${raw} drive`;
  }
  const mins = minutesBetweenTimes(item.startTime, item.endTime);
  if (mins != null && mins >= 15) return formatDriveLabel(mins);
  return null;
}

export type PlaceEdgeLeg = {
  fromPlaceId: string;
  toPlaceId: string;
  durationMin?: number | null;
  roadHint?: string | null;
};

function catalogLegLabel(
  fromPlaceId: string | null | undefined,
  toPlaceId: string | null | undefined,
  edges: PlaceEdgeLeg[] | undefined,
): string | null {
  if (!fromPlaceId || !toPlaceId || !edges?.length) return null;
  const hit = edges.find((e) => e.fromPlaceId === fromPlaceId && e.toPlaceId === toPlaceId);
  if (!hit?.durationMin || hit.durationMin <= 0) return null;
  const base = formatDriveLabel(hit.durationMin);
  if (hit.roadHint?.trim()) return `${base} · ${hit.roadHint.trim()}`;
  return base;
}

function buildRouteStops(
  days: ReturnType<typeof customerItineraryDays>,
  pickup: string | null,
  drop: string | null,
  edges?: PlaceEdgeLeg[],
): RouteStop[] {
  const nightOrder: string[] = [];
  const nightsByPlace = new Map<string, number>();
  const placeIdByLabel = new Map<string, string>();
  const transferLegs: string[] = [];

  for (const day of days) {
    if (day.destination && day.destinationPlaceId) {
      placeIdByLabel.set(day.destination.toLowerCase(), day.destinationPlaceId);
    }
    for (const item of day.items) {
      if (item.location && item.locationPlaceId) {
        placeIdByLabel.set(item.location.toLowerCase(), item.locationPlaceId);
      }
      if (item.type === 'transfer') {
        const fromId =
          (typeof item.details?.fromPlaceId === 'string' && item.details.fromPlaceId) ||
          null;
        const toId =
          (typeof item.details?.toPlaceId === 'string' && item.details.toPlaceId) || null;
        const fromLabel =
          (typeof item.details?.from === 'string' && item.details.from.trim()) ||
          parseArrowTitle(item.title)?.from ||
          '';
        const toLabel =
          (typeof item.details?.to === 'string' && item.details.to.trim()) ||
          parseArrowTitle(item.title)?.to ||
          '';
        if (fromLabel && fromId) placeIdByLabel.set(fromLabel.toLowerCase(), fromId);
        if (toLabel && toId) placeIdByLabel.set(toLabel.toLowerCase(), toId);
        const catalog = catalogLegLabel(fromId, toId, edges);
        const leg = catalog || transferLegLabel(item);
        if (leg) transferLegs.push(leg);
      }
      if (item.type !== 'hotel') continue;
      const place =
        (typeof item.location === 'string' && item.location.trim()) ||
        (typeof day.destination === 'string' && day.destination.trim()) ||
        'Stay';
      if (!nightsByPlace.has(place)) nightOrder.push(place);
      const n = Number(item.details?.nights);
      nightsByPlace.set(place, (nightsByPlace.get(place) || 0) + (Number.isFinite(n) && n > 0 ? n : 1));
    }
  }

  const stops: Array<RouteStop & { placeId?: string | null }> = [];
  if (pickup) {
    stops.push({
      label: pickup,
      kind: 'pickup',
      placeId: placeIdByLabel.get(pickup.toLowerCase()) || null,
    });
  }
  for (const place of nightOrder) {
    if (pickup && place.toLowerCase() === pickup.toLowerCase()) continue;
    stops.push({
      label: place,
      kind: 'stay',
      nights: nightsByPlace.get(place) || 1,
      placeId: placeIdByLabel.get(place.toLowerCase()) || null,
    });
  }
  if (drop) {
    const last = stops[stops.length - 1];
    if (!last || last.label.toLowerCase() !== drop.toLowerCase()) {
      stops.push({
        label: drop,
        kind: 'drop',
        placeId: placeIdByLabel.get(drop.toLowerCase()) || null,
      });
    }
  }

  let legIdx = 0;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const cur = stops[i]!;
    const catalog = catalogLegLabel(prev.placeId, cur.placeId, edges);
    if (catalog) {
      stops[i] = { ...cur, legFromPrevious: catalog };
      continue;
    }
    if (legIdx < transferLegs.length) {
      stops[i] = { ...cur, legFromPrevious: transferLegs[legIdx++] };
    }
  }

  return stops.map(({ placeId: _placeId, ...stop }) => stop);
}

/** Personal hero subtitle: "Your 4-Day North Bengal Hills Journey". */
export function personalJourneyLine(opts: {
  days: number;
  tripTitle: string;
  destinations?: string[];
}): string {
  const cleaned = opts.tripTitle
    .replace(/\bpackage\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const place =
    cleaned ||
    (opts.destinations && opts.destinations.length
      ? opts.destinations.join(' & ')
      : 'Trip');
  if (opts.days > 0) {
    return `Your ${opts.days}-Day ${place} Journey`;
  }
  return `Your ${place} Journey`;
}

function customerSafeDetails(details: Record<string, unknown> | undefined) {
  if (!details) return {};
  const out: Record<string, unknown> = {};
  for (const key of [
    'nights',
    'roomType',
    'stars',
    'amenities',
    'checkIn',
    'checkOut',
    'vehicle',
    'seats',
    'includes',
    'flightNumber',
    'from',
    'to',
    'imageUrl',
    'imageUrls',
    'googleRating',
    'googleReviewCount',
    'distanceHint',
    'googleMapsUrl',
    'reviewSnippet',
    'bestVisitTime',
    'driveDuration',
    'catalogPlaceId',
    'catalogProvenance',
    'supplierId',
    'fromPlaceId',
    'toPlaceId',
    'from',
    'to',
  ]) {
    if (details[key] !== undefined && details[key] !== null && details[key] !== '') {
      out[key] = details[key];
    }
  }
  return out;
}

/** Cover + gallery URLs for proposal media (deduped). */
export function resolveItemGallery(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  const urls: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const s = raw.trim();
    if (s && !urls.includes(s)) urls.push(s);
  };
  push(details.imageUrl);
  if (Array.isArray(details.imageUrls)) {
    for (const u of details.imageUrls) push(u);
  }
  return urls;
}

/** Customer-visible itinerary days (hides internal notes + non-visible items). */
export function customerItineraryDays(contentJson: unknown) {
  const raw = contentJson as { days?: ContentDay[] } | ContentDay[] | null;
  const days = Array.isArray(raw) ? raw : Array.isArray(raw?.days) ? raw.days : [];
  return days
    .map((day, index) => ({
      dayNumber: day.dayNumber ?? index + 1,
      title: day.title || `Day ${day.dayNumber ?? index + 1}`,
      date: day.date ?? null,
      destination: placeLabel(day.destination),
      destinationPlaceId: placeIdOf(day.destination),
      items: (day.items || [])
        .filter((item) => item.customerVisible !== false)
        .map((item) => ({
          type: item.type || 'note',
          title: item.title || 'Item',
          description:
            typeof item.description === 'string' && item.description.trim()
              ? item.description.trim()
              : null,
          startTime: item.startTime ?? null,
          endTime: item.endTime ?? null,
          location: placeLabel(item.location),
          locationPlaceId: placeIdOf(item.location),
          notes: item.notes ?? null,
          details: customerSafeDetails(item.details),
        })),
    }))
    .filter((day) => day.items.length > 0 || Boolean(day.title?.trim()));
}

/** Collect catalog / destination place ids referenced by an itinerary version. */
export function collectContentPlaceIds(contentJson: unknown): string[] {
  const raw = contentJson as { days?: ContentDay[] } | ContentDay[] | null;
  const days = Array.isArray(raw) ? raw : Array.isArray(raw?.days) ? raw.days : [];
  const ids = new Set<string>();
  for (const day of days) {
    const destId = placeIdOf(day.destination);
    if (destId) ids.add(destId);
    for (const item of day.items || []) {
      const locId = placeIdOf(item.location);
      if (locId) ids.add(locId);
      const catalogId = item.details?.catalogPlaceId;
      if (typeof catalogId === 'string' && catalogId.trim()) ids.add(catalogId.trim());
      const fromId = item.details?.fromPlaceId;
      const toId = item.details?.toPlaceId;
      if (typeof fromId === 'string' && fromId.trim()) ids.add(fromId.trim());
      if (typeof toId === 'string' && toId.trim()) ids.add(toId.trim());
    }
  }
  return [...ids];
}

/** Fill empty story weather/packing from platform PlaceKnowledge (trip overrides win). */
export function hydrateStoryFromKnowledge(
  story: ItineraryStory | null,
  knowledge: Array<{ kind: string; title?: string | null; body: string; season?: string }>,
  opts?: { startDate?: string | null; endDate?: string | null; placeName?: string | null },
): ItineraryStory | null {
  if (!knowledge.length && !opts?.startDate) return story;
  const next: ItineraryStory = { ...(story || {}) };
  const season = tripClimateSeason(opts?.startDate, opts?.endDate);
  const weatherBody = pickSeasonalKnowledgeBody(knowledge, 'weather', season);
  const packing = knowledge.filter((k) => k.kind === 'packing');
  const tips = knowledge.filter((k) => k.kind === 'tip');

  if (
    !next.bestTime?.trim() ||
    looksLikeIdealSeasonRange(next.bestTime)
  ) {
    if (opts?.startDate) {
      next.bestTime = tripWindowHeadline(
        opts.startDate,
        opts.endDate,
        opts.placeName || null,
      );
    }
  }

  if (!next.weatherNote?.trim() && weatherBody) {
    next.weatherNote = weatherBody;
  }
  if ((!next.packingTips || next.packingTips.length === 0) && packing.length) {
    next.packingTips = packing.map((p) => (p.title ? `${p.title}: ${p.body}` : p.body));
  }
  if ((!next.highlights || next.highlights.length === 0) && tips.length) {
    next.highlights = tips.slice(0, 3).map((t) => t.body);
  }
  return next;
}

export function computePackageSummary(
  days: ReturnType<typeof customerItineraryDays>,
  quote: CustomerQuotePayload | null,
  story: ItineraryStory | null,
  opts?: { edges?: PlaceEdgeLeg[] },
): PackageSummary {
  const destinations: string[] = [];
  for (const day of days) {
    if (day.destination && !destinations.includes(day.destination)) {
      destinations.push(day.destination);
    }
  }

  let hotelNights = 0;
  let hotelCount = 0;
  let activityCount = 0;
  let transportLabel: string | null = null;
  let vehicleSeats: number | null = null;
  let vehicleIncludes: string[] = [];
  const mealLabels = new Set<string>();
  let pickup: string | null = null;
  let drop: string | null = null;

  for (const day of days) {
    for (const item of day.items) {
      const details = item.details || {};
      if (item.type === 'hotel') {
        hotelCount += 1;
        const n = Number(details.nights);
        if (Number.isFinite(n) && n > 0) hotelNights += n;
        else hotelNights += 1;
      }
      if (item.type === 'sightseeing' || item.type === 'activity') activityCount += 1;
      if (item.type === 'transfer') {
        if (!transportLabel) {
          const vehicle = typeof details.vehicle === 'string' ? details.vehicle.trim() : '';
          transportLabel = vehicle || 'Private transfer';
          const seats = Number(details.seats);
          if (Number.isFinite(seats) && seats > 0) vehicleSeats = seats;
          vehicleIncludes = strList(details.includes);
        }
        const fromDetail = typeof details.from === 'string' ? details.from.trim() : '';
        const toDetail = typeof details.to === 'string' ? details.to.trim() : '';
        const arrow = parseArrowTitle(item.title);
        const from = fromDetail || arrow?.from || '';
        const to = toDetail || arrow?.to || '';
        if (from && !pickup) pickup = from;
        if (to) drop = to;
      }
      if (item.type === 'meal') {
        const t = item.title.toLowerCase();
        if (t.includes('breakfast')) mealLabels.add('Breakfast');
        else if (t.includes('lunch')) mealLabels.add('Lunch');
        else if (t.includes('dinner')) mealLabels.add('Dinner');
        else mealLabels.add(item.title);
      }
      if (item.type === 'flight') {
        const from = typeof details.from === 'string' ? details.from.trim() : '';
        const to = typeof details.to === 'string' ? details.to.trim() : '';
        if (from && !pickup) pickup = from;
        if (to) drop = to;
      }
    }
  }

  const dayCount = Math.max(days.length, 1);
  const nights = hotelNights > 0 ? hotelNights : Math.max(dayCount - 1, 0);

  // Round-trip default: return to pickup when we know an origin but not a distinct terminus
  const routePickup = pickup;
  const routeDrop = pickup || drop || null;

  return {
    days: dayCount,
    nights,
    destinations,
    transportLabel,
    mealLabels: [...mealLabels],
    hotelCount,
    activityCount,
    pickup: routePickup,
    drop: routeDrop,
    sellTotal: quote ? quote.sellTotal : null,
    currency: quote ? quote.currency : null,
    bestTime: story?.bestTime || null,
    routeStops: buildRouteStops(days, routePickup, routeDrop, opts?.edges),
    vehicleSeats,
    vehicleIncludes,
  };
}

export function parseOrgBranding(
  brandingJson: unknown,
  orgName: string,
): OrgBrandingPayload {
  const b = asRecord(brandingJson);
  return {
    companyName:
      (typeof b.companyName === 'string' && b.companyName.trim()) || orgName,
    tagline: typeof b.tagline === 'string' && b.tagline.trim() ? b.tagline.trim() : null,
    primaryColor:
      (typeof b.primaryColor === 'string' && b.primaryColor.trim()) || '#0f6e56',
    logoUrl: typeof b.logoUrl === 'string' && b.logoUrl.trim() ? b.logoUrl.trim() : null,
    previewFooter:
      typeof b.previewFooter === 'string' && b.previewFooter.trim()
        ? b.previewFooter.trim()
        : null,
  };
}

export function parseBusinessContact(settingsJson: unknown): BusinessContactPayload {
  const settings = asRecord(settingsJson);
  const business = asRecord(settings.business);
  const phone =
    typeof business.phone === 'string' && business.phone.trim() ? business.phone.trim() : null;
  const emergency =
    typeof business.emergencyPhone === 'string' && business.emergencyPhone.trim()
      ? business.emergencyPhone.trim()
      : null;
  return {
    phone,
    supportEmail:
      typeof business.supportEmail === 'string' && business.supportEmail.trim()
        ? business.supportEmail.trim()
        : null,
    website:
      typeof business.website === 'string' && business.website.trim()
        ? business.website.trim()
        : null,
    legalName:
      typeof business.legalName === 'string' && business.legalName.trim()
        ? business.legalName.trim()
        : null,
    emergencyPhone: emergency || phone,
  };
}

export function parseOrgTrust(settingsJson: unknown): OrgTrustPayload {
  const settings = asRecord(settingsJson);
  const trust = asRecord(settings.trust);
  const licensed = trust.licensed === true;
  const yearsRaw = Number(trust.yearsExperience);
  const yearsExperience =
    Number.isFinite(yearsRaw) && yearsRaw > 0 ? Math.round(yearsRaw) : null;
  const travellerCountLabel =
    typeof trust.travellerCountLabel === 'string' && trust.travellerCountLabel.trim()
      ? trust.travellerCountLabel.trim()
      : null;
  const support247 = trust.support247 === true;
  const verifiedHotels = trust.verifiedHotels === true;
  const defaultCancellationNote =
    typeof trust.defaultCancellationNote === 'string' && trust.defaultCancellationNote.trim()
      ? trust.defaultCancellationNote.trim()
      : null;

  const chips: string[] = [];
  if (licensed) chips.push('Licensed agency');
  if (yearsExperience != null) chips.push(`${yearsExperience}+ years experience`);
  if (travellerCountLabel) chips.push(`${travellerCountLabel} happy travellers`);
  if (support247) chips.push('24×7 support');
  if (verifiedHotels) chips.push('Verified hotels');

  return {
    licensed,
    yearsExperience,
    travellerCountLabel,
    support247,
    verifiedHotels,
    defaultCancellationNote,
    chips,
  };
}

/** Prefer trip story cancellation, else org default. */
export function resolveCancellationNote(
  story: ItineraryStory | null | undefined,
  trust: OrgTrustPayload | null | undefined,
): string | null {
  if (story?.cancellationNote?.trim()) return story.cancellationNote.trim();
  if (trust?.defaultCancellationNote?.trim()) return trust.defaultCancellationNote.trim();
  return null;
}

/** Split free-text inclusions/exclusions into checklist lines. */
export function splitChecklist(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n|•|▪|✔|✓|✖|✗|;/)
    .map((s) => s.replace(/^[-–—*]\s*/, '').trim())
    .filter(Boolean);
}

export type OrgDisplayPrefs = {
  dateFormat: 'd_mmm_yyyy' | 'dd_mm_yyyy' | 'mm_dd_yyyy' | 'yyyy_mm_dd';
  timeFormat: 'h12' | 'h24';
};

export function orgDisplayPrefs(settingsJson: unknown): OrgDisplayPrefs {
  const settings = asRecord(settingsJson);
  const display = asRecord(settings.display);
  const dateFormat =
    display.dateFormat === 'd_mmm_yyyy' ||
    display.dateFormat === 'dd_mm_yyyy' ||
    display.dateFormat === 'mm_dd_yyyy' ||
    display.dateFormat === 'yyyy_mm_dd'
      ? display.dateFormat
      : 'd_mmm_yyyy';
  const timeFormat =
    display.timeFormat === 'h12' || display.timeFormat === 'h24' ? display.timeFormat : 'h24';
  return { dateFormat, timeFormat };
}

const CUSTOMER_QUOTE_STATUSES = ['accepted', 'sent', 'approved'] as const;
const STAFF_QUOTE_STATUSES = [
  'accepted',
  'sent',
  'approved',
  'pending_approval',
  'draft',
] as const;

export function customerQuoteStatuses(allowDraft: boolean) {
  return allowDraft ? STAFF_QUOTE_STATUSES : CUSTOMER_QUOTE_STATUSES;
}

export type CustomerQuoteLine = {
  description: string;
  quantity: number;
  unitSell: number;
  taxPercent: number;
  amount: number;
};

export type CustomerQuotePayload = {
  quoteNumber: string;
  versionId: string;
  versionLabel: string | null;
  versionNumber: number;
  status: string;
  currency: string;
  validUntil: string | null;
  sellTotal: number;
  taxTotal: number;
  discountTotal: number;
  items: CustomerQuoteLine[];
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
};

export function presentCustomerQuote(version: {
  id: string;
  versionNumber: number;
  label: string | null;
  status: string;
  currency: string;
  validUntil: Date | null;
  sellTotal: unknown;
  taxTotal: unknown;
  discountTotal: unknown;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
  itemsJson: unknown;
  quotation: { quoteNumber: string };
}): CustomerQuotePayload {
  const itemsRaw = Array.isArray(version.itemsJson)
    ? (version.itemsJson as Array<Record<string, unknown>>)
    : [];
  const items: CustomerQuoteLine[] = itemsRaw.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitSell = Number(item.unitSell ?? 0);
    const taxPercent = Number(item.taxPercent ?? 0);
    const amount = quantity * unitSell * (1 + taxPercent / 100);
    return {
      description: String(item.description ?? 'Line'),
      quantity,
      unitSell,
      taxPercent,
      amount: Math.round(amount * 100) / 100,
    };
  });

  return {
    quoteNumber: version.quotation.quoteNumber,
    versionId: version.id,
    versionLabel: version.label,
    versionNumber: version.versionNumber,
    status: version.status,
    currency: version.currency,
    validUntil: version.validUntil ? version.validUntil.toISOString() : null,
    sellTotal: Number(version.sellTotal),
    taxTotal: Number(version.taxTotal),
    discountTotal: Number(version.discountTotal),
    items,
    inclusions: version.inclusions,
    exclusions: version.exclusions,
    terms: version.terms,
  };
}
