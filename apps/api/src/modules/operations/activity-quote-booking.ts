/** Pure helpers for materializing activity bookings from accepted quote lines. */

import {
  lineBuyTotal,
  lineSellTotal,
  type QuoteLineLike,
} from './hotel-quote-booking';

export type ActivityQuoteLineLike = QuoteLineLike & {
  details?: QuoteLineLike['details'] & {
    activityName?: string;
    placeId?: string;
    placeName?: string;
    serviceDate?: string;
    privateOrSic?: string;
    adults?: number;
    children?: number;
  };
};

export { lineBuyTotal, lineSellTotal };

export function activityLinesFromQuoteItems(items: unknown): ActivityQuoteLineLike[] {
  if (!Array.isArray(items)) return [];
  return items.filter((row): row is ActivityQuoteLineLike => {
    if (!row || typeof row !== 'object') return false;
    const r = row as ActivityQuoteLineLike;
    const type = r.serviceType;
    return (
      (type === 'activity' || type === 'sightseeing') &&
      Boolean(r.details?.supplierId) &&
      Boolean(r.id)
    );
  });
}

export function activityServiceWindow(
  details: ActivityQuoteLineLike['details'],
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
  const endAt = new Date(startAt.getTime() + 4 * 3_600_000);
  return { startAt, endAt };
}

export function activityBookingTitle(line: ActivityQuoteLineLike): string {
  const name =
    line.details?.activityName ||
    line.details?.propertyName ||
    line.description ||
    'Activity';
  const mode = line.details?.privateOrSic?.trim();
  if (mode === 'private' || mode === 'sic') {
    return `${name.trim()} · ${mode.toUpperCase()}`;
  }
  return name.trim() || 'Activity';
}
