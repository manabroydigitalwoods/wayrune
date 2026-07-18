import { describe, expect, it } from 'vitest';
import {
  defaultValidUntilIso,
  formatValidUntilDisplay,
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
});
