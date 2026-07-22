import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, SoftIcon, cn } from '@wayrune/ui';

type Tone = 'neutral' | 'success' | 'warn' | 'danger';

/** Quieter than StatCard — value + hint without a duplicate status badge. */
export function DashboardInsightCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}) {
  const soft =
    tone === 'success'
      ? 'border-success/15 bg-success-soft/25'
      : tone === 'warn'
        ? 'border-warning/15 bg-warning-soft/25'
        : tone === 'danger'
          ? 'border-destructive/15 bg-danger-soft/25'
          : 'border-border/60 bg-card';

  return (
    <Card
      className={cn(
        soft,
        onClick &&
          'cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="font-display mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {value}
            </div>
            {hint ? (
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {icon ? (
            <SoftIcon
              icon={icon}
              tone={
                tone === 'neutral'
                  ? 'primary'
                  : tone === 'danger'
                    ? 'danger'
                    : tone === 'warn'
                      ? 'warning'
                      : tone
              }
              className="shrink-0"
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
