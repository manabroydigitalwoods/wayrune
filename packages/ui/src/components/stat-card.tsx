import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from './ui/card';
import { SoftIcon } from './icon';
import { cn } from '../lib/utils';

export function StatCard({
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
  /** Optional helper under the value — never a StatusBadge (labels are not statuses). */
  hint?: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}) {
  const soft =
    tone === 'success'
      ? 'border-success/20 bg-success-soft/40'
      : tone === 'warn'
        ? 'border-warning/20 bg-warning-soft/40'
        : tone === 'danger'
          ? 'border-destructive/20 bg-danger-soft/40'
          : 'border-border/60 bg-card';

  return (
    <Card
      className={cn(
        'transition-shadow',
        soft,
        onClick &&
          'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
            <div className="font-display mt-1 text-2xl font-semibold tabular-nums tracking-tight">
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
