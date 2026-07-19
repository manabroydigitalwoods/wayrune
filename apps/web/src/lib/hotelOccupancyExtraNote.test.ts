import { describe, expect, it } from 'vitest';
import { formatHotelOccupancyExtraNote } from './hotelOccupancyExtraNote';

describe('formatHotelOccupancyExtraNote', () => {
  it('returns null without extras', () => {
    expect(formatHotelOccupancyExtraNote(null)).toBeNull();
    expect(formatHotelOccupancyExtraNote({ occupancyExtraTotal: 0 })).toBeNull();
    expect(formatHotelOccupancyExtraNote({ occupancyExtraTotal: -1 })).toBeNull();
  });

  it('formats amount and party breakdown', () => {
    expect(
      formatHotelOccupancyExtraNote({
        occupancyExtraTotal: 1500,
        extraAdultCount: 1,
      }),
    ).toBe('+₹1,500 · 1 extra adult');

    expect(
      formatHotelOccupancyExtraNote(
        {
          occupancyExtraTotal: 3200,
          extraAdultCount: 2,
          childWithBedCount: 1,
          childWithoutBedCount: 1,
        },
        { formatAmount: (n) => `INR ${n}` },
      ),
    ).toBe('+INR 3200 · 2 extra adults · 1 child w/ bed · 1 child w/o bed');
  });
});
