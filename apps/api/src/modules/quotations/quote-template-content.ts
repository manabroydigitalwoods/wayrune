import type { QuotationItem, QuoteTemplateContent } from '@wayrune/contracts';
import { QuotationItemSchema, QuoteTemplateContentSchema } from '@wayrune/contracts';

export function checklistToText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    const lines = value
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }
  return null;
}

export function parseQuoteTemplateContent(raw: unknown): QuoteTemplateContent {
  const parsed = QuoteTemplateContentSchema.safeParse(raw ?? {});
  if (!parsed.success) return {};
  const { tags: rawTags, folder: rawFolder, ...rest } = parsed.data;
  const tags = normalizeTemplateTags(rawTags);
  const folder = normalizeTemplateFolder(rawFolder);
  return {
    ...rest,
    ...(tags ? { tags } : {}),
    ...(folder ? { folder } : {}),
  };
}

const TEMPLATE_FOLDER_MAX_LEN = 80;

/** Trim segments, collapse `//`, join with `/`, cap length (slash-path ok). */
export function normalizeTemplateFolder(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'string') return undefined;
  const segments = raw
    .split('/')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (!segments.length) return undefined;
  let out = '';
  for (const seg of segments) {
    const next = out ? `${out}/${seg}` : seg;
    if (next.length > TEMPLATE_FOLDER_MAX_LEN) break;
    out = next;
  }
  return out || undefined;
}

/** Trim / dedupe (case-insensitive) / cap template organize tags. */
export function normalizeTemplateTags(raw: unknown): string[] | undefined {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.filter((x): x is string => typeof x === 'string');
  } else if (typeof raw === 'string') {
    list = raw.split(/[,;]+/);
  } else {
    return undefined;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const cleaned = t.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

/** Fresh line ids so template copies do not collide with live quote lines. */
export function remintQuoteItems(items: QuotationItem[], prefix = 'tpl'): QuotationItem[] {
  const stamp = Date.now();
  return items.map((item, i) => {
    const next = {
      ...item,
      id: `${prefix}-${stamp}-${i}`,
      description: item.description,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitSell: item.unitSell,
      taxPercent: item.taxPercent,
      pricingUnit: item.pricingUnit,
    };
    return QuotationItemSchema.parse(next);
  });
}

const PAX_LINE_KINDS = new Set(['hotel', 'transfer', 'activity']);

/** Normalize apply child ages to exactly `children` entries (pad with defaultAge). */
export function normalizeApplyChildAges(
  children: number,
  childAges?: number[] | null,
  defaultAge = 8,
): number[] | undefined {
  const kids = Math.max(0, Math.round(Number(children) || 0));
  if (kids <= 0) return undefined;
  const cleaned = (childAges || [])
    .map((a) => Math.round(Number(a)))
    .filter((a) => Number.isFinite(a) && a >= 0 && a <= 17)
    .slice(0, kids);
  while (cleaned.length < kids) cleaned.push(defaultAge);
  return cleaned;
}

/**
 * When apply sends adults and/or children, resolve a stamp party.
 * Omitted both → null (keep template line pax).
 */
export function resolveApplyPax(input: {
  adults?: number | null;
  children?: number | null;
  childAges?: number[] | null;
  childrenWithoutBed?: number | null;
}): {
  adults: number;
  children: number;
  childAges?: number[];
  childrenWithoutBed?: number;
} | null {
  if (input.adults == null && input.children == null) return null;
  const adults = Math.max(1, Math.round(Number(input.adults) || 2));
  const children = Math.max(0, Math.round(Number(input.children) || 0));
  const childAges = normalizeApplyChildAges(children, input.childAges);
  let childrenWithoutBed: number | undefined;
  if (children > 0 && input.childrenWithoutBed != null) {
    const n = Math.round(Number(input.childrenWithoutBed));
    if (Number.isFinite(n) && n > 0) {
      childrenWithoutBed = Math.min(n, children);
    }
  }
  return {
    adults,
    children,
    ...(childAges ? { childAges } : {}),
    ...(childrenWithoutBed != null ? { childrenWithoutBed } : {}),
  };
}

/** Stamp adults/children (+ ages / without-bed) onto hotel / transfer / activity lines. */
export function stampApplyPaxOntoQuoteItems(
  items: QuotationItem[],
  pax: {
    adults: number;
    children: number;
    childAges?: number[];
    childrenWithoutBed?: number;
  },
): { items: QuotationItem[]; stampedCount: number } {
  let stampedCount = 0;
  const next = items.map((item) => {
    const kind = item.rateKind || item.serviceType;
    if (!kind || !PAX_LINE_KINDS.has(kind)) return item;
    stampedCount += 1;
    const details: Record<string, unknown> = {
      ...(item.details || {}),
      adults: pax.adults,
      children: pax.children,
    };
    if (pax.children <= 0) {
      delete details.childAges;
      delete details.childrenWithoutBed;
    } else {
      details.childAges =
        pax.childAges ??
        normalizeApplyChildAges(
          pax.children,
          Array.isArray(details.childAges)
            ? (details.childAges as number[])
            : undefined,
        );
      if (pax.childrenWithoutBed != null) {
        details.childrenWithoutBed = pax.childrenWithoutBed;
      } else {
        delete details.childrenWithoutBed;
      }
    }
    return QuotationItemSchema.parse({ ...item, details });
  });
  return { items: next, stampedCount };
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** YYYY-MM-DD from an ISO date string or Date; ignores clock times / non-ISO labels. */
export function parseIsoDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const m = value.trim().match(ISO_DAY_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function utcDayMs(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysIso(isoDay: string, deltaDays: number): string {
  const dt = new Date(utcDayMs(isoDay));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function isoDayDiff(fromIsoDay: string, toIsoDay: string): number {
  return Math.round((utcDayMs(toIsoDay) - utcDayMs(fromIsoDay)) / 86_400_000);
}

/**
 * Resolve travel start for template apply.
 * Requested date wins (and should stamp trip when different/missing).
 * Falls back to existing trip start; errors when neither is set.
 */
export function resolveTemplateApplyTravelStart(opts: {
  tripStartDate: Date | string | null | undefined;
  requestedStartDate?: string | null;
}): { isoDay: string; shouldStampTrip: boolean } {
  const requested = parseIsoDay(opts.requestedStartDate ?? null);
  const existing = parseIsoDay(opts.tripStartDate);
  if (requested) {
    return {
      isoDay: requested,
      shouldStampTrip: !existing || existing !== requested,
    };
  }
  if (existing) {
    return { isoDay: existing, shouldStampTrip: false };
  }
  throw new Error('Travel start date is required to apply a template');
}

const SHIFT_DATE_KEYS = ['checkIn', 'checkOut', 'serviceDate', 'activityDate'] as const;

/** Earliest stay/service day across template lines (rate validity windows ignored). */
export function templateItemsAnchorDay(items: QuotationItem[]): string | null {
  let earliest: string | null = null;
  for (const item of items) {
    const details = item.details;
    if (!details) continue;
    for (const key of SHIFT_DATE_KEYS) {
      if (key === 'checkOut') continue;
      const day = parseIsoDay(details[key]);
      if (day && (!earliest || day < earliest)) earliest = day;
    }
  }
  return earliest;
}

function clearRateMatchFields(item: QuotationItem): QuotationItem {
  const next = { ...item };
  delete next.rateId;
  delete next.rateProvenance;
  delete next.rateUnmatched;
  delete next.rateBlockReason;
  // Force rematch — never ship template-stale buy/sell after apply.
  next.unitCost = null;
  next.unitSell = null;
  return QuotationItemSchema.parse(next);
}

/**
 * Remap frozen template stay/service dates onto the trip start window and clear
 * rate snapshots so the client can rematch against live charts.
 */
export function shiftQuoteItemsToTripStart(
  items: QuotationItem[],
  tripStartDate: string | Date | null | undefined,
): { items: QuotationItem[]; shiftDays: number; anchorDay: string | null } {
  const tripDay = parseIsoDay(tripStartDate);
  if (!tripDay) {
    return {
      items: items.map(clearRateMatchFields),
      shiftDays: 0,
      anchorDay: null,
    };
  }
  const anchorDay = templateItemsAnchorDay(items);
  if (!anchorDay) {
    return {
      items: items.map(clearRateMatchFields),
      shiftDays: 0,
      anchorDay: null,
    };
  }
  const shiftDays = isoDayDiff(anchorDay, tripDay);
  if (shiftDays === 0) {
    return {
      items: items.map(clearRateMatchFields),
      shiftDays: 0,
      anchorDay,
    };
  }

  const next = items.map((item) => {
    const details = item.details;
    if (!details) return clearRateMatchFields(item);
    const shifted = { ...details };
    for (const key of SHIFT_DATE_KEYS) {
      const day = parseIsoDay(details[key]);
      if (day) shifted[key] = addDaysIso(day, shiftDays);
    }
    return clearRateMatchFields({ ...item, details: shifted });
  });
  return { items: next, shiftDays, anchorDay };
}

export type ItineraryDayLike = {
  dayNumber?: number;
  date?: string | null;
};

/**
 * Stamp each story day to trip start + (dayNumber − 1).
 * Empty days / missing trip start → no-op.
 */
export function reanchorItineraryDaysToTripStart<T extends ItineraryDayLike>(
  days: T[],
  tripStartDate: string | Date | null | undefined,
): { days: T[]; changed: boolean } {
  const tripDay = parseIsoDay(tripStartDate);
  if (!tripDay || !days.length) {
    return { days, changed: false };
  }
  let changed = false;
  const next = days.map((day, index) => {
    const dayNumber =
      typeof day.dayNumber === 'number' && day.dayNumber >= 1
        ? Math.floor(day.dayNumber)
        : index + 1;
    const date = addDaysIso(tripDay, dayNumber - 1);
    if (parseIsoDay(day.date) === date) return day;
    changed = true;
    return { ...day, date };
  });
  return { days: next, changed };
}

export function contentFromVersionFields(input: {
  currency: string;
  itemsJson: unknown;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
  destinationHint?: string | null;
  tags?: string[] | null;
  folder?: string | null;
  itinerary?: QuoteTemplateContent['itinerary'];
}): QuoteTemplateContent {
  const itemsRaw = Array.isArray(input.itemsJson) ? input.itemsJson : [];
  const items: QuotationItem[] = [];
  for (const row of itemsRaw) {
    const parsed = QuotationItemSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
  }
  const tags = normalizeTemplateTags(input.tags);
  const folder = normalizeTemplateFolder(input.folder);
  return {
    currency: input.currency || 'INR',
    items,
    inclusions: input.inclusions ?? undefined,
    exclusions: input.exclusions ?? undefined,
    terms: input.terms,
    destinationHint: input.destinationHint ?? undefined,
    ...(tags ? { tags } : {}),
    ...(folder ? { folder } : {}),
    ...(input.itinerary ? { itinerary: input.itinerary } : {}),
  };
}

/** Soft-read template itinerary days (record-shaped rows only). */
export function templateItineraryDays(
  itinerary: QuoteTemplateContent['itinerary'] | undefined,
): Array<Record<string, unknown>> {
  if (!itinerary?.days?.length) return [];
  return itinerary.days.filter(
    (d): d is Record<string, unknown> =>
      !!d && typeof d === 'object' && !Array.isArray(d),
  );
}

/** Fresh day/item ids so seeded story days do not collide with live itinerary rows. */
export function remintTemplateItineraryDays(
  days: Array<Record<string, unknown>>,
  prefix = 'tpl-day',
): Array<Record<string, unknown>> {
  const stamp = Date.now();
  return days.map((day, i) => {
    const rawItems = Array.isArray(day.items) ? day.items : [];
    const items = rawItems.map((item, j) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return {
        ...(item as Record<string, unknown>),
        id: `${prefix}-item-${stamp}-${i}-${j}`,
      };
    });
    return {
      ...day,
      id: `${prefix}-${stamp}-${i}`,
      items,
    };
  });
}

type HotelStaySpan = {
  checkIn: string;
  checkOut: string;
  title: string;
  propertyName?: string;
};

function hotelStayFromItem(item: QuotationItem): HotelStaySpan | null {
  if (item.serviceType !== 'hotel') return null;
  const details = item.details;
  if (!details) return null;
  const checkIn = parseIsoDay(details.checkIn);
  if (!checkIn) return null;
  let checkOut = parseIsoDay(details.checkOut);
  if (!checkOut) {
    const nights =
      typeof details.nights === 'number' && Number.isFinite(details.nights)
        ? Math.max(1, Math.floor(details.nights))
        : null;
    if (!nights) return null;
    checkOut = addDaysIso(checkIn, nights);
  }
  if (checkOut <= checkIn) return null;
  const propertyName =
    typeof details.propertyName === 'string' && details.propertyName.trim()
      ? details.propertyName.trim()
      : undefined;
  const title =
    propertyName ||
    (typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : 'Hotel stay');
  return { checkIn, checkOut, title, propertyName };
}

/**
 * Scaffold story days from priced hotel lines when the trip Story is empty
 * and the template has no embedded itinerary.
 * Span = earliest check-in → latest check-out (inclusive departure day); cap 30 days.
 */
export function buildItineraryDaysFromHotelItems(
  items: QuotationItem[],
  opts?: { maxDays?: number; idPrefix?: string },
): Array<Record<string, unknown>> {
  const stays = items
    .map(hotelStayFromItem)
    .filter((s): s is HotelStaySpan => !!s)
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
  if (!stays.length) return [];

  let earliest = stays[0].checkIn;
  let latestOut = stays[0].checkOut;
  for (const stay of stays) {
    if (stay.checkIn < earliest) earliest = stay.checkIn;
    if (stay.checkOut > latestOut) latestOut = stay.checkOut;
  }

  const maxDays = Math.max(1, Math.min(30, opts?.maxDays ?? 30));
  const spanDays = isoDayDiff(earliest, latestOut) + 1;
  const dayCount = Math.min(maxDays, Math.max(1, spanDays));
  const stamp = Date.now();
  const prefix = opts?.idPrefix ?? 'hotel-day';

  const checkInsByDay = new Map<string, HotelStaySpan[]>();
  for (const stay of stays) {
    const list = checkInsByDay.get(stay.checkIn) ?? [];
    list.push(stay);
    checkInsByDay.set(stay.checkIn, list);
  }

  const days: Array<Record<string, unknown>> = [];
  for (let i = 0; i < dayCount; i++) {
    const date = addDaysIso(earliest, i);
    const checkIns = checkInsByDay.get(date) ?? [];
    const primary = checkIns[0];
    const isLast = i === dayCount - 1 && date === latestOut;
    let title: string;
    if (primary) {
      title = i === 0 ? `Arrive · ${primary.title}` : `Stay · ${primary.title}`;
    } else if (isLast) {
      title = 'Departure';
    } else {
      title = `Day ${i + 1}`;
    }
    const dayItems = checkIns.map((stay, j) => ({
      id: `${prefix}-item-${stamp}-${i}-${j}`,
      type: 'hotel',
      title: stay.propertyName ? `Check-in · ${stay.propertyName}` : 'Check-in',
      description: stay.title,
      customerVisible: true,
      details: {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        ...(stay.propertyName ? { propertyName: stay.propertyName } : {}),
      },
    }));
    days.push({
      id: `${prefix}-${stamp}-${i}`,
      dayNumber: i + 1,
      title,
      date,
      items: dayItems,
    });
  }
  return days;
}
