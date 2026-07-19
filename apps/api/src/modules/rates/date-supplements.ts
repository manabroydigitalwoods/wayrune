/** Hotel rate gala / date supplements (thin P0.5 — per-room charges on matching stay nights). */

export type DateSupplement = {
  /** Single night YYYY-MM-DD (preferred for gala). */
  date?: string;
  /** Inclusive range when date is omitted. */
  from?: string;
  to?: string;
  /** Extra buy amount per room for each matching night. */
  amount: number;
  label?: string;
};

export type DateSupplementApplyResult = {
  matched: Array<{ night: string; label: string; amount: number; rooms: number }>;
  supplementTotal: number;
  totalBuy: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isoDay(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function asAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    const n = Number(value);
    return n >= 0 ? n : null;
  }
  return null;
}

export function parseDateSupplements(occupancyPricingJson: unknown): DateSupplement[] {
  if (!occupancyPricingJson || typeof occupancyPricingJson !== 'object') return [];
  const root = occupancyPricingJson as Record<string, unknown>;
  const raw = root.dateSupplements;
  if (!Array.isArray(raw)) return [];
  const out: DateSupplement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const amount = asAmount(row.amount);
    if (amount == null || amount <= 0) continue;
    const date = isoDay(typeof row.date === 'string' ? row.date : undefined);
    const from = isoDay(typeof row.from === 'string' ? row.from : undefined);
    const to = isoDay(typeof row.to === 'string' ? row.to : undefined);
    if (!date && !(from && to)) continue;
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim().slice(0, 80)
        : undefined;
    out.push({
      amount,
      ...(date ? { date } : {}),
      ...(from && to ? { from, to } : {}),
      ...(label ? { label } : {}),
    });
  }
  return out.slice(0, 20);
}

/** True when stay night (YYYY-MM-DD) is covered by the supplement. */
export function nightMatchesSupplement(
  night: string,
  supplement: DateSupplement,
): boolean {
  const day = isoDay(night);
  if (!day) return false;
  if (supplement.date) return day === supplement.date;
  if (supplement.from && supplement.to) {
    return day >= supplement.from && day <= supplement.to;
  }
  return false;
}

/**
 * Add per-room supplements for each stay night that matches a gala / date rule.
 * `baseTotal` is the room stay buy before date supplements (after occupancy extras).
 */
export function applyDateSupplements(
  baseTotal: number,
  supplements: DateSupplement[],
  stayNights: string[],
  rooms: number,
): DateSupplementApplyResult {
  const roomCount = Math.max(1, Math.floor(rooms) || 1);
  const base = Number.isFinite(baseTotal) ? baseTotal : 0;
  if (!supplements.length || !stayNights.length) {
    return { matched: [], supplementTotal: 0, totalBuy: round2(base) };
  }

  const matched: DateSupplementApplyResult['matched'] = [];
  let supplementTotal = 0;
  for (const night of stayNights) {
    const day = isoDay(night);
    if (!day) continue;
    for (const s of supplements) {
      if (!nightMatchesSupplement(day, s)) continue;
      const amount = round2(s.amount * roomCount);
      supplementTotal = round2(supplementTotal + amount);
      matched.push({
        night: day,
        label: s.label || 'Date supplement',
        amount,
        rooms: roomCount,
      });
    }
  }

  return {
    matched,
    supplementTotal,
    totalBuy: round2(base + supplementTotal),
  };
}

export function dateSupplementMatchAccepted(
  result: DateSupplementApplyResult,
): string[] {
  if (!result.matched.length) return [];
  const lines = [
    `Date supplements ₹${Math.round(result.supplementTotal).toLocaleString('en-IN')}`,
  ];
  for (const m of result.matched.slice(0, 4)) {
    lines.push(`${m.label} (${m.night})`);
  }
  if (result.matched.length > 4) {
    lines.push(`+${result.matched.length - 4} more`);
  }
  return lines;
}

/** Merge dateSupplements into occupancyPricingJson object for storage. */
export function withDateSupplements(
  occupancyPricing: Record<string, unknown> | null | undefined,
  supplements: DateSupplement[] | null | undefined,
): Record<string, unknown> | null {
  const base =
    occupancyPricing && typeof occupancyPricing === 'object'
      ? { ...occupancyPricing }
      : {};
  delete base.dateSupplements;
  if (supplements?.length) {
    base.dateSupplements = supplements.map((s) => ({
      amount: s.amount,
      ...(s.date ? { date: s.date } : {}),
      ...(s.from && s.to ? { from: s.from, to: s.to } : {}),
      ...(s.label ? { label: s.label } : {}),
    }));
  }
  return Object.keys(base).length ? base : null;
}

/**
 * Persist occupancy fields + nested dateSupplements from a single API payload object.
 * Returns null when both are empty (caller maps to JsonNull).
 */
export function occupancyPricingJsonWithDateSupplements(
  input: unknown,
  occupancyFields: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (input == null && occupancyFields == null) return null;
  const supplements = parseDateSupplements(
    input && typeof input === 'object' ? input : null,
  );
  return withDateSupplements(
    occupancyFields,
    supplements.length ? supplements : null,
  );
}
