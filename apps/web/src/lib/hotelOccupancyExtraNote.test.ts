import { describe, expect, it } from 'vitest';
import {
  formatHotelAdultBandNote,
  formatHotelOccupancyExtraNote,
} from './hotelOccupancyExtraNote';

describe('formatHotelOccupancyExtraNote', () => {
  it('returns null without extras or band', () => {
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

  it('formats SGL/DBL band alone or with extras', () => {
    expect(
      formatHotelAdultBandNote({ adultBandAdults: 1, adultBandUnitCost: 3600 }),
    ).toBe('1A band · ₹3,600/n');
    expect(
      formatHotelOccupancyExtraNote({
        adultBandAdults: 1,
        adultBandUnitCost: 3600,
        occupancyExtraTotal: 0,
      }),
    ).toBe('1A band · ₹3,600/n');
    expect(
      formatHotelOccupancyExtraNote({
        adultBandAdults: 3,
        adultBandUnitCost: 5800,
        occupancyExtraTotal: 1500,
        extraAdultCount: 1,
      }),
    ).toBe('3A band · ₹5,800/n · +₹1,500 · 1 extra adult');
  });
});
