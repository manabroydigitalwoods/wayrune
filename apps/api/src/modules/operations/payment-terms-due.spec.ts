import { describe, expect, it } from 'vitest';
import { formatPaymentTermsDueDate } from '@wayrune/contracts';

describe('customer payment terms auto due', () => {
  it('stamps Net N, COD, and trip-relative due dates', () => {
    expect(formatPaymentTermsDueDate('Net 15', new Date(2026, 6, 1))).toBe(
      '2026-07-16',
    );
    expect(formatPaymentTermsDueDate('Pay on confirm', new Date(2026, 6, 1))).toBe(
      '2026-07-01',
    );
    expect(formatPaymentTermsDueDate('COD', new Date(2026, 6, 1))).toBe(
      '2026-07-01',
    );
    expect(
      formatPaymentTermsDueDate(
        'Before travel',
        new Date(2026, 6, 1),
        '2026-10-01',
      ),
    ).toBe('2026-10-01');
    expect(
      formatPaymentTermsDueDate('Custom retainer', new Date(2026, 6, 1)),
    ).toBeNull();
  });
});
