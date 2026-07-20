import { describe, expect, it } from 'vitest';
import {
  formatPaymentTermsDueDate,
  parsePaymentTermsDueRule,
} from './paymentTerms';

describe('paymentTerms web re-export', () => {
  it('formats due date for finance prefill', () => {
    expect(formatPaymentTermsDueDate('Net 10', new Date(2026, 6, 20))).toBe(
      '2026-07-30',
    );
    expect(formatPaymentTermsDueDate('COD', new Date(2026, 6, 20))).toBe(
      '2026-07-20',
    );
    expect(
      formatPaymentTermsDueDate(
        'Before travel',
        new Date(2026, 6, 20),
        '2026-10-01',
      ),
    ).toBe('2026-10-01');
    expect(parsePaymentTermsDueRule('Due in 7 days')).toEqual({
      kind: 'offset',
      days: 7,
    });
  });
});
