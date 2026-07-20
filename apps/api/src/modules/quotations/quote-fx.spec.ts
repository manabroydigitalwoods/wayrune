import { describe, expect, it } from 'vitest';
import {
  buildQuoteFxLock,
  convertBuyToQuoteCurrency,
  convertWithQuoteFxLock,
  fxLockCoversQuote,
  parseOrgFxRates,
  parseQuoteFxLock,
  sameCurrencyLock,
} from './quote-fx';

describe('quote-fx', () => {
  it('rejects legacy stub rates', () => {
    expect(parseQuoteFxLock({ INR: 1, USD: 0.012 })).toBeNull();
  });

  it('parses structured lock', () => {
    const lock = parseQuoteFxLock({
      baseCurrency: 'INR',
      quoteCurrency: 'USD',
      rate: 83.25,
      lockedAt: '2026-07-19T00:00:00.000Z',
      source: 'manual',
    });
    expect(lock?.rate).toBe(83.25);
    expect(fxLockCoversQuote(lock, 'USD', 'INR')).toBe(true);
    expect(fxLockCoversQuote(lock, 'EUR', 'INR')).toBe(false);
  });

  it('org fxRates override platform defaults', () => {
    const rates = parseOrgFxRates({ fxRates: { USD: 84.5, EUR: 91 } });
    expect(rates.USD).toBe(84.5);
    expect(rates.EUR).toBe(91);
    expect(rates.AED).toBe(22.7);
    const lock = buildQuoteFxLock({
      baseCurrency: 'INR',
      quoteCurrency: 'USD',
      orgFxRates: rates,
      source: 'org_default',
    });
    expect(lock.rate).toBe(84.5);
    expect(lock.source).toBe('org_default');
  });

  it('converts INR buy into USD quote', () => {
    const lock = buildQuoteFxLock({
      baseCurrency: 'INR',
      quoteCurrency: 'USD',
      rate: 83.25,
    });
    const r = convertWithQuoteFxLock(8325, 'INR', lock);
    expect(r.converted).toBe(true);
    expect(r.amount).toBe(100);
  });

  it('converts EUR chart into USD quote via org rates + lock', () => {
    const rates = parseOrgFxRates({ fxRates: { EUR: 90, USD: 83.25 } });
    const lock = buildQuoteFxLock({
      baseCurrency: 'INR',
      quoteCurrency: 'USD',
      rate: 83.25,
      orgFxRates: rates,
    });
    // 100 EUR → 9000 INR → 9000/83.25 USD
    const r = convertWithQuoteFxLock(100, 'EUR', lock, rates);
    expect(r.converted).toBe(true);
    expect(r.amount).toBe(108.11);
    expect(r.skipped).toBeUndefined();

    const buy = convertBuyToQuoteCurrency(100, 'EUR', lock, 'USD', rates);
    expect(buy.error).toBeUndefined();
    expect(buy.unitCost).toBe(108.11);
  });

  it('fails closed when cross-pair org rate is missing', () => {
    const lock = buildQuoteFxLock({
      baseCurrency: 'INR',
      quoteCurrency: 'USD',
      rate: 83.25,
    });
    const r = convertWithQuoteFxLock(100, 'JPY', lock, { USD: 83.25 });
    expect(r.converted).toBe(false);
    expect(r.skipped).toBe('cross_pair_missing_org_rate');
    expect(
      convertBuyToQuoteCurrency(100, 'JPY', lock, 'USD', { USD: 83.25 }).error,
    ).toBe('cross_pair_missing_org_rate');
  });

  it('blocks buy convert without lock', () => {
    const r = convertBuyToQuoteCurrency(1000, 'INR', null, 'USD');
    expect(r.error).toMatch(/FX lock required/);
  });

  it('same-currency lock is rate 1', () => {
    expect(sameCurrencyLock('INR').rate).toBe(1);
    expect(fxLockCoversQuote(null, 'INR', 'INR')).toBe(true);
  });
});
