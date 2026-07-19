import { describe, expect, it } from 'vitest';
import {
  evaluateHotelMinStay,
  hotelMinStayMatchAccepted,
  parseMinStayNights,
} from './hotel-min-stay';

describe('hotel-min-stay', () => {
  it('parses min stay 1–30', () => {
    expect(parseMinStayNights(3)).toBe(3);
    expect(parseMinStayNights('2')).toBe(2);
    expect(parseMinStayNights(0)).toBeUndefined();
    expect(parseMinStayNights(99)).toBe(30);
  });

  it('flags short stays', () => {
    const short = evaluateHotelMinStay({ minStayNights: 3, nights: 2 });
    expect(short).toEqual({
      minStayNights: 3,
      nights: 2,
      short: true,
      note: 'Min stay 3 nights — this stay is 2',
    });
    expect(hotelMinStayMatchAccepted(short!)).toEqual([short!.note]);

    const ok = evaluateHotelMinStay({ minStayNights: 2, nights: 2 });
    expect(ok?.short).toBe(false);
    expect(hotelMinStayMatchAccepted(ok!)).toEqual(['Min stay 2n met']);
  });

  it('returns null when unset', () => {
    expect(evaluateHotelMinStay({ nights: 2 })).toBeNull();
  });
});
