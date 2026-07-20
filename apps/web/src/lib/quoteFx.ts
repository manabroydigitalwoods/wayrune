/** Client-side Quote FX helpers (mirrors API quote-fx). */

export type QuoteFxLock = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  lockedAt: string;
  source: 'manual' | 'org_default' | 'same_currency';
};

export function normalizeCurrency(code: string | null | undefined): string {
  const c = String(code || 'INR').trim().toUpperCase();
  return c.length === 3 ? c : 'INR';
}

export function parseQuoteFxLock(value: unknown): QuoteFxLock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (
    typeof root.rate !== 'number' &&
    typeof root.USD === 'number' &&
    typeof root.INR === 'number'
  ) {
    return null;
  }
  const baseCurrency = normalizeCurrency(
    typeof root.baseCurrency === 'string'
      ? root.baseCurrency
      : typeof root.base === 'string'
        ? root.base
        : 'INR',
  );
  const quoteCurrency = normalizeCurrency(
    typeof root.quoteCurrency === 'string'
      ? root.quoteCurrency
      : typeof root.quote === 'string'
        ? root.quote
        : '',
  );
  const rate = typeof root.rate === 'number' ? root.rate : Number(root.rate);
  if (!quoteCurrency || !Number.isFinite(rate) || rate <= 0) return null;
  return {
    baseCurrency,
    quoteCurrency,
    rate,
    lockedAt:
      typeof root.lockedAt === 'string' && root.lockedAt.trim()
        ? root.lockedAt.trim()
        : new Date(0).toISOString(),
    source:
      root.source === 'org_default' || root.source === 'same_currency'
        ? root.source
        : 'manual',
  };
}

export function fxLockCoversQuote(
  lock: QuoteFxLock | null,
  quoteCurrency: string,
  baseCurrency: string,
): boolean {
  const quote = normalizeCurrency(quoteCurrency);
  const base = normalizeCurrency(baseCurrency);
  if (quote === base) return true;
  if (!lock) return false;
  return (
    normalizeCurrency(lock.quoteCurrency) === quote &&
    normalizeCurrency(lock.baseCurrency) === base &&
    lock.rate > 0
  );
}

export function convertBuyToQuoteCurrency(
  unitCost: number,
  rateCurrency: string | null | undefined,
  lock: QuoteFxLock | null,
  quoteCurrency: string,
  orgFxRates?: Record<string, number>,
): { unitCost: number; error?: string; converted?: boolean } {
  const from = normalizeCurrency(rateCurrency || quoteCurrency);
  const to = normalizeCurrency(quoteCurrency);
  if (from === to) return { unitCost };
  if (!lock || !fxLockCoversQuote(lock, to, lock.baseCurrency)) {
    return { unitCost, error: `FX lock required to convert ${from} → ${to}` };
  }
  const base = normalizeCurrency(lock.baseCurrency);
  if (from === base && to !== from) {
    return {
      unitCost: Math.round((unitCost / lock.rate) * 100) / 100,
      converted: true,
    };
  }
  if (from !== base && to === base) {
    return {
      unitCost: Math.round(unitCost * lock.rate * 100) / 100,
      converted: true,
    };
  }
  if (from !== base && to !== base) {
    if (base !== 'INR') {
      return { unitCost, error: 'cross_pair_non_inr_base' };
    }
    const fromPerUnit = orgFxRates?.[from];
    if (fromPerUnit == null || !(fromPerUnit > 0)) {
      return { unitCost, error: 'cross_pair_missing_org_rate' };
    }
    const inBase = unitCost * fromPerUnit;
    return {
      unitCost: Math.round((inBase / lock.rate) * 100) / 100,
      converted: true,
    };
  }
  return { unitCost, error: 'unsupported_pair' };
}

export const QUOTE_FX_CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'AED', label: 'AED' },
  { value: 'GBP', label: 'GBP' },
];
