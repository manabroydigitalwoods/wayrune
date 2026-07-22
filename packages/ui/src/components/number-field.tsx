import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

function sanitizeNumberInput(
  raw: string,
  opts: { integer?: boolean; allowNegative?: boolean },
): string | null {
  const { integer = true, allowNegative = false } = opts;
  let next = raw.replace(/[^\d.-]/g, '');
  if (!allowNegative) next = next.replace(/-/g, '');
  else {
    const neg = next.startsWith('-');
    next = `${neg ? '-' : ''}${next.replace(/-/g, '')}`;
  }
  if (integer) {
    next = next.replace(/\./g, '');
  } else {
    const parts = next.split('.');
    if (parts.length > 2) {
      next = `${parts[0]}.${parts.slice(1).join('')}`;
    }
  }
  // Allow empty / partial draft while typing
  if (next === '' || next === '-' || next === '.') return next === '.' ? '0.' : next;
  if (integer && !/^-?\d*$/.test(next)) return null;
  if (!integer && !/^-?\d*\.?\d*$/.test(next)) return null;
  return next;
}

export type NumberFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'size'
> & {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Whole numbers only (default). Set false for decimals. */
  integer?: boolean;
  allowNegative?: boolean;
  /** Brand quick-pick values shown under the input. */
  quickPicks?: number[];
  quickPickLabel?: string;
  /** When a selected quick pick is tapped again, clear the value. */
  allowDeselect?: boolean;
  inputSize?: 'default' | 'sm';
  'aria-invalid'?: boolean;
};

/**
 * Branded number entry: primary input + optional quick-pick chips.
 * Value is a string draft (like PriceField) so empty / partial typing works.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step: _step = 1,
  integer = true,
  allowNegative = false,
  quickPicks,
  quickPickLabel = 'Quick pick',
  allowDeselect = false,
  disabled,
  placeholder,
  className,
  id,
  name,
  autoFocus,
  inputSize = 'default',
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  ...rest
}: NumberFieldProps) {
  const display = value === '' || value == null ? '' : String(value);
  const selectedPick =
    display !== '' &&
    Number.isFinite(Number(display)) &&
    quickPicks?.some((n) => String(n) === display)
      ? display
      : '';

  function commit(next: string) {
    if (next === '' || next === '-' || next === '.' || next === '-.') {
      onChange(next === '.' ? '' : next === '-.' ? '-' : next);
      return;
    }
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    let clamped = n;
    if (min != null && clamped < min) clamped = min;
    if (max != null && clamped > max) clamped = max;
    onChange(integer ? String(Math.trunc(clamped)) : String(clamped));
  }

  return (
    <div className={cn('space-y-0', className)}>
      <Input
        {...rest}
        id={id}
        name={name}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        inputSize={inputSize}
        value={display}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const next = sanitizeNumberInput(e.target.value, {
            integer,
            allowNegative,
          });
          if (next != null) onChange(next);
        }}
        onBlur={() => {
          if (display === '' || display === '-') return;
          commit(display);
        }}
        className="tabular-nums"
      />
      {quickPicks?.length ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">{quickPickLabel}</p>
          <div
            role="group"
            aria-label={ariaLabel ? `${ariaLabel} quick picks` : quickPickLabel}
            className="flex flex-wrap gap-[var(--field-gap)]"
          >
            {quickPicks.map((n) => {
              const token = String(n);
              const selected = selectedPick === token;
              const outOfRange =
                (min != null && n < min) || (max != null && n > max);
              return (
                <button
                  key={token}
                  type="button"
                  disabled={disabled || outOfRange}
                  aria-pressed={selected}
                  onClick={() => {
                    if (selected) {
                      if (allowDeselect) onChange('');
                      return;
                    }
                    commit(token);
                  }}
                  className={cn(
                    'inline-flex h-[var(--control-h-sm)] min-w-[var(--control-h-sm)] shrink-0 items-center justify-center rounded-full border px-2 text-[length:var(--control-text-sm)] font-semibold tabular-nums transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-white/50 bg-white/35 text-foreground backdrop-blur-md hover:border-primary/40 hover:bg-white/55 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
                    (disabled || outOfRange) && 'opacity-50',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Labeled wrapper for suggestion chips / extras under a primary control. */
export function QuickPicks({
  label = 'Quick pick',
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-2 space-y-1.5', className)}>
      <p className="text-[length:var(--control-text-sm)] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
