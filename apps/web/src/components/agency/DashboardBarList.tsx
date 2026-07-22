import { Card, CardContent, cn } from '@wayrune/ui';

export type DashboardBarRow = {
  id: string;
  label: string;
  value: number;
  /** Optional secondary line (e.g. currency). */
  detail?: string;
  onClick?: () => void;
};

/** Readable horizontal bar list — no chart library. */
export function DashboardBarList({
  title,
  subtitle,
  rows,
  emptyLabel = 'No data yet',
  className,
}: {
  title: string;
  subtitle?: string;
  rows: DashboardBarRow[];
  emptyLabel?: string;
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className={cn('border-border/60', className)}>
      <CardContent className="space-y-3 p-[var(--pad-card)]">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const pct = Math.round((row.value / max) * 100);
              const inner = (
                <>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{row.label}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {/* `value` sizes the bar; `detail` is the human label (e.g. ₹). */}
                      {row.detail ?? row.value}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-[width]"
                      style={{ width: `${pct}%` }}
                      role="presentation"
                    />
                  </div>
                </>
              );
              return (
                <li key={row.id}>
                  {row.onClick ? (
                    <button
                      type="button"
                      className="w-full rounded-md text-left hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={row.onClick}
                    >
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
