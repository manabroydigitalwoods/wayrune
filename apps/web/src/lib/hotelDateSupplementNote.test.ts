import { describe, expect, it } from 'vitest';
import { formatHotelDateSupplementNote } from './hotelDateSupplementNote';

describe('formatHotelDateSupplementNote', () => {
  it('returns null without supplements', () => {
    expect(formatHotelDateSupplementNote(null)).toBeNull();
    expect(formatHotelDateSupplementNote({ dateSupplementTotal: 0 })).toBeNull();
  });

  it('formats total and labels', () => {
    expect(
      formatHotelDateSupplementNote({
        dateSupplementTotal: 4500,
        dateSupplements: [
          { night: '2026-12-24', label: 'Christmas Eve', amount: 2500 },
          { night: '2026-12-31', label: 'New Year Eve', amount: 2000 },
        ],
      }),
    ).toBe('+₹4,500 · Christmas Eve, New Year Eve');
  });

  it('falls back to short dates and truncates', () => {
    expect(
      formatHotelDateSupplementNote(
        {
          dateSupplementTotal: 9000,
          dateSupplements: [
            { night: '2026-12-24', amount: 3000 },
            { night: '2026-12-25', amount: 3000 },
            { night: '2026-12-31', amount: 3000 },
          ],
        },
        { formatAmount: (n) => `INR ${n}`, maxLabels: 2 },
      ),
    ).toBe('+INR 9000 · 24 Dec, 25 Dec · +1 more');
  });
});
