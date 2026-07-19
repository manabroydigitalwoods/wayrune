import { describe, expect, it } from 'vitest';
import {
  addUtcDaysIso,
  rescheduleBookingDates,
  utcDayDelta,
} from './movementReschedule';

describe('movementReschedule', () => {
  it('computes UTC day delta', () => {
    expect(utcDayDelta('2026-04-10', '2026-04-12')).toBe(2);
    expect(utcDayDelta('2026-04-12', '2026-04-10')).toBe(-2);
  });

  it('adds UTC days', () => {
    expect(addUtcDaysIso('2026-04-10', 3)).toBe('2026-04-13');
  });

  it('shifts hotel checkout with stay length', () => {
    expect(
      rescheduleBookingDates({
        movementAt: '2026-04-10',
        endAt: '2026-04-12',
        targetDay: '2026-04-15',
      }),
    ).toEqual({ startAt: '2026-04-15', endAt: '2026-04-17' });
  });

  it('returns null when same day', () => {
    expect(
      rescheduleBookingDates({
        movementAt: '2026-04-10',
        targetDay: '2026-04-10',
      }),
    ).toBeNull();
  });
});
