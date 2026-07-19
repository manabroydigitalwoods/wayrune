/** Quantity for hotel allotment holds from booking fields. */

export function hotelAllocationQuantity(input: {
  requiredQuantity?: number | string | { toString(): string } | null;
  travellerRequirementsJson?: unknown;
}): number {
  const fromRequired = Number(input.requiredQuantity);
  if (Number.isFinite(fromRequired) && fromRequired >= 1) {
    return Math.min(50, Math.max(1, Math.floor(fromRequired)));
  }
  const root =
    input.travellerRequirementsJson &&
    typeof input.travellerRequirementsJson === 'object' &&
    !Array.isArray(input.travellerRequirementsJson)
      ? (input.travellerRequirementsJson as Record<string, unknown>)
      : {};
  const fromJson = Number(root.rooms);
  if (Number.isFinite(fromJson) && fromJson >= 1) {
    return Math.min(50, Math.max(1, Math.floor(fromJson)));
  }
  return 1;
}

/**
 * Accept places holds; supplier/ops confirm should upgrade hold → confirmed.
 * Already-confirmed stays idempotent (no upgrade).
 */
export function shouldUpgradeAllotmentHoldOnConfirm(opts: {
  allocationStatus: string | null | undefined;
  bookingStatus: string | null | undefined;
}): boolean {
  return opts.allocationStatus === 'hold' && opts.bookingStatus === 'confirmed';
}

/** True when hold quantity no longer matches booking rooms on confirm. */
export function allocationQuantityNeedsResync(opts: {
  allocationQuantity: number | null | undefined;
  requiredQuantity?: number | string | { toString(): string } | null;
  travellerRequirementsJson?: unknown;
}): boolean {
  const current = Math.floor(Number(opts.allocationQuantity));
  if (!Number.isFinite(current) || current < 1) return true;
  return current !== hotelAllocationQuantity(opts);
}

/**
 * Soft capacity for in-place qty bump. `remaining` already subtracts this hold's
 * quantity from capacity — so increasing by `delta` needs `remaining >= delta`.
 * Decreases always allowed.
 */
export function canResyncAllocationQuantity(opts: {
  remaining: number;
  allocationQuantity: number;
  neededQuantity: number;
}): boolean {
  const current = Math.max(0, Math.floor(opts.allocationQuantity));
  const needed = Math.max(1, Math.floor(opts.neededQuantity));
  const remaining = Math.max(0, Math.floor(opts.remaining));
  const delta = needed - current;
  if (delta <= 0) return true;
  return remaining >= delta;
}

/** UTC calendar day (YYYY-MM-DD) for stay windows. */
export function stayDayIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** True when stay allotment check-in/out no longer match booking start/end days. */
export function allocationDatesNeedResync(opts: {
  allocationCheckIn?: Date | string | null;
  allocationCheckOut?: Date | string | null;
  bookingStartAt?: Date | string | null;
  bookingEndAt?: Date | string | null;
}): boolean {
  const aIn = stayDayIso(opts.allocationCheckIn);
  const aOut = stayDayIso(opts.allocationCheckOut);
  const bIn = stayDayIso(opts.bookingStartAt);
  const bOut = stayDayIso(opts.bookingEndAt);
  if (!aIn || !aOut || !bIn || !bOut) return false;
  return aIn !== bIn || aOut !== bOut;
}

/**
 * Soft capacity for date move. `remaining` is for the *new* window and still
 * counts this allocation when windows overlap — credit its qty in that case.
 */
export function canResyncAllocationDates(opts: {
  remaining: number;
  allocationQuantity: number;
  neededQuantity: number;
  allocationOverlapsNewWindow: boolean;
}): boolean {
  const needed = Math.max(1, Math.floor(opts.neededQuantity));
  const remaining = Math.max(0, Math.floor(opts.remaining));
  const credit = opts.allocationOverlapsNewWindow
    ? Math.max(0, Math.floor(opts.allocationQuantity))
    : 0;
  return remaining + credit >= needed;
}

/** True when active allotment sits on a different asset than the booking target. */
export function allocationAssetNeedsRebind(opts: {
  allocationAssetId?: string | null;
  targetAssetId?: string | null;
}): boolean {
  const current =
    typeof opts.allocationAssetId === 'string' ? opts.allocationAssetId.trim() : '';
  const target =
    typeof opts.targetAssetId === 'string' ? opts.targetAssetId.trim() : '';
  if (!current || !target) return false;
  return current !== target;
}

/**
 * Soft capacity for cross-asset rebind (new asset — no overlap credit).
 */
export function canResyncAllocationAsset(opts: {
  remaining: number;
  neededQuantity: number;
}): boolean {
  const needed = Math.max(1, Math.floor(opts.neededQuantity));
  const remaining = Math.max(0, Math.floor(opts.remaining));
  return remaining >= needed;
}

/** Release active allotment when booking no longer resolves to any inventory asset. */
export function allocationNeedsOrphanRelease(opts: {
  allocationAssetId?: string | null;
  targetAssetId?: string | null;
}): boolean {
  const current =
    typeof opts.allocationAssetId === 'string' ? opts.allocationAssetId.trim() : '';
  const target =
    typeof opts.targetAssetId === 'string' ? opts.targetAssetId.trim() : '';
  return Boolean(current) && !target;
}

export function bookingRoomProductId(
  travellerRequirementsJson?: unknown,
): string | null {
  const root =
    travellerRequirementsJson &&
    typeof travellerRequirementsJson === 'object' &&
    !Array.isArray(travellerRequirementsJson)
      ? (travellerRequirementsJson as Record<string, unknown>)
      : {};
  const id =
    typeof root.roomProductId === 'string' ? root.roomProductId.trim() : '';
  return id || null;
}

export function bookingRoomTypeLabel(
  travellerRequirementsJson?: unknown,
): string | null {
  const root =
    travellerRequirementsJson &&
    typeof travellerRequirementsJson === 'object' &&
    !Array.isArray(travellerRequirementsJson)
      ? (travellerRequirementsJson as Record<string, unknown>)
      : {};
  const label = typeof root.roomType === 'string' ? root.roomType.trim() : '';
  return label || null;
}

/** Normalize room type / product names for conservative matching. */
export function normalizeRoomTypeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Unique case/space-insensitive match of booking roomType → product id.
 * Returns null when zero or multiple products match (never guess).
 */
export function matchRoomProductIdByTypeName(opts: {
  roomType?: string | null;
  products: Array<{ id: string; name: string }>;
}): string | null {
  const wanted = normalizeRoomTypeLabel(opts.roomType || '');
  if (!wanted) return null;
  const hits = opts.products.filter(
    (p) => normalizeRoomTypeLabel(p.name || '') === wanted,
  );
  return hits.length === 1 ? hits[0]!.id : null;
}

/** Same-asset rematch when booking stamps a different room product. */
export function allocationRoomProductNeedsRematch(opts: {
  allocationRoomProductId?: string | null;
  bookingRoomProductId?: string | null;
}): boolean {
  const wanted =
    typeof opts.bookingRoomProductId === 'string'
      ? opts.bookingRoomProductId.trim()
      : '';
  if (!wanted) return false;
  const current =
    typeof opts.allocationRoomProductId === 'string'
      ? opts.allocationRoomProductId.trim()
      : '';
  return current !== wanted;
}

function instantMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function bookingFleetUnitId(
  travellerRequirementsJson?: unknown,
): string | null {
  const root =
    travellerRequirementsJson &&
    typeof travellerRequirementsJson === 'object' &&
    !Array.isArray(travellerRequirementsJson)
      ? (travellerRequirementsJson as Record<string, unknown>)
      : {};
  const id =
    typeof root.fleetUnitId === 'string' ? root.fleetUnitId.trim() : '';
  return id || null;
}

/** Transfer/fleet allocation window or unit no longer matches booking. */
export function allocationFleetWindowNeedsResync(opts: {
  allocationStartAt?: Date | string | null;
  allocationEndAt?: Date | string | null;
  allocationFleetUnitId?: string | null;
  bookingStartAt?: Date | string | null;
  bookingEndAt?: Date | string | null;
  bookingFleetUnitId?: string | null;
}): boolean {
  const aStart = instantMs(opts.allocationStartAt);
  const aEnd = instantMs(opts.allocationEndAt);
  const bStart = instantMs(opts.bookingStartAt);
  const bEnd = instantMs(opts.bookingEndAt);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
    return false;
  }
  if (aStart !== bStart || aEnd !== bEnd) return true;
  const aUnit =
    typeof opts.allocationFleetUnitId === 'string'
      ? opts.allocationFleetUnitId.trim()
      : '';
  const bUnit =
    typeof opts.bookingFleetUnitId === 'string'
      ? opts.bookingFleetUnitId.trim()
      : '';
  // Only rematch unit when booking stamps one; clearing unit alone is not a resync.
  if (bUnit && aUnit !== bUnit) return true;
  return false;
}

export type SyncBookingInventoryResult =
  | {
      ok: true;
      allocationId?: string;
      released?: number;
      upgraded?: boolean;
      quantityResynced?: boolean;
      datesResynced?: boolean;
      assetRebound?: boolean;
      roomProductRematched?: boolean;
      fleetWindowResynced?: boolean;
      orphanReleased?: boolean;
    }
  | { ok: false; skipped?: string; failed?: string }
  | null
  | undefined;

/** Whether a syncBookingInventory result should surface as a materialize warning. */
export function allotmentHoldWarnMessage(
  title: string,
  result: SyncBookingInventoryResult,
): string | null {
  if (!result || result.ok) return null;
  if (result.failed) {
    return `Allotment hold failed for “${title}” — ${result.failed}`;
  }
  // missing asset / no inventory linked stays non-blocking (same as quote)
  if (
    result.skipped === 'missing_asset_or_dates' ||
    result.skipped === 'asset_missing' ||
    result.skipped === 'status_not_allocatable' ||
    result.skipped === 'asset_kind_unsupported'
  ) {
    return null;
  }
  if (result.skipped) {
    return `Allotment hold skipped for “${title}” — ${result.skipped}`;
  }
  return null;
}
