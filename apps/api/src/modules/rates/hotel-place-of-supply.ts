/** Hotel tip place-of-supply Match — prefer dest POS tip, else any (blank). Match-only. */

import {
  normalizePlaceOfSupply,
  matchKnownPlaceOfSupply,
} from '../../common/tax-display-split';

export { normalizePlaceOfSupply, matchKnownPlaceOfSupply };

export function placeOfSupplyFromOccupancy(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as { placeOfSupply?: unknown }).placeOfSupply;
  if (typeof v !== 'string') return null;
  return normalizePlaceOfSupply(v);
}

/** Tip applies when blank (any) or exact dest POS match. */
export function hotelPlaceOfSupplyCompatible(
  ratePos: string | null | undefined,
  destinationPos: string | null | undefined,
): boolean {
  const rate = normalizePlaceOfSupply(ratePos);
  if (rate == null) return true;
  const dest = normalizePlaceOfSupply(destinationPos);
  if (dest == null) return true;
  return rate === dest;
}

/**
 * Prefer exact destination POS tips, then any (blank POS).
 * When destination unset, keep the full compatible pool.
 */
export function filterHotelByPlaceOfSupply<
  T extends { occupancyPricingJson?: unknown },
>(pool: T[], destinationPos: string | null | undefined): T[] {
  if (!pool.length) return pool;
  const dest = normalizePlaceOfSupply(destinationPos);
  const withPos = (r: T) =>
    placeOfSupplyFromOccupancy(r.occupancyPricingJson);

  const compatible = pool.filter((r) =>
    hotelPlaceOfSupplyCompatible(withPos(r), destinationPos),
  );
  if (!compatible.length) return [];
  if (dest == null) return compatible;

  const exact = compatible.filter((r) => withPos(r) === dest);
  if (exact.length) return exact;

  const any = compatible.filter((r) => withPos(r) == null);
  return any.length ? any : compatible;
}

export function hotelPlaceOfSupplyMatchAccepted(
  ratePos: string | null | undefined,
  destinationPos: string | null | undefined,
): string[] {
  const rate = normalizePlaceOfSupply(ratePos);
  const dest = normalizePlaceOfSupply(destinationPos);
  if (rate == null && dest == null) return [];
  if (rate != null && dest != null && rate === dest) {
    return [`Place of supply ${rate} matched`];
  }
  if (rate != null && dest == null) {
    return [`Place of supply ${rate} tip (destination unset)`];
  }
  if (rate == null && dest != null) {
    return [`Any-POS tip for destination ${dest}`];
  }
  return [];
}
