import { describe, expect, it } from 'vitest';
import { formatPaymentTermsDueDate } from './paymentTerms';

describe('paymentTerms web re-export', () => {
  it('formats due date for finance prefill', () => {
    expect(formatPaymentTermsDueDate('Net 10', new Date(2026, 6, 20))).toBe(
      '2026-07-30',
    );
  });
});
