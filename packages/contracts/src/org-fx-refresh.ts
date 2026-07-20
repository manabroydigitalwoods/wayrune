/** Fetch ECB-sourced market FX into org `settingsJson.fxRates` (Frankfurter). */

export const ORG_FX_REFRESH_CODES = ['USD', 'EUR', 'AED', 'GBP'] as const;

export type OrgFxRefreshCode = (typeof ORG_FX_REFRESH_CODES)[number];

/** Currencies Frankfurter/ECB publishes (AED is not included). */
export const FRANKFURTER_CURRENCIES = new Set([
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
]);

export type OrgFxRatesMeta = {
  fetchedAt: string;
  source: 'frankfurter';
  /** ECB observation date from Frankfurter (`YYYY-MM-DD`). */
  asOf?: string;
  baseCurrency: string;
  refreshed: string[];
  skipped: string[];
};

export type FetchOrgFxRatesResult = {
  rates: Record<string, number>;
  meta: OrgFxRatesMeta;
};

function normalizeCurrency(code: string): string {
  const c = String(code || '').trim().toUpperCase();
  return c.length === 3 ? c : '';
}

/** Round to 4 dp — enough for Lock FX, stable in Settings inputs. */
export function roundOrgFxRate(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Invert Frankfurter `from=base → to=foreign` quotes into
 * “units of base per 1 foreign” (org FX table convention).
 */
export function invertFrankfurterRates(
  foreignPerBase: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, raw] of Object.entries(foreignPerBase)) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[normalizeCurrency(code)] = roundOrgFxRate(1 / n);
  }
  return out;
}

export function planOrgFxRefresh(opts: {
  baseCurrency: string;
  codes?: readonly string[];
}): { fetchCodes: string[]; skipped: string[] } {
  const base = normalizeCurrency(opts.baseCurrency) || 'INR';
  const codes = opts.codes ?? ORG_FX_REFRESH_CODES;
  const fetchCodes: string[] = [];
  const skipped: string[] = [];
  for (const raw of codes) {
    const code = normalizeCurrency(raw);
    if (!code || code === base) {
      if (code) skipped.push(code);
      continue;
    }
    if (!FRANKFURTER_CURRENCIES.has(code)) {
      skipped.push(code);
      continue;
    }
    fetchCodes.push(code);
  }
  return { fetchCodes, skipped };
}

type FrankfurterLatest = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

/**
 * Pull market rates for Settings FX table.
 * Uses one Frankfurter request: foreign-per-1-base, then invert.
 */
export async function fetchFrankfurterOrgFxRates(opts: {
  baseCurrency: string;
  codes?: readonly string[];
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<FetchOrgFxRatesResult> {
  const base = normalizeCurrency(opts.baseCurrency) || 'INR';
  if (!FRANKFURTER_CURRENCIES.has(base)) {
    throw new Error(
      `Live FX refresh needs a Frankfurter-supported book currency (got ${base || 'blank'})`,
    );
  }

  const { fetchCodes, skipped } = planOrgFxRefresh({
    baseCurrency: base,
    codes: opts.codes,
  });
  const fetchedAt = (opts.now ?? new Date()).toISOString();

  if (!fetchCodes.length) {
    return {
      rates: {},
      meta: {
        fetchedAt,
        source: 'frankfurter',
        baseCurrency: base,
        refreshed: [],
        skipped,
      },
    };
  }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(fetchCodes.join(','))}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Frankfurter FX refresh failed (${res.status})`);
  }
  const body = (await res.json()) as FrankfurterLatest;
  const inverted = invertFrankfurterRates(body.rates ?? {});
  const rates: Record<string, number> = {};
  const refreshed: string[] = [];
  for (const code of fetchCodes) {
    const n = inverted[code];
    if (n == null || !(n > 0)) {
      skipped.push(code);
      continue;
    }
    rates[code] = n;
    refreshed.push(code);
  }

  return {
    rates,
    meta: {
      fetchedAt,
      source: 'frankfurter',
      asOf: typeof body.date === 'string' ? body.date : undefined,
      baseCurrency: base,
      refreshed,
      skipped,
    },
  };
}

export function mergeOrgFxRatesAfterRefresh(
  prior: Record<string, unknown>,
  incoming: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(prior)) {
    const code = normalizeCurrency(k);
    const n = typeof v === 'number' ? v : Number(v);
    if (code && Number.isFinite(n) && n > 0) out[code] = n;
  }
  for (const [k, v] of Object.entries(incoming)) {
    const code = normalizeCurrency(k);
    if (code && Number.isFinite(v) && v > 0) out[code] = v;
  }
  return out;
}

/** Default max age before worker auto-refresh (7 days). */
export const FX_AUTO_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function asSettingsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Read `settingsJson.fxRatesMeta` when present. */
export function parseOrgFxRatesMeta(
  settingsJson: unknown,
): OrgFxRatesMeta | null {
  const meta = asSettingsRecord(settingsJson).fxRatesMeta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const o = meta as Record<string, unknown>;
  const fetchedAt =
    typeof o.fetchedAt === 'string' ? o.fetchedAt : undefined;
  if (!fetchedAt && o.source !== 'frankfurter') return null;
  return {
    fetchedAt: fetchedAt || '',
    source: 'frankfurter',
    asOf: typeof o.asOf === 'string' ? o.asOf : undefined,
    baseCurrency:
      typeof o.baseCurrency === 'string' ? o.baseCurrency : '',
    refreshed: Array.isArray(o.refreshed)
      ? o.refreshed.filter((x): x is string => typeof x === 'string')
      : [],
    skipped: Array.isArray(o.skipped)
      ? o.skipped.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

/** True when meta is missing/invalid or older than maxAgeMs. */
export function fxAutoRefreshDue(
  meta: { fetchedAt?: string | null } | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = FX_AUTO_REFRESH_MAX_AGE_MS,
): boolean {
  const raw = meta?.fetchedAt;
  if (!raw || typeof raw !== 'string') return true;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t >= maxAgeMs;
}

/** Merge Frankfurter result into org settingsJson (fxRates + fxRatesMeta). */
export function applyFxRefreshToSettingsJson(
  settingsJson: unknown,
  fetched: FetchOrgFxRatesResult,
): Record<string, unknown> {
  const settings = asSettingsRecord(settingsJson);
  const priorFx = asSettingsRecord(settings.fxRates);
  const fxRates = mergeOrgFxRatesAfterRefresh(priorFx, fetched.rates);
  return {
    ...settings,
    fxRates,
    fxRatesMeta: fetched.meta,
  };
}
