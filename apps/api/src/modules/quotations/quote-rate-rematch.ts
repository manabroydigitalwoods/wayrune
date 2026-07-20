/**
 * Server rematch after template apply / from-package — clear rates then live /rates/resolve.
 */

import type {
  QuotationItem,
  ResolveRatesInput,
  ResolveRatesItemInput,
} from '@wayrune/contracts';
import { QuotationItemSchema } from '@wayrune/contracts';
import {
  matchAcceptedFromMeta,
  matchRejectedCompactFromMeta,
  matchSummaryFromAccepted,
} from '@wayrune/contracts';
import { isoDayDiff, parseIsoDay } from './quote-template-content';
import type { RatesService } from '../rates/rates.service';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function nightsBetweenIso(
  checkIn?: string | null,
  checkOut?: string | null,
): number | null {
  const a = parseIsoDay(checkIn);
  const b = parseIsoDay(checkOut);
  if (!a || !b) return null;
  const d = isoDayDiff(a, b);
  return d > 0 ? d : null;
}

function serviceTypeOf(
  item: QuotationItem,
): 'hotel' | 'transfer' | 'activity' | undefined {
  const t = item.serviceType || item.rateKind;
  if (t === 'hotel' || t === 'transfer' || t === 'activity') return t;
  return undefined;
}

function hotelQuantityFromDetails(
  details: QuotationItem['details'],
): number | null {
  if (!details) return null;
  const nights =
    nightsBetweenIso(
      typeof details.checkIn === 'string' ? details.checkIn : null,
      typeof details.checkOut === 'string' ? details.checkOut : null,
    ) ??
    (typeof details.nights === 'number' ? details.nights : null);
  if (nights == null || nights <= 0) return null;
  const rooms = Math.max(1, Math.round(Number(details.rooms) || 1));
  const adults = Math.max(0, Math.round(Number(details.adults) || 0));
  const children = Math.max(0, Math.round(Number(details.children) || 0));
  const pax = Math.max(1, adults + children);
  const basis =
    typeof details.rateBasis === 'string' ? details.rateBasis : 'per_room_night';
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

function quantityFromDetails(
  serviceType: 'hotel' | 'transfer' | 'activity',
  details: QuotationItem['details'],
  fallback = 1,
): number {
  if (!details) return fallback;
  if (serviceType === 'hotel') {
    return hotelQuantityFromDetails(details) ?? fallback;
  }
  if (serviceType === 'transfer') {
    return Math.max(1, Math.round(Number(details.vehicles) || fallback));
  }
  const adults = Math.max(0, Math.round(Number(details.adults) || 0));
  const children = Math.max(0, Math.round(Number(details.children) || 0));
  const pax = adults + children;
  return pax > 0 ? pax : fallback;
}

function suggestedSellFromMarkup(
  baseCost: number | null,
  mode: string | undefined,
  markupValue: number | undefined,
): number | null {
  if (baseCost == null) return null;
  const modeSafe = mode === 'fixed' ? 'fixed' : 'percent';
  const value = markupValue ?? 0;
  if (modeSafe === 'fixed') return round2(baseCost + value);
  return round2(baseCost * (1 + value / 100));
}

function minVehiclesForParty(
  party: number | null | undefined,
  seatsPerVehicle: number | null | undefined,
): number | null {
  const seats = Number(seatsPerVehicle);
  const pax = Math.max(0, Math.round(Number(party) || 0));
  if (!Number.isFinite(seats) || seats <= 0 || pax <= 0) return null;
  return Math.max(1, Math.ceil(pax / seats));
}

function bumpTransferVehiclesForCapacity(input: {
  vehicles?: number | null;
  party?: number | null;
  seatsPerVehicle?: number | null;
}): { vehicles: number; bumped: boolean } {
  const previous = Math.max(1, Math.round(Number(input.vehicles) || 1));
  const min = minVehiclesForParty(input.party, input.seatsPerVehicle);
  if (min == null || previous >= min) {
    return { vehicles: previous, bumped: false };
  }
  return { vehicles: min, bumped: true };
}

function formatTransferCapacityNote(input: {
  party?: number | null;
  seatsPerVehicle?: number | null;
  vehicles?: number | null;
}): string | null {
  const seats = Number(input.seatsPerVehicle);
  if (!Number.isFinite(seats) || seats <= 0) return null;
  const vehicles = Math.max(1, Math.round(Number(input.vehicles) || 1));
  const capacity = seats * vehicles;
  const party = Math.max(0, Math.round(Number(input.party) || 0));
  if (party <= 0) {
    return `${capacity} seat(s) across ${vehicles} vehicle(s).`;
  }
  if (party > capacity) {
    return `Insufficient capacity: party of ${party} exceeds ${capacity} seat(s) (${seats}×${vehicles}).`;
  }
  return `Party of ${party} fits ${capacity} seat(s) (${seats}×${vehicles}).`;
}

export type RateResolveHitLike = {
  itemId: string;
  matched: boolean;
  rateKind?: 'hotel' | 'transfer' | 'activity' | null;
  rateId?: string | null;
  unitCost: number;
  unitSell: number;
  quantity: number;
  taxPercent?: number;
  pricingUnit?: string | null;
  rateMeta?: Record<string, unknown> | null;
};

/** Build a /rates/resolve item from a quote line (hotel / transfer / activity). */
export function resolvePayloadFromQuoteItem(
  item: QuotationItem,
  fallbackDate?: string | null,
): ResolveRatesItemInput | null {
  const serviceType = serviceTypeOf(item);
  const details = item.details;
  if (!serviceType || !details) return null;

  if (serviceType === 'hotel' || serviceType === 'transfer') {
    const nights =
      nightsBetweenIso(
        typeof details.checkIn === 'string' ? details.checkIn : null,
        typeof details.checkOut === 'string' ? details.checkOut : null,
      ) ??
      (typeof details.nights === 'number' ? details.nights : undefined);
    return {
      itemId: item.id,
      type: serviceType,
      date:
        serviceType === 'transfer'
          ? (typeof details.serviceDate === 'string'
              ? details.serviceDate
              : null) ||
            fallbackDate ||
            (typeof details.checkIn === 'string' ? details.checkIn : null) ||
            null
          : (typeof details.checkIn === 'string' ? details.checkIn : null) ||
            (typeof details.serviceDate === 'string'
              ? details.serviceDate
              : null) ||
            fallbackDate ||
            null,
      details: {
        supplierId:
          typeof details.supplierId === 'string' ? details.supplierId : undefined,
        placeId: typeof details.placeId === 'string' ? details.placeId : undefined,
        roomType: typeof details.roomType === 'string' ? details.roomType : undefined,
        roomProductId:
          typeof details.roomProductId === 'string'
            ? details.roomProductId
            : undefined,
        mealPlan: typeof details.mealPlan === 'string' ? details.mealPlan : undefined,
        nationality:
          typeof details.nationality === 'string' ? details.nationality : undefined,
        nationalities: Array.isArray(details.nationalities)
          ? details.nationalities.filter((n): n is string => typeof n === 'string')
          : undefined,
        nights: nights ?? undefined,
        rooms: typeof details.rooms === 'number' ? details.rooms : undefined,
        adults: typeof details.adults === 'number' ? details.adults : undefined,
        children:
          typeof details.children === 'number' ? details.children : undefined,
        childAges: Array.isArray(details.childAges)
          ? details.childAges.filter((n): n is number => typeof n === 'number')
          : undefined,
        childrenWithoutBed:
          typeof details.childrenWithoutBed === 'number'
            ? details.childrenWithoutBed
            : undefined,
        vehicleTypeId:
          typeof details.vehicleTypeId === 'string'
            ? details.vehicleTypeId
            : undefined,
        fromPlaceId:
          typeof details.fromPlaceId === 'string' ? details.fromPlaceId : undefined,
        toPlaceId:
          typeof details.toPlaceId === 'string' ? details.toPlaceId : undefined,
      },
    };
  }

  return {
    itemId: item.id,
    type: 'activity',
    date:
      (typeof details.activityDate === 'string' ? details.activityDate : null) ||
      (typeof details.serviceDate === 'string' ? details.serviceDate : null) ||
      fallbackDate ||
      null,
    details: {
      supplierId:
        typeof details.supplierId === 'string' ? details.supplierId : undefined,
      placeId: typeof details.placeId === 'string' ? details.placeId : undefined,
      propertyName:
        typeof details.propertyName === 'string' ? details.propertyName : undefined,
      activityName:
        (typeof details.propertyName === 'string' ? details.propertyName : null) ||
        (typeof details.placeName === 'string' ? details.placeName : undefined),
      privateOrSic:
        details.privateOrSic === 'private' || details.privateOrSic === 'sic'
          ? details.privateOrSic
          : undefined,
      adults: typeof details.adults === 'number' ? details.adults : undefined,
      children: typeof details.children === 'number' ? details.children : undefined,
      childAges: Array.isArray(details.childAges)
        ? details.childAges.filter((n): n is number => typeof n === 'number')
        : undefined,
    },
  };
}

export function buildResolveRatesInput(opts: {
  items: QuotationItem[];
  startDate: string;
  adults?: number;
  children?: number;
  infants?: number;
  partyId?: string | null;
  /** Trip/traveller guest nationality fallback when lines omit nationality. */
  nationality?: string | null;
  nationalities?: string[] | null;
  /** Trip destination POS for hotel buy tip Match. */
  destinationPlaceOfSupply?: string | null;
}): ResolveRatesInput | null {
  const resolveItems = opts.items
    .map((item) => resolvePayloadFromQuoteItem(item, opts.startDate))
    .filter((x): x is ResolveRatesItemInput => Boolean(x));
  if (!resolveItems.length) return null;
  return {
    startDate: opts.startDate,
    adults: opts.adults,
    children: opts.children,
    infants: opts.infants,
    partyId: opts.partyId ?? undefined,
    nationality: opts.nationality?.trim() || undefined,
    nationalities: opts.nationalities?.length
      ? opts.nationalities
      : undefined,
    destinationPlaceOfSupply:
      opts.destinationPlaceOfSupply?.trim() || undefined,
    items: resolveItems,
  };
}

function buildThinProvenance(opts: {
  rateKind: 'hotel' | 'transfer' | 'activity';
  rateId: string;
  unitCost: number;
  rateMeta?: Record<string, unknown> | null;
  vehicleSeats?: number | null;
  capacityNote?: string | null;
}): NonNullable<QuotationItem['rateProvenance']> {
  const meta = opts.rateMeta || {};
  const str = (key: string) => {
    const v = meta[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const num = (key: string) => {
    const v = meta[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return undefined;
  };
  const capacityWarn = Boolean(
    opts.capacityNote?.startsWith('Insufficient capacity'),
  );
  const matchAccepted = matchAcceptedFromMeta(meta);
  const matchRejectedCompact = matchRejectedCompactFromMeta(meta);
  const matchSummary = matchSummaryFromAccepted(matchAccepted);
  return {
    rateId: opts.rateId,
    rateKind: opts.rateKind,
    matchedAt: new Date().toISOString(),
    unitCostAtMatch: opts.unitCost,
    isSystem: meta.isSystem === true,
    supplierId: str('supplierId'),
    placeId: str('placeId'),
    roomType: str('roomType'),
    mealPlan: str('mealPlan'),
    rateUpdatedAt: str('updatedAt'),
    currency: str('currency'),
    fromPlaceId: str('fromPlaceId'),
    toPlaceId: str('toPlaceId'),
    vehicleTypeId: str('vehicleTypeId'),
    vehicleSeats: opts.vehicleSeats ?? num('vehicleSeats') ?? num('capacity'),
    ...(opts.capacityNote
      ? {
          capacityNote: opts.capacityNote,
          ...(capacityWarn ? { capacityWarn: true as const } : {}),
        }
      : {}),
    ...(matchSummary ? { matchSummary } : {}),
    ...(matchAccepted.length ? { matchAccepted } : {}),
    ...(matchRejectedCompact.length ? { matchRejectedCompact } : {}),
  };
}

/** Apply one resolve hit onto a cleared quote line (force sell from markup). */
export function applyRateResolveHitToItem(opts: {
  item: QuotationItem;
  hit: RateResolveHitLike;
  defaultMarkupPercent: number;
}): QuotationItem {
  const serviceType =
    serviceTypeOf(opts.item) ||
    (opts.hit.rateKind === 'hotel' ||
    opts.hit.rateKind === 'transfer' ||
    opts.hit.rateKind === 'activity'
      ? opts.hit.rateKind
      : undefined);
  const details = { ...(opts.item.details || {}) };

  if (!opts.hit.matched || !serviceType || !opts.hit.rateId) {
    return QuotationItemSchema.parse({
      ...opts.item,
      details: { ...details, priceSource: 'none' },
      unitCost: null,
      unitSell: null,
      rateId: undefined,
      rateProvenance: undefined,
      rateUnmatched: true,
      rateKind: serviceType,
    });
  }

  const markupMode =
    details.markupMode === 'fixed' ? 'fixed' : ('percent' as const);
  const markupValue =
    typeof details.markupValue === 'number'
      ? details.markupValue
      : opts.defaultMarkupPercent;

  let vehicles = Math.max(1, Math.round(Number(details.vehicles) || 1));
  const meta = opts.hit.rateMeta || {};
  const seatsRaw = meta.vehicleSeats ?? meta.capacity;
  const seats =
    typeof seatsRaw === 'number' && Number.isFinite(seatsRaw)
      ? seatsRaw
      : typeof seatsRaw === 'string' && Number.isFinite(Number(seatsRaw))
        ? Number(seatsRaw)
        : null;
  let capacityNote: string | null = null;
  if (serviceType === 'transfer') {
    const party =
      Math.max(0, Number(details.adults) || 0) +
      Math.max(0, Number(details.children) || 0);
    const bump = bumpTransferVehiclesForCapacity({
      vehicles,
      party,
      seatsPerVehicle: seats,
    });
    vehicles = bump.vehicles;
    details.vehicles = vehicles;
    capacityNote = formatTransferCapacityNote({
      party,
      seatsPerVehicle: seats,
      vehicles,
    });
  }

  details.priceSource = 'matched';
  details.sellManual = false;
  details.markupMode = markupMode;
  details.markupValue = markupValue;

  const qty = quantityFromDetails(
    serviceType,
    details,
    Math.max(1, opts.hit.quantity || 1),
  );
  const base = round2(opts.hit.unitCost * qty);
  const suggested = suggestedSellFromMarkup(base, markupMode, markupValue);
  const unitSell =
    suggested != null && qty > 0 ? round2(suggested / qty) : opts.hit.unitSell;

  return QuotationItemSchema.parse({
    ...opts.item,
    details,
    quantity: qty,
    unitCost: opts.hit.unitCost,
    unitSell,
    taxPercent: opts.hit.taxPercent ?? opts.item.taxPercent ?? 0,
    pricingUnit: opts.hit.pricingUnit || opts.item.pricingUnit,
    rateId: opts.hit.rateId,
    rateKind: serviceType,
    rateUnmatched: false,
    rateBlockReason: undefined,
    rateProvenance: buildThinProvenance({
      rateKind: serviceType,
      rateId: opts.hit.rateId,
      unitCost: opts.hit.unitCost,
      rateMeta: meta,
      vehicleSeats: seats,
      capacityNote,
    }),
  });
}

export async function rematchQuoteItemsFromRates(
  rates: RatesService,
  organizationId: string,
  items: QuotationItem[],
  opts: {
    startDate: string;
    adults?: number;
    children?: number;
    infants?: number;
    partyId?: string | null;
    nationality?: string | null;
    nationalities?: string[] | null;
    destinationPlaceOfSupply?: string | null;
  },
): Promise<{
  items: QuotationItem[];
  matchedCount: number;
  unmatchedCount: number;
}> {
  const input = buildResolveRatesInput({
    items,
    startDate: opts.startDate,
    adults: opts.adults,
    children: opts.children,
    infants: opts.infants,
    partyId: opts.partyId,
    nationality: opts.nationality,
    nationalities: opts.nationalities,
    destinationPlaceOfSupply: opts.destinationPlaceOfSupply,
  });
  if (!input) {
    return { items, matchedCount: 0, unmatchedCount: 0 };
  }

  const resolved = await rates.resolve(organizationId, input);
  const byId = new Map(resolved.items.map((hit) => [hit.itemId, hit]));
  const next = items.map((item) => {
    const hit = byId.get(item.id);
    if (!hit) return item;
    return applyRateResolveHitToItem({
      item,
      hit: {
        itemId: hit.itemId,
        matched: hit.matched,
        rateKind: hit.rateKind,
        rateId: hit.rateId,
        unitCost: hit.unitCost,
        unitSell: hit.unitSell,
        quantity: hit.quantity,
        taxPercent: hit.taxPercent,
        pricingUnit: hit.pricingUnit,
        rateMeta: (hit.rateMeta || null) as Record<string, unknown> | null,
      },
      defaultMarkupPercent: resolved.markupPercent ?? 20,
    });
  });

  return {
    items: next,
    matchedCount: resolved.matchedCount,
    unmatchedCount: resolved.unmatchedCount,
  };
}
