import { describe, expect, it } from 'vitest';
import { formatOrgFxRatesMetaCue, formatOrgFxRefreshToast } from './orgFxRefresh';

describe('orgFxRefresh cues', () => {
  it('formats refresh toast with skipped codes', () => {
    expect(
      formatOrgFxRefreshToast({
        refreshed: ['USD', 'EUR', 'GBP'],
        skipped: ['AED'],
      }),
    ).toBe('Updated USD, EUR, GBP from market · kept prior AED (not in feed)');
    expect(formatOrgFxRefreshToast({ refreshed: [], skipped: ['AED'] })).toBe(
      'No market rates updated · kept prior AED (not in feed)',
    );
  });

  it('formats Settings last-fetched cue', () => {
    expect(
      formatOrgFxRatesMetaCue({
        fetchedAt: '2026-07-19T12:00:00.000Z',
        asOf: '2026-07-17',
        skipped: ['AED'],
      }),
    ).toBe('ECB as of 2026-07-17 · AED not in feed');
    expect(formatOrgFxRatesMetaCue(null)).toBeNull();
  });
});
