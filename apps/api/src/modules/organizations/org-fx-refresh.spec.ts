import { describe, expect, it, vi } from 'vitest';
import {
  applyFxRefreshToSettingsJson,
  fetchFrankfurterOrgFxRates,
  fxAutoRefreshDue,
  invertFrankfurterRates,
  mergeOrgFxRatesAfterRefresh,
  orgFxAutoRefreshEnabled,
  parseOrgFxRatesMeta,
  planOrgFxRefresh,
  roundOrgFxRate,
  tryRefreshOrgFxForLock,
} from '@wayrune/contracts';

describe('org-fx-refresh', () => {
  it('inverts foreign-per-base into base-per-foreign', () => {
    expect(invertFrankfurterRates({ USD: 0.01, EUR: 0.01 })).toEqual({
      USD: 100,
      EUR: 100,
    });
    expect(roundOrgFxRate(1 / 0.01039)).toBe(96.2464);
  });

  it('plans fetch vs skip (AED + same-as-base)', () => {
    expect(planOrgFxRefresh({ baseCurrency: 'INR' })).toEqual({
      fetchCodes: ['USD', 'EUR', 'GBP'],
      skipped: ['AED'],
    });
    expect(planOrgFxRefresh({ baseCurrency: 'USD' })).toEqual({
      fetchCodes: ['EUR', 'GBP'],
      skipped: ['USD', 'AED'],
    });
  });

  it('fetches and merges Frankfurter rates', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        base: 'INR',
        date: '2026-07-17',
        rates: { USD: 0.01, EUR: 0.01, GBP: 0.008 },
      }),
    })) as unknown as typeof fetch;

    const result = await fetchFrankfurterOrgFxRates({
      baseCurrency: 'INR',
      fetchImpl,
      now: new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.frankfurter.app/latest?from=INR&to=USD%2CEUR%2CGBP',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(result.rates).toEqual({ USD: 100, EUR: 100, GBP: 125 });
    expect(result.meta).toEqual({
      fetchedAt: '2026-07-19T12:00:00.000Z',
      source: 'frankfurter',
      asOf: '2026-07-17',
      baseCurrency: 'INR',
      refreshed: ['USD', 'EUR', 'GBP'],
      skipped: ['AED'],
    });

    expect(
      mergeOrgFxRatesAfterRefresh({ USD: 83.25, AED: 22.7 }, result.rates),
    ).toEqual({ USD: 100, AED: 22.7, EUR: 100, GBP: 125 });
  });

  it('fails closed when Frankfurter returns an error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      fetchFrankfurterOrgFxRates({ baseCurrency: 'INR', fetchImpl }),
    ).rejects.toThrow(/502/);
  });

  it('marks auto-refresh due when meta missing or stale', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    expect(fxAutoRefreshDue(null, now)).toBe(true);
    expect(fxAutoRefreshDue({ fetchedAt: 'not-a-date' }, now)).toBe(true);
    expect(
      fxAutoRefreshDue({ fetchedAt: '2026-07-10T12:00:00.000Z' }, now),
    ).toBe(true);
    expect(
      fxAutoRefreshDue({ fetchedAt: '2026-07-18T12:00:00.000Z' }, now),
    ).toBe(false);
  });

  it('applies refresh into settingsJson without inventing rates on empty fetch', () => {
    const next = applyFxRefreshToSettingsJson(
      { fxRates: { USD: 83, AED: 22 }, other: true },
      {
        rates: { USD: 90 },
        meta: {
          fetchedAt: '2026-07-20T00:00:00.000Z',
          source: 'frankfurter',
          baseCurrency: 'INR',
          refreshed: ['USD'],
          skipped: ['AED'],
        },
      },
    );
    expect(next.fxRates).toEqual({ USD: 90, AED: 22 });
    expect(next.other).toBe(true);
    expect(parseOrgFxRatesMeta(next)?.refreshed).toEqual(['USD']);
  });

  it('tryRefreshOrgFxForLock returns market or stale without inventing rates', async () => {
    const okFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        base: 'INR',
        date: '2026-07-17',
        rates: { USD: 0.01 },
      }),
    })) as unknown as typeof fetch;
    const market = await tryRefreshOrgFxForLock({
      baseCurrency: 'INR',
      settingsJson: { fxRates: { USD: 83, AED: 22 } },
      fetchImpl: okFetch,
      now: new Date('2026-07-20T12:00:00.000Z'),
    });
    expect(market.status).toBe('market');
    expect(market.settingsJson.fxRates).toMatchObject({ USD: 100, AED: 22 });

    const badFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const stale = await tryRefreshOrgFxForLock({
      baseCurrency: 'INR',
      settingsJson: { fxRates: { USD: 83, AED: 22 } },
      fetchImpl: badFetch,
    });
    expect(stale.status).toBe('stale');
    expect(stale.settingsJson.fxRates).toEqual({ USD: 83, AED: 22 });
  });

  it('reads fxAutoRefreshEnabled (default on)', () => {
    expect(orgFxAutoRefreshEnabled(null)).toBe(true);
    expect(orgFxAutoRefreshEnabled({})).toBe(true);
    expect(orgFxAutoRefreshEnabled({ fxAutoRefreshEnabled: false })).toBe(
      false,
    );
  });
});
