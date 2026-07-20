/** Sort Match alternatives for side-by-side compare. */

export type MatchAltSortMode = 'best' | 'lowest_buy' | 'preferred';

export type MatchAltSortable = {
  id: string;
  /** Est. stay / trip buy for the line window. */
  estimatedBuy?: number | null;
  unitCost?: number | null;
  preferred?: boolean | null;
  /** Higher is better when mode=best (confidence / rank). */
  score?: number | null;
};

function buyOf(alt: MatchAltSortable): number {
  const est = Number(alt.estimatedBuy);
  if (Number.isFinite(est)) return est;
  const unit = Number(alt.unitCost);
  if (Number.isFinite(unit)) return unit;
  return Number.POSITIVE_INFINITY;
}

function scoreOf(alt: MatchAltSortable): number {
  const s = Number(alt.score);
  return Number.isFinite(s) ? s : 0;
}

export function sortMatchAlternatives<T extends MatchAltSortable>(
  alts: T[],
  mode: MatchAltSortMode,
): T[] {
  const copy = [...alts];
  copy.sort((a, b) => {
    if (mode === 'preferred') {
      const pref = Number(Boolean(b.preferred)) - Number(Boolean(a.preferred));
      if (pref !== 0) return pref;
      return buyOf(a) - buyOf(b);
    }
    if (mode === 'lowest_buy') {
      const buy = buyOf(a) - buyOf(b);
      if (buy !== 0) return buy;
      return scoreOf(b) - scoreOf(a);
    }
    // best: higher score, then lower buy
    const score = scoreOf(b) - scoreOf(a);
    if (score !== 0) return score;
    return buyOf(a) - buyOf(b);
  });
  return copy;
}

export const MATCH_ALT_SORT_CHIPS: Array<{
  id: MatchAltSortMode;
  label: string;
}> = [
  { id: 'best', label: 'Best' },
  { id: 'lowest_buy', label: 'Lowest buy' },
  { id: 'preferred', label: 'Preferred' },
];
