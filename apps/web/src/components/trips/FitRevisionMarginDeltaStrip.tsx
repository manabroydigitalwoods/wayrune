import { cn, formatCurrency, formatPercent } from '@wayrune/ui';
import type { RevisionMarginDelta } from '../../lib/revisionMarginDelta';
import { signedMoneyDelta, signedPpDelta } from '../../lib/revisionMarginDelta';

type FitRevisionMarginDeltaStripProps = {
  delta: RevisionMarginDelta;
  currency?: string;
};

function moneyDeltaLabel(
  n: number,
  currency?: string,
): string {
  const { sign, abs } = signedMoneyDelta(n);
  if (!sign) return formatCurrency(0, currency);
  return `${sign}${formatCurrency(abs, currency)}`;
}

function ppDeltaLabel(n: number): string {
  const { sign, abs } = signedPpDelta(n);
  if (!sign) return '0 pp';
  return `${sign}${abs.toFixed(1)} pp`;
}

/** Before → after cost / sell / margin when revising a draft. */
export function FitRevisionMarginDeltaStrip({
  delta,
  currency,
}: FitRevisionMarginDeltaStripProps) {
  const marginUp = delta.deltaMarginPp > 0.05;
  const marginDown = delta.deltaMarginPp < -0.05;

  return (
    <div
      aria-label="Revision margin delta"
      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          vs {delta.baselineLabel}
          {delta.source === 'accepted' ? ' (accepted)' : ''}
        </p>
        {delta.before.incomplete || delta.after.incomplete ? (
          <span className="text-amber-700 dark:text-amber-400">
            Incomplete pricing — delta is partial
          </span>
        ) : null}
      </div>
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Cost</dt>
          <dd>
            {formatCurrency(delta.before.costTotal, currency)}
            <span className="text-muted-foreground"> → </span>
            {formatCurrency(delta.after.costTotal, currency)}
            <span className="ml-1 text-muted-foreground">
              ({moneyDeltaLabel(delta.deltaCost, currency)})
            </span>
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Sell</dt>
          <dd>
            {formatCurrency(delta.before.sellExTax, currency)}
            <span className="text-muted-foreground"> → </span>
            {formatCurrency(delta.after.sellExTax, currency)}
            <span className="ml-1 text-muted-foreground">
              ({moneyDeltaLabel(delta.deltaSellExTax, currency)})
            </span>
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Margin</dt>
          <dd
            className={cn(
              marginUp && 'text-emerald-700 dark:text-emerald-400',
              marginDown && 'text-amber-800 dark:text-amber-300',
            )}
          >
            {formatPercent(delta.before.marginPercent)}
            <span className="text-muted-foreground"> → </span>
            {formatPercent(delta.after.marginPercent)}
            <span className="ml-1">({ppDeltaLabel(delta.deltaMarginPp)})</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
