import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';
import { reportError } from '../../lib/errors';

export type AwaitingWriteOffRow = {
  paymentId: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  partyName: string | null;
  label: string;
  currency: string;
  writeOffAmount: number;
  reason: string | null;
  outstanding: number;
  amountExceedsOutstanding: boolean;
  href: string;
};

type AwaitingWriteOffsResponse = {
  items: AwaitingWriteOffRow[];
  count: number;
};

/** Receivables page strip: org write-offs awaiting dual-control approve. */
export function WriteOffAwaitingStrip({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const { hasAny } = usePermissions();
  const { toOrgPath } = useOrgNavigate();
  const canSee = hasAny([
    ...CAP.writeOffApprove,
    ...CAP.writeOffRequest,
    'finance.cost.read',
  ]);
  const [items, setItems] = useState<AwaitingWriteOffRow[] | null>(null);

  useEffect(() => {
    if (!enabled || !canSee) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AwaitingWriteOffsResponse>(
          '/operations/finance/write-offs/awaiting',
        );
        if (!cancelled) setItems(res.items || []);
      } catch (e) {
        reportError(e, 'Could not load awaiting write-offs');
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, canSee]);

  if (!enabled || !canSee || !items?.length) return null;

  return (
    <section className="mb-4 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Write-offs awaiting approval</h2>
        <span className="text-[11px] text-muted-foreground">
          {items.length} pending · open trip Finance to approve (requester cannot
          self-approve)
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 8).map((row) => (
          <li
            key={row.paymentId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-1.5 text-xs"
          >
            <div className="min-w-0">
              <div className="font-medium">
                {row.tripNumber} · {row.label}
              </div>
              <div className="text-muted-foreground tabular-nums">
                {formatCurrency(row.writeOffAmount, row.currency)}
                {row.partyName ? ` · ${row.partyName}` : ''}
                {row.reason ? ` · ${row.reason}` : ''}
                {row.amountExceedsOutstanding ? (
                  <span className="ml-1 text-amber-800 dark:text-amber-200">
                    · exceeds outstanding ({formatCurrency(row.outstanding, row.currency)})
                  </span>
                ) : null}
              </div>
            </div>
            <Link
              to={toOrgPath(row.href)}
              className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Open Finance
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 8 ? (
        <p className="text-[11px] text-muted-foreground">
          Showing 8 of {items.length}. Approve from each trip’s Finance tab.
        </p>
      ) : null}
    </section>
  );
}
