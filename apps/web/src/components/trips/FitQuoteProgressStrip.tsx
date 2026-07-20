import { Check } from 'lucide-react';
import { cn } from '@wayrune/ui';
import type {
  FitQuoteProgressAction,
  FitQuoteProgressStep,
} from '../../lib/fitQuoteProgress';

type FitQuoteProgressStripProps = {
  steps: FitQuoteProgressStep[];
  onStepAction: (action: FitQuoteProgressAction, fixTargetLineId: string | null) => void;
};

/** Compact Package → Match → Margin → Send cues on the quotations tab. */
export function FitQuoteProgressStrip({
  steps,
  onStepAction,
}: FitQuoteProgressStripProps) {
  if (!steps.length) return null;

  return (
    <nav
      aria-label="FIT quote progress"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
    >
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        FIT path
      </span>
      {steps.map((step, index) => {
        const clickable = step.status === 'current' && step.action != null;
        const done = step.status === 'done';
        const current = step.status === 'current';
        return (
          <div key={step.id} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className="text-muted-foreground/50" aria-hidden>
                →
              </span>
            ) : null}
            <button
              type="button"
              disabled={!clickable}
              title={step.hint}
              aria-current={current ? 'step' : undefined}
              onClick={() => {
                if (step.action) onStepAction(step.action, step.fixTargetLineId);
              }}
              className={cn(
                'inline-flex max-w-[12rem] items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
                done && 'text-emerald-800 dark:text-emerald-200',
                current &&
                  'border border-border/60 bg-background font-medium text-foreground shadow-sm',
                step.status === 'upcoming' && 'text-muted-foreground',
                clickable && 'hover:bg-background/90 cursor-pointer',
                !clickable && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                  done && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
                  current && 'bg-primary/15 text-primary',
                  step.status === 'upcoming' && 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
