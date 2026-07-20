import { describe, expect, it } from 'vitest';
import {
  filterHotelByPlaceOfSupply,
  hotelPlaceOfSupplyCompatible,
  hotelPlaceOfSupplyMatchAccepted,
  placeOfSupplyFromOccupancy,
} from './hotel-place-of-supply';

describe('hotel-place-of-supply', () => {
  it('reads and normalizes POS from occupancy JSON', () => {
    expect(
      placeOfSupplyFromOccupancy({ placeOfSupply: 'Karnataka' }),
    ).toBe('KA');
    expect(placeOfSupplyFromOccupancy({ placeOfSupply: '  mh ' })).toBe('MH');
    expect(placeOfSupplyFromOccupancy({})).toBeNull();
  });

  it('treats blank tip as compatible with any destination', () => {
    expect(hotelPlaceOfSupplyCompatible(null, 'KA')).toBe(true);
    expect(hotelPlaceOfSupplyCompatible('KA', 'KA')).toBe(true);
    expect(hotelPlaceOfSupplyCompatible('KA', 'MH')).toBe(false);
    expect(hotelPlaceOfSupplyCompatible('KA', null)).toBe(true);
  });

  it('filters pool preferring exact dest POS then any', () => {
    const pool = [
      { id: 'any', occupancyPricingJson: {} },
      { id: 'ka', occupancyPricingJson: { placeOfSupply: 'KA' } },
      { id: 'mh', occupancyPricingJson: { placeOfSupply: 'MH' } },
    ];
    expect(filterHotelByPlaceOfSupply(pool, 'KA').map((r) => r.id)).toEqual([
      'ka',
    ]);
    expect(filterHotelByPlaceOfSupply(pool, 'TN').map((r) => r.id)).toEqual([
      'any',
    ]);
    expect(filterHotelByPlaceOfSupply(pool, null).map((r) => r.id)).toEqual([
      'any',
      'ka',
      'mh',
    ]);
  });

  it('stamps Match accepted cues', () => {
    expect(hotelPlaceOfSupplyMatchAccepted('KA', 'KA')).toEqual([
      'Place of supply KA matched',
    ]);
    expect(hotelPlaceOfSupplyMatchAccepted(null, 'MH')).toEqual([
      'Any-POS tip for destination MH',
    ]);
  });
});
