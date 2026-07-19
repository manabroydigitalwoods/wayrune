import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  DEFAULT_QUOTE_VALIDITY_GRACE_HOURS,
  defaultValidUntilDate,
  isQuoteValidUntilExpired,
  isQuoteWithinPostExpiryGrace,
  quoteValidityDaysFromSettings,
  quoteValidityGraceHoursFromSettings,
  quoteValidUntilDaysRemaining,
  shouldAutoExtendQuoteValidity,
  shouldBlockSendPastGrace,
  shouldExtendValidityOnSend,
  syncTermsWithValidUntil,
} from './quote-validity';

describe('quote-validity', () => {
  it('reads org days with fallback and clamps', () => {
    expect(quoteValidityDaysFromSettings(null)).toBe(DEFAULT_QUOTE_VALIDITY_DAYS);
    expect(quoteValidityDaysFromSettings({ defaultQuoteValidityDays: 14 })).toBe(14);
    expect(quoteValidityDaysFromSettings({ defaultQuoteValidityDays: 0 })).toBe(
      DEFAULT_QUOTE_VALIDITY_DAYS,
    );
    expect(quoteValidityDaysFromSettings({ defaultQuoteValidityDays: 400 })).toBe(
      DEFAULT_QUOTE_VALIDITY_DAYS,
    );
  });

  it('reads grace hours with default and clamps', () => {
    expect(quoteValidityGraceHoursFromSettings(null)).toBe(DEFAULT_QUOTE_VALIDITY_GRACE_HOURS);
    expect(quoteValidityGraceHoursFromSettings({})).toBe(DEFAULT_QUOTE_VALIDITY_GRACE_HOURS);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 0 })).toBe(0);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 12 })).toBe(12);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 100 })).toBe(
      DEFAULT_QUOTE_VALIDITY_GRACE_HOURS,
    );
  });

  it('computes validUntil N calendar days ahead', () => {
    const from = new Date(2026, 6, 19); // 19 Jul 2026 local
    const d = defaultValidUntilDate(7, from);
    expect(d.toISOString().slice(0, 10)).toBe('2026-07-26');
  });

  it('syncs Valid until line into terms', () => {
    const until = defaultValidUntilDate(7, new Date(2026, 6, 19));
    const next = syncTermsWithValidUntil('Pay 50% to confirm\nValid for 7 days', until);
    expect(next).toContain('Pay 50% to confirm');
    expect(next).toMatch(/Valid until /);
    expect(next).not.toMatch(/Valid for 7 days/i);
  });

  it('detects expired validUntil vs today', () => {
    const today = new Date(2026, 6, 19);
    expect(isQuoteValidUntilExpired('2026-07-18', today)).toBe(true);
    expect(isQuoteValidUntilExpired('2026-07-19', today)).toBe(false);
    expect(isQuoteValidUntilExpired('2026-07-20', today)).toBe(false);
    expect(isQuoteValidUntilExpired(null, today)).toBe(false);
    expect(isQuoteValidUntilExpired(defaultValidUntilDate(0, today), today)).toBe(false);
  });

  it('near-expiry eligibility only when not expired', () => {
    const today = new Date(2026, 6, 19);
    expect(shouldAutoExtendQuoteValidity('2026-07-18', { today })).toBe(false);
    expect(shouldAutoExtendQuoteValidity('2026-07-19', { today })).toBe(true);
    expect(shouldAutoExtendQuoteValidity('2026-07-21', { today })).toBe(true);
    expect(shouldAutoExtendQuoteValidity('2026-07-22', { today })).toBe(false);
    expect(quoteValidUntilDaysRemaining('2026-07-21', today)).toBe(2);
  });

  it('skips near-expiry eligibility when expired (grace or past grace)', () => {
    const midGrace = new Date(2026, 6, 19, 10, 0, 0);
    expect(
      shouldAutoExtendQuoteValidity('2026-07-18', { today: midGrace, graceHours: 24 }),
    ).toBe(false);
    expect(isQuoteWithinPostExpiryGrace('2026-07-18', 24, midGrace)).toBe(true);
    expect(
      shouldAutoExtendQuoteValidity('2026-07-18', {
        today: new Date(2026, 6, 20, 1, 0, 0),
        graceHours: 24,
      }),
    ).toBe(false);
    expect(
      shouldAutoExtendQuoteValidity('2026-07-18', { today: midGrace, graceHours: 0 }),
    ).toBe(false);
  });

  it('blocks send when expired past grace', () => {
    const midGrace = new Date(2026, 6, 19, 10, 0, 0);
    const pastGrace = new Date(2026, 6, 20, 1, 0, 0);
    expect(shouldBlockSendPastGrace('2026-07-18', 24, midGrace)).toBe(false);
    expect(shouldBlockSendPastGrace('2026-07-18', 24, pastGrace)).toBe(true);
    expect(shouldBlockSendPastGrace('2026-07-18', 0, midGrace)).toBe(true);
    expect(shouldBlockSendPastGrace('2026-07-19', 24, midGrace)).toBe(false);
  });

  it('extend-on-send requires opt-in for grace and near-expiry', () => {
    const midGrace = new Date(2026, 6, 19, 10, 0, 0);
    const today = new Date(2026, 6, 19);
    expect(
      shouldExtendValidityOnSend('2026-07-18', {
        graceHours: 24,
        extendValidity: true,
        today: midGrace,
      }),
    ).toBe(true);
    expect(
      shouldExtendValidityOnSend('2026-07-18', {
        graceHours: 24,
        extendValidity: false,
        today: midGrace,
      }),
    ).toBe(false);
    expect(
      shouldExtendValidityOnSend('2026-07-19', {
        graceHours: 24,
        extendValidity: true,
        today,
      }),
    ).toBe(true);
    expect(
      shouldExtendValidityOnSend('2026-07-19', {
        graceHours: 24,
        extendValidity: false,
        today,
      }),
    ).toBe(false);
    expect(
      shouldExtendValidityOnSend('2026-07-22', {
        graceHours: 24,
        extendValidity: true,
        today,
      }),
    ).toBe(false);
  });
});
