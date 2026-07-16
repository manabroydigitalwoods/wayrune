import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export type WizardStep = {
  id: string;
  title: string;
  description?: string;
};

export function Wizard({
  steps,
  stepIndex,
  onStepChange,
  children,
  onBack,
  onNext,
  onFinish,
  nextLabel = 'Continue',
  finishLabel = 'Save',
  backLabel = 'Back',
  canNext = true,
  finishing,
  className,
}: {
  steps: WizardStep[];
  stepIndex: number;
  onStepChange?: (index: number) => void;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onFinish?: () => void;
  nextLabel?: string;
  finishLabel?: string;
  backLabel?: string;
  canNext?: boolean;
  finishing?: boolean;
  className?: string;
}) {
  const isLast = stepIndex >= steps.length - 1;
  return (
    <div className={cn('space-y-6', className)}>
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          // Back to any completed step always; forward only when Continue would allow.
          const canJump = Boolean(onStepChange) && (i <= stepIndex || (i === stepIndex + 1 && canNext));
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!canJump}
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  if (!canJump || i === stepIndex) return;
                  onStepChange?.(i);
                }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  canJump && 'cursor-pointer hover:opacity-90',
                  !canJump && 'cursor-not-allowed opacity-70',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-primary-100 text-primary-800',
                  !active && !done && 'bg-muted text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[10px]',
                    active || done ? 'bg-white/20' : 'bg-background/60',
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {step.title}
              </button>
            </li>
          );
        })}
      </ol>
      <div>
        <h3 className="font-display text-lg font-semibold">{steps[stepIndex]?.title}</h3>
        {steps[stepIndex]?.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{steps[stepIndex].description}</p>
        ) : null}
      </div>
      <div>{children}</div>
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={onBack}>
          {backLabel}
        </Button>
        {isLast ? (
          <Button type="button" onClick={onFinish} disabled={!canNext || finishing}>
            {finishing ? 'Saving…' : finishLabel}
          </Button>
        ) : (
          <Button type="button" onClick={onNext} disabled={!canNext}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
