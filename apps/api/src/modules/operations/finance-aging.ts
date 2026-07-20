/** Org-wide TripPayment AR/AP aging buckets. */

import { tripPaymentOutstanding } from './trip-payment-write-off';

export type AgingBucketKey =
  | 'current'
  | 'd1_30'
  | 'd31_60'
  | 'd61_90'
  | 'd90_plus'
  | 'noDue';

export type AgingBucketTotals = {
  count: number;
  amount: number;
};

export type FinanceAgingPayment = {
  id: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  direction: 'customer' | 'supplier';
  label: string;
  amount: number;
  amountPaid: number;
  currency: string;
  dueAt: Date | string | null;
  status: string;
  supplierName: string | null;
  notes?: string | null;
};

export type FinanceAgingRow = {
  id: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  direction: string;
  label: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
  dueAt: string | null;
  status: string;
  daysPastDue: number | null;
  bucket: AgingBucketKey;
  supplierName: string | null;
};

const EMPTY_BUCKETS = (): Record<AgingBucketKey, AgingBucketTotals> => ({
  current: { count: 0, amount: 0 },
  d1_30: { count: 0, amount: 0 },
  d31_60: { count: 0, amount: 0 },
  d61_90: { count: 0, amount: 0 },
  d90_plus: { count: 0, amount: 0 },
  noDue: { count: 0, amount: 0 },
});

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function paymentOutstanding(
  amount: number,
  amountPaid: number,
  notes?: string | null,
): number {
  return tripPaymentOutstanding({ amount, amountPaid, notes });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Days past due relative to start of local day. Negative = not yet due. */
export function daysPastDue(
  dueAt: Date | string | null | undefined,
  now = new Date(),
): number | null {
  const due = asDate(dueAt);
  if (!due) return null;
  const ms =
    startOfLocalDay(now).getTime() - startOfLocalDay(due).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function agingBucket(
  dueAt: Date | string | null | undefined,
  now = new Date(),
): AgingBucketKey {
  const days = daysPastDue(dueAt, now);
  if (days == null) return 'noDue';
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

export function isOpenAgingPayment(status: string): boolean {
  return status !== 'paid' && status !== 'cancelled';
}

export function buildFinanceAging(opts: {
  payments: FinanceAgingPayment[];
  direction?: 'customer' | 'supplier' | 'all';
  /** When true, only rows with daysPastDue > 0 (or overdue status without due). */
  overdueOnly?: boolean;
  now?: Date;
}): {
  summary: {
    currency: string;
    totalOutstanding: number;
    overdueOutstanding: number;
    otherCurrencyCount: number;
    buckets: Record<AgingBucketKey, AgingBucketTotals>;
  };
  rows: FinanceAgingRow[];
} {
  const now = opts.now ?? new Date();
  const direction = opts.direction ?? 'all';
  const buckets = EMPTY_BUCKETS();

  const rows: FinanceAgingRow[] = [];
  for (const p of opts.payments) {
    if (!isOpenAgingPayment(p.status)) continue;
    if (direction !== 'all' && p.direction !== direction) continue;

    const outstanding = paymentOutstanding(p.amount, p.amountPaid, p.notes);
    if (outstanding <= 0.001) continue;

    const days = daysPastDue(p.dueAt, now);
    const bucket = agingBucket(p.dueAt, now);
    if (opts.overdueOnly) {
      const pastDue = days != null ? days > 0 : p.status === 'overdue';
      if (!pastDue) continue;
    }

    rows.push({
      id: p.id,
      tripId: p.tripId,
      tripNumber: p.tripNumber,
      tripTitle: p.tripTitle,
      partyName: p.partyName,
      direction: p.direction,
      label: p.label,
      amount: round2(p.amount),
      amountPaid: round2(p.amountPaid),
      outstanding,
      currency: (p.currency || 'INR').toUpperCase(),
      dueAt: asDate(p.dueAt)?.toISOString() ?? null,
      status: p.status,
      daysPastDue: days,
      bucket,
      supplierName: p.supplierName,
    });
  }

  rows.sort((a, b) => {
    const da = a.daysPastDue ?? -9999;
    const db = b.daysPastDue ?? -9999;
    if (db !== da) return db - da;
    return a.tripNumber.localeCompare(b.tripNumber);
  });

  // Summary totals use the dominant currency only (no FX mix).
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

  for (const r of primaryRows) {
    buckets[r.bucket].count += 1;
    buckets[r.bucket].amount = round2(buckets[r.bucket].amount + r.outstanding);
  }

  const totalOutstanding = round2(
    primaryRows.reduce((s, r) => s + r.outstanding, 0),
  );
  const overdueOutstanding = round2(
    primaryRows
      .filter((r) => (r.daysPastDue != null && r.daysPastDue > 0) || r.status === 'overdue')
      .reduce((s, r) => s + r.outstanding, 0),
  );

  return {
    summary: {
      currency,
      totalOutstanding,
      overdueOutstanding,
      otherCurrencyCount,
      buckets,
    },
    rows,
  };
}
