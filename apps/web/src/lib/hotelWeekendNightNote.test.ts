import { describe, expect, it } from 'vitest';
import { formatHotelWeekendNightNote } from './hotelWeekendNightNote';

describe('formatHotelWeekendNightNote', () => {
  it('returns null without weekend nights or unit', () => {
    expect(formatHotelWeekendNightNote(null)).toBeNull();
    expect(
      formatHotelWeekendNightNote({ weekendNights: 0, weekendUnit: 4500 }),
    ).toBeNull();
    expect(
      formatHotelWeekendNightNote({ weekendNights: 2, weekendUnit: null }),
    ).toBeNull();
  });

  it('formats nights and weekend unit', () => {
    expect(
      formatHotelWeekendNightNote({
        weekendNights: 1,
        weekendUnit: 4500,
      }),
    ).toBe('1 weekend night · weekend ₹4,500');

    expect(
      formatHotelWeekendNightNote(
        {
          weekendNights: 2,
          weekendUnit: 5200,
          rooms: 2,
        },
        { formatAmount: (n) => `INR ${n}` },
      ),
    ).toBe('2 weekend nights · weekend INR 5200 · 2 rooms');
  });
});
