/**
 * Rank eligible rates for Match alternatives (top-N after the winner).
 * Reject diagnostics stay in matchExplain — alternatives are applyable only.
 */

export type RankedRate<T> = { row: T; score: number };

export type MatchAlternative = {
  rateId: string;
  label: string;
  score: number;
  /** Chart weekday / base unit cost (not stay-total). */
  chartUnitCost: number | null;
  /**
   * Estimated stay/line buy for current dims (single-tip path).
   * Null when dims incomplete. Not the post-Use final total.
   */
  previewBuyTotal: number | null;
  preferred?: boolean;
  roomType?: string | null;
  mealPlan?: string | null;
  vehicleLabel?: string | null;
  routeLabel?: string | null;
  stopSaleCue?: string | null;
  cancelCue?: string | null;
};

/** Clamp resolve `alternativesLimit` (0 = off, max 5). */
export function clampAlternativesLimit(raw: unknown): number {
  const n = Math.floor(Number(raw) || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, n);
}

export function pickPreferredOrBest<T extends { id: string }>(
  ranked: RankedRate<T>[],
  preferredRateId?: string | null,
): { best: RankedRate<T> | undefined; rest: RankedRate<T>[] } {
  if (!ranked.length) return { best: undefined, rest: [] };
  const preferred = preferredRateId?.trim() || '';
  if (preferred) {
    const idx = ranked.findIndex((r) => r.row.id === preferred);
    if (idx >= 0) {
      const best = ranked[idx]!;
      return {
        best,
        rest: [...ranked.slice(0, idx), ...ranked.slice(idx + 1)],
      };
    }
  }
  return { best: ranked[0], rest: ranked.slice(1) };
}

export function toMatchAlternatives<T extends { id: string }>(
  rest: RankedRate<T>[],
  limit: number,
  labelFn: (row: T) => string,
  chartUnitCostFn: (row: T) => number | null,
  previewBuyTotalFn?: (row: T) => number | null,
  enrichFn?: (row: T) => Partial<MatchAlternative>,
): MatchAlternative[] {
  if (limit <= 0 || !rest.length) return [];
  return rest.slice(0, limit).map((r) => {
    const preview =
      previewBuyTotalFn != null ? previewBuyTotalFn(r.row) : null;
    const extra = enrichFn ? enrichFn(r.row) : {};
    return {
      rateId: r.row.id,
      label: labelFn(r.row) || r.row.id,
      score: r.score,
      chartUnitCost: chartUnitCostFn(r.row),
      previewBuyTotal:
        preview != null && Number.isFinite(preview) ? preview : null,
      ...extra,
    };
  });
}

/** Sort higher score first; stable id tie-break. */
export function sortRankedRates<T extends { id: string }>(
  ranked: RankedRate<T>[],
): RankedRate<T>[] {
  return [...ranked].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.id.localeCompare(b.row.id);
  });
}
