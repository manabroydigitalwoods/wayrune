/** Thin tip-vs-active diff for hotel rate History. */

export type HotelRateTipSnapshot = {
  unitCost?: number | string | null;
  weekendUnitCost?: number | string | null;
  mealPlan?: string | null;
  roomType?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  occupancyPricingJson?: unknown;
};

export type HotelRateTipDiff = {
  changes: string[];
  /** Compact one-liner, or null when identical. */
  summary: string | null;
};

function moneyKey(v: unknown): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '';
}

function dateKey(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return '';
}

function jsonKey(v: unknown): string {
  if (v == null) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

/** Compare a historical tip against the active tip. */
export function diffHotelRateTips(
  prior: HotelRateTipSnapshot,
  active: HotelRateTipSnapshot,
): HotelRateTipDiff {
  const changes: string[] = [];
  if (moneyKey(prior.unitCost) !== moneyKey(active.unitCost)) {
    changes.push('weekday cost');
  }
  if (moneyKey(prior.weekendUnitCost) !== moneyKey(active.weekendUnitCost)) {
    changes.push('weekend cost');
  }
  if ((prior.mealPlan || '').trim() !== (active.mealPlan || '').trim()) {
    changes.push('meal plan');
  }
  if ((prior.roomType || '').trim() !== (active.roomType || '').trim()) {
    changes.push('room type');
  }
  if (dateKey(prior.startDate) !== dateKey(active.startDate) || dateKey(prior.endDate) !== dateKey(active.endDate)) {
    changes.push('dates');
  }
  if (jsonKey(prior.occupancyPricingJson) !== jsonKey(active.occupancyPricingJson)) {
    changes.push('occupancy');
  }
  if (!changes.length) {
    return { changes: [], summary: null };
  }
  const summary =
    changes.length <= 3
      ? changes.join(' · ')
      : `${changes.slice(0, 2).join(' · ')} +${changes.length - 2} more`;
  return { changes, summary };
}
