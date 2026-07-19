/** Shared rate tip version labels (hotel / transfer / activity). */

export function rateVersionLabel(versionNumber: number | null | undefined): string {
  const n = Math.max(1, Math.floor(Number(versionNumber) || 1));
  return `v${n}`;
}

export type RateVersionListItem = {
  id: string;
  versionNumber: number;
  supersedesId: string | null;
  isActive: boolean;
  unitCost?: number | string;
  updatedAt?: string | Date | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  /** Hotel */
  mealPlan?: string | null;
  diffVsActive?: { summary: string | null; changes?: string[] } | null;
  /** Transfer */
  pricingMode?: string | null;
  /** Activity */
  activityName?: string | null;
};

export function formatRateVersionHistoryLine(
  row: RateVersionListItem,
  opts?: {
    kind?: 'hotel' | 'transfer' | 'activity';
    formatAmount?: (n: number) => string;
  },
): string {
  const ver = rateVersionLabel(row.versionNumber);
  const cost = Number(row.unitCost);
  const amount =
    Number.isFinite(cost) && opts?.formatAmount
      ? opts.formatAmount(cost)
      : Number.isFinite(cost)
        ? `₹${Math.round(cost).toLocaleString('en-IN')}`
        : '';
  const state = row.isActive ? 'active' : 'superseded';
  const kind = opts?.kind ?? 'hotel';
  if (kind === 'hotel') {
    const meal = row.mealPlan?.trim() || 'Any meal';
    return [ver, meal, amount, state].filter(Boolean).join(' · ');
  }
  if (kind === 'transfer') {
    const mode = row.pricingMode?.trim() || 'fare';
    return [ver, mode, amount, state].filter(Boolean).join(' · ');
  }
  const name = row.activityName?.trim() || 'Activity';
  return [ver, name, amount, state].filter(Boolean).join(' · ');
}

export function formatRateVersionTipDiffCue(
  diff: { summary: string | null } | null | undefined,
): string | null {
  const s = diff?.summary?.trim();
  return s || null;
}

/** @deprecated Prefer formatRateVersionTipDiffCue */
export const formatHotelRateTipDiffCue = formatRateVersionTipDiffCue;
