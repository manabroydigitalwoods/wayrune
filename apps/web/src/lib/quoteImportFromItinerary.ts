import type { QuoteServiceType } from '@wayrune/contracts';

export type ImportDisposition =
  | 'import_as_service'
  | 'included_with_hotel'
  | 'no_price_required'
  | 'skip';

/** Rate directory preview shown in the import review modal before confirm. */
export type QuoteImportRatePreview = {
  status: 'idle' | 'loading' | 'matched' | 'unmatched' | 'skipped' | 'error';
  unitCost?: number | null;
  unitSell?: number | null;
  quantity?: number;
  taxPercent?: number;
  pricingUnit?: string;
  rateId?: string | null;
  rateKind?: 'hotel' | 'transfer' | null;
  rateMeta?: Record<string, unknown> | null;
  message?: string;
};

export type QuoteImportCandidate = {
  id: string;
  lineId: string;
  dayNumber: number;
  date?: string | null;
  title: string;
  itemType: string;
  serviceType: QuoteServiceType;
  disposition: ImportDisposition;
  /** User can toggle whether this becomes a commercial line. */
  selected: boolean;
  reason: string;
  resolveItem?: {
    itemId: string;
    type: string;
    date?: string | null;
    details?: Record<string, unknown>;
  };
  ratePreview?: QuoteImportRatePreview;
};

function normalizeType(type: unknown): string {
  if (type === 'activity') return 'sightseeing';
  return typeof type === 'string' ? type : 'custom';
}

function isMealIncludedWithStay(title: string, itemType: string): boolean {
  if (itemType !== 'meal') return false;
  const t = title.toLowerCase();
  return (
    t.includes('breakfast') ||
    t.includes('dinner') ||
    t.includes('lunch') ||
    t.includes('meal plan') ||
    t.includes('map') ||
    t.includes('cp ') ||
    t.startsWith('cp')
  );
}

function looksLikeFreeExperience(title: string, itemType: string): boolean {
  if (itemType !== 'sightseeing' && itemType !== 'free_time') return false;
  const t = title.toLowerCase();
  const freeHints = [
    'mall road',
    'evening stroll',
    'leisure',
    'free time',
    'viewpoint',
    'view point',
    'walk',
    'explore',
    'check-in',
    'check in',
    'welcome',
    'batasia',
    'delo hill',
  ];
  return freeHints.some((h) => t.includes(h));
}

function serviceTypeForItem(itemType: string): QuoteServiceType {
  switch (itemType) {
    case 'hotel':
      return 'hotel';
    case 'transfer':
      return 'transfer';
    case 'sightseeing':
      return 'activity';
    case 'meal':
      return 'meal';
    case 'flight':
      return 'flight';
    case 'train':
      return 'train';
    default:
      return 'custom';
  }
}

function hotelClusterKey(c: QuoteImportCandidate): string {
  const placeId = c.resolveItem?.details?.placeId;
  if (typeof placeId === 'string' && placeId) return `place:${placeId}`;
  return `title:${c.title.trim().toLowerCase()}`;
}

/**
 * Collapse consecutive same-property hotel nights into one commercial stay,
 * keeping sibling nights visible as “included with hotel”.
 */
export function consolidateHotelStays(
  candidates: QuoteImportCandidate[],
): QuoteImportCandidate[] {
  const hotels = candidates
    .filter((c) => c.itemType === 'hotel' && c.disposition === 'import_as_service')
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber || a.title.localeCompare(b.title));
  const others = candidates.filter(
    (c) => !(c.itemType === 'hotel' && c.disposition === 'import_as_service'),
  );
  if (hotels.length <= 1) return candidates;

  const clusters: QuoteImportCandidate[][] = [];
  let current: QuoteImportCandidate[] = [];
  for (const h of hotels) {
    if (!current.length) {
      current = [h];
      continue;
    }
    const prev = current[current.length - 1]!;
    const consecutive =
      h.dayNumber === prev.dayNumber || h.dayNumber === prev.dayNumber + 1;
    if (consecutive && hotelClusterKey(h) === hotelClusterKey(prev)) {
      current.push(h);
    } else {
      clusters.push(current);
      current = [h];
    }
  }
  if (current.length) clusters.push(current);

  const consolidated: QuoteImportCandidate[] = [];
  for (const cluster of clusters) {
    const first = cluster[0]!;
    const last = cluster[cluster.length - 1]!;
    const explicitNights = Number(first.resolveItem?.details?.nights);
    const spanNights = Math.max(cluster.length, last.dayNumber - first.dayNumber + 1);
    const nights =
      cluster.length > 1
        ? spanNights
        : Number.isFinite(explicitNights) && explicitNights > 0
          ? explicitNights
          : spanNights;

    if (cluster.length === 1) {
      consolidated.push(first);
      continue;
    }

    const baseTitle = first.title.replace(/\s*[·•-]\s*\d+\s*nights?\b/i, '').trim();
    consolidated.push({
      ...first,
      title: `${baseTitle} · ${nights} night${nights === 1 ? '' : 's'}`,
      reason: `Hotel stay (days ${first.dayNumber}–${last.dayNumber}) — one commercial line`,
      resolveItem: first.resolveItem
        ? {
            ...first.resolveItem,
            details: {
              ...first.resolveItem.details,
              nights,
              ...(typeof first.resolveItem.details?.checkIn === 'string' && nights > 0
                ? (() => {
                    const checkIn = String(first.resolveItem!.details!.checkIn).slice(0, 10);
                    const d = new Date(`${checkIn}T12:00:00`);
                    d.setDate(d.getDate() + nights);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return { checkOut: `${y}-${m}-${day}` };
                  })()
                : {}),
            },
          }
        : undefined,
      ratePreview: first.ratePreview || { status: 'idle' },
    });

    for (const sibling of cluster.slice(1)) {
      consolidated.push({
        ...sibling,
        disposition: 'included_with_hotel',
        selected: false,
        reason: `Included in stay starting day ${first.dayNumber}`,
        resolveItem: undefined,
      });
    }
  }

  return [...consolidated, ...others].sort(
    (a, b) => a.dayNumber - b.dayNumber || a.title.localeCompare(b.title),
  );
}

export function buildQuoteImportCandidates(input: {
  days: Array<{
    dayNumber: number;
    date?: string | null;
    destination?: unknown;
    items?: Array<{
      id: string;
      title?: string;
      type?: string;
      customerVisible?: boolean;
      location?: unknown;
      details?: Record<string, unknown>;
    }>;
  }>;
  tripStartDate?: string | null;
  existingLineIds?: Set<string>;
  placeIdFrom?: (loc: unknown) => string | undefined;
}): QuoteImportCandidate[] {
  const existing = input.existingLineIds || new Set<string>();
  const hasHotelOnTrip = input.days.some((d) =>
    (d.items || []).some((i) => normalizeType(i.type) === 'hotel'),
  );
  const out: QuoteImportCandidate[] = [];

  for (const day of input.days) {
    for (const item of day.items || []) {
      if (item.customerVisible === false) continue;
      const itemType = normalizeType(item.type);
      if (itemType === 'note' || itemType === 'free_time') continue;

      const lineId = `itin-${item.id}`;
      if (existing.has(lineId)) continue;

      const title = (item.title || '').trim() || 'Untitled';
      const serviceType = serviceTypeForItem(itemType);
      let disposition: ImportDisposition = 'import_as_service';
      let reason = 'Commercial service candidate';
      let selected = true;

      if (hasHotelOnTrip && isMealIncludedWithStay(title, itemType)) {
        disposition = 'included_with_hotel';
        reason = 'Likely included in hotel meal plan — no separate quote line';
        selected = false;
      } else if (looksLikeFreeExperience(title, itemType)) {
        disposition = 'no_price_required';
        reason = 'Itinerary experience — usually not separately billed';
        selected = false;
      } else if (itemType === 'sightseeing') {
        disposition = 'import_as_service';
        reason = 'Potential activity — confirm if billable';
        selected = false;
      } else if (itemType === 'hotel') {
        reason = 'Hotel stay — map to supplier rate';
      } else if (itemType === 'transfer') {
        reason = 'Transfer — map to transport rate';
      }

      const candidate: QuoteImportCandidate = {
        id: item.id,
        lineId,
        dayNumber: day.dayNumber,
        date: day.date || input.tripStartDate || null,
        title,
        itemType,
        serviceType,
        disposition,
        selected,
        reason,
      };

      if (itemType === 'hotel' || itemType === 'transfer') {
        const propertyName = title.replace(/\s*[·•-]\s*\d+\s*nights?\b/i, '').trim();
        const nightsRaw = Number(item.details?.nights);
        const nights =
          Number.isFinite(nightsRaw) && nightsRaw > 0 ? nightsRaw : undefined;
        const stayDate = day.date || input.tripStartDate || null;
        const serviceDate =
          typeof stayDate === 'string' ? stayDate.slice(0, 10) : undefined;
        candidate.resolveItem = {
          itemId: lineId,
          type: itemType,
          date: stayDate,
          details: {
            supplierId: item.details?.supplierId,
            placeId:
              item.details?.catalogPlaceId ||
              input.placeIdFrom?.(item.location) ||
              input.placeIdFrom?.(day.destination) ||
              undefined,
            roomType: item.details?.roomType,
            nights,
            vehicleTypeId: item.details?.vehicleTypeId,
            fromPlaceId: item.details?.fromPlaceId,
            toPlaceId: item.details?.toPlaceId,
            ...(itemType === 'hotel'
              ? {
                  propertyName,
                  rooms: 1,
                  checkIn: serviceDate,
                  mealPlan:
                    typeof item.details?.mealPlan === 'string'
                      ? item.details.mealPlan
                      : undefined,
                }
              : {
                  serviceDate,
                  vehicles: 1,
                  fromPlaceName:
                    (typeof item.details?.fromPlaceName === 'string' &&
                      item.details.fromPlaceName) ||
                    (typeof item.details?.from === 'string' && item.details.from) ||
                    undefined,
                  toPlaceName:
                    (typeof item.details?.toPlaceName === 'string' &&
                      item.details.toPlaceName) ||
                    (typeof item.details?.to === 'string' && item.details.to) ||
                    undefined,
                  vehicleLabel:
                    typeof item.details?.vehicleLabel === 'string'
                      ? item.details.vehicleLabel
                      : undefined,
                }),
          },
        };
        candidate.ratePreview = { status: 'idle' };
      }

      out.push(candidate);
    }
  }

  return consolidateHotelStays(out);
}

export function serviceTypeLabel(type: QuoteServiceType | string | undefined): string {
  switch (type) {
    case 'hotel':
      return 'Hotel';
    case 'transfer':
      return 'Transport';
    case 'activity':
      return 'Activity';
    case 'flight':
      return 'Flight';
    case 'train':
      return 'Train';
    case 'visa':
      return 'Visa';
    case 'meal':
      return 'Meal';
    case 'guide':
      return 'Guide';
    case 'insurance':
      return 'Insurance';
    case 'fee':
      return 'Fee';
    case 'discount':
      return 'Discount';
    default:
      return 'Custom';
  }
}

/** Build hotel/transfer quote details + provenance from an import rate preview. */
export function detailsFromImportCandidate(c: QuoteImportCandidate): Record<string, unknown> {
  const base = { ...(c.resolveItem?.details || {}) };
  const preview = c.ratePreview;
  if (c.serviceType === 'hotel') {
    const nightsRaw = Number(base.nights);
    const nights =
      Number.isFinite(nightsRaw) && nightsRaw > 0 ? nightsRaw : 1;
    base.nights = nights;
    const checkIn =
      typeof base.checkIn === 'string'
        ? base.checkIn.slice(0, 10)
        : typeof c.date === 'string'
          ? c.date.slice(0, 10)
          : undefined;
    if (checkIn) {
      base.checkIn = checkIn;
      if (!base.checkOut) {
        const d = new Date(`${checkIn}T12:00:00`);
        d.setDate(d.getDate() + nights);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        base.checkOut = `${y}-${m}-${day}`;
      }
    }
    if (!base.rooms) base.rooms = 1;
    if (!base.rateBasis) base.rateBasis = 'per_room_night';
    if (!base.availability) base.availability = 'unknown';
  }
  if (c.serviceType === 'transfer') {
    if (!base.vehicles) base.vehicles = 1;
    const serviceDate =
      typeof base.serviceDate === 'string'
        ? base.serviceDate.slice(0, 10)
        : typeof c.date === 'string'
          ? c.date.slice(0, 10)
          : undefined;
    if (serviceDate) base.serviceDate = serviceDate;
  }
  if (!preview) return base;
  if (preview.status === 'matched') {
    const meta = preview.rateMeta || {};
    if (c.serviceType === 'transfer') {
      const from =
        typeof base.fromPlaceName === 'string' ? base.fromPlaceName : undefined;
      const to = typeof base.toPlaceName === 'string' ? base.toPlaceName : undefined;
      const vehicle =
        typeof base.vehicleLabel === 'string' ? base.vehicleLabel : undefined;
      const route = from || to ? `${from || '…'} → ${to || '…'}` : undefined;
      const labelParts = [route, vehicle].filter(Boolean);
      base.priceSource = 'matched';
      base.rateLabel = labelParts.length
        ? labelParts.join(' · ')
        : 'Matched transfer rate';
      base.rateSupplierLabel = meta.isSystem
        ? 'System / platform rate'
        : 'Direct contract';
    } else {
      const roomType =
        (typeof meta.roomType === 'string' && meta.roomType) ||
        (typeof base.roomType === 'string' ? base.roomType : undefined);
      const propertyName =
        typeof base.propertyName === 'string' ? base.propertyName : undefined;
      const mealPlan = typeof base.mealPlan === 'string' ? base.mealPlan : undefined;
      const labelParts = [propertyName, roomType, mealPlan].filter(Boolean);
      base.priceSource = 'matched';
      base.rateLabel = labelParts.length ? labelParts.join(' · ') : 'Matched rate';
      base.rateSupplierLabel = meta.isSystem
        ? 'System / platform rate'
        : 'Direct contract';
      if (typeof meta.roomType === 'string' && meta.roomType && !base.roomType) {
        base.roomType = meta.roomType;
      }
    }
    if (typeof meta.startDate === 'string') base.rateValidFrom = meta.startDate;
    if (typeof meta.endDate === 'string') base.rateValidTo = meta.endDate;
  } else if (preview.status === 'unmatched') {
    base.priceSource = 'none';
  }
  return base;
}
