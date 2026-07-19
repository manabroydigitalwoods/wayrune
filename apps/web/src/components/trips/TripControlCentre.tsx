import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  StatusBadge,
  formatCurrency,
  formatPercent,
} from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type ControlFlag = {
  id: string;
  severity: 'danger' | 'warn' | 'info';
  code: string;
  label: string;
  detail?: string;
  tab: 'operations' | 'finance' | 'quotations' | 'commerce';
  bookingId?: string;
};

type TripControlSummary = {
  generatedAt: string;
  nearDepartureDays: number;
  daysToStart: number | null;
  counts: {
    openBookings: number;
    confirmedBookings: number;
    vouchersPending: number;
    hotelsOpen: number;
    transfersOpen: number;
    readinessDone: number;
    readinessTotal: number;
    openIncidents: number;
    openChangeCases: number;
  };
  money: {
    currency: string;
    customerDue: number;
    customerPaid: number;
    supplierDue: number;
    supplierPaid: number;
    overdueCount: number;
    marginAmount: number | null;
    marginPercent: number | null;
    sellTotal: number | null;
  };
  flags: ControlFlag[];
  allClear: boolean;
};

function severityTone(severity: ControlFlag['severity']): 'danger' | 'warn' | 'info' | 'success' {
  if (severity === 'danger') return 'danger';
  if (severity === 'warn') return 'warn';
  return 'info';
}

export function TripControlCentre({
  tripId,
  onOpenTab,
  compact,
  activeTab,
}: {
  tripId: string;
  onOpenTab: (tab: 'operations' | 'finance' | 'quotations' | 'commerce') => void;
  /** Slim risk strip (e.g. above tabs). */
  compact?: boolean;
  /** Current workspace tab — hides redundant strip on detail tabs. */
  activeTab?: string;
}) {
  const [data, setData] = useState<TripControlSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<TripControlSummary>(`/trips/${tripId}/control`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) reportError(e, 'Could not load trip control');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!data) return null;

  const actionFlags = data.flags.filter((f) => f.severity !== 'info');
  const showCompact = compact && actionFlags.length > 0;

  if (compact && !showCompact) return null;

  if (compact) {
    const elsewhere =
      actionFlags.find((f) => f.tab !== activeTab) ?? actionFlags[0];
    const ctaTab = elsewhere?.tab ?? 'operations';
    const onThisTab = ctaTab === activeTab;
    const ctaLabel =
      ctaTab === 'finance'
        ? 'Open finance'
        : ctaTab === 'commerce'
          ? 'Open changes'
          : ctaTab === 'quotations'
            ? 'Open quotations'
            : 'Open operations';
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/25 bg-warning-soft/30 px-3 py-2 text-sm">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Needs attention
        </span>
        {actionFlags.slice(0, 4).map((f) => (
          <button
            key={f.id}
            type="button"
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 py-1 text-left text-xs hover:bg-background"
            onClick={() => onOpenTab(f.tab)}
          >
            <StatusBadge value={f.code} label={f.label} tone={severityTone(f.severity)} showIcon />
          </button>
        ))}
        {actionFlags.length > 4 ? (
          <span className="text-xs text-muted-foreground">+{actionFlags.length - 4} more</span>
        ) : null}
        {!onThisTab ? (
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => onOpenTab(ctaTab)}>
            {ctaLabel}
          </Button>
        ) : (
          <span className="ml-auto text-[11px] text-muted-foreground">On this tab</span>
        )}
      </div>
    );
  }

  const { counts, money } = data;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <strong className="text-sm">Trip control</strong>
            <p className="text-xs text-muted-foreground">
              Bookings, vouchers, collections, and payables at a glance
              {data.daysToStart != null
                ? ` · ${data.daysToStart < 0 ? `${Math.abs(data.daysToStart)}d past start` : data.daysToStart === 0 ? 'departs today' : `${data.daysToStart}d to start`}`
                : ''}
              .
            </p>
          </div>
          {data.allClear ? (
            <StatusBadge value="ready" label="All clear" tone="success" />
          ) : (
            <StatusBadge
              value="attention"
              label={`${actionFlags.length || data.flags.length} to review`}
              tone={actionFlags.some((f) => f.severity === 'danger') ? 'danger' : 'warn'}
            />
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Bookings open"
            value={String(counts.openBookings)}
            hint={`${counts.confirmedBookings} confirmed`}
            onClick={() => onOpenTab('operations')}
          />
          <Metric
            label="Vouchers pending"
            value={String(counts.vouchersPending)}
            hint="Confirmed hotels without note"
            onClick={() => onOpenTab('operations')}
          />
          <Metric
            label="Customer due"
            value={formatCurrency(money.customerDue, {
              currency: money.currency,
              maximumFractionDigits: 0,
            })}
            hint={
              money.overdueCount
                ? `${money.overdueCount} overdue`
                : `Paid ${formatCurrency(money.customerPaid, { currency: money.currency, maximumFractionDigits: 0 })}`
            }
            onClick={() => onOpenTab('finance')}
          />
          <Metric
            label="Supplier due"
            value={formatCurrency(money.supplierDue, {
              currency: money.currency,
              maximumFractionDigits: 0,
            })}
            hint={
              money.marginPercent != null
                ? `Margin ${formatPercent(money.marginPercent)}`
                : money.sellTotal != null
                  ? `Sell ${formatCurrency(money.sellTotal, { currency: money.currency, maximumFractionDigits: 0 })}`
                  : 'No accepted quote'
            }
            onClick={() => onOpenTab('finance')}
          />
        </div>

        {data.flags.length ? (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border">
            {data.flags.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                  onClick={() => onOpenTab(f.tab)}
                >
                  <StatusBadge
                    value={f.code}
                    label={f.label}
                    tone={severityTone(f.severity)}
                    showIcon
                  />
                  {f.detail ? (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {f.detail}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {f.tab}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open risks on this trip.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onOpenTab('operations')}>
            Operations
            {counts.readinessTotal
              ? ` · ${counts.readinessDone}/${counts.readinessTotal} ready`
              : ''}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onOpenTab('finance')}>
            Finance
          </Button>
          {(counts.openIncidents > 0 || counts.openChangeCases > 0) ? (
            <Button size="sm" variant="secondary" onClick={() => onOpenTab('commerce')}>
              Changes & incidents
              {counts.openIncidents || counts.openChangeCases
                ? ` · ${counts.openIncidents + counts.openChangeCases}`
                : ''}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onOpenTab('commerce')}>
              Changes & incidents
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpenTab('quotations')}>
            Quotations
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/30 glass-row"
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </button>
  );
}
