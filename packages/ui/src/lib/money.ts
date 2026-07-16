/** Locale used for Indian agency money display (lakhs/crores grouping). */
export const MONEY_LOCALE = 'en-IN';
export const DEFAULT_CURRENCY = 'INR';

export type FormatCurrencyOptions = {
  /** ISO 4217 code. Defaults to INR. */
  currency?: string | null;
  /** Fraction digits (default 2). Pass 0 for whole rupees. */
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  /** When true, omit currency symbol/code and only format the number. */
  numberOnly?: boolean;
};

/**
 * Human-readable money for display.
 * Examples (INR): ₹25,324.00 · ₹1,50,000
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: FormatCurrencyOptions | string = {},
): string {
  const opts: FormatCurrencyOptions =
    typeof options === 'string' ? { currency: options } : options;
  const currency = (opts.currency || DEFAULT_CURRENCY).toUpperCase();
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || Number.isNaN(Number(n))) return '—';

  const maximumFractionDigits = opts.maximumFractionDigits ?? 2;
  const minimumFractionDigits =
    opts.minimumFractionDigits ?? (maximumFractionDigits === 0 ? 0 : Math.min(2, maximumFractionDigits));

  if (opts.numberOnly) {
    return new Intl.NumberFormat(MONEY_LOCALE, {
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(Number(n));
  }

  try {
    return new Intl.NumberFormat(MONEY_LOCALE, {
      style: 'currency',
      currency,
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(Number(n));
  } catch {
    return `${currency} ${new Intl.NumberFormat(MONEY_LOCALE, {
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(Number(n))}`;
  }
}

/** Compact percent for margins etc. e.g. 36.7% */
export function formatPercent(
  value: number | string | null | undefined,
  digits = 1,
): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

/** Narrow currency symbol for input adornments (₹, $, …). Falls back to ISO code. */
export function currencyAdornment(currency?: string | null): string {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  try {
    const parts = new Intl.NumberFormat(MONEY_LOCALE, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || code;
  } catch {
    return code;
  }
}

export type SanitizePriceOptions = {
  /** Max digits after decimal (default 2). */
  maxFractionDigits?: number;
  allowNegative?: boolean;
};

/**
 * Keep only a valid partial price draft. Returns `null` when the keystroke is invalid.
 * Allows intermediate values like `""`, `"12."`, and `"0.5"`.
 */
export function sanitizePriceInput(
  raw: string,
  options: SanitizePriceOptions = {},
): string | null {
  const maxFractionDigits = options.maxFractionDigits ?? 2;
  const allowNegative = options.allowNegative ?? false;
  let s = raw.replace(/,/g, '').trim();

  if (s === '') return '';
  if (allowNegative && s === '-') return '-';

  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(s)) return null;

  s = s.replace(/^(-?)0+(?=\d)/, '$1');

  const dot = s.indexOf('.');
  if (dot >= 0 && maxFractionDigits >= 0) {
    const intPart = s.slice(0, dot + 1);
    const frac = s.slice(dot + 1, dot + 1 + maxFractionDigits);
    s = `${intPart}${frac}`;
  }

  return s;
}

/** Parse a price draft to a finite number, or `null` when empty/invalid. */
export function parsePrice(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
