import { describe, expect, it } from 'vitest';
import {
  collectGuestNationalityBag,
  collectGuestNationalityCodes,
  effectiveGuestNationality,
  filterHotelByNationality,
  guestNationalitiesAreMixed,
  guestNationalitiesFromTripTravellers,
  hotelNationalityCompatible,
  hotelNationalityLabel,
  hotelNationalityMatchAccepted,
  hotelNationalityMarket,
  normalizeHotelNationality,
  orderBagWithAloneLast,
  resolveNationalityOptsFromTripTravellers,
} from './hotel-nationality';

describe('hotel-nationality', () => {
  it('normalizes IN / INTL / preserves ISO-2', () => {
    expect(normalizeHotelNationality('in')).toBe('IN');
    expect(normalizeHotelNationality('domestic')).toBe('IN');
    expect(normalizeHotelNationality('INTL')).toBe('INTL');
    expect(normalizeHotelNationality('US')).toBe('US');
    expect(normalizeHotelNationality('gb')).toBe('GB');
    expect(normalizeHotelNationality('')).toBeNull();
  });

  it('maps ISO to foreign market bucket', () => {
    expect(hotelNationalityMarket('US')).toBe('INTL');
    expect(hotelNationalityMarket('IN')).toBe('IN');
    expect(hotelNationalityMarket(null)).toBeNull();
  });

  it('labels markets and ISO tips', () => {
    expect(hotelNationalityLabel('IN')).toMatch(/Indian/);
    expect(hotelNationalityLabel('INTL')).toMatch(/Foreign/);
    expect(hotelNationalityLabel('US')).toMatch(/United States/);
    expect(hotelNationalityLabel('JP')).toMatch(/Japan/);
    expect(hotelNationalityLabel(null)).toMatch(/Any/);
  });

  it('collapses multi-guest nationalities for Match', () => {
    expect(effectiveGuestNationality(['IN', 'IN'])).toBe('IN');
    expect(effectiveGuestNationality(['US'])).toBe('US');
    expect(effectiveGuestNationality(['IN', 'US'])).toBe('INTL');
    expect(effectiveGuestNationality(['US', 'GB'])).toBe('INTL');
    expect(effectiveGuestNationality(['INTL', 'US'])).toBe('INTL');
    expect(effectiveGuestNationality([])).toBeNull();
    expect(
      collectGuestNationalityCodes({
        nationality: 'US',
        nationalities: ['IN', 'us'],
      }),
    ).toEqual(['IN', 'US']);
    expect(guestNationalitiesAreMixed(['IN', 'US'])).toBe(true);
    expect(guestNationalitiesAreMixed(['US'])).toBe(false);
  });

  it('keeps bag duplicates and alone-last order', () => {
    expect(
      collectGuestNationalityBag({ nationalities: ['IN', 'US', 'US'] }),
    ).toEqual(['IN', 'US', 'US']);
    expect(orderBagWithAloneLast(['IN', 'US', 'US'], 'IN')).toEqual([
      'US',
      'US',
      'IN',
    ]);
  });

  it('derives Match codes from trip travellers (lead + mixed)', () => {
    expect(
      guestNationalitiesFromTripTravellers([
        { isLead: true, traveller: { nationality: 'IN' } },
        { isLead: false, traveller: { nationality: null } },
      ]),
    ).toEqual({ nationality: 'IN', nationalities: ['IN'] });
    expect(
      guestNationalitiesFromTripTravellers([
        { isLead: true, traveller: { nationality: 'IN' } },
        { isLead: false, traveller: { nationality: 'US' } },
      ]).nationalities,
    ).toEqual(['IN', 'US']);
    expect(
      guestNationalitiesFromTripTravellers([
        { isLead: true, traveller: { nationality: 'IN' } },
        { isLead: false, traveller: { nationality: 'US' } },
        { isLead: false, traveller: { nationality: 'US' } },
      ]).nationalities,
    ).toEqual(['IN', 'US', 'US']);
    expect(
      resolveNationalityOptsFromTripTravellers([
        { isLead: true, traveller: { nationality: 'GB' } },
      ]),
    ).toEqual({ nationality: 'GB' });
  });

  it('compatibility: exact, INTL catch-all, not cross-ISO', () => {
    expect(hotelNationalityCompatible(null, 'US')).toBe(true);
    expect(hotelNationalityCompatible('IN', 'IN')).toBe(true);
    expect(hotelNationalityCompatible('IN', 'US')).toBe(false);
    expect(hotelNationalityCompatible('INTL', 'US')).toBe(true);
    expect(hotelNationalityCompatible('INTL', 'IN')).toBe(false);
    expect(hotelNationalityCompatible('US', 'US')).toBe(true);
    expect(hotelNationalityCompatible('US', 'GB')).toBe(false);
    expect(hotelNationalityCompatible('US', 'INTL')).toBe(false);
  });

  it('filters pool preferring exact ISO then INTL then any', () => {
    const pool = [
      { id: 'any', occupancyPricingJson: {} },
      { id: 'in', occupancyPricingJson: { nationality: 'IN' } },
      { id: 'intl', occupancyPricingJson: { nationality: 'INTL' } },
      { id: 'us', occupancyPricingJson: { nationality: 'US' } },
    ];
    expect(filterHotelByNationality(pool, 'IN').map((r) => r.id)).toEqual([
      'in',
    ]);
    expect(filterHotelByNationality(pool, 'US').map((r) => r.id)).toEqual([
      'us',
    ]);
    expect(
      filterHotelByNationality(
        [pool[0]!, pool[2]!],
        'US',
      ).map((r) => r.id),
    ).toEqual(['intl']);
    expect(
      filterHotelByNationality([pool[0]!], 'GB').map((r) => r.id),
    ).toEqual(['any']);
    // Mixed guests → effective INTL prefers INTL card
    expect(
      filterHotelByNationality(
        pool,
        effectiveGuestNationality(['IN', 'US']),
      ).map((r) => r.id),
    ).toEqual(['intl']);
  });

  it('match accepted lines', () => {
    expect(hotelNationalityMatchAccepted('IN', 'IN')).toEqual([
      'Nationality IN matched',
    ]);
    expect(hotelNationalityMatchAccepted('US', 'US')).toEqual([
      'Nationality US matched',
    ]);
    expect(hotelNationalityMatchAccepted('INTL', 'US')[0]).toMatch(/INTL/);
    expect(hotelNationalityMatchAccepted(null, 'IN')[0]).toMatch(
      /Any-nationality/,
    );
    expect(
      hotelNationalityMatchAccepted('INTL', 'INTL', {
        guestNationalities: ['IN', 'US'],
        mixed: true,
      })[0],
    ).toMatch(/mixed/);
  });
});
