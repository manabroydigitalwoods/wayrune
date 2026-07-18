import type { QuotationItemDetails, QuoteServiceType } from '@wayrune/contracts';

export type QuoteServiceDetails = QuotationItemDetails;

export type QuoteHotelRateBasis =
  | 'per_room_night'
  | 'per_room_stay'
  | 'per_person_night'
  | 'per_person_stay'
  | 'package_total';

export type QuoteMarkupMode = 'percent' | 'fixed';
export type QuotePriceSource = 'matched' | 'manual' | 'none' | 'expired' | 'overridden';

const MEAL_PLANS = [
  { value: 'EP', label: 'EP — Room only' },
  { value: 'CP', label: 'CP — Breakfast' },
  { value: 'MAP', label: 'MAP — Breakfast + dinner' },
  { value: 'AP', label: 'AP — All meals' },
] as const;

export const QUOTE_MEAL_PLAN_OPTIONS = MEAL_PLANS.map((m) => ({
  value: m.value,
  label: m.label,
}));

export const QUOTE_HOTEL_RATE_BASIS_OPTIONS: Array<{ value: QuoteHotelRateBasis; label: string }> = [
  { value: 'per_room_night', label: 'Per room / night' },
  { value: 'per_room_stay', label: 'Per room / stay' },
  { value: 'per_person_night', label: 'Per person / night' },
  { value: 'per_person_stay', label: 'Per person / stay' },
  { value: 'package_total', label: 'Total package' },
];

export const QUOTE_AVAILABILITY_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'available', label: 'Available' },
  { value: 'on_request', label: 'On request' },
  { value: 'confirmed', label: 'Confirmed' },
];

export const QUOTE_CUSTOM_UNIT_OPTIONS = [
  { value: 'service', label: 'Service' },
  { value: 'item', label: 'Item' },
  { value: 'day', label: 'Day' },
  { value: 'person', label: 'Person' },
  { value: 'unit', label: 'Unit' },
];

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function numArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) {
    if (typeof v === 'string' && v.trim()) {
      const ages = v
        .split(/[,\s]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n >= 0);
      return ages.length ? ages : undefined;
    }
    return undefined;
  }
  const ages = v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0);
  return ages.length ? ages : undefined;
}

export function nightsBetweenIso(checkIn?: string, checkOut?: string): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(`${checkIn.slice(0, 10)}T12:00:00`);
  const b = new Date(`${checkOut.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const nights = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : null;
}

export function parseQuoteServiceDetails(raw: unknown): QuoteServiceDetails | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  const rateBasis = str(d.rateBasis) as QuoteHotelRateBasis | undefined;
  const markupMode = str(d.markupMode) as QuoteMarkupMode | undefined;
  const priceSource = str(d.priceSource) as QuotePriceSource | undefined;
  const availability = str(d.availability);
  const out: QuoteServiceDetails = {
    supplierId: str(d.supplierId),
    supplierName: str(d.supplierName),
    placeId: str(d.placeId),
    placeName: str(d.placeName),
    propertyName: str(d.propertyName),
    roomType: str(d.roomType),
    mealPlan: str(d.mealPlan),
    nights: num(d.nights),
    rooms: num(d.rooms),
    checkIn: str(d.checkIn)?.slice(0, 10),
    checkOut: str(d.checkOut)?.slice(0, 10),
    adults: num(d.adults),
    children: num(d.children),
    childAges: numArray(d.childAges),
    extraBeds: num(d.extraBeds),
    childrenWithoutBed: num(d.childrenWithoutBed),
    rateBasis:
      rateBasis &&
      [
        'per_room_night',
        'per_room_stay',
        'per_person_night',
        'per_person_stay',
        'package_total',
      ].includes(rateBasis)
        ? rateBasis
        : undefined,
    markupMode: markupMode === 'percent' || markupMode === 'fixed' ? markupMode : undefined,
    markupValue: num(d.markupValue),
    sellManual: typeof d.sellManual === 'boolean' ? d.sellManual : undefined,
    priceSource:
      priceSource &&
      ['matched', 'manual', 'none', 'expired', 'overridden'].includes(priceSource)
        ? priceSource
        : undefined,
    rateLabel: str(d.rateLabel),
    rateSupplierLabel: str(d.rateSupplierLabel),
    rateValidFrom: str(d.rateValidFrom)?.slice(0, 10),
    rateValidTo: str(d.rateValidTo)?.slice(0, 10),
    rateLastUpdated: str(d.rateLastUpdated),
    availability:
      availability &&
      ['unknown', 'available', 'on_request', 'confirmed'].includes(availability)
        ? (availability as QuoteServiceDetails['availability'])
        : undefined,
    cancellationPolicy: str(d.cancellationPolicy),
    supplementsNote: str(d.supplementsNote),
    extraBedCharge: num(d.extraBedCharge),
    childCharge: num(d.childCharge),
    internalNotes: str(d.internalNotes),
    customerNotes: str(d.customerNotes),
    unitLabel: str(d.unitLabel),
    fromPlaceId: str(d.fromPlaceId),
    fromPlaceName: str(d.fromPlaceName),
    toPlaceId: str(d.toPlaceId),
    toPlaceName: str(d.toPlaceName),
    fromCountry: str(d.fromCountry),
    toCountry: str(d.toCountry),
    vehicleTypeId: str(d.vehicleTypeId),
    vehicleLabel: str(d.vehicleLabel),
    serviceDate: str(d.serviceDate)?.slice(0, 10),
    serviceDateOutsideTripOverride:
      typeof d.serviceDateOutsideTripOverride === 'boolean'
        ? d.serviceDateOutsideTripOverride
        : undefined,
    vehicles: num(d.vehicles),
    unusualVehiclesConfirmed:
      typeof d.unusualVehiclesConfirmed === 'boolean'
        ? d.unusualVehiclesConfirmed
        : undefined,
    activityDate: str(d.activityDate)?.slice(0, 10),
    activityTime: str(d.activityTime)?.slice(0, 5),
    privateOrSic:
      d.privateOrSic === 'private' || d.privateOrSic === 'sic' ? d.privateOrSic : undefined,
  };
  return Object.values(out).some((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    ? out
    : undefined;
}

export function detailsFromResolveRecord(
  details?: Record<string, unknown> | null,
): QuoteServiceDetails | undefined {
  return parseQuoteServiceDetails(details ?? undefined);
}

export function withCalculatedHotelNights(
  details: QuoteServiceDetails,
): QuoteServiceDetails {
  const nights = nightsBetweenIso(details.checkIn, details.checkOut);
  if (nights == null) return { ...details, nights: undefined };
  return { ...details, nights };
}

/** Multiplier applied to buy unit rate for line quantity on the table. */
export function hotelQuantityFromDetails(
  details: QuoteServiceDetails | undefined,
): number | null {
  if (!details) return null;
  const nights = nightsBetweenIso(details.checkIn, details.checkOut) ?? details.nights;
  if (nights == null || nights <= 0) return null;
  const rooms = Math.max(1, Math.round(details.rooms ?? 1));
  const adults = Math.max(0, Math.round(details.adults ?? 0));
  const children = Math.max(0, Math.round(details.children ?? 0));
  const pax = Math.max(1, adults + children);
  const basis = details.rateBasis || 'per_room_night';
  switch (basis) {
    case 'per_room_night':
      return rooms * nights;
    case 'per_room_stay':
      return rooms;
    case 'per_person_night':
      return pax * nights;
    case 'per_person_stay':
      return pax;
    case 'package_total':
      return 1;
    default:
      return rooms * nights;
  }
}

export function hotelBaseCost(
  buyUnitRate: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (buyUnitRate == null || !Number.isFinite(buyUnitRate)) return null;
  const qty = hotelQuantityFromDetails(details);
  if (qty == null) return null;
  const extras =
    (Number(details?.extraBedCharge) || 0) * Math.max(0, Math.round(details?.extraBeds ?? 0)) +
    (Number(details?.childCharge) || 0) * Math.max(0, Math.round(details?.children ?? 0));
  return round2(buyUnitRate * qty + extras);
}

export function suggestedSellFromMarkup(
  baseCost: number | null,
  mode: QuoteMarkupMode | undefined,
  markupValue: number | undefined,
): number | null {
  if (baseCost == null) return null;
  const modeSafe = mode || 'percent';
  const value = markupValue ?? 0;
  if (modeSafe === 'fixed') return round2(baseCost + value);
  return round2(baseCost * (1 + value / 100));
}

/** Unit sell to store on the line (mirrors unit cost basis). */
export function unitSellFromSuggestedTotal(
  suggestedTotal: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (suggestedTotal == null) return null;
  const qty = hotelQuantityFromDetails(details);
  if (qty == null || qty <= 0) return suggestedTotal;
  return round2(suggestedTotal / qty);
}

export function quantityFromServiceDetails(
  serviceType: QuoteServiceType | string | undefined,
  details: QuoteServiceDetails | undefined,
  fallback = 1,
): number {
  if (!details) return fallback;
  if (serviceType === 'hotel') {
    return hotelQuantityFromDetails(details) ?? fallback;
  }
  if (serviceType === 'transfer') {
    return Math.max(1, Math.round(details.vehicles ?? fallback));
  }
  if (serviceType === 'activity') {
    const adults = Math.max(0, Math.round(details.adults ?? 0));
    const children = Math.max(0, Math.round(details.children ?? 0));
    const pax = adults + children;
    return pax > 0 ? pax : fallback;
  }
  if (serviceType === 'custom') {
    return fallback;
  }
  return fallback;
}

export function pricingUnitForServiceType(
  serviceType: QuoteServiceType | string | undefined,
  details?: QuoteServiceDetails,
): 'per_person' | 'per_room' | 'per_service' | 'package' {
  if (serviceType === 'hotel') {
    const basis = details?.rateBasis || 'per_room_night';
    if (basis === 'package_total') return 'package';
    if (basis.startsWith('per_person')) return 'per_person';
    return 'per_room';
  }
  if (serviceType === 'activity' || serviceType === 'meal') return 'per_person';
  return 'per_service';
}

export function quoteServiceDetailsSummary(
  serviceType: QuoteServiceType | string | undefined,
  details: QuoteServiceDetails | undefined,
): string | null {
  if (!details) return null;
  const parts: string[] = [];
  if (serviceType === 'hotel') {
    if (details.propertyName) parts.push(details.propertyName);
    if (details.roomType) parts.push(details.roomType);
    if (details.mealPlan) parts.push(details.mealPlan);
    const nights = nightsBetweenIso(details.checkIn, details.checkOut) ?? details.nights;
    if (nights != null) parts.push(`${nights} night${nights === 1 ? '' : 's'}`);
    if (details.rooms != null && details.rooms !== 1) {
      parts.push(`${details.rooms} rooms`);
    }
  } else if (serviceType === 'transfer') {
    if (details.fromPlaceName || details.toPlaceName) {
      parts.push(`${details.fromPlaceName || '…'} → ${details.toPlaceName || '…'}`);
    }
    if (details.vehicleLabel) parts.push(details.vehicleLabel);
    if (details.vehicles != null && details.vehicles !== 1) {
      parts.push(`${details.vehicles} vehicles`);
    }
  } else if (serviceType === 'activity') {
    if (details.propertyName) parts.push(details.propertyName);
    else if (details.placeName) parts.push(details.placeName);
    if (details.privateOrSic === 'private') parts.push('Private');
    if (details.privateOrSic === 'sic') parts.push('SIC');
    if (details.adults != null || details.children != null) {
      const a = details.adults ?? 0;
      const c = details.children ?? 0;
      const bits = [];
      if (a) bits.push(`${a} adult${a === 1 ? '' : 's'}`);
      if (c) bits.push(`${c} child${c === 1 ? '' : 'ren'}`);
      if (bits.length) parts.push(bits.join(', '));
    }
    if (details.activityDate) parts.push(details.activityDate);
    if (details.activityTime) parts.push(details.activityTime);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function hasMeaningfulTypedDetails(
  serviceType: QuoteServiceType | string | undefined,
  details: QuoteServiceDetails | undefined,
): boolean {
  if (!details) return false;
  if (serviceType === 'hotel') {
    return Boolean(
      details.propertyName ||
        details.checkIn ||
        details.checkOut ||
        details.roomType ||
        details.supplierId ||
        details.rateLabel,
    );
  }
  if (serviceType === 'transfer') {
    return Boolean(details.fromPlaceId || details.toPlaceId || details.vehicleTypeId);
  }
  if (serviceType === 'activity') {
    return Boolean(
      details.propertyName ||
        details.activityDate ||
        details.privateOrSic ||
        details.supplierId ||
        details.placeId,
    );
  }
  return false;
}

export function resolvePayloadFromQuoteDetails(
  lineId: string,
  serviceType: QuoteServiceType | string | undefined,
  details: QuoteServiceDetails | undefined,
  date?: string | null,
): {
  itemId: string;
  type: string;
  date?: string | null;
  details: Record<string, unknown>;
} | null {
  if (!details) return null;
  if (serviceType === 'hotel' || serviceType === 'transfer') {
    const nights =
      nightsBetweenIso(details.checkIn, details.checkOut) ?? details.nights ?? undefined;
    return {
      itemId: lineId,
      type: serviceType === 'transfer' ? 'transfer' : 'hotel',
      date:
        (serviceType === 'transfer' ? details.serviceDate : null) ||
        date ||
        details.serviceDate ||
        details.checkIn ||
        details.activityDate ||
        null,
      details: {
        supplierId: details.supplierId,
        placeId: details.placeId,
        roomType: details.roomType,
        nights,
        vehicleTypeId: details.vehicleTypeId,
        fromPlaceId: details.fromPlaceId,
        toPlaceId: details.toPlaceId,
      },
    };
  }
  return null;
}

export function priceSourceLabel(source: QuotePriceSource | string | undefined): string {
  switch (source) {
    case 'matched':
      return 'Matched rate';
    case 'manual':
      return 'Manual price';
    case 'expired':
      return 'Expired rate';
    case 'overridden':
      return 'Overridden rate';
    case 'none':
      return 'No match';
    default:
      return 'Not priced';
  }
}

/** Default child age bounds for hotel occupancy validation. */
export const DEFAULT_CHILD_AGE_MIN = 0;
export const DEFAULT_CHILD_AGE_MAX = 17;

/** Fields that invalidate a matched hotel rate when changed. */
export const HOTEL_RATE_MATCH_KEYS = [
  'placeId',
  'propertyName',
  'supplierId',
  'checkIn',
  'checkOut',
  'roomType',
  'mealPlan',
] as const;

export type HotelRoomCapacity = {
  maxAdults: number;
  maxChildren: number;
  maxTotal: number;
  label: string;
};

/** Heuristic capacity from room type name until catalog stores capacity. */
export function hotelRoomCapacity(roomType?: string | null): HotelRoomCapacity {
  const t = (roomType || '').trim().toLowerCase();
  if (t.includes('single')) {
    return { maxAdults: 1, maxChildren: 0, maxTotal: 1, label: '1 adult' };
  }
  if (t.includes('triple')) {
    return { maxAdults: 3, maxChildren: 1, maxTotal: 3, label: '3 adults (or 2+1 child)' };
  }
  if (t.includes('family') || t.includes('suite')) {
    return { maxAdults: 3, maxChildren: 2, maxTotal: 4, label: 'up to 4 guests' };
  }
  if (t.includes('quad') || t.includes('4')) {
    return { maxAdults: 4, maxChildren: 2, maxTotal: 4, label: 'up to 4 guests' };
  }
  // Standard double / deluxe / twin
  return { maxAdults: 2, maxChildren: 2, maxTotal: 3, label: '2 adults + 1 child (max 3)' };
}

export function hotelOccupancyWarning(
  details: QuoteServiceDetails | undefined,
): string | null {
  if (!details) return null;
  const rooms = Math.max(1, Math.round(details.rooms ?? 1));
  const adults = Math.max(0, Math.round(details.adults ?? 0));
  const children = Math.max(0, Math.round(details.children ?? 0));
  if (adults === 0 && children === 0) return null;
  const cap = hotelRoomCapacity(details.roomType);
  const maxAdults = cap.maxAdults * rooms;
  const maxChildren = cap.maxChildren * rooms;
  const maxTotal = cap.maxTotal * rooms;
  const total = adults + children;
  if (adults > maxAdults || children > maxChildren || total > maxTotal) {
    const roomLabel = details.roomType?.trim() || 'selected room';
    return `Occupancy may exceed ${roomLabel} capacity (${cap.label} per room × ${rooms}). Confirm with the supplier or split rooms.`;
  }
  return null;
}

export function hotelAutoDescription(details: QuoteServiceDetails | undefined): string | null {
  if (!details) return null;
  const nights = nightsBetweenIso(details.checkIn, details.checkOut) ?? details.nights;
  const meal =
    details.mealPlan?.trim().split(/\s*[—–-]\s*/)[0]?.trim() || details.mealPlan?.trim();
  const parts: string[] = [];
  if (details.propertyName?.trim()) parts.push(details.propertyName.trim());
  if (details.roomType?.trim()) parts.push(details.roomType.trim());
  if (meal) parts.push(meal);
  if (nights != null && nights > 0) {
    parts.push(`${nights} night${nights === 1 ? '' : 's'}`);
  }
  return parts.length >= 2 ? parts.join(' · ') : parts[0] || null;
}

/** True when text looks like a system-generated hotel description. */
export function looksLikeHotelAutoDescription(current: string): boolean {
  const trimmed = current.trim();
  if (!trimmed) return true;
  if (/^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  if (/new service/i.test(trimmed)) return true;
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  // Property · Room · MEAL · N nights  OR  Room · MEAL · N nights
  if (/·\s*\d+\s*nights?\s*$/i.test(trimmed) && trimmed.includes('·')) return true;
  if (/\b(EP|CP|MAP|AP)\b/i.test(trimmed) && /\bnights?\b/i.test(trimmed)) return true;
  return false;
}

export function shouldReplaceHotelDescription(
  current: string,
  details: QuoteServiceDetails | undefined,
): boolean {
  const trimmed = current.trim();
  if (!trimmed || /^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  const auto = hotelAutoDescription(details);
  if (!auto) return false;
  if (trimmed === auto) return false;
  if (/^day\s+\d+:/i.test(trimmed) && !details?.propertyName) return false;
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  if (details?.propertyName && trimmed.startsWith(details.propertyName)) return true;
  if (looksLikeHotelAutoDescription(trimmed)) return true;
  return false;
}

export function hotelMatchKeysChanged(
  prev: QuoteServiceDetails,
  patch: Partial<QuoteServiceDetails>,
): boolean {
  for (const key of HOTEL_RATE_MATCH_KEYS) {
    if (!(key in patch)) continue;
    const nextVal = patch[key];
    const prevVal = prev[key];
    if (String(nextVal ?? '') !== String(prevVal ?? '')) return true;
  }
  return false;
}

export type HotelV1Validation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Why Match rate is unavailable (empty when matchable). */
  matchBlockedReasons: string[];
};

export function validateHotelV1(
  details: QuoteServiceDetails | undefined,
  opts?: {
    buyUnit?: number | null;
    sellUnit?: number | null;
    childAgeMin?: number;
    childAgeMax?: number;
  },
): HotelV1Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const matchBlockedReasons: string[] = [];
  const d = details || {};
  const ageMin = opts?.childAgeMin ?? DEFAULT_CHILD_AGE_MIN;
  const ageMax = opts?.childAgeMax ?? DEFAULT_CHILD_AGE_MAX;

  const nights = nightsBetweenIso(d.checkIn, d.checkOut);
  if (d.checkIn && d.checkOut && nights == null) {
    errors.push('Check-out must be after check-in');
  }
  if (!d.checkIn || !d.checkOut) {
    matchBlockedReasons.push('select check-in and check-out');
  } else if (nights == null) {
    matchBlockedReasons.push('fix check-out so it is after check-in');
  }

  const rooms = d.rooms ?? 1;
  if (rooms < 1) errors.push('Rooms must be at least 1');

  if (d.adults != null && d.adults < 0) errors.push('Adults cannot be negative');
  if (d.children != null && d.children < 0) errors.push('Children cannot be negative');

  const children = Math.max(0, Math.round(d.children ?? 0));
  const ages = d.childAges || [];
  if (children > 0) {
    if (ages.length !== children) {
      errors.push(`Enter exactly ${children} child age${children === 1 ? '' : 's'}`);
    }
    for (const age of ages) {
      if (age < ageMin || age > ageMax) {
        errors.push(`Child ages must be between ${ageMin} and ${ageMax}`);
        break;
      }
    }
  } else if (ages.length > 0) {
    errors.push('Clear child ages when there are no children');
  }

  const occupancy = hotelOccupancyWarning(d);
  if (occupancy) warnings.push(occupancy);

  const travellers = Math.max(0, Math.round(d.adults ?? 0)) + Math.max(0, Math.round(d.children ?? 0));
  if (travellers > 0 && rooms > travellers) {
    warnings.push(
      `Unusual occupancy: ${rooms} rooms for ${travellers} traveller${travellers === 1 ? '' : 's'}. Please verify.`,
    );
  }

  if (!d.roomType?.trim()) matchBlockedReasons.push('select room type');
  if (!d.mealPlan?.trim()) matchBlockedReasons.push('select meal plan');
  if (!d.placeId && !d.propertyName && !d.supplierId) {
    matchBlockedReasons.push('select destination, property or supplier');
  }

  const buy = opts?.buyUnit;
  const sell = opts?.sellUnit;
  if (
    buy != null &&
    sell != null &&
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    sell < buy
  ) {
    errors.push(
      `Sell (${sell}) is below buy (${buy}) — fix markup or buy rate before saving`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    matchBlockedReasons,
  };
}

/** Fields that invalidate a directory rate match for transport. */
export const TRANSFER_RATE_MATCH_KEYS = [
  'fromPlaceId',
  'toPlaceId',
  'vehicleTypeId',
  'supplierId',
  'serviceDate',
] as const;

export function transferMatchKeysChanged(
  prev: QuoteServiceDetails,
  patch: Partial<QuoteServiceDetails>,
): boolean {
  for (const key of TRANSFER_RATE_MATCH_KEYS) {
    if (!(key in patch)) continue;
    const nextVal = patch[key];
    const prevVal = prev[key];
    if (String(nextVal ?? '') !== String(prevVal ?? '')) return true;
  }
  return false;
}

export function transferBaseCost(
  buyUnitRate: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (buyUnitRate == null || !Number.isFinite(buyUnitRate)) return null;
  const qty = quantityFromServiceDetails('transfer', details, 1);
  return round2(buyUnitRate * qty);
}

export function transferUnitSellFromSuggestedTotal(
  suggestedTotal: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (suggestedTotal == null) return null;
  const qty = quantityFromServiceDetails('transfer', details, 1);
  if (qty <= 0) return suggestedTotal;
  return round2(suggestedTotal / qty);
}

export function transferAutoDescription(details: QuoteServiceDetails | undefined): string | null {
  if (!details) return null;
  const from = details.fromPlaceName?.trim();
  const to = details.toPlaceName?.trim();
  const parts: string[] = [];
  if (from || to) parts.push(`${from || '…'} → ${to || '…'}`);
  if (details.vehicleLabel?.trim()) parts.push(details.vehicleLabel.trim());
  const vehicles = Math.max(1, Math.round(details.vehicles ?? 1));
  if (vehicles !== 1 || parts.length >= 1) {
    parts.push(`${vehicles} vehicle${vehicles === 1 ? '' : 's'}`);
  }
  return parts.length >= 2 ? parts.join(' · ') : parts[0] || null;
}

export function looksLikeTransferAutoDescription(current: string): boolean {
  const trimmed = current.trim();
  if (!trimmed) return true;
  if (/^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  if (/new service/i.test(trimmed)) return true;
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  if (/→/.test(trimmed) && (trimmed.includes('·') || /\bvehicles?\b/i.test(trimmed))) {
    return true;
  }
  return false;
}

export function shouldReplaceTransferDescription(
  current: string,
  details: QuoteServiceDetails | undefined,
): boolean {
  const trimmed = current.trim();
  if (!trimmed || /^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  const auto = transferAutoDescription(details);
  if (!auto) return false;
  if (trimmed === auto) return false;
  if (/^day\s+\d+:/i.test(trimmed) && !details?.fromPlaceName && !details?.toPlaceName) {
    return false;
  }
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  if (looksLikeTransferAutoDescription(trimmed)) return true;
  return false;
}

export type TransferV1Validation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Route-specific warning shown under From/To (also included in warnings). */
  routeWarning: string | null;
  matchBlockedReasons: string[];
  /** Soft-unusual vehicle qty — confirm before save when above confirm threshold. */
  requiresUnusualVehiclesConfirm: boolean;
  /** Service date outside trip — override required before save. */
  requiresServiceDateOverride: boolean;
};

/** Soft warning when vehicle count exceeds this (default). */
export const TRANSFER_VEHICLES_SOFT_WARN = 10;
/** Require explicit confirmation when vehicle count exceeds this. */
export const TRANSFER_VEHICLES_CONFIRM = 20;
/** Road distance (km) above which we warn about long-haul routes. */
export const TRANSFER_ROUTE_LONG_KM = 400;

const INTL_PLACE_NAME_HINT =
  /\b(bangkok|dubai|singapore|kuala\s*lumpur|colombo|kathmandu|thimphu|dhaka|london|paris|tokyo|bali|phuket|male|yangon|hanoi|ho\s*chi\s*minh|seoul|shanghai|hong\s*kong|doha|abu\s*dhabi|istanbul|moscow|sydney|melbourne|new\s*york|los\s*angeles|toronto|vancouver)\b/i;

const LIGHT_VEHICLE_HINT =
  /\b(hatch|sedan|swift|i10|i20|dzire|city|verna|ciaz|baleno|polo|ameo|aura|tigor)\b/i;

/** Best-effort country from place name when catalog country is missing. */
const PLACE_COUNTRY_HINTS: Array<{ re: RegExp; country: string }> = [
  { re: /\b(bangkok|phuket|chiang\s*mai|pattaya)\b/i, country: 'Thailand' },
  { re: /\b(dubai|abu\s*dhabi|sharjah)\b/i, country: 'United Arab Emirates' },
  { re: /\b(singapore)\b/i, country: 'Singapore' },
  { re: /\b(kuala\s*lumpur|penang|langkawi)\b/i, country: 'Malaysia' },
  { re: /\b(colombo|kandy|galle)\b/i, country: 'Sri Lanka' },
  { re: /\b(kathmandu|pokhara)\b/i, country: 'Nepal' },
  { re: /\b(thimphu|paro)\b/i, country: 'Bhutan' },
  { re: /\b(dhaka|chittagong|sylhet)\b/i, country: 'Bangladesh' },
  { re: /\b(yangon|mandalay)\b/i, country: 'Myanmar' },
  {
    re: /\b(new\s*jalpaiguri|njp|darjeeling|gangtok|siliguri|delhi|mumbai|jaipur|goa|manali|leh|bagdogra|kolkata|chennai|bengaluru|hyderabad|varanasi|agra|udaipur|jaisalmer|rishikesh|shimla)\b/i,
    country: 'India',
  },
];

export function inferPlaceCountry(
  placeName?: string | null,
  explicitCountry?: string | null,
): string | undefined {
  const explicit = explicitCountry?.trim();
  if (explicit) return explicit;
  const name = placeName?.trim();
  if (!name) return undefined;
  for (const hint of PLACE_COUNTRY_HINTS) {
    if (hint.re.test(name)) return hint.country;
  }
  return undefined;
}

function normalizeCountryKey(country: string): string {
  return country.trim().toLowerCase().replace(/\./g, '');
}

export function formatTripDateRangeLabel(
  start?: string | null,
  end?: string | null,
): string {
  const fmt = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || 'trip dates';
}

export function isServiceDateOutsideTrip(
  serviceDate: string | undefined,
  tripStart?: string | null,
  tripEnd?: string | null,
): boolean {
  if (!serviceDate) return false;
  const day = serviceDate.slice(0, 10);
  const start = tripStart?.slice(0, 10);
  const end = tripEnd?.slice(0, 10) || start;
  if (!start) return false;
  if (day < start) return true;
  if (end && day > end) return true;
  return false;
}

export function transferRoutePlausibilityWarning(
  details: QuoteServiceDetails | undefined,
  opts?: { routeDistanceKm?: number | null },
): string | null {
  if (!details) return null;
  if (!details.fromPlaceId && !details.fromPlaceName) return null;
  if (!details.toPlaceId && !details.toPlaceName) return null;

  const fromC = inferPlaceCountry(details.fromPlaceName, details.fromCountry);
  const toC = inferPlaceCountry(details.toPlaceName, details.toCountry);
  const fromKey = fromC ? normalizeCountryKey(fromC) : '';
  const toKey = toC ? normalizeCountryKey(toC) : '';
  const internationalCountries = Boolean(fromKey && toKey && fromKey !== toKey);

  const names = `${details.fromPlaceName || ''} ${details.toPlaceName || ''}`;
  const intlName = INTL_PLACE_NAME_HINT.test(names);
  const distance = opts?.routeDistanceKm;
  const longHaul =
    distance != null && Number.isFinite(distance) && distance >= TRANSFER_ROUTE_LONG_KM;
  const lightVehicle = LIGHT_VEHICLE_HINT.test(details.vehicleLabel || '');
  const longForLight =
    lightVehicle &&
    ((distance != null && distance >= 250) || internationalCountries || intlName);

  if (internationalCountries) {
    return `Cross-border road transfer (${fromC} → ${toC}) is not a normal vehicle route. Verify border permits or use a flight instead.`;
  }
  if (intlName) {
    return 'This looks like an international destination for a road transfer. Verify the vehicle, permits and supplier — or book a flight.';
  }
  if (longHaul || longForLight) {
    const distLabel =
      distance != null && Number.isFinite(distance)
        ? ` (~${Math.round(distance)} km)`
        : '';
    return `This is a long-distance road route${distLabel}. Verify the vehicle, permits and supplier.`;
  }
  return null;
}

export function validateTransferV1(
  details: QuoteServiceDetails | undefined,
  opts?: {
    buyUnit?: number | null;
    sellUnit?: number | null;
    tripStartDate?: string | null;
    tripEndDate?: string | null;
    softVehiclesWarn?: number;
    confirmVehiclesAbove?: number;
    routeDistanceKm?: number | null;
  },
): TransferV1Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const matchBlockedReasons: string[] = [];
  const d = details || {};
  const softWarn = opts?.softVehiclesWarn ?? TRANSFER_VEHICLES_SOFT_WARN;
  const confirmAbove = opts?.confirmVehiclesAbove ?? TRANSFER_VEHICLES_CONFIRM;

  const vehiclesRaw = d.vehicles;
  const vehicles = vehiclesRaw ?? 1;
  if (vehiclesRaw != null && (!Number.isFinite(vehiclesRaw) || vehiclesRaw < 1)) {
    errors.push('Vehicles must be at least 1');
  } else if (vehiclesRaw != null && !Number.isInteger(vehiclesRaw)) {
    errors.push('Vehicles must be a whole number');
  } else if (vehicles < 1) {
    errors.push('Vehicles must be at least 1');
  }

  const unusualQty = Number.isFinite(vehicles) && vehicles > softWarn;
  if (unusualQty) {
    warnings.push(
      `Unusual quantity: ${vehicles.toLocaleString()} vehicle${vehicles === 1 ? '' : 's'}. Please verify before saving.`,
    );
  }
  const requiresUnusualVehiclesConfirm =
    Number.isFinite(vehicles) && vehicles > confirmAbove && !d.unusualVehiclesConfirmed;
  if (requiresUnusualVehiclesConfirm) {
    errors.push(
      `Confirm unusual quantity (${vehicles.toLocaleString()} vehicles) before saving`,
    );
  }

  const outsideTrip = isServiceDateOutsideTrip(
    d.serviceDate,
    opts?.tripStartDate,
    opts?.tripEndDate,
  );
  const requiresServiceDateOverride = outsideTrip && !d.serviceDateOutsideTripOverride;
  if (requiresServiceDateOverride) {
    errors.push(
      `Service date is outside the trip dates: ${formatTripDateRangeLabel(
        opts?.tripStartDate,
        opts?.tripEndDate,
      )}.`,
    );
  } else if (outsideTrip && d.serviceDateOutsideTripOverride) {
    warnings.push(
      'Service date is outside the trip window — authorised as pre/post-trip service.',
    );
  }

  const routeWarn = transferRoutePlausibilityWarning(d, {
    routeDistanceKm: opts?.routeDistanceKm,
  });
  if (routeWarn) warnings.push(routeWarn);

  if (!d.fromPlaceId) matchBlockedReasons.push('select From place');
  if (!d.toPlaceId) matchBlockedReasons.push('select To place');
  if (!d.vehicleTypeId) matchBlockedReasons.push('select vehicle');
  if (!d.serviceDate) matchBlockedReasons.push('select service date');
  if (
    vehiclesRaw != null &&
    (!Number.isFinite(vehiclesRaw) || vehiclesRaw < 1 || !Number.isInteger(vehiclesRaw))
  ) {
    matchBlockedReasons.push('set a valid vehicle quantity');
  }

  const buy = opts?.buyUnit;
  const sell = opts?.sellUnit;
  if (
    buy != null &&
    sell != null &&
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    sell < buy
  ) {
    errors.push(
      `Sell (${sell}) is below buy (${buy}) — fix markup or buy rate before saving`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    routeWarning: routeWarn,
    matchBlockedReasons,
    requiresUnusualVehiclesConfirm,
    requiresServiceDateOverride,
  };
}

/** Per-person activity: base cost = buy unit × travellers. */
export function activityBaseCost(
  buyUnitRate: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (buyUnitRate == null || !Number.isFinite(buyUnitRate)) return null;
  const qty = quantityFromServiceDetails('activity', details, 1);
  return round2(buyUnitRate * qty);
}

export function activityUnitSellFromSuggestedTotal(
  suggestedTotal: number | null,
  details: QuoteServiceDetails | undefined,
): number | null {
  if (suggestedTotal == null) return null;
  const qty = quantityFromServiceDetails('activity', details, 1);
  if (qty <= 0) return suggestedTotal;
  return round2(suggestedTotal / qty);
}

export function activityAutoDescription(details: QuoteServiceDetails | undefined): string | null {
  if (!details) return null;
  const parts: string[] = [];
  const name = details.propertyName?.trim() || details.placeName?.trim();
  if (name) parts.push(name);
  if (details.privateOrSic === 'private') parts.push('Private');
  if (details.privateOrSic === 'sic') parts.push('SIC');
  const adults = Math.max(0, Math.round(details.adults ?? 0));
  const children = Math.max(0, Math.round(details.children ?? 0));
  if (adults || children) {
    const bits: string[] = [];
    if (adults) bits.push(`${adults} adult${adults === 1 ? '' : 's'}`);
    if (children) bits.push(`${children} child${children === 1 ? '' : 'ren'}`);
    parts.push(bits.join(', '));
  }
  if (details.activityDate) parts.push(details.activityDate);
  if (details.activityTime) parts.push(details.activityTime);
  return parts.length ? parts.join(' · ') : null;
}

export function looksLikeActivityAutoDescription(current: string): boolean {
  const trimmed = current.trim();
  if (!trimmed) return true;
  if (/^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  if (/\b(private|sic)\b/i.test(trimmed) && /\b(adult|child)/i.test(trimmed)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(trimmed) && trimmed.includes('·')) return true;
  return false;
}

export function shouldReplaceActivityDescription(
  current: string,
  details: QuoteServiceDetails | undefined,
): boolean {
  const trimmed = current.trim();
  if (!trimmed || /^new service$/i.test(trimmed) || /^service$/i.test(trimmed)) return true;
  const auto = activityAutoDescription(details);
  if (!auto) return false;
  if (trimmed === auto) return false;
  if (/^day\s+\d+:\s*new service$/i.test(trimmed)) return true;
  if (looksLikeActivityAutoDescription(trimmed)) return true;
  return false;
}

export type ActivityV1Validation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  requiresServiceDateOverride: boolean;
};

export function validateActivityV1(
  details: QuoteServiceDetails | undefined,
  opts?: {
    buyUnit?: number | null;
    sellUnit?: number | null;
    tripStartDate?: string | null;
    tripEndDate?: string | null;
  },
): ActivityV1Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = details || {};

  if (!d.propertyName?.trim() && !d.placeName?.trim()) {
    errors.push('Enter an activity name');
  }
  if (!d.activityDate) {
    errors.push('Select activity date');
  }

  if (d.adults != null && d.adults < 0) errors.push('Adults cannot be negative');
  if (d.children != null && d.children < 0) errors.push('Children cannot be negative');

  const adults = Math.max(0, Math.round(d.adults ?? 0));
  const children = Math.max(0, Math.round(d.children ?? 0));
  if (adults + children <= 0) {
    warnings.push('No travellers set — quantity will default to 1');
  }
  if (!d.privateOrSic) {
    warnings.push('Private vs SIC not selected');
  }

  let requiresServiceDateOverride = false;
  if (
    d.activityDate &&
    isServiceDateOutsideTrip(d.activityDate, opts?.tripStartDate, opts?.tripEndDate)
  ) {
    if (d.serviceDateOutsideTripOverride) {
      warnings.push('Activity date is outside the trip window (override recorded)');
    } else {
      errors.push('Activity date is outside the trip window');
      requiresServiceDateOverride = true;
    }
  }

  const buy = opts?.buyUnit;
  const sell = opts?.sellUnit;
  if (
    buy != null &&
    sell != null &&
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    sell < buy
  ) {
    errors.push(
      `Sell (${sell}) is below buy (${buy}) — fix markup or buy rate before saving`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    requiresServiceDateOverride,
  };
}

/** Stable fingerprint of fields that invalidate a directory match. */
export function rateMatchFingerprint(
  serviceType: QuoteServiceType | string | undefined,
  details: QuoteServiceDetails | undefined,
): string {
  const d = details || {};
  if (serviceType === 'hotel') {
    return HOTEL_RATE_MATCH_KEYS.map((k) => String(d[k] ?? '')).join('|');
  }
  if (serviceType === 'transfer') {
    return TRANSFER_RATE_MATCH_KEYS.map((k) => String(d[k] ?? '')).join('|');
  }
  return '';
}

/** Whether the drawer should auto-call `/rates/resolve` after match keys changed. */
export function shouldAutoRematchRate(opts: {
  open: boolean;
  readOnly?: boolean;
  rateMatchStale: boolean;
  keepManualConfirmed?: boolean;
  matching?: boolean;
  serviceType: QuoteServiceType | string | undefined;
  details: QuoteServiceDetails | undefined;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}): boolean {
  if (!opts.open || opts.readOnly || opts.matching) return false;
  if (!opts.rateMatchStale || opts.keepManualConfirmed) return false;
  if (opts.serviceType === 'hotel') {
    return validateHotelV1(opts.details).matchBlockedReasons.length === 0;
  }
  if (opts.serviceType === 'transfer') {
    return (
      validateTransferV1(opts.details, {
        tripStartDate: opts.tripStartDate,
        tripEndDate: opts.tripEndDate,
      }).matchBlockedReasons.length === 0
    );
  }
  return false;
}

export type RateResolveHit = {
  matched: boolean;
  rateKind?: string | null;
  rateId?: string | null;
  unitCost: number;
  unitSell: number;
  quantity: number;
  taxPercent: number;
  pricingUnit?: string | null;
  rateMeta?: Record<string, unknown> | null;
};

/**
 * Apply a `/rates/resolve` hit onto quote line pricing.
 * Preserves prior sell when `details.sellManual` is set (unless `forceSell` is true).
 */
export function applyRateResolveHit(opts: {
  serviceType: QuoteServiceType | string | undefined;
  details: QuoteServiceDetails | undefined;
  hit: RateResolveHit;
  defaultMarkupPercent?: number;
  previousUnitSell?: number | null;
  forceSell?: boolean;
}): {
  details: QuoteServiceDetails;
  quantity: number;
  unitCost: number | null;
  unitSell: number | null;
  taxPercent: number;
  rateId: string | undefined;
  rateUnmatched: boolean;
  rateKind: 'hotel' | 'transfer' | undefined;
  pricingUnit?: string;
} {
  const serviceType =
    opts.serviceType === 'transfer'
      ? 'transfer'
      : opts.serviceType === 'hotel'
        ? 'hotel'
        : undefined;
  const baseDetails = opts.details || {};
  const markupPercent = opts.defaultMarkupPercent ?? 20;
  const meta = opts.hit.rateMeta || {};

  if (!opts.hit.matched || !serviceType) {
    return {
      details: {
        ...baseDetails,
        priceSource: 'none',
        rateLabel: undefined,
        rateSupplierLabel: undefined,
        rateValidFrom: undefined,
        rateValidTo: undefined,
      },
      quantity: quantityFromServiceDetails(serviceType || 'custom', baseDetails, 1),
      unitCost: null,
      unitSell: null,
      taxPercent: opts.hit.taxPercent ?? 0,
      rateId: undefined,
      rateUnmatched: true,
      rateKind: serviceType,
    };
  }

  const withNights =
    serviceType === 'hotel' ? withCalculatedHotelNights(baseDetails) : baseDetails;
  const labelParts =
    serviceType === 'transfer'
      ? [
          withNights.fromPlaceName || withNights.toPlaceName
            ? `${withNights.fromPlaceName || '…'} → ${withNights.toPlaceName || '…'}`
            : null,
          withNights.vehicleLabel,
        ].filter(Boolean)
      : [
          withNights.propertyName,
          (meta.roomType as string) || withNights.roomType,
          withNights.mealPlan,
        ].filter(Boolean);

  const sellManual = !opts.forceSell && Boolean(withNights.sellManual);
  const nextDetails: QuoteServiceDetails = {
    ...withNights,
    priceSource: 'matched',
    sellManual,
    rateLabel:
      labelParts.join(' · ') ||
      (serviceType === 'transfer' ? 'Matched transfer rate' : 'Matched hotel rate'),
    rateSupplierLabel: meta.isSystem
      ? 'System / platform rate'
      : withNights.supplierName ||
        (serviceType === 'transfer' ? 'Transport rate directory' : 'Direct contract'),
    rateValidFrom: typeof meta.startDate === 'string' ? meta.startDate : undefined,
    rateValidTo: typeof meta.endDate === 'string' ? meta.endDate : undefined,
    markupMode: withNights.markupMode || 'percent',
    markupValue: withNights.markupValue ?? markupPercent,
  };

  const qty = quantityFromServiceDetails(
    serviceType,
    nextDetails,
    Math.max(1, opts.hit.quantity || 1),
  );
  const base =
    serviceType === 'transfer'
      ? transferBaseCost(opts.hit.unitCost, nextDetails)
      : hotelBaseCost(opts.hit.unitCost, nextDetails);
  const suggested = suggestedSellFromMarkup(
    base,
    nextDetails.markupMode,
    nextDetails.markupValue ?? markupPercent,
  );
  const suggestedUnit =
    (serviceType === 'transfer'
      ? transferUnitSellFromSuggestedTotal(suggested, nextDetails)
      : unitSellFromSuggestedTotal(suggested, nextDetails)) ?? opts.hit.unitSell;

  const unitSell =
    sellManual && opts.previousUnitSell != null && Number.isFinite(opts.previousUnitSell)
      ? opts.previousUnitSell
      : suggestedUnit;

  return {
    details: nextDetails,
    quantity: qty,
    unitCost: opts.hit.unitCost,
    unitSell,
    taxPercent: opts.hit.taxPercent ?? 0,
    rateId: opts.hit.rateId || undefined,
    rateUnmatched: false,
    rateKind: serviceType,
    pricingUnit: opts.hit.pricingUnit || undefined,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
