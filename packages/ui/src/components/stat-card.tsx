import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusBadge } from './status-badge';
import { Card, CardContent } from './ui/card';
import { SoftIcon } from './icon';
import { cn } from '../lib/utils';

export function StatCard({
  label,
  value,
  tone = 'neutral',
  icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
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
          : 'border-primary/10 bg-primary-50/60';

  return (
    <Card
      className={cn(
        'transition-shadow',
        soft,
        onClick && 'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
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
              className="size-9"
            />
          ) : null}
        </div>
        <div className="font-display mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</div>
        <div className="mt-3">
          <StatusBadge value={label} tone={tone} />
        </div>
      </CardContent>
    </Card>
  );
}
