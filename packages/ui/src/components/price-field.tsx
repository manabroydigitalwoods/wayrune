import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import {
  DEFAULT_CURRENCY,
  currencyAdornment,
  sanitizePriceInput,
} from '../lib/money';
import { Input } from './ui/input';

export type PriceFieldProps = {
  value: string | number;
  onChange: (value: string) => void;
  /** ISO 4217. Defaults to INR. */
  currency?: string | null;
  id?: string;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Hide the currency prefix (dense table cells). */
  showCurrency?: boolean;
  maxFractionDigits?: number;
  allowNegative?: boolean;
  autoFocus?: boolean;
  'aria-invalid'?: boolean;
  /** Optional control beside the field (e.g. Suggest). */
  trailing?: ReactNode;
};

/**
 * Money entry: digits + optional fraction only.
 * Keeps a string draft so partial values like `12.` work while typing.
 */
export function PriceField({
  value,
  onChange,
  currency = DEFAULT_CURRENCY,
  id,
  name,
  disabled,
  placeholder = '0',
  className,
  showCurrency = true,
  maxFractionDigits = 2,
  allowNegative = false,
  autoFocus,
  'aria-invalid': ariaInvalid,
  trailing,
}: PriceFieldProps) {
  const display = value === '' || value == null ? '' : String(value);
  const symbol = currencyAdornment(currency);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-input bg-card/85 shadow-sm transition-[color,box-shadow,border-color]',
          'focus-within:border-ring focus-within:outline-none focus-within:ring-2 focus-within:ring-ring',
          ariaInvalid &&
            'border-destructive focus-within:border-destructive focus-within:ring-destructive/40',
          disabled && 'opacity-50',
        )}
      >
        {showCurrency ? (
          <span
            className="flex h-full shrink-0 items-center border-r border-border/80 bg-muted/50 px-1.5 text-xs font-semibold leading-none tabular-nums text-muted-foreground"
            aria-hidden
          >
            {symbol}
          </span>
        ) : null}
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={ariaInvalid}
          value={display}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = sanitizePriceInput(e.target.value, {
              maxFractionDigits,
              allowNegative,
            });
            if (next != null) onChange(next);
          }}
          className={cn(
            'h-full min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 py-0 shadow-none focus-visible:ring-0',
          )}
        />
      </div>
      {trailing}
    </div>
  );
}
