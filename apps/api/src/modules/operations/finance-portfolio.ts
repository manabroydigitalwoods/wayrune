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

export function buildFinancePortfolio(opts: {
  trips: PortfolioTripInput[];
  from?: Date | string | null;
  to?: Date | string | null;
}): {
  summary: {
    currency: string;
    tripCount: number;
    otherCurrencyCount: number;
    sellTotal: number;
    costTotal: number;
    marginAmount: number;
    marginPercent: number | null;
  };
  rows: PortfolioTripRow[];
} {
  const from = asDate(opts.from ?? null);
  const to = asDate(opts.to ?? null);

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
      currency: (t.currency || 'INR').toUpperCase(),
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

  // Summary totals use the dominant currency only (no FX mix) — same honesty as aging.
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
  const marginAmount = round2(primaryRows.reduce((s, r) => s + r.marginAmount, 0));
  const marginPercent =
    sellTotal > 0 ? round2((marginAmount / sellTotal) * 100) : null;

  return {
    summary: {
      currency,
      tripCount: primaryRows.length,
      otherCurrencyCount,
      sellTotal,
      costTotal,
      marginAmount,
      marginPercent,
    },
    rows,
  };
}
