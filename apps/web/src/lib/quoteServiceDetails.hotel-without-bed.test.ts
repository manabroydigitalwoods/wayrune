import { describe, expect, it } from 'vitest';
import {
  clampHotelChildrenWithoutBed,
  hotelMatchKeysChanged,
  resolvePayloadFromQuoteDetails,
  validateHotelV1,
} from './quoteServiceDetails';

describe('clampHotelChildrenWithoutBed', () => {
  it('returns undefined when no children', () => {
    expect(clampHotelChildrenWithoutBed(0, 2)).toBeUndefined();
    expect(clampHotelChildrenWithoutBed(undefined, 1)).toBeUndefined();
  });

  it('clamps to children count', () => {
    expect(clampHotelChildrenWithoutBed(2, 5)).toBe(2);
    expect(clampHotelChildrenWithoutBed(3, 1)).toBe(1);
    expect(clampHotelChildrenWithoutBed(2, 0)).toBeUndefined();
  });
});

describe('validateHotelV1 childrenWithoutBed', () => {
  it('errors when without-bed exceeds children', () => {
    const v = validateHotelV1({
      checkIn: '2026-08-01',
      checkOut: '2026-08-03',
      roomType: 'Deluxe',
      mealPlan: 'MAP',
      placeId: 'p1',
      children: 1,
      childAges: [8],
      childrenWithoutBed: 2,
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.toLowerCase().includes('without bed'))).toBe(true);
  });

  it('errors when without-bed set with zero children', () => {
    const v = validateHotelV1({
      checkIn: '2026-08-01',
      checkOut: '2026-08-03',
      roomType: 'Deluxe',
      mealPlan: 'MAP',
      placeId: 'p1',
      children: 0,
      childrenWithoutBed: 1,
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.toLowerCase().includes('without bed'))).toBe(true);
  });

  it('accepts without-bed within children', () => {
    const v = validateHotelV1({
      checkIn: '2026-08-01',
      checkOut: '2026-08-03',
      roomType: 'Deluxe',
      mealPlan: 'MAP',
      placeId: 'p1',
      children: 2,
      childAges: [6, 9],
      childrenWithoutBed: 1,
    });
    expect(v.errors.filter((e) => e.toLowerCase().includes('without bed'))).toEqual([]);
  });
});

describe('hotelMatchKeysChanged occupancy', () => {
  it('marks stale when childrenWithoutBed changes', () => {
    expect(
      hotelMatchKeysChanged(
        { childrenWithoutBed: 0, roomType: 'Deluxe' },
        { childrenWithoutBed: 1 },
      ),
    ).toBe(true);
  });

  it('marks stale when adults or children change', () => {
    expect(hotelMatchKeysChanged({ adults: 2 }, { adults: 3 })).toBe(true);
    expect(hotelMatchKeysChanged({ children: 1 }, { children: 2 })).toBe(true);
  });
});

describe('resolvePayloadFromQuoteDetails hotel occupancy', () => {
  it('forwards childAges and childrenWithoutBed', () => {
    const payload = resolvePayloadFromQuoteDetails(
      'line-1',
      'hotel',
      {
        checkIn: '2026-08-01',
        rooms: 1,
        adults: 2,
        children: 2,
        childAges: [5, 8],
        childrenWithoutBed: 1,
        roomType: 'Deluxe',
        mealPlan: 'MAP',
      },
      null,
    );
    expect(payload?.details.childAges).toEqual([5, 8]);
    expect(payload?.details.childrenWithoutBed).toBe(1);
  });
});
