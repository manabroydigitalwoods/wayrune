import { describe, expect, it } from 'vitest';
import {
  dueDateFromPaymentTerms,
  formatPaymentTermsDueDate,
  parsePaymentTermsDueRule,
  parsePaymentTermsNetDays,
  paymentTermsDueCue,
} from './payment-terms';

describe('payment-terms', () => {
  it('parses Net N and pay on confirm', () => {
    expect(parsePaymentTermsNetDays('Net 15')).toBe(15);
    expect(parsePaymentTermsNetDays('net30')).toBe(30);
    expect(parsePaymentTermsNetDays('Pay on confirm')).toBe(0);
  });

  it('parses non-Net offset and trip-relative terms', () => {
    expect(parsePaymentTermsDueRule('COD')).toEqual({ kind: 'offset', days: 0 });
    expect(parsePaymentTermsDueRule('Cash on delivery')).toEqual({
      kind: 'offset',
      days: 0,
    });
    expect(parsePaymentTermsDueRule('Due immediately')).toEqual({
      kind: 'offset',
      days: 0,
    });
    expect(parsePaymentTermsDueRule('Due in 10 days')).toEqual({
      kind: 'offset',
      days: 10,
    });
    expect(parsePaymentTermsDueRule('Within 7 days')).toEqual({
      kind: 'offset',
      days: 7,
    });
    expect(parsePaymentTermsDueRule('14 days')).toEqual({
      kind: 'offset',
      days: 14,
    });
    expect(parsePaymentTermsDueRule('Before travel')).toEqual({
      kind: 'trip_start',
    });
    expect(parsePaymentTermsDueRule('Due on arrival')).toEqual({
      kind: 'trip_start',
    });
    expect(parsePaymentTermsDueRule('Custom retainer')).toBeNull();
  });

  it('computes due dates from terms', () => {
    const from = new Date(2026, 6, 20);
    expect(formatPaymentTermsDueDate('Net 7', from)).toBe('2026-07-27');
    expect(formatPaymentTermsDueDate('Pay on confirm', from)).toBe('2026-07-20');
    expect(formatPaymentTermsDueDate('COD', from)).toBe('2026-07-20');
    expect(formatPaymentTermsDueDate('Due in 5 days', from)).toBe('2026-07-25');
    expect(formatPaymentTermsDueDate('Before travel', from)).toBeNull();
    expect(
      formatPaymentTermsDueDate('Before travel', from, '2026-10-01'),
    ).toBe('2026-10-01');
    expect(
      dueDateFromPaymentTerms('On arrival', from, '2026-10-01')?.getDate(),
    ).toBe(1);
  });

  it('builds finance cue copy', () => {
    expect(paymentTermsDueCue('Net 15', new Date(2026, 6, 20))).toMatch(
      /Net 15 → due 2026-08-04/,
    );
    expect(paymentTermsDueCue('COD')).toMatch(/due today/);
    expect(paymentTermsDueCue('Before travel')).toMatch(/set travel dates/);
    expect(
      paymentTermsDueCue('Before travel', new Date(2026, 6, 20), '2026-10-01'),
    ).toMatch(/due 2026-10-01 \(travel start\)/);
    expect(paymentTermsDueCue('Custom retainer')).toMatch(
      /not auto-calculated/,
    );
  });
});
