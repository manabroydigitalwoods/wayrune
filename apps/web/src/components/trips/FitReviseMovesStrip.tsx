import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, cn } from '@wayrune/ui';
import type { FitReviseMove, FitReviseMoveId } from '../../lib/fitReviseMoves';

type FitReviseMovesStripProps = {
  title: string;
  subtitle: string;
  actions: FitReviseMove[];
  onAction: (id: FitReviseMoveId) => void;
  onDismiss?: () => void;
  trailing?: ReactNode;
};

/** Compact date / rematch / hotel-swap chips after revise unlock. */
export function FitReviseMovesStrip({
  title,
  subtitle,
  actions,
  onAction,
  onDismiss,
  trailing,
}: FitReviseMovesStripProps) {
  if (!actions.length) return null;

  return (
    <div
      aria-label={title}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2"
    >
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="text-[10px] font-medium uppercase tracking-wide text-sky-900/80 dark:text-sky-100/80">
          {title}
        </p>
        <p className="text-xs text-sky-950/80 dark:text-sky-50/80">{subtitle}</p>
      </div>
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant={action.primary ? 'default' : 'secondary'}
          className={cn('h-7', !action.primary && 'bg-background/70')}
          title={action.hint}
          data-testid={`fit-revise-${action.id}`}
          onClick={() => onAction(action.id)}
        >
          {action.label}
        </Button>
      ))}
      {trailing}
      {onDismiss ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-sky-900/70 dark:text-sky-100/70"
          aria-label="Dismiss revise moves"
          onClick={onDismiss}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
