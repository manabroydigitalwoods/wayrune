/** Org-wide trip portfolio profitability from accepted quotation versions. */

export type PortfolioTripInput = {
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  tripStatus: string;
  partyName: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  currency: string;
  sellTotal: number;
  costTotal: number;
  taxTotal: number;
  marginAmount: number;
  marginPercent: number;
  acceptedAt: Date | string | null;
  quoteNumber: string | null;
  versionNumber: number | null;
};

export type PortfolioTripRow = {
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  tripStatus: string;
  partyName: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  sellTotal: number;
  costTotal: number;
  taxTotal: number;
  marginAmount: number;
  marginPercent: number;
  acceptedAt: string | null;
  quoteNumber: string | null;
  versionNumber: number | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(value: Date | string | null | undefined): string | null {
  const d = asDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inWindow(
  startDate: Date | string | null | undefined,
  from: Date | null,
  to: Date | null,
): boolean {
  if (!from && !to) return true;
  const start = asDate(startDate);
  if (!start) return false;
  const day = start.getTime();
  if (from && day < from.getTime()) return false;
  if (to && day > to.getTime()) return false;
  return true;
}

function normalizeCurrency(code: string | null | undefined): string {
  const c = String(code || 'INR').trim().toUpperCase();
  return c.length === 3 ? c : 'INR';
}

/**
 * Convert foreign amount → book using org FX table
 * (`units of book per 1 foreign`). Missing/invalid rate → null (fail-closed).
 */
export function convertAmountAtOrgFx(opts: {
  amount: number;
  fromCurrency: string;
  bookCurrency: string;
  fxRates: Record<string, number>;
}): number | null {
  const from = normalizeCurrency(opts.fromCurrency);
  const book = normalizeCurrency(opts.bookCurrency);
  if (from === book) return round2(opts.amount);
  const rate = opts.fxRates[from];
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return round2(opts.amount * rate);
}

export function buildFinancePortfolio(opts: {
  trips: PortfolioTripInput[];
  from?: Date | string | null;
  to?: Date | string | null;
  /**
   * Org book currency for summary rollup. When set with `fxRates`, foreign
   * trips convert into book; missing rates stay excluded (honesty).
   * When omitted, summary uses dominant currency only (legacy honesty).
   */
  bookCurrency?: string | null;
  /** Org FX table: units of book per 1 foreign. */
  fxRates?: Record<string, number> | null;
}): {
  summary: {
    currency: string;
    tripCount: number;
    /** Trips excluded from totals (no FX rate / honesty). */
    otherCurrencyCount: number;
    /** Foreign trips converted into book via org FX. */
    convertedTripCount: number;
    sellTotal: number;
    costTotal: number;
    marginAmount: number;
    marginPercent: number | null;
  };
  rows: PortfolioTripRow[];
} {
  const from = asDate(opts.from ?? null);
  const to = asDate(opts.to ?? null);
  const book = opts.bookCurrency
    ? normalizeCurrency(opts.bookCurrency)
    : null;
  const fxRates = opts.fxRates && typeof opts.fxRates === 'object' ? opts.fxRates : null;
  const rollupAtOrgFx = Boolean(book && fxRates);

  const filtered = opts.trips.filter((t) => inWindow(t.startDate, from, to));

  const rows: PortfolioTripRow[] = filtered
    .map((t) => ({
      tripId: t.tripId,
      tripNumber: t.tripNumber,
      tripTitle: t.tripTitle,
      tripStatus: t.tripStatus,
      partyName: t.partyName,
      startDate: isoDay(t.startDate),
      endDate: isoDay(t.endDate),
      currency: normalizeCurrency(t.currency),
      sellTotal: round2(t.sellTotal),
      costTotal: round2(t.costTotal),
      taxTotal: round2(t.taxTotal),
      marginAmount: round2(t.marginAmount),
      marginPercent: round2(t.marginPercent),
      acceptedAt: asDate(t.acceptedAt)?.toISOString() ?? null,
      quoteNumber: t.quoteNumber,
      versionNumber: t.versionNumber,
    }))
    .sort((a, b) => {
      const da = a.startDate || '';
      const db = b.startDate || '';
      if (da !== db) return da.localeCompare(db);
      return a.tripNumber.localeCompare(b.tripNumber);
    });

  if (!rollupAtOrgFx || !book || !fxRates) {
    // Legacy: dominant currency only (no FX mix).
    const currencyCounts = new Map<string, number>();
    for (const r of rows) {
      currencyCounts.set(r.currency, (currencyCounts.get(r.currency) || 0) + 1);
    }
    let currency = 'INR';
    let best = 0;
    for (const [c, n] of currencyCounts) {
      if (n > best) {
        currency = c;
        best = n;
      }
    }
    const primaryRows = rows.filter((r) => r.currency === currency);
    const otherCurrencyCount = rows.length - primaryRows.length;
    const sellTotal = round2(primaryRows.reduce((s, r) => s + r.sellTotal, 0));
    const costTotal = round2(primaryRows.reduce((s, r) => s + r.costTotal, 0));
    const marginAmount = round2(
      primaryRows.reduce((s, r) => s + r.marginAmount, 0),
    );
    const marginPercent =
      sellTotal > 0 ? round2((marginAmount / sellTotal) * 100) : null;
    return {
      summary: {
        currency,
        tripCount: primaryRows.length,
        otherCurrencyCount,
        convertedTripCount: 0,
        sellTotal,
        costTotal,
        marginAmount,
        marginPercent,
      },
      rows,
    };
  }

  let sellTotal = 0;
  let costTotal = 0;
  let marginAmount = 0;
  let tripCount = 0;
  let convertedTripCount = 0;
  let otherCurrencyCount = 0;

  for (const r of rows) {
    const sell = convertAmountAtOrgFx({
      amount: r.sellTotal,
      fromCurrency: r.currency,
      bookCurrency: book,
      fxRates,
    });
    const cost = convertAmountAtOrgFx({
      amount: r.costTotal,
      fromCurrency: r.currency,
      bookCurrency: book,
      fxRates,
    });
    const margin = convertAmountAtOrgFx({
      amount: r.marginAmount,
      fromCurrency: r.currency,
      bookCurrency: book,
      fxRates,
    });
    if (sell == null || cost == null || margin == null) {
      otherCurrencyCount += 1;
      continue;
    }
    if (r.currency !== book) convertedTripCount += 1;
    sellTotal += sell;
    costTotal += cost;
    marginAmount += margin;
    tripCount += 1;
  }

  sellTotal = round2(sellTotal);
  costTotal = round2(costTotal);
  marginAmount = round2(marginAmount);
  const marginPercent =
    sellTotal > 0 ? round2((marginAmount / sellTotal) * 100) : null;

  return {
    summary: {
      currency: book,
      tripCount,
      otherCurrencyCount,
      convertedTripCount,
      sellTotal,
      costTotal,
      marginAmount,
      marginPercent,
    },
    rows,
  };
}
