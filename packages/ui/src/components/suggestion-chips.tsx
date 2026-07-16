import { cn } from '../lib/utils';

export type SuggestionOption = {
  value: string;
  label: string;
};

/** Single-select suggestion chips — tap to select; tap again clears unless allowDeselect is false. */
export function SuggestionChips({
  options,
  value,
  onChange,
  className,
  allowDeselect = true,
  'aria-label': ariaLabel,
}: {
  options: SuggestionOption[];
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  allowDeselect?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (selected) {
                if (allowDeselect) onChange('');
                return;
              }
              onChange(option.value);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-white/50 bg-white/35 text-foreground backdrop-blur-md hover:border-primary/40 hover:bg-white/55 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
