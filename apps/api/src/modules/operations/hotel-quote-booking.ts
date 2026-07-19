/** Pure helpers for materializing hotel bookings from accepted quote lines. */

export type QuoteLineLike = {
  id?: string;
  description?: string;
  serviceType?: string;
  quantity?: number;
  unitCost?: number | null;
  unitSell?: number | null;
  rateProvenance?: unknown;
  details?: {
    supplierId?: string;
    supplierName?: string;
    propertyName?: string;
    roomType?: string;
    roomProductId?: string;
    mealPlan?: string;
    checkIn?: string;
    checkOut?: string;
    nights?: number;
    rooms?: number;
  };
};

export function hotelLinesFromQuoteItems(items: unknown): QuoteLineLike[] {
  if (!Array.isArray(items)) return [];
  return items.filter((row): row is QuoteLineLike => {
    if (!row || typeof row !== 'object') return false;
    const r = row as QuoteLineLike;
    return r.serviceType === 'hotel' && Boolean(r.details?.supplierId) && Boolean(r.id);
  });
}

/** Hotel quote lines missing a supplier — cannot materialize into ops bookings. */
export function hotelLinesMissingSupplier(items: unknown): QuoteLineLike[] {
  if (!Array.isArray(items)) return [];
  return items.filter((row): row is QuoteLineLike => {
    if (!row || typeof row !== 'object') return false;
    const r = row as QuoteLineLike;
    return r.serviceType === 'hotel' && Boolean(r.id) && !r.details?.supplierId;
  });
}

export function hotelStayWindow(details: QuoteLineLike['details']): {
  startAt: Date | null;
  endAt: Date | null;
} {
  const checkIn = details?.checkIn?.trim();
  if (!checkIn || !/^\d{4}-\d{2}-\d{2}/.test(checkIn)) {
    return { startAt: null, endAt: null };
  }
  const startAt = new Date(`${checkIn.slice(0, 10)}T00:00:00.000Z`);
  let endAt: Date | null = null;
  const checkOut = details?.checkOut?.trim();
  if (checkOut && /^\d{4}-\d{2}-\d{2}/.test(checkOut)) {
    endAt = new Date(`${checkOut.slice(0, 10)}T00:00:00.000Z`);
  } else {
    const nights = Math.max(1, Math.floor(Number(details?.nights) || 1));
    endAt = new Date(startAt.getTime());
    endAt.setUTCDate(endAt.getUTCDate() + nights);
  }
  return { startAt, endAt };
}

export function hotelBookingTitle(line: QuoteLineLike): string {
  const parts = [
    line.details?.propertyName || line.details?.supplierName,
    line.details?.roomType,
    line.details?.mealPlan,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return (line.description || 'Hotel').trim() || 'Hotel';
}

export function lineBuyTotal(line: QuoteLineLike): number | null {
  const unit = line.unitCost;
  if (unit == null || !Number.isFinite(Number(unit))) return null;
  const qty = Math.max(1, Number(line.quantity) || 1);
  return Math.round(Number(unit) * qty * 100) / 100;
}

export function lineSellTotal(line: QuoteLineLike): number | null {
  const unit = line.unitSell;
  if (unit == null || !Number.isFinite(Number(unit))) return null;
  const qty = Math.max(1, Number(line.quantity) || 1);
  return Math.round(Number(unit) * qty * 100) / 100;
}
