import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { SoftIcon } from './icon';

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-[var(--gap-section)] sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-[var(--gap-section)]">
        {icon ? <SoftIcon icon={icon} tone="primary" /> : null}
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? (
            <div className="mt-[var(--field-gap)] text-[length:var(--control-text)] text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[var(--field-gap)]">{actions}</div>
      ) : null}
    </div>
  );
}
