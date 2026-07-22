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

  const current = steps.find((s) => s.status === 'current');

  return (
    <nav
      aria-label="FIT quote progress"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
    >
      <span className="mr-1 text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground">
        FIT path
      </span>
      {steps.map((step, index) => {
        const clickable = step.status === 'current' && step.action != null;
        const done = step.status === 'done';
        const isCurrent = step.status === 'current';
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
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => {
                if (step.action) onStepAction(step.action, step.fixTargetLineId);
              }}
              className={cn(
                'inline-flex max-w-[14rem] items-center gap-1.5 rounded-md px-2 py-1 text-[length:var(--control-text-sm)] transition-colors',
                done && 'text-success',
                isCurrent &&
                  'border border-primary/40 bg-background font-medium text-foreground shadow-sm',
                step.status === 'upcoming' && 'text-muted-foreground',
                clickable && 'hover:bg-background/90 cursor-pointer',
                !clickable && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full text-[length:var(--control-text-sm)] font-semibold',
                  done && 'bg-success-soft text-success',
                  isCurrent && 'bg-primary/15 text-primary',
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
      {current?.ctaLabel && current.action ? (
        <button
          type="button"
          data-testid="fit-progress-next"
          className="ml-auto inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => onStepAction(current.action!, current.fixTargetLineId)}
        >
          Next: {current.ctaLabel}
        </button>
      ) : null}
    </nav>
  );
}
