import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUOTE_VALIDITY_GRACE_HOURS,
  defaultValidUntilIso,
  formatValiditySendToastSuffix,
  formatValidUntilDisplay,
  isQuoteValidUntilExpired,
  isQuoteValidUntilNearExpiry,
  isQuoteWithinPostExpiryGrace,
  quoteExpiredGraceCue,
  quoteNearExpiryToastMessage,
  quotePastGraceBlockCue,
  quoteValidityGraceHoursFromSettings,
  quoteValidUntilDaysRemaining,
  shouldBlockSendPastGrace,
  syncTermsWithValidUntil,
} from './quoteValidity';

describe('quoteValidity', () => {
  it('computes local YYYY-MM-DD validity', () => {
    expect(defaultValidUntilIso(7, new Date(2026, 6, 18))).toBe('2026-07-25');
  });

  it('replaces free-text validity with structured date', () => {
    const next = syncTermsWithValidUntil('Pay 50% to confirm\nValid for 7 days', '2026-07-25');
    expect(next).toContain('Pay 50% to confirm');
    expect(next).not.toMatch(/Valid for 7 days/i);
    expect(next).toContain(`Valid until ${formatValidUntilDisplay('2026-07-25')}`);
  });

  it('clears validity line when date removed', () => {
    expect(syncTermsWithValidUntil('Valid until 25 July 2026\nPay 50%', '')).toBe('Pay 50%');
  });

  it('detects expired validUntil vs today', () => {
    const today = new Date(2026, 6, 19);
    expect(isQuoteValidUntilExpired('2026-07-18', today)).toBe(true);
    expect(isQuoteValidUntilExpired('2026-07-19', today)).toBe(false);
    expect(isQuoteValidUntilExpired('', today)).toBe(false);
  });

  it('counts days remaining and near-expiry', () => {
    const today = new Date(2026, 6, 19);
    expect(quoteValidUntilDaysRemaining('2026-07-18', today)).toBeNull();
    expect(quoteValidUntilDaysRemaining('2026-07-19', today)).toBe(0);
    expect(quoteValidUntilDaysRemaining('2026-07-20', today)).toBe(1);
    expect(quoteValidUntilDaysRemaining('2026-07-21', today)).toBe(2);
    expect(quoteValidUntilDaysRemaining('2026-07-22', today)).toBe(3);

    expect(isQuoteValidUntilNearExpiry('2026-07-21', { today, withinDays: 2 })).toBe(true);
    expect(isQuoteValidUntilNearExpiry('2026-07-22', { today, withinDays: 2 })).toBe(false);
    expect(isQuoteValidUntilNearExpiry('2026-07-18', { today })).toBe(false);

    expect(quoteNearExpiryToastMessage('2026-07-19', today)).toMatch(/expires today/);
    expect(quoteNearExpiryToastMessage('2026-07-19', today)).toMatch(/Extend on send/);
    expect(quoteNearExpiryToastMessage('2026-07-20', today)).toMatch(/1 day/);
    expect(quoteNearExpiryToastMessage('2026-07-22', today)).toBeNull();
  });

  it('reads grace hours with default and clamps', () => {
    expect(quoteValidityGraceHoursFromSettings(null)).toBe(DEFAULT_QUOTE_VALIDITY_GRACE_HOURS);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 12 })).toBe(12);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 0 })).toBe(0);
    expect(quoteValidityGraceHoursFromSettings({ quoteValidityGraceHours: 99 })).toBe(
      DEFAULT_QUOTE_VALIDITY_GRACE_HOURS,
    );
  });

  it('detects post-expiry grace window', () => {
    const midGrace = new Date(2026, 6, 19, 10, 0, 0);
    const pastGrace = new Date(2026, 6, 20, 1, 0, 0);
    expect(isQuoteWithinPostExpiryGrace('2026-07-18', 24, midGrace)).toBe(true);
    expect(isQuoteWithinPostExpiryGrace('2026-07-18', 24, pastGrace)).toBe(false);
    expect(isQuoteWithinPostExpiryGrace('2026-07-18', 0, midGrace)).toBe(false);
    expect(isQuoteWithinPostExpiryGrace('2026-07-19', 24, midGrace)).toBe(false);
    expect(quoteExpiredGraceCue('2026-07-18', { quoteValidityGraceHours: 24 }, midGrace)).toMatch(
      /grace 24h/,
    );
    expect(shouldBlockSendPastGrace('2026-07-18', 24, pastGrace)).toBe(true);
    expect(shouldBlockSendPastGrace('2026-07-18', 24, midGrace)).toBe(false);
    expect(
      quotePastGraceBlockCue('2026-07-18', { quoteValidityGraceHours: 24 }, pastGrace),
    ).toMatch(/reset validity/);
  });

  it('formats send toast suffix for extend vs grace', () => {
    expect(formatValiditySendToastSuffix({ validityExtendedTo: '2026-07-26' })).toMatch(
      /extended to 2026-07-26/,
    );
    expect(formatValiditySendToastSuffix({ validityGraceUsed: true })).toMatch(/unchanged/);
    expect(formatValiditySendToastSuffix({})).toBe('');
  });
});
