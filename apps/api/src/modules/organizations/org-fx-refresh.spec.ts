import { describe, expect, it, vi } from 'vitest';
import {
  fetchFrankfurterOrgFxRates,
  invertFrankfurterRates,
  mergeOrgFxRatesAfterRefresh,
  planOrgFxRefresh,
  roundOrgFxRate,
} from './org-fx-refresh';

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
});
