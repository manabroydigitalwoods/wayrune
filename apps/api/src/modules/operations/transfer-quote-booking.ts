/** Pure helpers for materializing transfer bookings from accepted quote lines. */

import {
  lineBuyTotal,
  lineSellTotal,
  type QuoteLineLike,
} from './hotel-quote-booking';

export type TransferQuoteLineLike = QuoteLineLike & {
  details?: QuoteLineLike['details'] & {
    fromPlaceId?: string;
    toPlaceId?: string;
    fromPlaceName?: string;
    toPlaceName?: string;
    vehicleTypeId?: string;
    vehicleTypeName?: string;
    vehicleName?: string;
    serviceDate?: string;
    vehicles?: number;
    adults?: number;
    children?: number;
    seats?: number;
  };
};

export { lineBuyTotal, lineSellTotal };

export function transferLinesFromQuoteItems(items: unknown): TransferQuoteLineLike[] {
  if (!Array.isArray(items)) return [];
  return items.filter((row): row is TransferQuoteLineLike => {
    if (!row || typeof row !== 'object') return false;
    const r = row as TransferQuoteLineLike;
    return (
      r.serviceType === 'transfer' &&
      Boolean(r.details?.supplierId) &&
      Boolean(r.id)
    );
  });
}

export function transferServiceWindow(
  details: TransferQuoteLineLike['details'],
): { startAt: Date | null; endAt: Date | null } {
  const raw =
    details?.serviceDate?.trim() ||
    details?.checkIn?.trim() ||
    null;
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return { startAt: null, endAt: null };
  }
  const day = raw.slice(0, 10);
  const startAt = new Date(`${day}T00:00:00.000Z`);
  const endAt = new Date(startAt.getTime() + 2 * 3_600_000);
  return { startAt, endAt };
}

export function transferBookingTitle(line: TransferQuoteLineLike): string {
  const from =
    line.details?.fromPlaceName ||
    line.details?.propertyName ||
    null;
  const to = line.details?.toPlaceName || null;
  const vehicle =
    line.details?.vehicleTypeName ||
    line.details?.vehicleName ||
    null;
  if (from && to) {
    return [from, '→', to, vehicle].filter(Boolean).join(' ');
  }
  return (line.description || 'Transfer').trim() || 'Transfer';
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(500, Math.floor(n));
}

function nonNegInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(500, Math.floor(n));
}

/** Party / seats for partner capacity soft cue (stamped onto travellerRequirementsJson). */
export function transferCapacityStampFromLine(line: TransferQuoteLineLike): {
  adults: number | null;
  children: number | null;
  vehicleSeats: number | null;
} {
  const adults = nonNegInt(line.details?.adults);
  const children = nonNegInt(line.details?.children);
  const prov =
    line.rateProvenance &&
    typeof line.rateProvenance === 'object' &&
    !Array.isArray(line.rateProvenance)
      ? (line.rateProvenance as Record<string, unknown>)
      : null;
  const vehicleSeats =
    positiveInt(prov?.vehicleSeats) ??
    positiveInt(prov?.capacity) ??
    positiveInt(line.details?.seats);
  return {
    adults: adults != null && adults > 0 ? adults : null,
    children: children != null && children > 0 ? children : null,
    vehicleSeats,
  };
}
