import type { PlaceSearchPurpose } from '@wayrune/contracts';
import type { PlaceRef } from './placeRefs';

/** Transfer From / To catalog purposes (Step 5 P0). */
export const TRANSFER_PICKUP_PURPOSE: PlaceSearchPurpose = 'transfer_pickup';
export const TRANSFER_DROP_PURPOSE: PlaceSearchPurpose = 'transfer_drop';

export type TransferEndpointSnapshot = {
  placeId: string | null;
  name: string | null;
};

/**
 * Apply a picker selection to a transfer endpoint.
 * Select sets ID + catalog name together; clear clears both.
 * Typing in search must not call this — only explicit selection/clear.
 */
export function applyTransferEndpointSelection(
  ref: PlaceRef | null,
): TransferEndpointSnapshot {
  if (!ref?.placeId) {
    return { placeId: null, name: null };
  }
  return {
    placeId: ref.placeId,
    name: ref.name?.trim() || null,
  };
}

/** Linked catalog endpoint for the picker value (null when name-only legacy). */
export function transferEndpointPickerValue(
  placeId?: string | null,
  placeName?: string | null,
): PlaceRef | null {
  if (!placeId?.trim()) return null;
  return {
    placeId: placeId.trim(),
    name: placeName?.trim() || placeId.trim(),
  };
}

export function transferEndpointIsLinked(placeId?: string | null): boolean {
  return Boolean(placeId?.trim());
}

export function transferEndpointLegacyLabel(placeName?: string | null): string | null {
  const n = placeName?.trim();
  return n || null;
}

export function transferSameEndpointWarning(
  fromPlaceId?: string | null,
  toPlaceId?: string | null,
): string | null {
  const from = fromPlaceId?.trim();
  const to = toPlaceId?.trim();
  if (!from || !to) return null;
  if (from !== to) return null;
  return 'Pickup and drop are the same place.';
}
