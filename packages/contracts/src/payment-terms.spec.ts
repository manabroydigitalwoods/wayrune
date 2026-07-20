import { describe, expect, it } from 'vitest';
import {
  dueDateFromPaymentTerms,
  parsePaymentTermsNetDays,
  paymentTermsDueCue,
} from './payment-terms';

describe('payment-terms', () => {
  it('parses Net N and pay on confirm', () => {
    expect(parsePaymentTermsNetDays('Net 15')).toBe(15);
    expect(parsePaymentTermsNetDays('net30')).toBe(30);
    expect(parsePaymentTermsNetDays('Pay on confirm')).toBe(0);
    expect(parsePaymentTermsNetDays('COD')).toBeNull();
  });

  it('computes due dates from terms', () => {
    const from = new Date(2026, 6, 20);
    expect(formatPaymentTermsDueDate('Net 7', from)).toBe('2026-07-27');
    expect(formatPaymentTermsDueDate('Pay on confirm', from)).toBe('2026-07-20');
  });

  it('builds finance cue copy', () => {
    expect(paymentTermsDueCue('Net 15', new Date(2026, 6, 20))).toMatch(
      /Net 15 → due 2026-08-04/,
    );
    expect(paymentTermsDueCue('COD')).toMatch(/not auto-calculated/);
  });
});
