import { describe, expect, it } from 'vitest';
import {
  evaluateHotelMaxStay,
  hotelMaxStayMatchAccepted,
  parseMaxStayNights,
} from './hotel-max-stay';

describe('hotel-max-stay', () => {
  it('parses max stay 1–30', () => {
    expect(parseMaxStayNights(7)).toBe(7);
    expect(parseMaxStayNights('5')).toBe(5);
    expect(parseMaxStayNights(0)).toBeUndefined();
    expect(parseMaxStayNights(99)).toBe(30);
  });

  it('flags long stays', () => {
    const long = evaluateHotelMaxStay({ maxStayNights: 3, nights: 5 });
    expect(long).toEqual({
      maxStayNights: 3,
      nights: 5,
      long: true,
      note: 'Max stay 3 nights — this stay is 5',
    });
    expect(hotelMaxStayMatchAccepted(long!)).toEqual([long!.note]);

    const ok = evaluateHotelMaxStay({ maxStayNights: 4, nights: 4 });
    expect(ok?.long).toBe(false);
    expect(hotelMaxStayMatchAccepted(ok!)).toEqual(['Max stay 4n ok']);
  });

  it('returns null when unset', () => {
    expect(evaluateHotelMaxStay({ nights: 2 })).toBeNull();
  });
});
