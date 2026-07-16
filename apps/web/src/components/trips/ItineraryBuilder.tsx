import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GripVertical,
  LayoutTemplate,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityCombobox,
  FormGrid,
  humanizeItemType,
  Input,
  RecordDialog,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  TimePicker,
  toastError,
  toastSuccess,
  formatDayLabel,
  formatTime,
  formatTimeRange as formatClockRange,
  type ComboboxOption,
} from '@travel/ui';
import {
  CreatePlaceSchema,
  CreateRoomTypeSchema,
  CreateSupplierSchema,
  CreateVehicleTypeSchema,
  parseWithFieldErrors,
} from '@travel/contracts';
import { api, apiUpload } from '../../api';
import {
  CatalogLandmarkPicker,
  loadPlace,
  PlaceMultiPicker,
  PlaceSinglePicker,
  type PlaceApiItem,
} from '../places/PlacePicker';
import {
  snapshotFromPlaceProfile,
  snapshotRefreshFields,
} from '../../lib/placeSnapshot';
import {
  placeName,
  samePlace,
  toPlaceRef,
  type PlaceRef,
} from '../../lib/placeRefs';
import {
  seedStoryFromDays,
  storyEssentialsScore,
  storyHasContent,
} from '../../lib/proposalStory';

export type ItineraryItemDetails = {
  nights?: number;
  roomType?: string;
  stars?: number;
  amenities?: string[];
  checkIn?: string;
  checkOut?: string;
  flightNumber?: string;
  from?: string;
  to?: string;
  fromPlaceId?: string;
  toPlaceId?: string;
  vehicle?: string;
  seats?: number;
  /** Catalog VehicleType id when picked from the agency/system catalog. */
  vehicleTypeId?: string;
  /** Shown on the proposal route timeline (e.g. "3h 20m"). */
  driveDuration?: string;
  /** Driving distance in km (from PlaceEdge / Google). */
  distanceKm?: number;
  includes?: string[];
  /** Customer-facing photo for hotel or sightseeing cards. */
  imageUrl?: string;
  /** Additional gallery photos (interactive proposal). */
  imageUrls?: string[];
  /** Google / public review score (e.g. 4.5). */
  googleRating?: number;
  /** Approximate Google review count for social proof. */
  googleReviewCount?: number;
  /** e.g. "500m from Mall Road". */
  distanceHint?: string;
  /** Google Maps link for the place. */
  googleMapsUrl?: string;
  /** Short agency-entered guest / place review quote. */
  reviewSnippet?: string;
  /** Tip for when to visit (sightseeing). */
  bestVisitTime?: string;
  openingHours?: string;
  durationMin?: number;
  entryFee?: string;
  suitabilityTags?: string[];
  /** Linked destination-guide catalog place for snapshot refresh. */
  catalogPlaceId?: string;
  /** Supplier linked to this item (operations). */
  supplierId?: string;
  /** Stay supplier type when linked (hotel / homestay / farmstay). */
  supplierType?: string;
  /** How catalog fields were populated (e.g. destination_guide). */
  catalogProvenance?: string;
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
  paymentSchedule?: Array<{ label: string; percent?: number; amountHint?: string }>;
};

export type ItineraryItem = {
  id: string;
  type: string;
  title: string;
  /** Short customer-facing experience blurb (proposal story). */
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: PlaceRef | string | null;
  notes?: string | null;
  internalNotes?: string | null;
  customerVisible?: boolean;
  details?: ItineraryItemDetails;
};

export type ItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  date?: string | null;
  /** Primary place for this day (multi-stop trips). */
  destination?: PlaceRef | string | null;
  items: ItineraryItem[];
};

/** Create UI types — Flight / Free time / Note stay in schema for legacy data. */
const ITEM_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'meal', label: 'Meal' },
];

/** Which time inputs to show for each itinerary item type. */
type TimeFieldMode = 'none' | 'single' | 'range';

const TIME_FIELDS_BY_TYPE: Record<
  string,
  { mode: TimeFieldMode; startLabel: string; endLabel?: string }
> = {
  hotel: { mode: 'single', startLabel: 'Time' },
  meal: { mode: 'single', startLabel: 'Time' },
  note: { mode: 'none', startLabel: 'Time' },
  sightseeing: { mode: 'range', startLabel: 'Start time', endLabel: 'End time' },
  activity: { mode: 'range', startLabel: 'Start time', endLabel: 'End time' }, // legacy
  free_time: { mode: 'range', startLabel: 'Start time', endLabel: 'End time' },
  transfer: { mode: 'range', startLabel: 'Pickup', endLabel: 'Drop-off' },
  flight: { mode: 'range', startLabel: 'Departure', endLabel: 'Arrival' },
};

function timeFieldsForType(type: string) {
  return TIME_FIELDS_BY_TYPE[type] || { mode: 'single' as const, startLabel: 'Time' };
}

function mealLabelForTime(start?: string | null): string {
  if (!start?.trim()) return 'Meal';
  const hour = Number(start.trim().slice(0, 2));
  if (!Number.isFinite(hour)) return 'Meal';
  if (hour < 11) return 'Breakfast';
  if (hour < 15) return 'Lunch';
  if (hour < 17) return 'Snacks';
  return 'Dinner';
}

const MEAL_KIND_OPTIONS = [
  { value: 'Breakfast', label: 'Breakfast', startTime: '08:00' },
  { value: 'Lunch', label: 'Lunch', startTime: '13:00' },
  { value: 'Snacks', label: 'Snacks', startTime: '16:00' },
  { value: 'Dinner', label: 'Dinner', startTime: '20:00' },
] as const;

type StayKind = 'hotel' | 'homestay' | 'farmstay';

type MealContext = {
  stayKind?: StayKind | null;
  stayName?: string | null;
  priorType?: string | null;
};

function resolveStayKind(item: ItineraryItem): StayKind | null {
  if (item.type !== 'hotel') return null;
  const stored = item.details?.supplierType?.toLowerCase();
  if (stored === 'hotel' || stored === 'homestay' || stored === 'farmstay') {
    return stored;
  }
  const title = (item.title || '').toLowerCase();
  if (/\bhomestay\b|home[\s-]?stay/.test(title)) return 'homestay';
  if (/\bfarmstay\b|farm[\s-]?stay/.test(title)) return 'farmstay';
  return 'hotel';
}

/** Day + insert position → cues for emotional meal titles. */
function mealContextFromDay(
  day?: ItineraryDay | null,
  itemId?: string | null,
): MealContext {
  const items = day?.items || [];
  const stayItem = items.find((i) => i.type === 'hotel');
  let prior: ItineraryItem | undefined;
  if (itemId) {
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx > 0) prior = items[idx - 1];
  } else if (items.length) {
    prior = items[items.length - 1];
  }
  const priorType = prior?.type === 'activity' ? 'sightseeing' : prior?.type || null;
  return {
    stayKind: stayItem ? resolveStayKind(stayItem) : null,
    stayName: stayItem?.title?.trim() || null,
    priorType,
  };
}

function shortStayLabel(name?: string | null): string | null {
  const n = name?.trim();
  if (!n) return null;
  if (n.length > 28) return null;
  if (/^(check-?in|check-?out|hotel stay|hotel)$/i.test(n)) return null;
  return n;
}

/** Contextual meal titles — stay, timing, and what came before on the day. */
function suggestMealTitle(opts: {
  startTime?: string | null;
  mealContext?: MealContext | null;
}): string {
  const kindRaw = mealLabelForTime(opts.startTime);
  // No time yet — default to a midday meal for a natural first title.
  const kind = kindRaw === 'Meal' ? 'Lunch' : kindRaw;
  const stay = opts.mealContext?.stayKind || null;
  const prior = opts.mealContext?.priorType || null;
  const stayLabel = shortStayLabel(opts.mealContext?.stayName);

  if (kind === 'Breakfast') {
    if (stay === 'homestay') return 'Home-style breakfast';
    if (stay === 'farmstay') return 'Farm-fresh breakfast';
    if (stayLabel) return `Breakfast at ${stayLabel}`;
    if (stay === 'hotel') return 'Breakfast at the hotel';
    if (prior === 'transfer' || prior === 'flight') return 'Welcome breakfast';
    return 'Leisurely breakfast';
  }
  if (kind === 'Lunch') {
    if (prior === 'sightseeing') return 'Lunch after sightseeing';
    if (stay === 'homestay') return 'Home-style lunch';
    if (stay === 'farmstay') return 'Farmhouse lunch';
    if (prior === 'transfer' || prior === 'flight') return 'Lunch en route';
    return 'Local lunch';
  }
  if (kind === 'Snacks') {
    if (prior === 'sightseeing') return 'Tea & snacks after sightseeing';
    if (stay === 'homestay' || stay === 'farmstay') return 'Evening chai at home';
    return 'Tea-time snacks';
  }
  if (kind === 'Dinner') {
    if (stay === 'homestay') return 'Home-cooked dinner';
    if (stay === 'farmstay') return 'Farmhouse dinner';
    if (stayLabel) return `Dinner at ${stayLabel}`;
    if (stay === 'hotel') return 'Dinner at the hotel';
    if (prior === 'sightseeing') return 'Dinner after a full day';
    return 'Leisurely dinner';
  }
  return 'Meal';
}

function isAutoMealTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/^(Breakfast|Lunch|Snacks|Dinner|Evening snack) in /.test(t)) return true;
  return (
    /^(Breakfast|Dinner) at /.test(t) ||
    /^Home-style (breakfast|lunch)$/.test(t) ||
    /^Farm-fresh breakfast$/.test(t) ||
    /^Farmhouse (lunch|dinner)$/.test(t) ||
    /^Home-cooked dinner$/.test(t) ||
    /^Welcome breakfast$/.test(t) ||
    /^Leisurely (breakfast|dinner)$/.test(t) ||
    /^Lunch after sightseeing$/.test(t) ||
    /^Lunch en route$/.test(t) ||
    /^Local lunch$/.test(t) ||
    /^Tea & snacks after sightseeing$/.test(t) ||
    /^Evening chai at home$/.test(t) ||
    /^Tea-time snacks$/.test(t) ||
    /^Dinner after a full day$/.test(t)
  );
}

function formatDriveDuration(durationMin: number): string {
  const mins = Math.max(0, Math.round(durationMin));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse "1h 15m", "75m", "1.5h", "1:15" into minutes. */
function parseDriveDurationMinutes(raw?: string | null): number | null {
  if (!raw?.trim()) return null;
  const text = raw.trim().toLowerCase().replace(/,/g, ' ');
  const colon = /^(\d+)\s*:\s*(\d{1,2})$/.exec(text);
  if (colon) {
    const h = Number(colon[1]);
    const m = Number(colon[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m < 60) return h * 60 + m;
  }
  const hoursMatch = /(\d+(?:\.\d+)?)\s*h/.exec(text);
  const minsMatch = /(\d+)\s*m/.exec(text);
  if (hoursMatch || minsMatch) {
    const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
    const mins = minsMatch ? Number(minsMatch[1]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    return Math.round(hours * 60 + mins);
  }
  const plain = Number(text);
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain);
  return null;
}

/** Add minutes to HH:mm (24h). Returns null if start is invalid. */
function addMinutesToHhmm(start?: string | null, addMin?: number | null): string | null {
  if (!start?.trim() || addMin == null || !Number.isFinite(addMin) || addMin < 0) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const total = (hour * 60 + minute + Math.round(addMin)) % (24 * 60);
  const normalized = total < 0 ? total + 24 * 60 : total;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** For transfers: derive drop-off from pickup + drive duration when both exist. */
function withTransferDropOff(draft: ItineraryItem): ItineraryItem {
  if (draft.type !== 'transfer') return draft;
  const mins = parseDriveDurationMinutes(draft.details?.driveDuration);
  const endTime = addMinutesToHhmm(draft.startTime, mins);
  if (!endTime) return draft;
  if (draft.endTime === endTime) return draft;
  return { ...draft, endTime };
}

/** Assemble a customer-facing title from type + concrete context (no AI / random chips). */
function suggestItemTitle(opts: {
  type: string;
  place?: string | null;
  from?: string | null;
  to?: string | null;
  startTime?: string | null;
  landmark?: string | null;
  hotelName?: string | null;
  mealContext?: MealContext | null;
}): string {
  const place = opts.place?.trim() || null;
  const from = opts.from?.trim() || null;
  const to = opts.to?.trim() || null;
  const landmark = opts.landmark?.trim() || null;
  const hotelName = opts.hotelName?.trim() || null;
  const type = opts.type === 'activity' ? 'sightseeing' : opts.type;

  switch (type) {
    case 'hotel':
      if (hotelName) return hotelName;
      return place ? `Stay in ${place}` : 'Hotel stay';
    case 'sightseeing':
      if (landmark) return landmark;
      return place ? `Sightseeing in ${place}` : 'Sightseeing';
    case 'transfer':
      if (from && to && from !== to) return `${from} → ${to}`;
      if (to) return `Transfer to ${to}`;
      if (from) return `Transfer from ${from}`;
      return 'Private transfer';
    case 'flight':
      if (from && to && from !== to) return `${from} → ${to}`;
      if (to) return `Flight to ${to}`;
      return place ? `Flight · ${place}` : 'Flight';
    case 'meal':
      return suggestMealTitle({
        startTime: opts.startTime,
        mealContext: opts.mealContext,
      });
    case 'free_time':
      return place ? `At leisure · ${place}` : 'At leisure';
    case 'note':
      return 'Traveller tip';
    default:
      return humanizeItemType(opts.type);
  }
}

/** True when title is empty or still a generic / previously auto-generated label. */
function isReplaceableTitle(
  title: string | null | undefined,
  type: string,
  context?: {
    place?: string | null;
    from?: string | null;
    to?: string | null;
    startTime?: string | null;
    landmark?: string | null;
    hotelName?: string | null;
    mealContext?: MealContext | null;
  },
): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  const normalizedType = type === 'activity' ? 'sightseeing' : type;
  if (t === humanizeItemType(type) || t === humanizeItemType(normalizedType)) return true;
  const generics = new Set([
    'Activity',
    'Sightseeing',
    'Hotel',
    'Transfer',
    'Meal',
    'Flight',
    'Free time',
    'Note',
    'Hotel check-in',
    'Hotel stay',
    'Private transfer',
    'At leisure',
    'Traveller tip',
    'Breakfast',
    'Lunch',
    'Dinner',
    'Snacks',
    'Evening snack',
    'Check-in',
    'Check-out',
    'City tour',
    'Guided tour',
  ]);
  if (generics.has(t)) return true;
  // Template leftovers from older builder versions.
  if (/^(Check-in|Hotel stay|Explore|Private transfer|Airport transfer) · /.test(t)) return true;
  if (/^(Arrive|Sightseeing in|Stay in) /.test(t)) return true;
  if (normalizedType === 'meal' && isAutoMealTitle(t)) return true;
  if (t === suggestItemTitle({ type: normalizedType, ...context })) return true;
  if (t === suggestItemTitle({ type: normalizedType })) return true;
  if (context?.place && t === suggestItemTitle({ type: normalizedType, place: context.place })) {
    return true;
  }
  return false;
}

/** Refresh auto title when context changes; never clobber a custom title. */
function retitleIfNeeded(
  prev: ItineraryItem,
  next: ItineraryItem,
  mealContext?: MealContext | null,
): ItineraryItem {
  const hotelName =
    next.type === 'hotel' && next.details?.supplierId
      ? next.title
      : undefined;
  const landmark =
    (next.type === 'sightseeing' || next.type === 'activity') && next.details?.catalogPlaceId
      ? next.title
      : undefined;
  const prevCtx = {
    place: placeName(prev.location),
    from: prev.details?.from,
    to: prev.details?.to,
    startTime: prev.startTime,
    mealContext: prev.type === 'meal' ? mealContext : undefined,
  };
  if (
    !isReplaceableTitle(prev.title, prev.type, prevCtx) &&
    !isReplaceableTitle(prev.title, next.type, prevCtx)
  ) {
    return next;
  }
  return {
    ...next,
    title: suggestItemTitle({
      type: next.type,
      place: placeName(next.location),
      from: next.details?.from,
      to: next.details?.to,
      startTime: next.startTime,
      landmark,
      hotelName,
      mealContext: next.type === 'meal' ? mealContext : undefined,
    }),
  };
}

function emptyItem(type = 'sightseeing'): ItineraryItem {
  return {
    id: `i${Date.now()}`,
    type: type === 'activity' ? 'sightseeing' : type,
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    location: '',
    notes: '',
    internalNotes: '',
    customerVisible: true,
    details: {},
  };
}

function addDaysIso(startIso: string, offsetDays: number): string {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatDayDate(iso?: string | null): string | null {
  return formatDayLabel(iso);
}

function formatTimeRange(
  start?: string | null,
  end?: string | null,
  type?: string,
): string | null {
  if (!start && !end) return null;
  const mode = timeFieldsForType(type || '').mode;
  if (mode === 'none') return null;
  if (mode === 'single' || !end || end === start) return start ? formatTime(start) : end ? formatTime(end) : null;
  return formatClockRange(start, end);
}

type ItineraryBlockRow = {
  id: string;
  name: string;
  itemType: string;
  contentJson?: { days?: ItineraryDay[] };
};

type BuildItineraryMode = 'one-per-city' | 'stay-nights';

function nightsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start.slice(0, 10) + 'T12:00:00Z');
  const b = new Date(end.slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const nights = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : null;
}

function defaultDayCount(tripStartDate?: string | null, tripEndDate?: string | null): number {
  const nights = nightsBetween(tripStartDate, tripEndDate);
  if (nights != null) return nights + 1;
  return 4;
}

/** Shared media / catalog fields keep when changing item type. */
const SHARED_DETAIL_KEYS: Array<keyof ItineraryItemDetails> = [
  'imageUrl',
  'imageUrls',
  'googleRating',
  'googleReviewCount',
  'distanceHint',
  'googleMapsUrl',
  'reviewSnippet',
  'bestVisitTime',
  'openingHours',
  'durationMin',
  'entryFee',
  'suitabilityTags',
  'catalogPlaceId',
  'catalogProvenance',
  'supplierId',
];

function mapDetailsForTypeChange(
  fromType: string,
  toType: string,
  details: ItineraryItemDetails | undefined,
): ItineraryItemDetails {
  const src = details || {};
  const next: ItineraryItemDetails = {};
  for (const key of SHARED_DETAIL_KEYS) {
    if (src[key] !== undefined) (next as Record<string, unknown>)[key] = src[key];
  }
  if (toType === 'hotel' || fromType === 'hotel') {
    if (toType === 'hotel') {
      if (src.nights != null) next.nights = src.nights;
      if (src.roomType) next.roomType = src.roomType;
      if (src.stars != null) next.stars = src.stars;
      if (src.amenities) next.amenities = src.amenities;
      if (src.checkIn) next.checkIn = src.checkIn;
      if (src.checkOut) next.checkOut = src.checkOut;
    }
  }
  if (toType === 'flight' && fromType === 'flight') {
    if (src.flightNumber) next.flightNumber = src.flightNumber;
    if (src.from) next.from = src.from;
    if (src.to) next.to = src.to;
  }
  if (toType === 'transfer' && (fromType === 'transfer' || fromType === 'flight')) {
    if (src.vehicle) next.vehicle = src.vehicle;
    if (src.seats != null) next.seats = src.seats;
    if (src.vehicleTypeId) next.vehicleTypeId = src.vehicleTypeId;
    if (src.driveDuration) next.driveDuration = src.driveDuration;
    if (src.distanceKm != null) next.distanceKm = src.distanceKm;
    if (src.from) next.from = src.from;
    if (src.to) next.to = src.to;
    if (src.fromPlaceId) next.fromPlaceId = src.fromPlaceId;
    if (src.toPlaceId) next.toPlaceId = src.toPlaceId;
  }
  if (
    toType === 'sightseeing' ||
    toType === 'activity' ||
    toType === 'meal' ||
    toType === 'free_time'
  ) {
    if (src.includes) next.includes = src.includes;
  }
  return next;
}

function buildItinerarySkeleton(opts: {
  dayCount: number;
  places: PlaceRef[];
  mode: BuildItineraryMode;
  tripStartDate?: string | null;
}): ItineraryDay[] {
  const { dayCount, places, mode, tripStartDate } = opts;
  const count = Math.max(1, Math.min(30, dayCount));
  const placeList = places.length ? places : [null];

  return Array.from({ length: count }, (_, i) => {
    let dest: PlaceRef | null = null;
    if (mode === 'one-per-city') {
      dest = placeList[Math.min(i, placeList.length - 1)] || null;
    } else {
      // Stay nights in first city, then optional hops across remaining days.
      if (placeList.length <= 1) {
        dest = placeList[0] || null;
      } else if (i < count - (placeList.length - 1)) {
        dest = placeList[0] || null;
      } else {
        const hopIndex = i - (count - placeList.length);
        dest = placeList[Math.max(0, hopIndex)] || null;
      }
    }
    const title =
      i === 0 && dest
        ? `Arrive ${dest.name}`
        : dest
          ? dest.name
          : `Day ${i + 1}`;
    return {
      id: `d${Date.now()}-${i}`,
      dayNumber: i + 1,
      title,
      date: tripStartDate ? addDaysIso(tripStartDate, i) : null,
      destination: dest,
      items:
        i === 0 && dest
          ? [
              {
                ...emptyItem('hotel'),
                id: `i${Date.now()}-ci`,
                title: 'Check-in',
                location: dest,
              },
            ]
          : ([] as ItineraryItem[]),
    };
  });
}

function daysHaveWork(days: ItineraryDay[]): boolean {
  const itemCount = days.reduce((n, d) => n + d.items.length, 0);
  return days.length > 1 || itemCount > 1 || Boolean(days[0]?.destination);
}

function blockHasDays(block: ItineraryBlockRow): boolean {
  const days = block.contentJson?.days;
  return Array.isArray(days) && days.length > 0;
}

function toTemplateContentJson(days: ItineraryDay[]) {
  return {
    days: days.map((day) => {
      const dest = toPlaceRef(day.destination);
      return {
        dayNumber: day.dayNumber,
        title: day.title,
        destinationPlaceId: dest?.placeId || undefined,
        destination: dest || undefined,
        items: day.items.map((item) => {
          const loc = toPlaceRef(item.location);
          const catalogPlaceId =
            item.details?.catalogPlaceId || loc?.placeId || undefined;
          return {
            type: item.type,
            title: item.title,
            description: item.description || undefined,
            startTime: item.startTime || undefined,
            endTime: item.endTime || undefined,
            catalogPlaceId,
            customerVisible: item.customerVisible !== false,
            location: loc || undefined,
            details: {
              ...(catalogPlaceId ? { catalogPlaceId } : {}),
              ...(item.details?.nights != null ? { nights: item.details.nights } : {}),
              ...(item.details?.roomType ? { roomType: item.details.roomType } : {}),
              ...(item.details?.vehicle ? { vehicle: item.details.vehicle } : {}),
              ...(item.details?.vehicleTypeId
                ? { vehicleTypeId: item.details.vehicleTypeId }
                : {}),
              ...(item.details?.seats != null ? { seats: item.details.seats } : {}),
              ...(item.details?.flightNumber
                ? { flightNumber: item.details.flightNumber }
                : {}),
              ...(item.details?.from ? { from: item.details.from } : {}),
              ...(item.details?.to ? { to: item.details.to } : {}),
              ...(item.details?.includes ? { includes: item.details.includes } : {}),
            },
          };
        }),
      };
    }),
  };
}

function applyPlaceSnapshotToDraft(draft: ItineraryItem, place: PlaceApiItem): ItineraryItem {
  const snap = snapshotFromPlaceProfile(place);
  const placeRef: PlaceRef = {
    placeId: place.id,
    name: place.name,
    kind: place.kind,
  };
  return {
    ...draft,
    type: draft.type === 'activity' ? 'sightseeing' : draft.type,
    title: snap.title || draft.title,
    description: snap.description ?? draft.description,
    location: placeRef,
    details: {
      ...draft.details,
      catalogPlaceId: snap.catalogPlaceId,
      catalogProvenance: snap.catalogProvenance,
      imageUrl: snap.imageUrl ?? draft.details?.imageUrl,
      imageUrls: snap.imageUrls ?? draft.details?.imageUrls,
      bestVisitTime: snap.bestVisitTime ?? draft.details?.bestVisitTime,
      googleMapsUrl: snap.googleMapsUrl ?? draft.details?.googleMapsUrl,
      googleRating: snap.googleRating ?? draft.details?.googleRating,
      googleReviewCount: snap.googleReviewCount ?? draft.details?.googleReviewCount,
      reviewSnippet: snap.reviewSnippet ?? draft.details?.reviewSnippet,
      openingHours: snap.openingHours ?? draft.details?.openingHours,
      durationMin: snap.durationMin ?? draft.details?.durationMin,
      entryFee: snap.entryFee ?? draft.details?.entryFee,
      suitabilityTags: snap.suitabilityTags ?? draft.details?.suitabilityTags,
    },
  };
}

type HotelSupplierMeta = {
  id: string;
  name: string;
  type: string;
  place?: { id: string; name: string; kind: string } | null;
  imageUrl?: string;
  imageUrls?: string[];
  amenities?: string[];
  roomHint?: string;
  stars?: number;
  googleRating?: number;
  googleReviewCount?: number;
  googleMapsUrl?: string;
  reviewSnippet?: string;
  checkIn?: string;
  checkOut?: string;
  distanceHint?: string;
};

const hotelSupplierCache = new Map<string, HotelSupplierMeta>();

const STAY_SUPPLIER_TYPES = new Set(['hotel', 'homestay', 'farmstay']);

function supplierProfileExtras(profile: unknown): Omit<
  HotelSupplierMeta,
  'id' | 'name' | 'type' | 'place'
> {
  if (!profile || typeof profile !== 'object') return {};
  const p = profile as {
    imageUrl?: string;
    imageUrls?: string[];
    amenities?: string[];
    roomHints?: string[];
    stars?: number;
    googleRating?: number;
    googleReviewCount?: number;
    googleMapsUrl?: string;
    reviewSnippet?: string;
    checkIn?: string;
    checkOut?: string;
    distanceHint?: string;
  };
  const imageUrls = Array.isArray(p.imageUrls)
    ? p.imageUrls.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
    : undefined;
  const amenities = Array.isArray(p.amenities)
    ? p.amenities.filter((a): a is string => typeof a === 'string' && Boolean(a.trim()))
    : undefined;
  const roomHint = Array.isArray(p.roomHints)
    ? p.roomHints.find((h): h is string => typeof h === 'string' && Boolean(h.trim()))
    : undefined;
  return {
    imageUrl: p.imageUrl?.trim() || imageUrls?.[0],
    imageUrls,
    amenities,
    roomHint,
    stars: typeof p.stars === 'number' ? p.stars : undefined,
    googleRating: typeof p.googleRating === 'number' ? p.googleRating : undefined,
    googleReviewCount:
      typeof p.googleReviewCount === 'number' ? p.googleReviewCount : undefined,
    googleMapsUrl: p.googleMapsUrl?.trim() || undefined,
    reviewSnippet: p.reviewSnippet?.trim() || undefined,
    checkIn: p.checkIn?.trim() || undefined,
    checkOut: p.checkOut?.trim() || undefined,
    distanceHint: p.distanceHint?.trim() || undefined,
  };
}

function applyHotelSupplierToDraft(
  draft: ItineraryItem,
  supplier: HotelSupplierMeta,
): ItineraryItem {
  const location: PlaceRef | undefined = supplier.place
    ? {
        placeId: supplier.place.id,
        name: supplier.place.name,
        kind: supplier.place.kind,
      }
    : draft.location
      ? toPlaceRef(draft.location) || undefined
      : undefined;
  return {
    ...draft,
    type: 'hotel',
    title: supplier.name,
    location: location ?? draft.location,
    details: {
      ...draft.details,
      supplierId: supplier.id,
      supplierType: supplier.type,
      catalogProvenance: 'supplier',
      imageUrl: supplier.imageUrl ?? draft.details?.imageUrl,
      imageUrls: supplier.imageUrls ?? draft.details?.imageUrls,
      amenities: supplier.amenities?.length
        ? supplier.amenities
        : draft.details?.amenities,
      roomType: supplier.roomHint || draft.details?.roomType,
      stars: supplier.stars ?? draft.details?.stars,
      googleRating: supplier.googleRating ?? draft.details?.googleRating,
      googleReviewCount: supplier.googleReviewCount ?? draft.details?.googleReviewCount,
      googleMapsUrl: supplier.googleMapsUrl ?? draft.details?.googleMapsUrl,
      reviewSnippet: supplier.reviewSnippet ?? draft.details?.reviewSnippet,
      checkIn: supplier.checkIn ?? draft.details?.checkIn,
      checkOut: supplier.checkOut ?? draft.details?.checkOut,
      distanceHint: supplier.distanceHint ?? draft.details?.distanceHint,
    },
  };
}

async function searchHotelSuppliers(
  q: string,
  placeId?: string | null,
): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('type', 'hotel,homestay,farmstay');
  if (placeId) params.set('placeId', placeId);
  let items = await api<
    Array<{
      id: string;
      name: string;
      type: string;
      profileJson?: unknown;
      place?: { id: string; name: string; kind: string } | null;
    }>
  >(`/suppliers?${params.toString()}`);
  // If city filter yields nothing, fall back to all stay suppliers so planners can still pick.
  if (placeId && items.length === 0) {
    const fallback = new URLSearchParams();
    if (q) fallback.set('q', q);
    fallback.set('type', 'hotel,homestay,farmstay');
    items = await api(`/suppliers?${fallback.toString()}`);
  }
  return items
    .filter((s) => STAY_SUPPLIER_TYPES.has(s.type))
    .map((s) => {
      const extras = supplierProfileExtras(s.profileJson);
      hotelSupplierCache.set(s.id, {
        id: s.id,
        name: s.name,
        type: s.type,
        place: s.place,
        ...extras,
      });
      return {
        value: s.id,
        label: s.name,
        description: [s.type.replace(/_/g, ' '), s.place?.name].filter(Boolean).join(' · '),
      };
    });
}

function refreshDraftFromGuide(draft: ItineraryItem, place: PlaceApiItem): ItineraryItem {
  const snap = snapshotRefreshFields(place);
  return {
    ...draft,
    type: draft.type === 'activity' ? 'sightseeing' : draft.type,
    title: snap.title || draft.title,
    description: snap.description ?? draft.description,
    details: {
      ...draft.details,
      catalogPlaceId: snap.catalogPlaceId,
      catalogProvenance: snap.catalogProvenance,
      imageUrl: snap.imageUrl,
      imageUrls: snap.imageUrls,
      bestVisitTime: snap.bestVisitTime,
      googleMapsUrl: snap.googleMapsUrl,
      googleRating: snap.googleRating,
      googleReviewCount: snap.googleReviewCount,
      reviewSnippet: snap.reviewSnippet,
      openingHours: snap.openingHours,
      durationMin: snap.durationMin,
      entryFee: snap.entryFee,
      suitabilityTags: snap.suitabilityTags,
    },
  };
}

/** 1–2 context-derived chips only (no random templates). */
function titleSuggestions(
  type: string,
  opts?: {
    place?: string | null;
    from?: string | null;
    to?: string | null;
    startTime?: string | null;
    landmark?: string | null;
    hotelName?: string | null;
    mealContext?: MealContext | null;
  },
): string[] {
  const primary = suggestItemTitle({
    type,
    place: opts?.place,
    from: opts?.from,
    to: opts?.to,
    startTime: opts?.startTime,
    landmark: opts?.landmark,
    hotelName: opts?.hotelName,
    mealContext: opts?.mealContext,
  });
  const secondary =
    type === 'meal'
      ? [
          suggestItemTitle({
            type,
            startTime: '08:00',
            mealContext: opts?.mealContext,
          }),
          suggestItemTitle({
            type,
            startTime: '13:00',
            mealContext: opts?.mealContext,
          }),
          suggestItemTitle({
            type,
            startTime: '20:00',
            mealContext: opts?.mealContext,
          }),
        ].filter((t) => t !== primary)
      : [];
  return [...new Set([primary, ...secondary])].slice(0, 2);
}

function normalizeDays(
  raw: ItineraryDay[] | undefined,
  tripStartDate?: string | null,
): ItineraryDay[] {
  const source =
    raw?.length
      ? raw
      : [
          {
            id: 'd1',
            dayNumber: 1,
            title: 'Arrival',
            date: tripStartDate ? addDaysIso(tripStartDate, 0) : null,
            destination: null,
            items: [
              {
                id: 'i1',
                type: 'hotel',
                title: 'Check-in',
                customerVisible: true,
                details: {},
              },
            ],
          },
        ];

  return source.map((day, index) => {
    const dayNumber = day.dayNumber || index + 1;
    const date =
      day.date ||
      (tripStartDate ? addDaysIso(tripStartDate, dayNumber - 1) : null);
    return {
      ...day,
      id: day.id || `d${dayNumber}`,
      dayNumber,
      title: day.title || `Day ${dayNumber}`,
      date,
      destination: day.destination || null,
      items: (day.items || []).map((item) => ({
        ...item,
        type: item.type === 'activity' ? 'sightseeing' : item.type,
        customerVisible: item.customerVisible !== false,
        details: item.details || {},
      })),
    };
  });
}

async function searchRoomTypes(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<{
    items: Array<{
      id: string;
      name: string;
      description?: string | null;
      isSystem: boolean;
    }>;
  }>(`/room-types?${params.toString()}`);
  return res.items.map((r) => ({
    value: r.name,
    label: r.name,
    description: [r.description, r.isSystem ? 'System' : 'Your agency'].filter(Boolean).join(' · '),
  }));
}

type VehicleTypeMeta = {
  id: string;
  name: string;
  seats?: number | null;
  imageUrl?: string;
};

const vehicleTypeCache = new Map<string, VehicleTypeMeta>();

function vehicleProfileImage(profile: unknown): string | undefined {
  if (!profile || typeof profile !== 'object') return undefined;
  const p = profile as { imageUrl?: string; imageUrls?: string[] };
  return p.imageUrl?.trim() || p.imageUrls?.find((u) => u.trim()) || undefined;
}

async function searchVehicleTypes(q: string): Promise<ComboboxOption[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await api<{
    items: Array<{
      id: string;
      name: string;
      description?: string | null;
      seats?: number | null;
      isSystem: boolean;
      profileJson?: unknown;
    }>;
  }>(`/vehicle-types?${params.toString()}`);
  return res.items.map((v) => {
    const imageUrl = vehicleProfileImage(v.profileJson);
    vehicleTypeCache.set(v.id, {
      id: v.id,
      name: v.name,
      seats: v.seats,
      imageUrl,
    });
    return {
      value: v.id,
      label: v.name,
      description: [
        v.seats != null ? `${v.seats} seats` : null,
        v.description,
        v.isSystem ? 'System' : 'Your agency',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  });
}

function PlaceField({
  label,
  value,
  onChange,
  placeholder,
  onCreateNew,
}: {
  label: string;
  value?: PlaceRef | string | null;
  onChange: (value: PlaceRef | null) => void;
  placeholder?: string;
  onCreateNew?: (q: string) => void;
}) {
  return (
    <PlaceSinglePicker
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onCreateNew={onCreateNew}
    />
  );
}

function RoomTypeField({
  value,
  onChange,
  onCreateNew,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  onCreateNew?: (q: string) => void;
}) {
  const onSearch = useCallback((q: string) => searchRoomTypes(q), []);
  return (
    <FormField label="Room type">
      <EntityCombobox
        value={value || ''}
        selectedLabel={value || undefined}
        onChange={(next) => onChange(next)}
        onSearch={onSearch}
        placeholder="Search room types…"
        emptyText="No room types match — add one for your agency."
        createNewLabel="Add room type"
        onCreateNew={onCreateNew}
        clearable
      />
    </FormField>
  );
}

function VehicleTypeField({
  valueId,
  valueName,
  onChange,
  onCreateNew,
}: {
  valueId?: string | null;
  valueName?: string | null;
  onChange: (next: {
    vehicleTypeId?: string;
    vehicle: string;
    seats?: number;
    imageUrl?: string;
  }) => void;
  onCreateNew?: (q: string) => void;
}) {
  const onSearch = useCallback((q: string) => searchVehicleTypes(q), []);
  return (
    <FormField label="Vehicle">
      <EntityCombobox
        value={valueId || ''}
        selectedLabel={valueName || undefined}
        onChange={(id, option) => {
          if (!id) {
            onChange({ vehicleTypeId: undefined, vehicle: '', seats: undefined });
            return;
          }
          const cached = vehicleTypeCache.get(id);
          onChange({
            vehicleTypeId: id,
            vehicle: option?.label || cached?.name || id,
            seats: cached?.seats ?? undefined,
            imageUrl: cached?.imageUrl,
          });
        }}
        onSearch={onSearch}
        placeholder="Search vehicle types…"
        emptyText="No vehicles match — add one for your agency."
        createNewLabel="Add vehicle type"
        onCreateNew={onCreateNew}
        clearable
      />
    </FormField>
  );
}

function HotelSupplierField({
  valueId,
  valueName,
  placeId,
  checkIn,
  checkOut,
  onPick,
  onClear,
  onCreateNew,
}: {
  valueId?: string | null;
  valueName?: string | null;
  placeId?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  onPick: (supplier: HotelSupplierMeta) => void;
  onClear: () => void;
  onCreateNew?: (q: string) => void;
}) {
  const [availNote, setAvailNote] = useState<string | null>(null);
  const onSearch = useCallback(
    (q: string) => searchHotelSuppliers(q, placeId),
    [placeId],
  );

  useEffect(() => {
    if (!valueId || !checkIn || !checkOut) {
      setAvailNote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{
          products: Array<{ remaining: number; name: string }>;
          message?: string;
        }>(
          `/inventory/availability?supplierId=${encodeURIComponent(valueId)}&from=${encodeURIComponent(checkIn)}&to=${encodeURIComponent(checkOut)}`,
        );
        if (cancelled) return;
        if (!res.products?.length) {
          setAvailNote(res.message || 'No inventory linked yet — confirmations will skip allotment.');
          return;
        }
        const total = res.products.reduce((s, p) => s + p.remaining, 0);
        if (total <= 0) {
          setAvailNote('Soft warning: no remaining allotment for these nights.');
        } else {
          setAvailNote(
            `${total} room(s) remaining across ${res.products.length} product(s) for these nights.`,
          );
        }
      } catch {
        if (!cancelled) setAvailNote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [valueId, checkIn, checkOut]);

  return (
    <FormField
      label="Hotel"
      description={
        availNote ||
        'From your agency suppliers (hotels, homestays, farmstays).'
      }
    >
      <EntityCombobox
        value={valueId || ''}
        selectedLabel={valueName || undefined}
        onChange={(id, option) => {
          if (!id) {
            onClear();
            return;
          }
          const cached = hotelSupplierCache.get(id);
          onPick(
            cached || {
              id,
              name: option?.label || id,
              type: 'hotel',
            },
          );
        }}
        onSearch={onSearch}
        placeholder="Search available hotels…"
        emptyText="No stay suppliers yet — add one for your agency."
        createNewLabel="Add hotel"
        onCreateNew={onCreateNew}
        clearable
      />
    </FormField>
  );
}

export function ItineraryBuilder({
  days,
  onChange,
  story,
  onStoryChange,
  tripId,
  tripStartDate,
  tripEndDate,
  destinations,
  versions,
  saving,
  saveState = 'idle',
  savedAt,
  onSaveCheckpoint,
  onPreparePreview,
  onRestoreVersion,
  readOnly = false,
}: {
  days: ItineraryDay[];
  onChange: (days: ItineraryDay[]) => void;
  story?: ItineraryStory;
  onStoryChange?: (story: ItineraryStory) => void;
  tripId?: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  destinations?: Array<PlaceRef | string>;
  versions?: Array<{ id: string; versionNumber: number; label?: string | null }>;
  saving?: boolean;
  saveState?: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  savedAt?: Date | null;
  onSaveCheckpoint: () => void;
  /** Flush latest edits before opening client preview / share. */
  onPreparePreview?: () => Promise<void>;
  onRestoreVersion?: (versionId: string) => Promise<void>;
  /** When true, disables all editing affordances (role lacks itinerary.edit). */
  readOnly?: boolean;
}) {
  const navigate = useNavigate();
  const normalized = useMemo(
    () => normalizeDays(days, tripStartDate),
    [days, tripStartDate],
  );
  const destinationRefs = useMemo(
    () =>
      (destinations || [])
        .map((d) => toPlaceRef(d))
        .filter(Boolean) as PlaceRef[],
    [destinations],
  );
  const [selectedDayId, setSelectedDayId] = useState<string | null>(normalized[0]?.id ?? null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<{
    dayId: string;
    itemId: string | null;
    draft: ItineraryItem;
  } | null>(null);

  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeForm, setPlaceForm] = useState({
    name: '',
    country: 'India',
    region: '',
    domesticOrIntl: 'domestic' as 'domestic' | 'international',
  });
  const [placeErrors, setPlaceErrors] = useState<Record<string, string>>({});
  const [placeSubmitting, setPlaceSubmitting] = useState(false);

  const [roomTypeOpen, setRoomTypeOpen] = useState(false);
  const [roomTypeForm, setRoomTypeForm] = useState({ name: '', description: '' });
  const [roomTypeErrors, setRoomTypeErrors] = useState<Record<string, string>>({});
  const [roomTypeSubmitting, setRoomTypeSubmitting] = useState(false);
  const [hotelOpen, setHotelOpen] = useState(false);
  const [hotelForm, setHotelForm] = useState({
    name: '',
    type: 'hotel',
    place: null as PlaceRef | null,
    imageUrl: '',
    imageUrls: '',
    amenities: '',
    roomHints: '',
    stars: '',
    googleRating: '',
    googleReviewCount: '',
    googleMapsUrl: '',
    reviewSnippet: '',
    checkIn: '2:00 PM',
    checkOut: '11:00 AM',
    distanceHint: '',
  });
  const [hotelSubmitting, setHotelSubmitting] = useState(false);

  const [vehicleTypeOpen, setVehicleTypeOpen] = useState(false);
  const [vehicleTypeForm, setVehicleTypeForm] = useState({
    name: '',
    description: '',
    seats: '' as string,
  });
  const [vehicleTypeErrors, setVehicleTypeErrors] = useState<Record<string, string>>({});
  const [vehicleTypeSubmitting, setVehicleTypeSubmitting] = useState(false);

  const [itineraryBlocks, setItineraryBlocks] = useState<ItineraryBlockRow[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [applyingBlockId, setApplyingBlockId] = useState<string | null>(null);
  const [refreshingGuide, setRefreshingGuide] = useState(false);
  const [buildWizardOpen, setBuildWizardOpen] = useState(false);
  const [buildNights, setBuildNights] = useState(() =>
    Math.max(1, defaultDayCount(tripStartDate, tripEndDate) - 1),
  );
  const [buildPlaces, setBuildPlaces] = useState<PlaceRef[]>(destinationRefs);
  const [buildMode, setBuildMode] = useState<BuildItineraryMode>('stay-nights');
  const [buildDraftStory, setBuildDraftStory] = useState(true);
  const [buildWorking, setBuildWorking] = useState(false);
  const autoOpenedBuildRef = useRef(false);
  const [guidePickerOpen, setGuidePickerOpen] = useState(false);
  const [guidePickerDayId, setGuidePickerDayId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    | {
        kind: 'build-days';
        nights: number;
        places: PlaceRef[];
        mode: BuildItineraryMode;
        draftStory: boolean;
      }
    | {
        kind: 'apply-template';
        block: ItineraryBlockRow;
        mode: 'replace' | 'append';
        previewDays?: ItineraryDay[];
      }
    | { kind: 'delete-day'; dayId: string }
    | null
  >(null);

  const focusedDay = useMemo(() => {
    return (
      normalized.find((d) => d.id === selectedDayId) ||
      normalized[0] ||
      null
    );
  }, [normalized, selectedDayId]);

  const packageBlocks = useMemo(
    () => itineraryBlocks.filter((b) => blockHasDays(b)),
    [itineraryBlocks],
  );

  useEffect(() => {
    if (!selectedDayId && normalized[0]) setSelectedDayId(normalized[0].id);
    else if (selectedDayId && !normalized.some((d) => d.id === selectedDayId)) {
      setSelectedDayId(normalized[0]?.id ?? null);
    }
  }, [normalized, selectedDayId]);

  useEffect(() => {
    let cancelled = false;
    setBlocksLoading(true);
    void (async () => {
      try {
        const res = await api<{ items: ItineraryBlockRow[] }>('/itinerary-blocks');
        if (!cancelled) setItineraryBlocks(res.items || []);
      } catch {
        if (!cancelled) setItineraryBlocks([]);
      } finally {
        if (!cancelled) setBlocksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function commit(next: ItineraryDay[]) {
    onChange(next);
  }

  function updateDay(dayId: string, patch: Partial<ItineraryDay>) {
    commit(normalized.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
  }

  function updateItem(
    dayId: string,
    itemId: string,
    patch: Partial<ItineraryItem>,
  ) {
    commit(
      normalized.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: day.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
            }
          : day,
      ),
    );
  }

  function openCreatePlace(prefillName = '') {
    setPlaceForm({
      name: prefillName,
      country: 'India',
      region: '',
      domesticOrIntl: 'domestic',
    });
    setPlaceErrors({});
    setPlaceOpen(true);
  }

  async function createPlace() {
    const parsed = parseWithFieldErrors(CreatePlaceSchema, placeForm);
    if (!parsed.ok) {
      setPlaceErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setPlaceErrors({});
    setPlaceSubmitting(true);
    try {
      const place = await api<{ id: string; name: string; kind: string }>('/places', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setEditing((ed) =>
        ed
          ? {
              ...ed,
              draft: {
                ...ed.draft,
                location: { placeId: place.id, name: place.name, kind: place.kind },
              },
            }
          : ed,
      );
      setPlaceOpen(false);
      toastSuccess('Place added');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create place');
    } finally {
      setPlaceSubmitting(false);
    }
  }

  function openCreateRoomType(prefillName = '') {
    setRoomTypeForm({ name: prefillName, description: '' });
    setRoomTypeErrors({});
    setRoomTypeOpen(true);
  }

  function openCreateHotel(prefillName = '') {
    const dayForHotel = editing
      ? normalized.find((d) => d.id === editing.dayId)
      : null;
    setHotelForm({
      name: prefillName,
      type: 'hotel',
      place:
        toPlaceRef(editing?.draft.location) ||
        toPlaceRef(dayForHotel?.destination) ||
        null,
      imageUrl: '',
      imageUrls: '',
      amenities: '',
      roomHints: '',
      stars: '',
      googleRating: '',
      googleReviewCount: '',
      googleMapsUrl: '',
      reviewSnippet: '',
      checkIn: '2:00 PM',
      checkOut: '11:00 AM',
      distanceHint: '',
    });
    setHotelOpen(true);
  }

  async function createHotelSupplier() {
    const profileJson: Record<string, unknown> = {};
    if (hotelForm.imageUrl.trim()) profileJson.imageUrl = hotelForm.imageUrl.trim();
    const gallery = hotelForm.imageUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (gallery.length) profileJson.imageUrls = gallery;
    const amenities = hotelForm.amenities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (amenities.length) profileJson.amenities = amenities;
    const roomHints = hotelForm.roomHints
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (roomHints.length) profileJson.roomHints = roomHints;
    if (hotelForm.stars.trim()) {
      const stars = Number(hotelForm.stars);
      if (Number.isFinite(stars)) profileJson.stars = stars;
    }
    if (hotelForm.googleRating.trim()) {
      const rating = Number(hotelForm.googleRating);
      if (Number.isFinite(rating)) profileJson.googleRating = rating;
    }
    if (hotelForm.googleReviewCount.trim()) {
      const count = Number(hotelForm.googleReviewCount);
      if (Number.isFinite(count)) profileJson.googleReviewCount = count;
    }
    if (hotelForm.googleMapsUrl.trim()) {
      profileJson.googleMapsUrl = hotelForm.googleMapsUrl.trim();
    }
    if (hotelForm.reviewSnippet.trim()) {
      profileJson.reviewSnippet = hotelForm.reviewSnippet.trim();
    }
    if (hotelForm.checkIn.trim()) profileJson.checkIn = hotelForm.checkIn.trim();
    if (hotelForm.checkOut.trim()) profileJson.checkOut = hotelForm.checkOut.trim();
    if (hotelForm.distanceHint.trim()) {
      profileJson.distanceHint = hotelForm.distanceHint.trim();
    }

    const parsed = parseWithFieldErrors(CreateSupplierSchema, {
      name: hotelForm.name,
      type: hotelForm.type,
      placeId: hotelForm.place?.placeId || undefined,
      profileJson: Object.keys(profileJson).length ? profileJson : undefined,
    });
    if (!parsed.ok) {
      toastError(Object.values(parsed.errors)[0] || 'Fix the hotel fields');
      return;
    }
    setHotelSubmitting(true);
    try {
      const created = await api<{
        id: string;
        name: string;
        type: string;
        place?: { id: string; name: string; kind: string } | null;
        profileJson?: unknown;
      }>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      const extras = supplierProfileExtras(created.profileJson);
      const meta: HotelSupplierMeta = {
        id: created.id,
        name: created.name,
        type: created.type,
        place: created.place,
        ...extras,
      };
      hotelSupplierCache.set(created.id, meta);
      setEditing((ed) =>
        ed ? { ...ed, draft: applyHotelSupplierToDraft(ed.draft, meta) } : ed,
      );
      setHotelOpen(false);
      toastSuccess(`Hotel added: ${created.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create hotel');
    } finally {
      setHotelSubmitting(false);
    }
  }

  async function createRoomType() {
    const parsed = parseWithFieldErrors(CreateRoomTypeSchema, roomTypeForm);
    if (!parsed.ok) {
      setRoomTypeErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setRoomTypeErrors({});
    setRoomTypeSubmitting(true);
    try {
      const roomType = await api<{ name: string }>('/room-types', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setEditing((ed) =>
        ed
          ? {
              ...ed,
              draft: {
                ...ed.draft,
                details: { ...ed.draft.details, roomType: roomType.name },
              },
            }
          : ed,
      );
      setRoomTypeOpen(false);
      toastSuccess('Room type added');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create room type');
    } finally {
      setRoomTypeSubmitting(false);
    }
  }

  function openCreateVehicleType(prefillName = '') {
    setVehicleTypeForm({ name: prefillName, description: '', seats: '' });
    setVehicleTypeErrors({});
    setVehicleTypeOpen(true);
  }

  async function createVehicleType() {
    const seatsNum = vehicleTypeForm.seats.trim()
      ? Number(vehicleTypeForm.seats)
      : undefined;
    const parsed = parseWithFieldErrors(CreateVehicleTypeSchema, {
      name: vehicleTypeForm.name,
      description: vehicleTypeForm.description || undefined,
      seats:
        seatsNum != null && Number.isFinite(seatsNum) && seatsNum > 0
          ? seatsNum
          : undefined,
    });
    if (!parsed.ok) {
      setVehicleTypeErrors(parsed.errors);
      toastError(Object.values(parsed.errors)[0] || 'Fix the highlighted fields');
      return;
    }
    setVehicleTypeErrors({});
    setVehicleTypeSubmitting(true);
    try {
      const vehicle = await api<{
        id: string;
        name: string;
        seats?: number | null;
        profileJson?: unknown;
      }>('/vehicle-types', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      const imageUrl = vehicleProfileImage(vehicle.profileJson);
      vehicleTypeCache.set(vehicle.id, {
        id: vehicle.id,
        name: vehicle.name,
        seats: vehicle.seats,
        imageUrl,
      });
      setEditing((ed) =>
        ed
          ? {
              ...ed,
              draft: {
                ...ed.draft,
                details: {
                  ...ed.draft.details,
                  vehicleTypeId: vehicle.id,
                  vehicle: vehicle.name,
                  seats: vehicle.seats ?? ed.draft.details?.seats,
                  ...(imageUrl && !ed.draft.details?.imageUrl
                    ? { imageUrl }
                    : {}),
                },
              },
            }
          : ed,
      );
      setVehicleTypeOpen(false);
      toastSuccess('Vehicle type added');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create vehicle type');
    } finally {
      setVehicleTypeSubmitting(false);
    }
  }

  /** Prefer previous item's end time; fall back to its start (hotel/meal). */
function suggestedStartFromPreviousItem(items: ItineraryItem[]): string | null {
  if (!items.length) return null;
  const prev = items[items.length - 1];
  const end = prev.endTime?.trim();
  if (end) return end;
  const start = prev.startTime?.trim();
  return start || null;
}

function openAdd(dayId: string, type = 'sightseeing') {
    const day = normalized.find((d) => d.id === dayId);
    const draft = emptyItem(type);
    const place = placeName(day?.destination);
    const fromRef = day?.destination ? toPlaceRef(day.destination) : null;
    if (type !== 'transfer' && day?.destination) {
      draft.location = fromRef;
    }
    const suggestedStart = suggestedStartFromPreviousItem(day?.items || []);
    if (suggestedStart) {
      draft.startTime = suggestedStart;
    }
    const dayIndex = normalized.findIndex((d) => d.id === dayId);
    const nextDay = dayIndex >= 0 ? normalized[dayIndex + 1] : undefined;
    const toRef = nextDay?.destination ? toPlaceRef(nextDay.destination) : null;
    if (type === 'transfer' || type === 'flight') {
      const from = place;
      const to = placeName(nextDay?.destination);
      draft.details = {
        ...draft.details,
        ...(from
          ? { from, ...(fromRef?.placeId ? { fromPlaceId: fromRef.placeId } : {}) }
          : {}),
        ...(to && to !== from
          ? { to, ...(toRef?.placeId ? { toPlaceId: toRef.placeId } : {}) }
          : {}),
      };
      if (toRef) draft.location = toRef;
      else if (fromRef) draft.location = fromRef;
      draft.title = suggestItemTitle({
        type,
        place,
        from: draft.details?.from,
        to: draft.details?.to,
      });
    } else {
      draft.title = suggestItemTitle({
        type,
        place,
        startTime: draft.startTime,
        mealContext: type === 'meal' ? mealContextFromDay(day) : undefined,
      });
    }
    setEditing({ dayId, itemId: null, draft: withTransferDropOff(draft) });
    setSheetOpen(true);
  }

  function openEdit(dayId: string, item: ItineraryItem) {
    setEditing({
      dayId,
      itemId: item.id,
      draft: {
        ...emptyItem(item.type),
        ...item,
        type: item.type === 'activity' ? 'sightseeing' : item.type,
        details: { ...(item.details || {}) },
      },
    });
    setSheetOpen(true);
  }

  function openGuidePicker(dayId: string) {
    setGuidePickerDayId(dayId);
    setGuidePickerOpen(true);
  }

  async function addFromGuide(place: PlaceApiItem) {
    const dayId = guidePickerDayId || focusedDay?.id;
    if (!dayId) return;
    const day = normalized.find((d) => d.id === dayId);
    const type = 'sightseeing';
    let draft = emptyItem(type);
    if (day?.destination) draft.location = toPlaceRef(day.destination);
    const suggestedStart = suggestedStartFromPreviousItem(day?.items || []);
    if (suggestedStart) draft.startTime = suggestedStart;
    draft = applyPlaceSnapshotToDraft(draft, place);
    const item: ItineraryItem = {
      ...draft,
      id: `i${Date.now()}`,
      title: draft.title || place.name,
      startTime: draft.startTime || suggestedStart || '',
    };
    commit(
      normalized.map((d) =>
        d.id === dayId ? { ...d, items: [...d.items, item] } : d,
      ),
    );
    setGuidePickerOpen(false);
    setGuidePickerDayId(null);
    toastSuccess(`Added ${place.name} from guide`);
  }

  function saveItem() {
    if (!editing) return;
    const title = editing.draft.title.trim();
    if (!title) {
      toastError('Enter a title');
      return;
    }
    const fields = timeFieldsForType(editing.draft.type);
    const startTime =
      fields.mode === 'none' ? null : editing.draft.startTime || null;
    const endTime =
      fields.mode === 'range' ? editing.draft.endTime || null : null;
    let location = toPlaceRef(editing.draft.location);
    if (editing.draft.type === 'transfer') {
      const toId = editing.draft.details?.toPlaceId;
      const fromId = editing.draft.details?.fromPlaceId;
      if (toId && editing.draft.details?.to) {
        location = {
          placeId: toId,
          name: editing.draft.details.to,
        };
      } else if (fromId && editing.draft.details?.from) {
        location = {
          placeId: fromId,
          name: editing.draft.details.from,
        };
      }
    }
    const item: ItineraryItem = {
      ...editing.draft,
      type:
        editing.draft.type === 'activity' ? 'sightseeing' : editing.draft.type,
      title,
      description: editing.draft.description?.trim() || null,
      startTime,
      endTime,
      location,
      notes: editing.draft.notes?.trim() || null,
      internalNotes: editing.draft.internalNotes?.trim() || null,
      details: editing.draft.details || {},
    };

    commit(
      normalized.map((day) => {
        if (day.id !== editing.dayId) return day;
        if (editing.itemId) {
          return {
            ...day,
            items: day.items.map((i) => (i.id === editing.itemId ? item : i)),
          };
        }
        return { ...day, items: [...day.items, { ...item, id: `i${Date.now()}` }] };
      }),
    );
    setSheetOpen(false);
    setEditing(null);
    toastSuccess(editing.itemId ? 'Item updated' : 'Item added');
  }

  function deleteItem(dayId: string, itemId: string) {
    const prev = normalized;
    const removed = prev
      .find((d) => d.id === dayId)
      ?.items.find((i) => i.id === itemId);
    commit(
      prev.map((day) =>
        day.id === dayId ? { ...day, items: day.items.filter((i) => i.id !== itemId) } : day,
      ),
    );
    toastSuccess(removed ? `Removed “${removed.title}”` : 'Item removed', {
      action: {
        label: 'Undo',
        onClick: () => commit(prev),
      },
    });
  }

  function duplicateItem(dayId: string, item: ItineraryItem) {
    commit(
      normalized.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: [
                ...day.items,
                { ...item, id: `i${Date.now()}`, title: `${item.title} (copy)` },
              ],
            }
          : day,
      ),
    );
  }

  function moveItem(dayId: string, index: number, dir: -1 | 1) {
    commit(
      normalized.map((day) => {
        if (day.id !== dayId) return day;
        const next = [...day.items];
        const j = index + dir;
        if (j < 0 || j >= next.length) return day;
        const tmp = next[index];
        next[index] = next[j];
        next[j] = tmp;
        return { ...day, items: next };
      }),
    );
  }

  function reorderItem(dayId: string, fromId: string, toId: string) {
    if (fromId === toId) return;
    commit(
      normalized.map((day) => {
        if (day.id !== dayId) return day;
        const next = [...day.items];
        const fromIndex = next.findIndex((i) => i.id === fromId);
        const toIndex = next.findIndex((i) => i.id === toId);
        if (fromIndex < 0 || toIndex < 0) return day;
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { ...day, items: next };
      }),
    );
  }

  function addDay() {
    const dayNumber = normalized.length + 1;
    const id = `d${Date.now()}`;
    const date = tripStartDate ? addDaysIso(tripStartDate, dayNumber - 1) : null;
    const unusedPlace = destinationRefs.find(
      (dest) => !normalized.some((d) => samePlace(d.destination, dest)),
    );
    const next = [
      ...normalized,
      {
        id,
        dayNumber,
        title: unusedPlace ? unusedPlace.name : `Day ${dayNumber}`,
        date,
        destination: unusedPlace || null,
        items: [] as ItineraryItem[],
      },
    ];
    commit(next);
    setSelectedDayId(id);
  }

  function requestDeleteDay(dayId: string) {
    if (normalized.length <= 1) {
      toastError('Keep at least one day');
      return;
    }
    setPendingConfirm({ kind: 'delete-day', dayId });
  }

  function deleteDay(dayId: string) {
    if (normalized.length <= 1) {
      toastError('Keep at least one day');
      return;
    }
    const prev = normalized;
    const next = prev
      .filter((d) => d.id !== dayId)
      .map((d, i) => ({ ...d, dayNumber: i + 1 }));
    commit(next);
    setSelectedDayId(next[0]?.id ?? null);
    toastSuccess('Day deleted', {
      action: {
        label: 'Undo',
        onClick: () => {
          commit(prev);
          setSelectedDayId(dayId);
        },
      },
    });
  }

  function duplicateDay(day: ItineraryDay) {
    const dayNumber = normalized.length + 1;
    const id = `d${Date.now()}`;
    const date = tripStartDate ? addDaysIso(tripStartDate, dayNumber - 1) : day.date;
    commit([
      ...normalized,
      {
        ...day,
        id,
        dayNumber,
        title: `${day.title} (copy)`,
        date,
        items: day.items.map((i) => ({ ...i, id: `i${Date.now()}-${i.id}` })),
      },
    ]);
    toastSuccess('Day duplicated');
  }

  function openBuildWizard() {
    setBuildNights(Math.max(1, defaultDayCount(tripStartDate, tripEndDate) - 1));
    setBuildPlaces(destinationRefs.length ? destinationRefs : []);
    setBuildMode(destinationRefs.length > 1 ? 'one-per-city' : 'stay-nights');
    setBuildDraftStory(!story || storyEssentialsScore(story).score === 0);
    setBuildWizardOpen(true);
  }

  useEffect(() => {
    if (autoOpenedBuildRef.current) return;
    const storyEmpty = !story || storyEssentialsScore(story).score === 0;
    const fresh = !daysHaveWork(normalized) && storyEmpty;
    if (!fresh) return;
    autoOpenedBuildRef.current = true;
    openBuildWizard();
    // Only auto-open once for a blank trip canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount/fresh gate
  }, [normalized, story, destinationRefs, tripStartDate, tripEndDate]);

  async function draftStoryFromPlaces(places: PlaceRef[]) {
    if (!onStoryChange) return;
    const placeIds = places
      .map((p) => p.placeId)
      .filter((id): id is string => Boolean(id));
    if (!placeIds.length) {
      toastError('Link places from the catalog so we can draft the story');
      return;
    }
    const nights = Math.max(1, Math.min(29, buildNights));
    const res = await api<{
      story: Partial<ItineraryStory> & {
        headline?: string;
        tagline?: string;
        highlights?: string[];
        bestTime?: string;
        weatherNote?: string;
        consultantNote?: string;
        packingTips?: string[];
        packingCategories?: PackingCategories;
        heroImageUrl?: string;
      };
      provenance: 'openai' | 'catalog';
      model?: string;
    }>('/ai/proposal-story', {
      method: 'POST',
      body: JSON.stringify({
        placeIds,
        placeNames: places.map((p) => p.name),
        startDate: tripStartDate || undefined,
        endDate: tripEndDate || undefined,
        nights,
        preferAi: true,
      }),
    });
    const seeded = res.story;
    onStoryChange({
      ...(story || emptyItineraryStory()),
      heroImageUrl: seeded.heroImageUrl ?? story?.heroImageUrl,
      headline: seeded.headline ?? story?.headline,
      tagline: seeded.tagline ?? story?.tagline,
      bestTime: seeded.bestTime ?? story?.bestTime,
      weatherNote: seeded.weatherNote ?? story?.weatherNote,
      consultantNote: seeded.consultantNote ?? story?.consultantNote,
      highlights: seeded.highlights ?? story?.highlights,
      packingTips: seeded.packingTips ?? story?.packingTips,
      packingCategories: seeded.packingCategories ?? story?.packingCategories,
    });
    return res.provenance;
  }

  function confirmBuildItinerary() {
    const places = buildPlaces.length ? buildPlaces : destinationRefs;
    if (!places.length) {
      toastError('Add at least one place');
      return;
    }
    const nights = Math.max(1, Math.min(29, buildNights));
    if (daysHaveWork(normalized)) {
      setPendingConfirm({
        kind: 'build-days',
        nights,
        places,
        mode: buildMode,
        draftStory: buildDraftStory,
      });
      return;
    }
    void runBuildItinerary(nights, places, buildMode, buildDraftStory);
  }

  async function runBuildItinerary(
    nights: number,
    places: PlaceRef[],
    mode: BuildItineraryMode,
    draftStory = false,
  ) {
    const dayCount = nights + 1;
    const next = buildItinerarySkeleton({
      dayCount,
      places,
      mode,
      tripStartDate,
    });
    commit(next);
    setSelectedDayId(next[0]?.id ?? null);
    setBuildWorking(true);
    try {
      if (draftStory && onStoryChange) {
        const provenance = await draftStoryFromPlaces(places);
        toastSuccess(
          provenance === 'openai'
            ? `${next.length} days ready · AI proposal story drafted`
            : `${next.length} days ready · proposal story drafted from catalog`,
        );
      } else {
        toastSuccess(`${next.length} days ready`);
      }
      setBuildWizardOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not draft proposal story');
      setBuildWizardOpen(false);
    } finally {
      setBuildWorking(false);
    }
  }

  function selectDay(id: string) {
    setSelectedDayId(id);
  }

  function applyItineraryBlock(block: ItineraryBlockRow, mode: 'replace' | 'append') {
    void (async () => {
      setApplyingBlockId(block.id);
      try {
        const previewDays = await loadTemplateDays(block);
        if (!previewDays?.length) {
          toastError('Template has no days to apply');
          return;
        }
        setPendingConfirm({
          kind: 'apply-template',
          block,
          mode,
          previewDays,
        });
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Could not load template');
      } finally {
        setApplyingBlockId(null);
      }
    })();
  }

  async function loadTemplateDays(block: ItineraryBlockRow): Promise<ItineraryDay[] | undefined> {
    try {
      const expanded = await api<{ days: ItineraryDay[] }>(
        `/itinerary-blocks/${block.id}/expand`,
      );
      return expanded.days;
    } catch {
      try {
        const applied = await api<{ days: ItineraryDay[] }>(
          `/itinerary-blocks/${block.id}/apply`,
          { method: 'POST', body: JSON.stringify({}) },
        );
        return applied.days;
      } catch {
        const detail = await api<ItineraryBlockRow>(`/itinerary-blocks/${block.id}`);
        return detail.contentJson?.days;
      }
    }
  }

  async function runApplyItineraryBlock(
    block: ItineraryBlockRow,
    mode: 'replace' | 'append' = 'replace',
    previewDays?: ItineraryDay[],
  ) {
    setApplyingBlockId(block.id);
    try {
      const days = previewDays || (await loadTemplateDays(block));
      if (!days?.length) {
        toastError('Template has no days to apply');
        return;
      }
      const incoming = normalizeDays(days, tripStartDate).map((d, i) => ({
        ...d,
        id: `d${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        items: d.items.map((item, j) => ({
          ...item,
          id: `i${Date.now()}-${i}-${j}`,
        })),
      }));
      let next: ItineraryDay[];
      if (mode === 'append') {
        const offset = tripStartDate ? normalized.length : 0;
        next = [
          ...normalized,
          ...incoming.map((d, i) => ({
            ...d,
            dayNumber: normalized.length + i + 1,
            date: tripStartDate
              ? addDaysIso(tripStartDate, offset + i)
              : d.date,
          })),
        ];
      } else {
        next = incoming.map((d, i) => ({
          ...d,
          dayNumber: i + 1,
          date: tripStartDate ? addDaysIso(tripStartDate, i) : d.date,
        }));
      }
      commit(next);
      setSelectedDayId(
        mode === 'append'
          ? incoming[0]?.id ?? next[0]?.id ?? null
          : next[0]?.id ?? null,
      );
      toastSuccess(
        mode === 'append'
          ? `Appended ${incoming.length} days from “${block.name}”`
          : `Applied template “${block.name}”`,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not apply template');
    } finally {
      setApplyingBlockId(null);
    }
  }

  async function saveAsTemplate() {
    const name = saveTemplateName.trim();
    if (!name) {
      toastError('Enter a template name');
      return;
    }
    setSavingTemplate(true);
    try {
      const created = await api<ItineraryBlockRow>('/itinerary-blocks', {
        method: 'POST',
        body: JSON.stringify({
          name,
          itemType: 'package',
          contentJson: toTemplateContentJson(normalized),
        }),
      });
      setItineraryBlocks((prev) => [created, ...prev]);
      setSaveTemplateOpen(false);
      setSaveTemplateName('');
      toastSuccess(`Saved “${name}” as package template`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save template');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleRestoreVersion(versionId: string) {
    if (!onRestoreVersion) return;
    setRestoringVersionId(versionId);
    try {
      await onRestoreVersion(versionId);
      toastSuccess('Version restored into a new draft');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not restore version');
    } finally {
      setRestoringVersionId(null);
    }
  }

  async function refreshFromGuide() {
    const catalogPlaceId = editing?.draft.details?.catalogPlaceId;
    if (!catalogPlaceId) return;
    setRefreshingGuide(true);
    try {
      const place = await loadPlace(catalogPlaceId);
      setEditing((ed) =>
        ed ? { ...ed, draft: refreshDraftFromGuide(ed.draft, place) } : ed,
      );
      toastSuccess('Snapshot refreshed from destination guide');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not refresh from guide');
    } finally {
      setRefreshingGuide(false);
    }
  }

  const draft = editing?.draft;
  const details = draft?.details || {};
  const timeFields = timeFieldsForType(draft?.type || 'sightseeing');
  const editingDay = editing ? normalized.find((d) => d.id === editing.dayId) : null;
  const guideCityPlaceId =
    toPlaceRef(draft?.location)?.placeId ||
    toPlaceRef(editingDay?.destination)?.placeId ||
    toPlaceRef(focusedDay?.destination)?.placeId ||
    undefined;
  const showDestinationGuide =
    draft?.type === 'sightseeing' || draft?.type === 'activity';
  const hotelPlaceFilterId =
    toPlaceRef(draft?.location)?.placeId ||
    toPlaceRef(editingDay?.destination)?.placeId ||
    toPlaceRef(focusedDay?.destination)?.placeId ||
    undefined;
  const suggestionPlace = placeName(draft?.location || editingDay?.destination);
  const sheetMealContext = mealContextFromDay(editingDay, editing?.itemId);
  const titleOptions = draft
    ? titleSuggestions(draft.type, {
        place: suggestionPlace || null,
        from: details.from,
        to: details.to,
        startTime: draft.startTime,
        landmark:
          details.catalogPlaceId &&
          (draft.type === 'sightseeing' || draft.type === 'activity')
            ? draft.title
            : undefined,
        hotelName:
          details.supplierId && draft.type === 'hotel' ? draft.title : undefined,
        mealContext: draft.type === 'meal' ? sheetMealContext : undefined,
      })
    : [];

  /** Auto-fill drive duration when transfer From/To places are set. */
  useEffect(() => {
    if (!sheetOpen || draft?.type !== 'transfer') return;
    const fromPlaceId = details.fromPlaceId?.trim();
    const toPlaceId = details.toPlaceId?.trim();
    if (!fromPlaceId || !toPlaceId || fromPlaceId === toPlaceId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const route = await api<{
            distanceKm: number | null;
            durationMin: number | null;
            source: string;
          }>(
            `/places/route?fromPlaceId=${encodeURIComponent(fromPlaceId)}&toPlaceId=${encodeURIComponent(toPlaceId)}`,
          );
          if (cancelled) return;
          if (route.durationMin == null && route.distanceKm == null) return;
          setEditing((ed) => {
            if (!ed || ed.draft.type !== 'transfer') return ed;
            if (
              ed.draft.details?.fromPlaceId !== fromPlaceId ||
              ed.draft.details?.toPlaceId !== toPlaceId
            ) {
              return ed;
            }
            return {
              ...ed,
              draft: withTransferDropOff({
                ...ed.draft,
                details: {
                  ...ed.draft.details,
                  driveDuration:
                    route.durationMin != null
                      ? formatDriveDuration(route.durationMin)
                      : ed.draft.details?.driveDuration,
                  distanceKm:
                    route.distanceKm != null
                      ? route.distanceKm
                      : ed.draft.details?.distanceKm,
                },
              }),
            };
          });
        } catch {
          // Keep manual duration; edge/google may be unavailable.
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sheetOpen, draft?.type, details.fromPlaceId, details.toPlaceId]);

  const journeyPlaces = useMemo(() => {
    const fromDays = normalized
      .map((d) => toPlaceRef(d.destination))
      .filter(Boolean) as PlaceRef[];
    if (fromDays.length) {
      const seen = new Set<string>();
      return fromDays.filter((p) => {
        const k = p.placeId || p.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return destinationRefs;
  }, [normalized, destinationRefs]);

  return (
    <div
      className={readOnly ? 'space-y-3 pointer-events-none select-none opacity-95' : 'space-y-3'}
      aria-disabled={readOnly || undefined}
    >
      {readOnly ? (
        <div className="pointer-events-auto rounded-xl border border-amber-300/50 bg-amber-50/50 px-3.5 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          Read-only — you don’t have permission to edit this itinerary.
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border glass">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Journey
            </div>
            {journeyPlaces.length ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm">
                {journeyPlaces.map((place, i) => (
                  <span key={`${place.placeId || place.name}-${i}`} className="flex items-center gap-1">
                    {i > 0 ? (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-foreground">
                      <MapPin className="size-3 text-primary" />
                      {place.name}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Set trip destinations, or add places on each itinerary item as you build.
              </p>
            )}
            {tripStartDate ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Starts {formatDayDate(tripStartDate) || tripStartDate}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openBuildWizard}>
              Build itinerary
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveTemplateName(journeyPlaces[0]?.name
                  ? `${journeyPlaces.map((p) => p.name).join(' / ')} package`
                  : 'Trip package');
                setSaveTemplateOpen(true);
              }}
            >
              Save as template
            </Button>
          </div>
        </div>
        {packageBlocks.length > 0 || blocksLoading ? (
          <div className="border-t border-border/50 px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <LayoutTemplate className="size-3.5" />
              Package templates
            </div>
            {blocksLoading ? (
              <p className="text-xs text-muted-foreground">Loading templates…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {packageBlocks.map((block) => {
                  const dayCount = block.contentJson?.days?.length || 0;
                  return (
                    <DropdownMenu key={block.id}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={applyingBlockId === block.id}
                        >
                          {applyingBlockId === block.id
                            ? 'Loading…'
                            : `${block.name}${dayCount ? ` · ${dayCount}d` : ''}`}
                          <ChevronDown className="size-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => void applyItineraryBlock(block, 'replace')}
                        >
                          Replace all days
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void applyItineraryBlock(block, 'append')}
                        >
                          Append days
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {onStoryChange ? (
        <ProposalStoryPanel
          story={story || {}}
          onChange={onStoryChange}
          days={normalized}
          tripId={tripId}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[168px_minmax(0,1fr)_200px]">
        <Card className="self-start lg:sticky lg:top-4">
          <CardContent className="space-y-1 p-3">
            <strong className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Days
            </strong>
            {normalized.map((d) => {
              const active = selectedDayId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDay(d.id)}
                  className={
                    active
                      ? 'flex w-full flex-col rounded-lg bg-primary px-2.5 py-2 text-left text-sm text-primary-foreground shadow-sm'
                      : 'flex w-full flex-col rounded-xl border px-2.5 py-2 text-left text-sm glass-row hover:border-primary/25'
                  }
                >
                  <span className="font-semibold">Day {d.dayNumber}</span>
                  <span
                    className={
                      active
                        ? 'truncate text-[11px] text-primary-foreground/85'
                        : 'truncate text-[11px] text-muted-foreground'
                    }
                  >
                    {d.title || `Day ${d.dayNumber}`}
                  </span>
                  {formatDayDate(d.date) ? (
                    <span
                      className={
                        active
                          ? 'text-[10px] text-primary-foreground/70'
                          : 'text-[10px] text-muted-foreground/80'
                      }
                    >
                      {formatDayDate(d.date)}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <Button variant="secondary" size="sm" className="mt-1.5 w-full" onClick={addDay}>
              <Plus className="size-3.5" />
              Add day
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {focusedDay ? (
            <Card className="border-primary/30 shadow-sm ring-1 ring-primary/20">
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Day {focusedDay.dayNumber}
                      </span>
                      {formatDayDate(focusedDay.date) ? (
                        <span className="text-xs text-muted-foreground">
                          {formatDayDate(focusedDay.date)}
                        </span>
                      ) : null}
                    </div>
                    <Input
                      value={focusedDay.title}
                      onChange={(e) =>
                        updateDay(focusedDay.id, { title: e.target.value })
                      }
                      className="h-8 max-w-md border-transparent bg-transparent px-0 font-display text-base font-bold shadow-none hover:border-border focus-visible:border-border focus-visible:bg-card"
                      placeholder="Day title (e.g. Arrive Goa)"
                      aria-label={`Day ${focusedDay.dayNumber} title`}
                    />
                    <div className="max-w-md">
                      <PlaceSinglePicker
                        label="Day destination"
                        value={focusedDay.destination}
                        onChange={(place) =>
                          updateDay(focusedDay.id, {
                            destination: place,
                            title:
                              !focusedDay.title.trim() ||
                              focusedDay.title === `Day ${focusedDay.dayNumber}`
                                ? place?.name || focusedDay.title
                                : focusedDay.title,
                          })
                        }
                        placeholder="City for this day…"
                      />
                    </div>
                  </div>
                  <DropdownMenuActions
                    onDuplicate={() => duplicateDay(focusedDay)}
                    onDelete={() => requestDeleteDay(focusedDay.id)}
                  />
                </div>

                <ul className="space-y-1.5">
                  {focusedDay.items.map((item, index) => {
                    const time = formatTimeRange(
                      item.startTime,
                      item.endTime,
                      item.type,
                    );
                    const fields = timeFieldsForType(item.type);
                    return (
                      <li
                        key={item.id}
                        draggable
                        onDragStart={() => setDragItemId(item.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragItemId) {
                            reorderItem(focusedDay.id, dragItemId, item.id);
                          }
                          setDragItemId(null);
                        }}
                        onDragEnd={() => setDragItemId(null)}
                        className="group flex gap-2 rounded-xl border px-2.5 py-2 transition-colors glass-row hover:border-primary/25"
                      >
                        <span
                          className="mt-1 cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
                          aria-hidden
                        >
                          <GripVertical className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge
                              value={item.type}
                              label={humanizeItemType(item.type)}
                            />
                            {item.customerVisible === false ? (
                              <span className="text-[11px] text-muted-foreground">
                                Internal
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Visible
                              </span>
                            )}
                          </div>
                          <Input
                            value={item.title}
                            onChange={(e) =>
                              updateItem(focusedDay.id, item.id, {
                                title: e.target.value,
                              })
                            }
                            className="h-8 border-transparent bg-transparent px-0 text-sm font-medium shadow-none hover:border-border focus-visible:border-border focus-visible:bg-card"
                            placeholder="Item title"
                            aria-label="Item title"
                          />
                          {fields.mode !== 'none' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <TimePicker
                                value={item.startTime || ''}
                                onChange={(startTime) => {
                                  const day = focusedDay;
                                  const patch: Partial<ItineraryItem> = {
                                    startTime,
                                    endTime:
                                      fields.mode === 'single' ? null : item.endTime,
                                  };
                                  if (item.type === 'transfer' && fields.mode === 'range') {
                                    const next = withTransferDropOff({
                                      ...item,
                                      startTime,
                                    });
                                    patch.endTime = next.endTime;
                                  }
                                  if (
                                    item.type === 'meal' &&
                                    isReplaceableTitle(item.title, item.type, {
                                      place: placeName(item.location || day.destination),
                                      startTime: item.startTime,
                                      mealContext: mealContextFromDay(day, item.id),
                                    })
                                  ) {
                                    patch.title = suggestItemTitle({
                                      type: 'meal',
                                      startTime,
                                      mealContext: mealContextFromDay(day, item.id),
                                    });
                                  }
                                  updateItem(focusedDay.id, item.id, patch);
                                }}
                                placeholder={fields.startLabel}
                              />
                              {fields.mode === 'range' ? (
                                <TimePicker
                                  value={item.endTime || ''}
                                  onChange={(endTime) =>
                                    updateItem(focusedDay.id, item.id, {
                                      endTime,
                                    })
                                  }
                                  placeholder={fields.endLabel || 'End'}
                                />
                              ) : null}
                              {time ? (
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {time}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {item.location ? (
                            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin className="size-3 shrink-0" />
                              {placeName(item.location)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => moveItem(focusedDay.id, index, -1)}
                          >
                            <ChevronUp className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label="Move down"
                            disabled={index === focusedDay.items.length - 1}
                            onClick={() => moveItem(focusedDay.id, index, 1)}
                          >
                            <ChevronDown className="size-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                aria-label="Item actions"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEdit(focusedDay.id, item)}
                              >
                                Edit details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  duplicateItem(focusedDay.id, item)
                                }
                              >
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  deleteItem(focusedDay.id, item.id)
                                }
                              >
                                <Trash2 className="size-3.5" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {focusedDay.items.length === 0 ? (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Add an item, or pick from the destination guide.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openAdd(focusedDay.id)}
                  >
                    <Plus className="size-3.5" />
                    Add item
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openGuidePicker(focusedDay.id)}
                  >
                    <MapPin className="size-3.5" />
                    From guide
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Add a day to start building the itinerary.
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="self-start lg:sticky lg:top-4">
          <CardContent className="space-y-3 p-4">
            <strong className="text-sm">Auto-save</strong>
            <p className="text-xs text-muted-foreground">
              Changes save to the current draft automatically. Use a checkpoint when you want a
              named snapshot in history.
            </p>
            <div
              className={
                saveState === 'error'
                  ? 'rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive'
                  : 'rounded-xl border px-2.5 py-2 text-xs text-muted-foreground glass-well'
              }
            >
              {saveState === 'pending'
                ? 'Unsaved changes…'
                : saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved'
                    ? `Saved${savedAt ? ` · ${formatTime(savedAt)}` : ''}`
                    : saveState === 'error'
                      ? 'Auto-save failed — try again or save a checkpoint'
                      : 'Edits auto-save after a short pause'}
            </div>
            <Button className="w-full" onClick={onSaveCheckpoint} disabled={saving}>
              {saving ? 'Saving…' : 'Save checkpoint'}
            </Button>
            {tripId ? (
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    void (async () => {
                      await onPreparePreview?.();
                      navigate(`/trips/${tripId}/itinerary/preview`);
                    })();
                  }}
                >
                  <Eye className="size-4" />
                  Client preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    void (async () => {
                      await onPreparePreview?.();
                      navigate(`/trips/${tripId}/itinerary/preview?share=1`);
                    })();
                  }}
                >
                  <Share2 className="size-4" />
                  Share…
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Versions:{' '}
              {(versions || []).map((v) => `v${v.versionNumber}`).join(', ') || '—'}
            </p>
            {onRestoreVersion && (versions || []).length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={Boolean(restoringVersionId)}
                  >
                    {restoringVersionId ? 'Restoring…' : 'Restore version…'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-auto">
                  {(versions || []).map((v) => (
                    <DropdownMenuItem
                      key={v.id}
                      onClick={() => void handleRestoreVersion(v.id)}
                    >
                      v{v.versionNumber}
                      {v.label ? ` · ${v.label}` : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <RecordSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditing(null);
        }}
        title={editing?.itemId ? 'Edit details' : 'Add itinerary item'}
        description="Rich fields for the customer proposal — title and times can also be edited inline."
        submitLabel={editing?.itemId ? 'Save item' : 'Add item'}
        onSubmit={saveItem}
      >
        {draft ? (
          <div className="space-y-3">
            <FormField label="Title" required>
              <Input
                value={draft.title}
                onChange={(e) =>
                  setEditing((ed) =>
                    ed ? { ...ed, draft: { ...ed.draft, title: e.target.value } } : ed,
                  )
                }
                placeholder="e.g. Sunset cruise / Hotel check-in"
                autoComplete="off"
                autoFocus
                required
              />
              {draft.type === 'meal' ||
              draft.type === 'hotel' ||
              draft.type === 'transfer' ? null : (
                <div className="mt-2">
                  <SuggestionChips
                    aria-label="Title suggestions"
                    allowDeselect={false}
                    options={titleOptions.slice(0, 6).map((t) => ({ value: t, label: t }))}
                    value={titleOptions.includes(draft.title) ? draft.title : ''}
                    onChange={(title) =>
                      setEditing((ed) => (ed ? { ...ed, draft: { ...ed.draft, title } } : ed))
                    }
                  />
                </div>
              )}
            </FormField>
            <FormField label="Type">
              <SuggestionChips
                aria-label="Item type"
                allowDeselect={false}
                options={ITEM_TYPES}
                value={draft.type}
                onChange={(type) =>
                  setEditing((ed) => {
                    if (!ed) return ed;
                    const nextMode = timeFieldsForType(type).mode;
                    const patched: ItineraryItem = {
                      ...ed.draft,
                      type,
                      details: mapDetailsForTypeChange(
                        ed.draft.type,
                        type,
                        ed.draft.details,
                      ),
                      startTime: nextMode === 'none' ? '' : ed.draft.startTime,
                      endTime: nextMode === 'range' ? ed.draft.endTime : '',
                    };
                    return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                  })
                }
              />
            </FormField>
            {draft.type === 'meal' ? (
              <FormField label="Meal">
                <SuggestionChips
                  aria-label="Meal kind"
                  allowDeselect={false}
                  options={MEAL_KIND_OPTIONS.map((m) => ({
                    value: m.value,
                    label: m.label,
                  }))}
                  value={mealLabelForTime(draft.startTime)}
                  onChange={(kind) =>
                    setEditing((ed) => {
                      if (!ed) return ed;
                      const opt = MEAL_KIND_OPTIONS.find((m) => m.value === kind);
                      const startTime = opt?.startTime || ed.draft.startTime || '13:00';
                      const mealCtx = mealContextFromDay(editingDay, ed.itemId);
                      const patched: ItineraryItem = {
                        ...ed.draft,
                        startTime,
                        endTime: '',
                        title: suggestItemTitle({
                          type: 'meal',
                          startTime,
                          mealContext: mealCtx,
                        }),
                      };
                      return { ...ed, draft: patched };
                    })
                  }
                />
              </FormField>
            ) : null}
            {draft.type === 'transfer' ? (
              <div className="space-y-3">
                <FormGrid>
                  <PlaceField
                    label="From"
                    value={
                      details.fromPlaceId
                        ? { placeId: details.fromPlaceId, name: details.from || '' }
                        : details.from || null
                    }
                    onChange={(place) =>
                      setEditing((ed) => {
                        if (!ed) return ed;
                        const patched: ItineraryItem = {
                          ...ed.draft,
                          details: {
                            ...ed.draft.details,
                            from: place?.name || undefined,
                            fromPlaceId: place?.placeId || undefined,
                          },
                          location: ed.draft.details?.toPlaceId
                            ? ed.draft.location
                            : place,
                        };
                        return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                      })
                    }
                    placeholder="Pickup place"
                    onCreateNew={(q) => openCreatePlace(q)}
                  />
                  <PlaceField
                    label="To"
                    value={
                      details.toPlaceId
                        ? { placeId: details.toPlaceId, name: details.to || '' }
                        : details.to || null
                    }
                    onChange={(place) =>
                      setEditing((ed) => {
                        if (!ed) return ed;
                        const patched: ItineraryItem = {
                          ...ed.draft,
                          location: place || ed.draft.location,
                          details: {
                            ...ed.draft.details,
                            to: place?.name || undefined,
                            toPlaceId: place?.placeId || undefined,
                          },
                        };
                        return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                      })
                    }
                    placeholder="Drop-off place"
                    onCreateNew={(q) => openCreatePlace(q)}
                  />
                </FormGrid>
                <FormGrid>
                  <FormField label="Pickup">
                    <TimePicker
                      value={draft.startTime || ''}
                      onChange={(startTime) =>
                        setEditing((ed) => {
                          if (!ed) return ed;
                          return {
                            ...ed,
                            draft: withTransferDropOff({ ...ed.draft, startTime }),
                          };
                        })
                      }
                      placeholder="Pickup"
                    />
                  </FormField>
                  <FormField label="Drop-off">
                    <TimePicker
                      value={draft.endTime || ''}
                      onChange={(endTime) =>
                        setEditing((ed) =>
                          ed ? { ...ed, draft: { ...ed.draft, endTime } } : ed,
                        )
                      }
                      placeholder="Drop-off"
                    />
                  </FormField>
                </FormGrid>
                <VehicleTypeField
                  valueId={details.vehicleTypeId}
                  valueName={details.vehicle}
                  onChange={(next) =>
                    setEditing((ed) => {
                      if (!ed) return ed;
                      const patched: ItineraryItem = {
                        ...ed.draft,
                        details: {
                          ...ed.draft.details,
                          vehicleTypeId: next.vehicleTypeId,
                          vehicle: next.vehicle,
                          seats:
                            next.seats != null
                              ? next.seats
                              : next.vehicle
                                ? ed.draft.details?.seats
                                : undefined,
                          ...(next.imageUrl && !ed.draft.details?.imageUrl
                            ? { imageUrl: next.imageUrl }
                            : {}),
                        },
                      };
                      return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                    })
                  }
                  onCreateNew={(q) => openCreateVehicleType(q)}
                />
                {details.seats != null ? (
                  <p className="-mt-1 text-[11px] text-muted-foreground">
                    {details.seats} seats · from vehicle catalog
                  </p>
                ) : null}
                <FormField label="Drive duration">
                  <Input
                    value={details.driveDuration || ''}
                    onChange={(e) =>
                      setEditing((ed) => {
                        if (!ed) return ed;
                        return {
                          ...ed,
                          draft: withTransferDropOff({
                            ...ed.draft,
                            details: {
                              ...ed.draft.details,
                              driveDuration: e.target.value || undefined,
                            },
                          }),
                        };
                      })
                    }
                    placeholder="Auto from route · or e.g. 3h 20m"
                  />
                  {details.distanceKm != null ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ~{details.distanceKm} km
                    </p>
                  ) : details.fromPlaceId && details.toPlaceId ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Duration fills from route knowledge or Google when available.
                    </p>
                  ) : null}
                </FormField>
                <FormField label="Includes (comma-separated)">
                  <Input
                    value={(details.includes || []).join(', ')}
                    onChange={(e) =>
                      setEditing((ed) =>
                        ed
                          ? {
                              ...ed,
                              draft: {
                                ...ed.draft,
                                details: {
                                  ...ed.draft.details,
                                  includes: e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              },
                            }
                          : ed,
                      )
                    }
                    placeholder="Driver, Fuel, Toll, Parking"
                  />
                </FormField>
              </div>
            ) : null}
            {draft.type === 'transfer' ? null : timeFields.mode === 'none' ? null : timeFields.mode === 'single' ? (
              <FormField label={timeFields.startLabel}>
                <TimePicker
                  value={draft.startTime || ''}
                  onChange={(startTime) =>
                    setEditing((ed) => {
                      if (!ed) return ed;
                      const patched = { ...ed.draft, startTime, endTime: '' };
                      return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                    })
                  }
                  placeholder="Time"
                />
              </FormField>
            ) : (
              <FormGrid>
                <FormField label={timeFields.startLabel}>
                  <TimePicker
                    value={draft.startTime || ''}
                    onChange={(startTime) =>
                      setEditing((ed) => {
                        if (!ed) return ed;
                        const patched = { ...ed.draft, startTime };
                        return {
                          ...ed,
                          draft: withTransferDropOff(patched),
                        };
                      })
                    }
                    placeholder={timeFields.startLabel}
                  />
                </FormField>
                <FormField label={timeFields.endLabel || 'End time'}>
                  <TimePicker
                    value={draft.endTime || ''}
                    onChange={(endTime) =>
                      setEditing((ed) =>
                        ed ? { ...ed, draft: { ...ed.draft, endTime } } : ed,
                      )
                    }
                    placeholder={timeFields.endLabel || 'End'}
                  />
                </FormField>
              </FormGrid>
            )}
            {draft.type === 'transfer' ? null : (
              <PlaceField
                label="Location"
                value={draft.location}
                onChange={(location) =>
                  setEditing((ed) => {
                    if (!ed) return ed;
                    const patched = { ...ed.draft, location };
                    return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                  })
                }
                placeholder="Hotel / venue / city"
                onCreateNew={(q) => openCreatePlace(q)}
              />
            )}

            {draft.type === 'hotel' ? (
              <div className="space-y-2 rounded-xl border border-dashed border-primary/25 bg-primary/5 p-3">
                <HotelSupplierField
                  valueId={details.supplierId}
                  valueName={
                    details.supplierId
                      ? hotelSupplierCache.get(details.supplierId)?.name || draft.title
                      : undefined
                  }
                  placeId={hotelPlaceFilterId}
                  checkIn={editingDay?.date || tripStartDate || null}
                  checkOut={
                    editingDay?.date
                      ? addDaysIso(editingDay.date, 1)
                      : tripEndDate || tripStartDate || null
                  }
                  onPick={(supplier) => {
                    setEditing((ed) =>
                      ed
                        ? { ...ed, draft: applyHotelSupplierToDraft(ed.draft, supplier) }
                        : ed,
                    );
                    toastSuccess(`Loaded hotel: ${supplier.name}`);
                  }}
                  onClear={() =>
                    setEditing((ed) =>
                      ed
                        ? {
                            ...ed,
                            draft: {
                              ...ed.draft,
                              details: {
                                ...ed.draft.details,
                                supplierId: undefined,
                                catalogProvenance: undefined,
                              },
                            },
                          }
                        : ed,
                    )
                  }
                  onCreateNew={(q) => openCreateHotel(q)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Pick a hotel supplier — title, photos, ratings, maps and amenities come from that
                  record. Only nights and room are set on this trip item.
                </p>
                {details.supplierId ? (
                  <div className="rounded-lg border border-border/60 bg-card/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                    {[
                      details.stars != null ? `${details.stars}★` : null,
                      details.googleRating != null
                        ? `${details.googleRating}${
                            details.googleReviewCount != null
                              ? ` (${details.googleReviewCount})`
                              : ''
                          }`
                        : null,
                      details.checkIn || details.checkOut
                        ? `In ${details.checkIn || '—'} · Out ${details.checkOut || '—'}`
                        : null,
                      details.distanceHint || null,
                      details.amenities?.length
                        ? details.amenities.slice(0, 4).join(', ')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Supplier details loaded for the proposal'}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showDestinationGuide ? (
              <div className="space-y-2 rounded-xl border border-dashed border-primary/25 bg-primary/5 p-3">
                <CatalogLandmarkPicker
                  cityPlaceId={guideCityPlaceId}
                  onPick={(place) => {
                    setEditing((ed) =>
                      ed ? { ...ed, draft: applyPlaceSnapshotToDraft(ed.draft, place) } : ed,
                    );
                    toastSuccess(`Loaded from destination guide: ${place.name}`);
                  }}
                />
                {details.catalogPlaceId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Linked to catalog · {details.catalogProvenance || 'guide'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={refreshingGuide}
                      onClick={() => void refreshFromGuide()}
                    >
                      <RefreshCw className="size-3.5" />
                      {refreshingGuide ? 'Refreshing…' : 'Refresh from guide'}
                    </Button>
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Story, photos, maps and tips come from the destination guide — edit them there.
                  Here set title, times and notes for this trip.
                </p>
                {details.catalogPlaceId ? (
                  <div className="rounded-lg border border-border/60 bg-card/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                    {[
                      draft.description
                        ? draft.description.length > 90
                          ? `${draft.description.slice(0, 90)}…`
                          : draft.description
                        : null,
                      details.bestVisitTime ? `Best: ${details.bestVisitTime}` : null,
                      details.googleRating != null
                        ? `${details.googleRating}${
                            details.googleReviewCount != null
                              ? ` (${details.googleReviewCount})`
                              : ''
                          }`
                        : null,
                      details.imageUrl || (details.imageUrls?.length ?? 0) > 0
                        ? 'Photos linked'
                        : null,
                      details.googleMapsUrl ? 'Maps linked' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Guide details loaded for the proposal'}
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.type === 'transfer' ||
            draft.type === 'hotel' ||
            draft.type === 'meal' ||
            draft.type === 'sightseeing' ||
            draft.type === 'activity' ? null : (
            <FormField label="Customer description">
              <textarea
                className="flex min-h-[72px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={draft.description || ''}
                onChange={(e) =>
                  setEditing((ed) =>
                    ed
                      ? { ...ed, draft: { ...ed.draft, description: e.target.value } }
                      : ed,
                  )
                }
                placeholder="Short line shown on the customer proposal"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tell the story — not the schedule. Shown under the item on share &amp; PDF.
              </p>
            </FormField>
            )}

            {draft.type === 'hotel' ? (
              <div className="space-y-3">
                <FormGrid>
                  <FormField label="Nights">
                    <Input
                      type="number"
                      min={1}
                      value={details.nights ?? ''}
                      onChange={(e) =>
                        setEditing((ed) =>
                          ed
                            ? {
                                ...ed,
                                draft: {
                                  ...ed.draft,
                                  details: {
                                    ...ed.draft.details,
                                    nights: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                },
                              }
                            : ed,
                        )
                      }
                      placeholder="1"
                    />
                  </FormField>
                  <RoomTypeField
                    value={details.roomType}
                    onChange={(roomType) =>
                      setEditing((ed) =>
                        ed
                          ? {
                              ...ed,
                              draft: {
                                ...ed.draft,
                                details: { ...ed.draft.details, roomType },
                              },
                            }
                          : ed,
                      )
                    }
                    onCreateNew={(q) => openCreateRoomType(q)}
                  />
                </FormGrid>
              </div>
            ) : null}

            {draft.type === 'flight' ? (
              <div className="space-y-3">
                <FormField label="Flight number">
                  <Input
                    value={details.flightNumber || ''}
                    onChange={(e) =>
                      setEditing((ed) =>
                        ed
                          ? {
                              ...ed,
                              draft: {
                                ...ed.draft,
                                details: { ...ed.draft.details, flightNumber: e.target.value },
                              },
                            }
                          : ed,
                      )
                    }
                    placeholder="AI 802"
                  />
                </FormField>
                <FormGrid>
                  <FormField label="From">
                    <Input
                      value={details.from || ''}
                      onChange={(e) =>
                        setEditing((ed) => {
                          if (!ed) return ed;
                          const patched: ItineraryItem = {
                            ...ed.draft,
                            details: { ...ed.draft.details, from: e.target.value },
                          };
                          return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                        })
                      }
                      placeholder="DEL"
                    />
                  </FormField>
                  <FormField label="To">
                    <Input
                      value={details.to || ''}
                      onChange={(e) =>
                        setEditing((ed) => {
                          if (!ed) return ed;
                          const patched: ItineraryItem = {
                            ...ed.draft,
                            details: { ...ed.draft.details, to: e.target.value },
                          };
                          return {
                      ...ed,
                      draft: retitleIfNeeded(ed.draft, patched, sheetMealContext),
                    };
                        })
                      }
                      placeholder="GOI"
                    />
                  </FormField>
                </FormGrid>
              </div>
            ) : null}

            <FormField label="Notes (client-visible)">
              <Input
                value={draft.notes || ''}
                onChange={(e) =>
                  setEditing((ed) =>
                    ed ? { ...ed, draft: { ...ed.draft, notes: e.target.value } } : ed,
                  )
                }
                placeholder="What the traveller should know"
              />
            </FormField>
            <FormField label="Internal notes">
              <Input
                value={draft.internalNotes || ''}
                onChange={(e) =>
                  setEditing((ed) =>
                    ed ? { ...ed, draft: { ...ed.draft, internalNotes: e.target.value } } : ed,
                  )
                }
                placeholder="Staff-only"
              />
            </FormField>
            <FormField label="Visibility">
              <SuggestionChips
                aria-label="Customer visibility"
                allowDeselect={false}
                options={[
                  { value: 'visible', label: 'Client visible' },
                  { value: 'internal', label: 'Internal only' },
                ]}
                value={draft.customerVisible === false ? 'internal' : 'visible'}
                onChange={(v) =>
                  setEditing((ed) =>
                    ed
                      ? {
                          ...ed,
                          draft: { ...ed.draft, customerVisible: v !== 'internal' },
                        }
                      : ed,
                  )
                }
              />
            </FormField>
          </div>
        ) : null}
      </RecordSheet>

      <RecordDialog
        open={placeOpen}
        onOpenChange={(next) => {
          setPlaceOpen(next);
          if (!next) setPlaceErrors({});
        }}
        title="Add place"
        description="Saved to your agency place list for reuse on inquiries and itineraries."
        submitLabel="Add place"
        submitting={placeSubmitting}
        onSubmit={createPlace}
      >
        <FormField label="Place name" required error={placeErrors.name}>
          <Input
            value={placeForm.name}
            onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })}
            placeholder="e.g. Goa"
            aria-invalid={Boolean(placeErrors.name)}
          />
        </FormField>
        <FormField label="Country" error={placeErrors.country}>
          <Input
            value={placeForm.country}
            onChange={(e) => setPlaceForm({ ...placeForm, country: e.target.value })}
            placeholder="India"
          />
        </FormField>
        <FormField label="Region" error={placeErrors.region}>
          <Input
            value={placeForm.region}
            onChange={(e) => setPlaceForm({ ...placeForm, region: e.target.value })}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Scope">
          <SuggestionChips
            aria-label="Place scope"
            allowDeselect={false}
            options={[
              { value: 'domestic', label: 'Domestic' },
              { value: 'international', label: 'International' },
            ]}
            value={placeForm.domesticOrIntl}
            onChange={(domesticOrIntl) =>
              setPlaceForm({
                ...placeForm,
                domesticOrIntl: domesticOrIntl as 'domestic' | 'international',
              })
            }
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={roomTypeOpen}
        onOpenChange={(next) => {
          setRoomTypeOpen(next);
          if (!next) setRoomTypeErrors({});
        }}
        title="Add room type"
        description="Saved to your agency catalog for reuse on hotel stays."
        submitLabel="Add room type"
        submitting={roomTypeSubmitting}
        onSubmit={createRoomType}
      >
        <FormField label="Room type" required error={roomTypeErrors.name}>
          <Input
            value={roomTypeForm.name}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
            placeholder="e.g. Lake View Deluxe"
            aria-invalid={Boolean(roomTypeErrors.name)}
          />
        </FormField>
        <FormField label="Description" error={roomTypeErrors.description}>
          <Input
            value={roomTypeForm.description}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
            placeholder="Optional notes (occupancy, view, bed type)"
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={hotelOpen}
        onOpenChange={setHotelOpen}
        title="Add hotel supplier"
        description="Saved to your agency supplier list for stays on future trips."
        submitLabel={hotelSubmitting ? 'Saving…' : 'Add hotel'}
        submitting={hotelSubmitting}
        onSubmit={() => void createHotelSupplier()}
      >
        <FormField label="Hotel name" required>
          <Input
            value={hotelForm.name}
            onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })}
            placeholder="e.g. Kalimpong Mountain Lodge"
          />
        </FormField>
        <FormField label="Stay type">
          <SuggestionChips
            aria-label="Stay type"
            allowDeselect={false}
            options={[
              { value: 'hotel', label: 'Hotel' },
              { value: 'homestay', label: 'Homestay' },
              { value: 'farmstay', label: 'Farmstay' },
            ]}
            value={hotelForm.type}
            onChange={(type) => setHotelForm({ ...hotelForm, type })}
          />
        </FormField>
        <PlaceField
          label="Near place"
          value={hotelForm.place}
          onChange={(place) => setHotelForm({ ...hotelForm, place })}
          placeholder="City / area"
          onCreateNew={(q) => openCreatePlace(q)}
        />
        <FormField label="Cover photo URL">
          <Input
            value={hotelForm.imageUrl}
            onChange={(e) => setHotelForm({ ...hotelForm, imageUrl: e.target.value })}
            placeholder="https://…"
          />
        </FormField>
        <FormField label="Gallery photos (one URL per line)">
          <textarea
            className="flex min-h-[64px] w-full rounded-xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={hotelForm.imageUrls}
            onChange={(e) => setHotelForm({ ...hotelForm, imageUrls: e.target.value })}
            placeholder={'https://…\nhttps://…'}
          />
        </FormField>
        <FormField label="Amenities (comma-separated)">
          <Input
            value={hotelForm.amenities}
            onChange={(e) => setHotelForm({ ...hotelForm, amenities: e.target.value })}
            placeholder="WiFi, Breakfast, Mountain view"
          />
        </FormField>
        <FormField label="Room types (comma-separated)">
          <Input
            value={hotelForm.roomHints}
            onChange={(e) => setHotelForm({ ...hotelForm, roomHints: e.target.value })}
            placeholder="Deluxe, Suite"
          />
        </FormField>
        <FormGrid>
          <FormField label="Stars">
            <Input
              type="number"
              min={1}
              max={5}
              value={hotelForm.stars}
              onChange={(e) => setHotelForm({ ...hotelForm, stars: e.target.value })}
              placeholder="4"
            />
          </FormField>
          <FormField label="Google rating">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={hotelForm.googleRating}
              onChange={(e) => setHotelForm({ ...hotelForm, googleRating: e.target.value })}
              placeholder="4.5"
            />
          </FormField>
          <FormField label="Google review count">
            <Input
              type="number"
              min={0}
              value={hotelForm.googleReviewCount}
              onChange={(e) =>
                setHotelForm({ ...hotelForm, googleReviewCount: e.target.value })
              }
              placeholder="1287"
            />
          </FormField>
        </FormGrid>
        <FormField label="Google Maps URL">
          <Input
            value={hotelForm.googleMapsUrl}
            onChange={(e) => setHotelForm({ ...hotelForm, googleMapsUrl: e.target.value })}
            placeholder="https://maps.google.com/…"
          />
        </FormField>
        <FormField label="Review snippet">
          <Input
            value={hotelForm.reviewSnippet}
            onChange={(e) => setHotelForm({ ...hotelForm, reviewSnippet: e.target.value })}
            placeholder="“Rooms were spotless…”"
          />
        </FormField>
        <FormGrid>
          <FormField label="Check-in">
            <Input
              value={hotelForm.checkIn}
              onChange={(e) => setHotelForm({ ...hotelForm, checkIn: e.target.value })}
              placeholder="2:00 PM"
            />
          </FormField>
          <FormField label="Check-out">
            <Input
              value={hotelForm.checkOut}
              onChange={(e) => setHotelForm({ ...hotelForm, checkOut: e.target.value })}
              placeholder="11:00 AM"
            />
          </FormField>
        </FormGrid>
        <FormField label="Distance hint">
          <Input
            value={hotelForm.distanceHint}
            onChange={(e) => setHotelForm({ ...hotelForm, distanceHint: e.target.value })}
            placeholder="500m from Mall Road"
          />
        </FormField>
      </RecordDialog>

      <RecordDialog
        open={vehicleTypeOpen}
        onOpenChange={(next) => {
          setVehicleTypeOpen(next);
          if (!next) setVehicleTypeErrors({});
        }}
        title="Add vehicle type"
        description="Saved to your agency catalog for reuse on transfers."
        submitLabel="Add vehicle type"
        submitting={vehicleTypeSubmitting}
        onSubmit={createVehicleType}
      >
        <FormField label="Vehicle type" required error={vehicleTypeErrors.name}>
          <Input
            value={vehicleTypeForm.name}
            onChange={(e) => setVehicleTypeForm({ ...vehicleTypeForm, name: e.target.value })}
            placeholder="e.g. Innova Crysta"
            aria-invalid={Boolean(vehicleTypeErrors.name)}
          />
        </FormField>
        <FormField label="Seats" error={vehicleTypeErrors.seats}>
          <Input
            type="number"
            min={1}
            value={vehicleTypeForm.seats}
            onChange={(e) => setVehicleTypeForm({ ...vehicleTypeForm, seats: e.target.value })}
            placeholder="6"
          />
        </FormField>
        <FormField label="Description" error={vehicleTypeErrors.description}>
          <Input
            value={vehicleTypeForm.description}
            onChange={(e) =>
              setVehicleTypeForm({ ...vehicleTypeForm, description: e.target.value })
            }
            placeholder="Optional notes (AC, hills, airport)"
          />
        </FormField>
      </RecordDialog>

      <ConfirmDialog
        open={pendingConfirm != null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
        title={
          pendingConfirm?.kind === 'apply-template'
            ? pendingConfirm.mode === 'append'
              ? `Append “${pendingConfirm.block.name}”?`
              : `Replace with “${pendingConfirm.block.name}”?`
            : pendingConfirm?.kind === 'delete-day'
              ? 'Delete this day?'
              : 'Replace itinerary days?'
        }
        description={
          pendingConfirm?.kind === 'apply-template'
            ? pendingConfirm.mode === 'append'
              ? `Adds ${pendingConfirm.previewDays?.length || 0} day(s)${
                  pendingConfirm.previewDays?.length
                    ? `: ${pendingConfirm.previewDays
                        .map((d) => d.title)
                        .slice(0, 4)
                        .join(', ')}${
                        pendingConfirm.previewDays.length > 4 ? '…' : ''
                      }`
                    : ''
                } after the current itinerary.`
              : `Replaces all days with ${pendingConfirm.previewDays?.length || 0} template day(s)${
                  pendingConfirm.previewDays?.length
                    ? ` (${pendingConfirm.previewDays
                        .map((d) => d.title)
                        .slice(0, 4)
                        .join(', ')}${
                        pendingConfirm.previewDays.length > 4 ? '…' : ''
                      })`
                    : ''
                }.`
            : pendingConfirm?.kind === 'delete-day'
              ? 'You can undo from the toast right after deleting.'
              : 'This replaces the current itinerary with a new day skeleton (destinations set on each day).'
        }
        confirmLabel={
          pendingConfirm?.kind === 'apply-template'
            ? pendingConfirm.mode === 'append'
              ? 'Append days'
              : 'Replace all'
            : pendingConfirm?.kind === 'delete-day'
              ? 'Delete day'
              : 'Build itinerary'
        }
        destructive={
          pendingConfirm?.kind === 'delete-day' ||
          (pendingConfirm?.kind === 'apply-template' &&
            pendingConfirm.mode === 'replace') ||
          pendingConfirm?.kind === 'build-days'
        }
        loading={
          pendingConfirm?.kind === 'apply-template' &&
          applyingBlockId === pendingConfirm.block.id
        }
        onConfirm={() => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          if (!pending) return;
          if (pending.kind === 'build-days') {
            void runBuildItinerary(
              pending.nights,
              pending.places,
              pending.mode,
              pending.draftStory,
            );
          } else if (pending.kind === 'delete-day') {
            deleteDay(pending.dayId);
          } else {
            void runApplyItineraryBlock(
              pending.block,
              pending.mode,
              pending.previewDays,
            );
          }
        }}
      />

      <RecordDialog
        open={buildWizardOpen}
        onOpenChange={setBuildWizardOpen}
        title="Start this trip"
        description="Confirm places and nights — we’ll scaffold days and can draft the proposal story from destination knowledge."
        submitLabel={
          buildWorking
            ? 'Building…'
            : buildDraftStory
              ? 'Build days & story'
              : 'Build days'
        }
        submitting={buildWorking}
        onSubmit={confirmBuildItinerary}
      >
        <div className="space-y-3">
          {tripStartDate || tripEndDate ? (
            <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Trip dates:{' '}
              <span className="font-medium text-foreground">
                {[formatDayDate(tripStartDate), formatDayDate(tripEndDate)]
                  .filter(Boolean)
                  .join(' → ') || '—'}
              </span>
              {tripStartDate && tripEndDate
                ? ` · ${defaultDayCount(tripStartDate, tripEndDate) - 1} nights suggested`
                : ''}
            </p>
          ) : null}
          <FormField label="Nights">
            <Input
              type="number"
              min={1}
              max={29}
              value={buildNights}
              onChange={(e) =>
                setBuildNights(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Creates {buildNights + 1} days
              {tripStartDate && tripEndDate
                ? ` (trip dates suggest ${defaultDayCount(tripStartDate, tripEndDate) - 1} nights)`
                : ''}
              .
            </p>
          </FormField>
          <PlaceMultiPicker
            label="Places"
            value={buildPlaces}
            onChange={setBuildPlaces}
            placeholder="Cities for this trip…"
          />
          <FormField label="Structure">
            <SuggestionChips
              aria-label="Build mode"
              allowDeselect={false}
              options={[
                { value: 'stay-nights', label: 'Stay nights, then hops' },
                { value: 'one-per-city', label: 'One day per city' },
              ]}
              value={buildMode}
              onChange={(v) => setBuildMode(v as BuildItineraryMode)}
            />
          </FormField>
          {onStoryChange ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-sm">
              <Checkbox
                checked={buildDraftStory}
                onCheckedChange={(v) => setBuildDraftStory(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">
                  Draft proposal story with AI
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Uses OpenAI when configured, grounded in destination catalog facts.
                  Falls back to catalog-only draft if the key is missing. Always editable.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      </RecordDialog>

      <RecordDialog
        open={guidePickerOpen}
        onOpenChange={(open) => {
          setGuidePickerOpen(open);
          if (!open) setGuidePickerDayId(null);
        }}
        title="Add from destination guide"
        description="Pick a landmark — we set the snapshot and location on an activity."
        submitLabel="Close"
        onSubmit={() => setGuidePickerOpen(false)}
      >
        <CatalogLandmarkPicker
          label="Search destination guide"
          cityPlaceId={
            toPlaceRef(
              normalized.find((d) => d.id === guidePickerDayId)?.destination ||
                focusedDay?.destination,
            )?.placeId || undefined
          }
          onPick={(place) => void addFromGuide(place)}
        />
      </RecordDialog>

      <RecordDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        title="Save as package template"
        description="Reuse this day structure on other trips (place IDs refresh from the guide on apply)."
        submitLabel={savingTemplate ? 'Saving…' : 'Save template'}
        submitting={savingTemplate}
        onSubmit={() => void saveAsTemplate()}
      >
        <FormField label="Template name" required>
          <Input
            value={saveTemplateName}
            onChange={(e) => setSaveTemplateName(e.target.value)}
            placeholder="e.g. North Bengal 3N/4D hills"
          />
        </FormField>
      </RecordDialog>
    </div>
  );
}

function DropdownMenuActions({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Day actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDuplicate}>Duplicate day</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete}>
          <Trash2 className="size-3.5" />
          Delete day
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Normalize loaded content before first paint / save. */
export function ensureItineraryDays(
  raw: ItineraryDay[] | undefined,
  tripStartDate?: string | null,
): ItineraryDay[] {
  return normalizeDays(raw, tripStartDate);
}

export function emptyItineraryStory(): ItineraryStory {
  return {
    highlights: [],
    packingTips: [],
    packingCategories: {
      clothing: [],
      electronics: [],
      documents: [],
      medicine: [],
    },
    faqs: [],
    paymentSchedule: [],
  };
}

function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectStoryPlaceIds(days: ItineraryDay[]): string[] {
  return [
    ...new Set(
      days
        .flatMap((d) => [
          toPlaceRef(d.destination)?.placeId,
          ...(d.items || []).flatMap((i) => [
            i.details?.catalogPlaceId,
            toPlaceRef(i.location)?.placeId,
          ]),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

function ProposalStoryPanel({
  story,
  onChange,
  days,
  tripId,
  tripStartDate,
  tripEndDate,
}: {
  story: ItineraryStory;
  onChange: (story: ItineraryStory) => void;
  days: ItineraryDay[];
  tripId?: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}) {
  const essentialsEmpty = storyEssentialsScore(story).score === 0;
  const [open, setOpen] = useState(() => essentialsEmpty && days.length > 0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [confirmFill, setConfirmFill] = useState(false);

  const readiness = storyEssentialsScore(story);
  const highlightsText = (story.highlights || []).join('\n');
  const packingText = (story.packingTips || []).join('\n');
  const cats = story.packingCategories || {};

  useEffect(() => {
    if (essentialsEmpty && days.length > 0) setOpen(true);
  }, [essentialsEmpty, days.length]);

  function patch(partial: Partial<ItineraryStory>) {
    onChange({ ...story, ...partial });
  }

  function patchPackingCat(key: keyof PackingCategories, text: string) {
    patch({
      packingCategories: {
        ...cats,
        [key]: linesToList(text),
      },
    });
  }

  async function applyFill() {
    setFilling(true);
    try {
      const placeIds = collectStoryPlaceIds(days);
      if (!placeIds.length) {
        const seeded = await seedStoryFromDays(days, {
          startDate: tripStartDate,
          endDate: tripEndDate,
        });
        onChange({
          ...story,
          ...seeded,
          highlights: seeded.highlights ?? story.highlights,
          packingTips: seeded.packingTips ?? story.packingTips,
          packingCategories: seeded.packingCategories ?? story.packingCategories,
        });
        toastSuccess('Story filled from destinations');
        setOpen(true);
        return;
      }
      const res = await api<{
        story: Partial<ItineraryStory>;
        provenance: 'openai' | 'catalog';
      }>('/ai/proposal-story', {
        method: 'POST',
        body: JSON.stringify({
          placeIds,
          startDate: tripStartDate || undefined,
          endDate: tripEndDate || undefined,
          preferAi: true,
        }),
      });
      const seeded = res.story;
      onChange({
        ...story,
        heroImageUrl: seeded.heroImageUrl ?? story.heroImageUrl,
        headline: seeded.headline ?? story.headline,
        tagline: seeded.tagline ?? story.tagline,
        bestTime: seeded.bestTime ?? story.bestTime,
        weatherNote: seeded.weatherNote ?? story.weatherNote,
        consultantNote: seeded.consultantNote ?? story.consultantNote,
        highlights: seeded.highlights ?? story.highlights,
        packingTips: seeded.packingTips ?? story.packingTips,
        packingCategories: seeded.packingCategories ?? story.packingCategories,
      });
      setOpen(true);
      setAdvancedOpen(true);
      toastSuccess(
        res.provenance === 'openai'
          ? 'Story + packing drafted with AI'
          : 'Story filled from destination catalog',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not fill from destinations');
    } finally {
      setFilling(false);
      setConfirmFill(false);
    }
  }

  async function applyPackingOnly() {
    setFilling(true);
    try {
      const placeIds = collectStoryPlaceIds(days);
      if (!placeIds.length) {
        toastError('Add destinations on days so AI can suggest packing');
        return;
      }
      const res = await api<{
        story: Partial<ItineraryStory>;
        provenance: 'openai' | 'catalog';
      }>('/ai/proposal-story', {
        method: 'POST',
        body: JSON.stringify({
          placeIds,
          startDate: tripStartDate || undefined,
          endDate: tripEndDate || undefined,
          preferAi: true,
        }),
      });
      const cats = res.story.packingCategories;
      patch({
        packingTips: res.story.packingTips ?? story.packingTips,
        packingCategories: {
          clothing: cats?.clothing ?? story.packingCategories?.clothing ?? [],
          electronics: cats?.electronics ?? story.packingCategories?.electronics ?? [],
          documents: cats?.documents ?? story.packingCategories?.documents ?? [],
          medicine: cats?.medicine ?? story.packingCategories?.medicine ?? [],
        },
      });
      setAdvancedOpen(true);
      toastSuccess(
        res.provenance === 'openai'
          ? 'Packing checklist suggested with AI'
          : 'Packing filled from destination knowledge',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not suggest packing');
    } finally {
      setFilling(false);
    }
  }

  function requestFill() {
    if (storyHasContent(story)) {
      setConfirmFill(true);
      return;
    }
    void applyFill();
  }

  async function uploadHero(file: File) {
    if (!tripId) return;
    setUploadingHero(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ id: string; contentUrl: string }>(
        `/files/upload?entityType=trip&entityId=${encodeURIComponent(tripId)}`,
        fd,
      );
      patch({ heroImageUrl: res.contentUrl });
      toastSuccess('Hero photo uploaded');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingHero(false);
    }
  }

  const readinessTone =
    readiness.score >= 4 ? 'success' : readiness.score >= 2 ? 'warn' : 'neutral';

  const fieldClass =
    'flex w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm leading-snug shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const areaClass = `${fieldClass} min-h-[4.5rem] resize-y`;

  return (
    <Card className="overflow-hidden border-border/70">
      <CardContent className="p-0">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/30"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm tracking-tight text-foreground">Proposal story</strong>
              <StatusBadge
                value={`story-${readiness.score}`}
                label={`${readiness.score}/${readiness.max} ready`}
                tone={readinessTone}
                showIcon={false}
              />
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              Share link &amp; PDF essentials — draft with AI, then edit.
            </p>
          </div>
          {open ? (
            <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {open ? (
          <div className="space-y-3 border-t border-border/60 px-3.5 pb-3.5 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Share essentials
              </p>
              <Button
                type="button"
                size="sm"
                disabled={filling || days.length === 0}
                onClick={requestFill}
              >
                <Sparkles className={`size-3.5 ${filling ? 'animate-pulse' : ''}`} />
                {filling ? 'Drafting…' : 'Fill with AI'}
              </Button>
            </div>
            {days.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add itinerary days (or run Start this trip) before drafting.
              </p>
            ) : null}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted/25 sm:h-[6.5rem] sm:w-28">
                <div className="relative h-full bg-muted/40">
                  {story.heroImageUrl?.trim() ? (
                    <img
                      src={story.heroImageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground">
                      <Upload className="size-3.5 opacity-60" />
                      <span className="text-[10px]">Photo</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <FormField label="Hero image" className="!mb-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      value={story.heroImageUrl || ''}
                      onChange={(e) =>
                        patch({ heroImageUrl: e.target.value || undefined })
                      }
                      placeholder="Paste image URL…"
                      className="h-8 min-w-[10rem] flex-1 border-border/60 bg-background/80 text-xs"
                    />
                    {tripId ? (
                      <label className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border/70 px-2 text-xs font-medium text-foreground hover:bg-muted/40">
                        <Upload className="size-3" />
                        {uploadingHero ? '…' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={uploadingHero}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadHero(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                </FormField>
                <FormField
                  label="During your trip"
                  className="!mb-0"
                  description="Travel window label from trip dates — shown on share & PDF."
                >
                  <Input
                    value={story.bestTime || ''}
                    onChange={(e) => patch({ bestTime: e.target.value || undefined })}
                    placeholder="July in Darjeeling"
                    className="h-8"
                  />
                </FormField>
                <FormField
                  label="What to expect"
                  className="!mb-0"
                  description="Weather and tips for these travel dates — not the ideal season."
                >
                  <textarea
                    className={`${areaClass} min-h-[3.25rem]`}
                    value={story.weatherNote || ''}
                    onChange={(e) => patch({ weatherNote: e.target.value || undefined })}
                    placeholder="Misty monsoon mornings — pack a light rain jacket."
                  />
                </FormField>
              </div>
            </div>

            <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/15 p-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Story copy
                </h3>
                <p className="text-xs leading-4 text-muted-foreground">
                  What travellers read first — keep it short and vivid.
                </p>
              </div>
              <FormField label="Emotional headline" className="!mb-0">
                <Input
                  value={story.headline || ''}
                  onChange={(e) => patch({ headline: e.target.value || undefined })}
                  placeholder="Discover the serenity of Kurseong"
                  className="h-9 border-border/60 bg-background/85 px-3 text-sm font-medium"
                />
              </FormField>
              <FormField label="Supporting line" className="!mb-0">
                <Input
                  value={story.tagline || ''}
                  onChange={(e) => patch({ tagline: e.target.value || undefined })}
                  placeholder="A tea-town retreat amid misty estates"
                  className="h-8 border-border/60 bg-background/85 px-3"
                />
              </FormField>
              <FormField
                label="Why you’ll love this"
                className="!mb-0"
                description="One highlight per line — shown as bullets on the proposal."
              >
                <textarea
                  className={`${areaClass} min-h-[4.75rem] border-border/60 bg-background/85`}
                  value={highlightsText}
                  onChange={(e) =>
                    patch({
                      highlights: linesToList(e.target.value),
                    })
                  }
                  placeholder={
                    'Explore lush tea estates\nRelax in colonial bungalows\nEnjoy a family-friendly mid-way pause'
                  }
                />
              </FormField>
            </section>

            <div className="flex flex-col gap-3">
              <FormField
                label="Personal note from consultant"
                className="!mb-0"
                description="Optional — warm sign-off under the story."
              >
                <textarea
                  className={`${areaClass} min-h-[3.5rem]`}
                  value={story.consultantNote || ''}
                  onChange={(e) => patch({ consultantNote: e.target.value || undefined })}
                  placeholder="Looking forward to hosting your family in the hills."
                />
              </FormField>

              <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                <div className="min-w-0">
                  <strong className="text-sm tracking-tight text-foreground">
                    More for the proposal
                  </strong>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Optional extras for packing, money, FAQs, and cancellation
                  </p>
                </div>
                {advancedOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {advancedOpen ? (
                <div className="space-y-3 border-t border-border/60 bg-muted/5 p-3 sm:p-3.5">
                  <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">
                          Packing checklist
                        </h4>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          One item per line. AI can draft from destination knowledge — edit anytime.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={filling || days.length === 0}
                        onClick={() => void applyPackingOnly()}
                      >
                        <Sparkles className="size-3.5" />
                        {filling ? 'Drafting…' : 'Suggest with AI'}
                      </Button>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {(
                        [
                          {
                            key: 'clothing' as const,
                            label: 'Clothing',
                            placeholder: 'Warm jacket\nWalking shoes',
                          },
                          {
                            key: 'electronics' as const,
                            label: 'Electronics',
                            placeholder: 'Power bank\nCamera',
                          },
                          {
                            key: 'documents' as const,
                            label: 'Documents',
                            placeholder: 'Identity card\nHotel vouchers',
                          },
                          {
                            key: 'medicine' as const,
                            label: 'Medicine',
                            placeholder: 'Personal meds\nAltitude tablets',
                          },
                        ] as const
                      ).map((cat) => {
                        const filled = (cats[cat.key] || []).length > 0;
                        return (
                          <div
                            key={cat.key}
                            className="overflow-hidden rounded-xl border border-border/70 bg-muted/20"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                {cat.label}
                              </span>
                              {filled ? (
                                <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                                  {(cats[cat.key] || []).length} items
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                                  Empty
                                </span>
                              )}
                            </div>
                            <textarea
                              className="min-h-[84px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-0"
                              value={(cats[cat.key] || []).join('\n')}
                              onChange={(e) => patchPackingCat(cat.key, e.target.value)}
                              placeholder={cat.placeholder}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <FormField
                      label="Extra tips"
                      className="mb-0"
                      description="Used only if the categories above are empty."
                    >
                      <textarea
                        className={`${areaClass} min-h-[76px] resize-none border-border/60 bg-muted/15`}
                        value={packingText}
                        onChange={(e) =>
                          patch({
                            packingTips: linesToList(e.target.value),
                          })
                        }
                        placeholder="Bring layers for cooler evenings…"
                      />
                    </FormField>
                  </section>

                  <section className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-3.5">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        Cancellation note
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Overrides the org default for this proposal only.
                      </p>
                    </div>
                    <textarea
                      className={`${areaClass} min-h-[80px] resize-none border-border/60 bg-muted/15`}
                      value={story.cancellationNote || ''}
                      onChange={(e) =>
                        patch({ cancellationNote: e.target.value || undefined })
                      }
                      placeholder="e.g. Free cancellation up to 21 days before departure…"
                    />
                  </section>

                  <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">
                          Payment schedule
                        </h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Timeline on the proposal — e.g. Today 40% → Before travel 60%.
                        </p>
                      </div>
                      {(story.paymentSchedule || []).length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patch({
                              paymentSchedule: [
                                ...(story.paymentSchedule || []),
                                { label: '', percent: undefined },
                              ],
                            })
                          }
                        >
                          <Plus className="size-3.5" />
                          Add step
                        </Button>
                      ) : null}
                    </div>
                    {(story.paymentSchedule || []).length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center">
                        <p className="text-xs text-muted-foreground">
                          No steps yet. Add a simple deposit schedule for the family share.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patch({
                              paymentSchedule: [
                                { label: 'Today', percent: 40 },
                                { label: 'Before travel', percent: 60 },
                              ],
                            })
                          }
                        >
                          <Plus className="size-3.5" />
                          Add typical 40 / 60
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(story.paymentSchedule || []).map((step, idx) => (
                          <div
                            key={idx}
                            className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 p-2.5 sm:grid-cols-[1fr_5.5rem_1fr_auto]"
                          >
                            <Input
                              value={step.label}
                              onChange={(e) => {
                                const paymentSchedule = [...(story.paymentSchedule || [])];
                                paymentSchedule[idx] = {
                                  ...paymentSchedule[idx],
                                  label: e.target.value,
                                };
                                patch({ paymentSchedule });
                              }}
                              placeholder="Label"
                              className="h-9 bg-background/80"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={step.percent ?? ''}
                              onChange={(e) => {
                                const paymentSchedule = [...(story.paymentSchedule || [])];
                                const n = Number(e.target.value);
                                paymentSchedule[idx] = {
                                  ...paymentSchedule[idx],
                                  percent:
                                    e.target.value === '' || !Number.isFinite(n)
                                      ? undefined
                                      : n,
                                };
                                patch({ paymentSchedule });
                              }}
                              placeholder="%"
                              className="h-9 bg-background/80"
                            />
                            <Input
                              value={step.amountHint || ''}
                              onChange={(e) => {
                                const paymentSchedule = [...(story.paymentSchedule || [])];
                                paymentSchedule[idx] = {
                                  ...paymentSchedule[idx],
                                  amountHint: e.target.value || undefined,
                                };
                                patch({ paymentSchedule });
                              }}
                              placeholder="Amount hint"
                              className="h-9 bg-background/80"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0"
                              onClick={() =>
                                patch({
                                  paymentSchedule: (story.paymentSchedule || []).filter(
                                    (_, i) => i !== idx,
                                  ),
                                })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">
                          Before you go (FAQs)
                        </h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Short Q&amp;As travellers see on the proposal.
                        </p>
                      </div>
                      {(story.faqs || []).length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patch({
                              faqs: [...(story.faqs || []), { question: '', answer: '' }],
                            })
                          }
                        >
                          <Plus className="size-3.5" />
                          Add FAQ
                        </Button>
                      ) : null}
                    </div>
                    {(story.faqs || []).length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center">
                        <p className="text-xs text-muted-foreground">
                          No FAQs yet — add packing, arrival, or weather questions.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patch({
                              faqs: [{ question: '', answer: '' }],
                            })
                          }
                        >
                          <Plus className="size-3.5" />
                          Add FAQ
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(story.faqs || []).map((faq, idx) => (
                          <div
                            key={idx}
                            className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
                          >
                            <Input
                              value={faq.question}
                              onChange={(e) => {
                                const faqs = [...(story.faqs || [])];
                                faqs[idx] = { ...faqs[idx], question: e.target.value };
                                patch({ faqs });
                              }}
                              placeholder="Question"
                              className="h-9 bg-background/80"
                            />
                            <Input
                              value={faq.answer}
                              onChange={(e) => {
                                const faqs = [...(story.faqs || [])];
                                faqs[idx] = { ...faqs[idx], answer: e.target.value };
                                patch({ faqs });
                              }}
                              placeholder="Answer"
                              className="h-9 bg-background/80"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 shrink-0"
                              onClick={() =>
                                patch({
                                  faqs: (story.faqs || []).filter((_, i) => i !== idx),
                                })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmFill}
        onOpenChange={(next) => {
          if (!next) setConfirmFill(false);
        }}
        title="Overwrite proposal story?"
        description="This replaces hero, headline, tagline, highlights, during-your-trip weather, and packing tips with an AI draft grounded in your destinations and travel dates (catalog fallback if OpenAI is not configured)."
        confirmLabel="Overwrite"
        destructive
        loading={filling}
        onConfirm={() => {
          void applyFill();
        }}
      />
    </Card>
  );
}
