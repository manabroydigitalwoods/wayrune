/** Unit-level margin for a quote line (null money = not priced yet). */
export function lineUnitMargin(
  unitCost: number | null | undefined,
  unitSell: number | null | undefined,
): { lossMaking: boolean; profit: number; marginPercent: number; belowBy: number } | null {
  if (unitCost == null || unitSell == null) return null;
  if (!Number.isFinite(unitCost) || !Number.isFinite(unitSell)) return null;
  const profit = unitSell - unitCost;
  const marginPercent = unitSell === 0 ? (unitCost > 0 ? -100 : 0) : (profit / unitSell) * 100;
  return {
    lossMaking: profit < 0,
    profit,
    marginPercent,
    belowBy: profit < 0 ? -profit : 0,
  };
}

export type MarginPolicyKind = 'loss' | 'below_floor';

/** Line needs `below_margin.approve` before send / approval request. */
export function lineMarginPolicyViolation(
  unitCost: number | null | undefined,
  unitSell: number | null | undefined,
  minMarginPercent = 0,
): {
  kind: MarginPolicyKind;
  profit: number;
  marginPercent: number;
  belowBy: number;
  floorPercent: number;
  shortfallPercent: number;
} | null {
  const m = lineUnitMargin(unitCost, unitSell);
  if (!m) return null;
  const floor = Number.isFinite(minMarginPercent) ? Math.max(0, minMarginPercent) : 0;
  if (m.lossMaking) {
    return {
      kind: 'loss',
      profit: m.profit,
      marginPercent: m.marginPercent,
      belowBy: m.belowBy,
      floorPercent: floor,
      shortfallPercent: floor - m.marginPercent,
    };
  }
  if (floor > 0 && m.marginPercent < floor) {
    return {
      kind: 'below_floor',
      profit: m.profit,
      marginPercent: m.marginPercent,
      belowBy: 0,
      floorPercent: floor,
      shortfallPercent: floor - m.marginPercent,
    };
  }
  return null;
}

export function countMarginPolicyViolations(
  items: Array<{
    unitCost: number | null;
    unitSell: number | null;
    marginOverride?: { reason?: string } | null;
    includedMeta?: unknown;
  }>,
  minMarginPercent = 0,
  opts?: { ignoreOverridden?: boolean },
): number {
  let n = 0;
  for (const item of items) {
    // Included (₹0) lines are proposal display only — not margin-gated.
    if (item.includedMeta) continue;
    const v = lineMarginPolicyViolation(item.unitCost, item.unitSell, minMarginPercent);
    if (!v) continue;
    if (opts?.ignoreOverridden && item.marginOverride?.reason?.trim()) continue;
    n += 1;
  }
  return n;
}

/** @deprecated Prefer {@link countMarginPolicyViolations} with floor 0. */
export function countLossMakingLines(
  items: Array<{
    unitCost: number | null;
    unitSell: number | null;
    marginOverride?: { reason?: string } | null;
    includedMeta?: unknown;
  }>,
  opts?: { ignoreOverridden?: boolean },
): number {
  return countMarginPolicyViolations(items, 0, opts);
}

/** Read org floor from settingsJson (0 = only block sell-below-cost). */
export function parseMinMarginPercent(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return 0;
  const raw = (settings as { minMarginPercent?: unknown }).minMarginPercent;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}
