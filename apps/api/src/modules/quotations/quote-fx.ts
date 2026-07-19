/** Quote FX lock — INR book base; convert rate-chart amounts into quote currency. */

export type QuoteFxLock = {
  /** Org book currency (Wave 1: INR). */
  baseCurrency: string;
  /** QuotationVersion.currency. */
  quoteCurrency: string;
  /**
   * Units of baseCurrency per 1 unit of quoteCurrency.
   * Example: USD quote with rate 83.25 → 1 USD = 83.25 INR.
   */
  rate: number;
  lockedAt: string;
  source: 'manual' | 'org_default' | 'same_currency';
};

/** Demo / local defaults when org has no fxRates table (INR per 1 foreign). */
export const DEFAULT_INR_PER_FOREIGN: Record<string, number> = {
  USD: 83.25,
  EUR: 90.5,
  AED: 22.7,
  GBP: 105.0,
};

export function normalizeCurrency(code: string | null | undefined): string {
  const c = String(code || 'INR').trim().toUpperCase();
  return c.length === 3 ? c : 'INR';
}

export function parseOrgFxRates(settingsJson: unknown): Record<string, number> {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const raw = root.fxRates;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_INR_PER_FOREIGN };
  }
  const out: Record<string, number> = { ...DEFAULT_INR_PER_FOREIGN };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = normalizeCurrency(k);
    const n = typeof v === 'number' ? v : Number(v);
    if (code !== 'INR' && Number.isFinite(n) && n > 0) out[code] = n;
  }
  return out;
}

export function parseQuoteFxLock(value: unknown): QuoteFxLock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;

  // Legacy stub { INR: 1, USD: 0.012 } — treat as missing (never use for math).
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
  const lockedAt =
    typeof root.lockedAt === 'string' && root.lockedAt.trim()
      ? root.lockedAt.trim()
      : new Date(0).toISOString();
  const sourceRaw = typeof root.source === 'string' ? root.source : 'manual';
  const source: QuoteFxLock['source'] =
    sourceRaw === 'org_default' || sourceRaw === 'same_currency'
      ? sourceRaw
      : 'manual';

  return { baseCurrency, quoteCurrency, rate, lockedAt, source };
}

export function sameCurrencyLock(
  currency: string,
  lockedAt = new Date().toISOString(),
): QuoteFxLock {
  const c = normalizeCurrency(currency);
  return {
    baseCurrency: c,
    quoteCurrency: c,
    rate: 1,
    lockedAt,
    source: 'same_currency',
  };
}

export function buildQuoteFxLock(input: {
  baseCurrency: string;
  quoteCurrency: string;
  rate?: number | null;
  orgFxRates?: Record<string, number>;
  source?: QuoteFxLock['source'];
  lockedAt?: string;
}): QuoteFxLock {
  const base = normalizeCurrency(input.baseCurrency);
  const quote = normalizeCurrency(input.quoteCurrency);
  const lockedAt = input.lockedAt || new Date().toISOString();
  if (base === quote) {
    return sameCurrencyLock(quote, lockedAt);
  }
  const table = input.orgFxRates || DEFAULT_INR_PER_FOREIGN;
  let rate =
    input.rate != null && Number.isFinite(input.rate) && input.rate > 0
      ? Number(input.rate)
      : table[quote];
  if (rate == null || !(rate > 0)) {
    throw new Error(
      `No FX rate for ${quote} (set a rate or add org settingsJson.fxRates.${quote})`,
    );
  }
  // Wave 1 assumes base is INR. If quote is INR and base is foreign — invert.
  if (base !== 'INR' && quote === 'INR' && table[base]) {
    rate = table[base];
  }
  return {
    baseCurrency: base,
    quoteCurrency: quote,
    rate,
    lockedAt,
    source: input.source || (input.rate != null ? 'manual' : 'org_default'),
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

/**
 * Convert an amount denominated in `fromCurrency` into quote currency using the lock.
 * Wave 1: rate charts are INR; quote may be foreign → amountQuote = amountInr / rate.
 */
export function convertWithQuoteFxLock(
  amount: number,
  fromCurrency: string,
  lock: QuoteFxLock,
): { amount: number; converted: boolean; skipped?: string } {
  if (!Number.isFinite(amount)) {
    return { amount: 0, converted: false, skipped: 'invalid_amount' };
  }
  const from = normalizeCurrency(fromCurrency);
  const quote = normalizeCurrency(lock.quoteCurrency);
  const base = normalizeCurrency(lock.baseCurrency);
  if (from === quote) {
    return { amount, converted: false };
  }
  if (from === base && quote !== base) {
    return { amount: roundMoney(amount / lock.rate), converted: true };
  }
  if (from !== base && quote === base) {
    return { amount: roundMoney(amount * lock.rate), converted: true };
  }
  // Foreign → foreign via base
  if (from !== base && quote !== base) {
    const inBase = amount * lock.rate; // wrong if from≠quote's pair — Wave 1: only INR charts
    return {
      amount: roundMoney(inBase / lock.rate),
      converted: false,
      skipped: 'cross_pair_unsupported',
    };
  }
  return { amount, converted: false, skipped: 'unsupported_pair' };
}

/** Convert INR (or base) buy into quote currency; no-op when same. */
export function convertBuyToQuoteCurrency(
  unitCost: number,
  rateCurrency: string | null | undefined,
  lock: QuoteFxLock | null,
  quoteCurrency: string,
): {
  unitCost: number;
  fx?: { from: string; to: string; rate: number; source: string };
  error?: string;
} {
  const from = normalizeCurrency(rateCurrency || quoteCurrency);
  const to = normalizeCurrency(quoteCurrency);
  if (from === to) {
    return { unitCost };
  }
  if (!lock || !fxLockCoversQuote(lock, to, lock.baseCurrency)) {
    return {
      unitCost,
      error: `FX lock required to convert ${from} → ${to}`,
    };
  }
  const converted = convertWithQuoteFxLock(unitCost, from, lock);
  if (converted.skipped) {
    return { unitCost, error: converted.skipped };
  }
  return {
    unitCost: converted.amount,
    fx: {
      from,
      to,
      rate: lock.rate,
      source: lock.source,
    },
  };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function quoteFxLockToJson(lock: QuoteFxLock): Record<string, unknown> {
  return {
    baseCurrency: lock.baseCurrency,
    quoteCurrency: lock.quoteCurrency,
    rate: lock.rate,
    lockedAt: lock.lockedAt,
    source: lock.source,
  };
}
