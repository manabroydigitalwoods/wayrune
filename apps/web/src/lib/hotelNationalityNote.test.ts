import { describe, expect, it } from 'vitest';
import {
  formatHotelNationalityNote,
  HOTEL_NATIONALITY_OPTIONS,
  effectiveGuestNationalityUi,
  guestNationalitiesFromTripTravellersUi,
  tripTravellerDisplayName,
  withAloneGuestNationality,
  withAloneTripTraveller,
  withGuestNationalities,
  normalizeHotelNationalityUi,
} from './hotelNationalityNote';

describe('hotelNationalityNote', () => {
  it('preserves ISO-2 (does not collapse to INTL)', () => {
    expect(normalizeHotelNationalityUi('in')).toBe('IN');
    expect(normalizeHotelNationalityUi('US')).toBe('US');
    expect(normalizeHotelNationalityUi('gb')).toBe('GB');
    expect(normalizeHotelNationalityUi('')).toBe('');
  });

  it('exposes full ISO-3166 catalog in picker options', () => {
    expect(HOTEL_NATIONALITY_OPTIONS.length).toBeGreaterThan(240);
    expect(HOTEL_NATIONALITY_OPTIONS.some((o) => o.value === 'JP')).toBe(true);
    expect(HOTEL_NATIONALITY_OPTIONS.some((o) => o.value === 'INTL')).toBe(true);
  });

  it('collapses mixed guests for Match cue', () => {
    expect(effectiveGuestNationalityUi(['IN', 'US'])).toBe('INTL');
    expect(withGuestNationalities(['IN', 'US'])).toEqual({
      nationality: 'INTL',
      nationalities: ['IN', 'US'],
    });
    expect(
      formatHotelNationalityNote({
        nationality: 'INTL',
        guestNationality: 'INTL',
        guestNationalities: ['IN', 'US'],
        guestNationalityMixed: true,
      }),
    ).toMatch(/mixed/);
  });

  it('derives guest codes from trip travellers', () => {
    expect(
      guestNationalitiesFromTripTravellersUi([
        { isLead: true, traveller: { nationality: 'IN' } },
      ]),
    ).toEqual({ nationality: 'IN', nationalities: undefined });
    expect(
      guestNationalitiesFromTripTravellersUi([
        { isLead: true, traveller: { nationality: 'IN' } },
        { isLead: false, traveller: { nationality: 'US' } },
      ]),
    ).toEqual({ nationality: 'INTL', nationalities: ['IN', 'US'] });
    expect(
      guestNationalitiesFromTripTravellersUi([
        { isLead: true, traveller: { nationality: 'IN' } },
        { isLead: false, traveller: { nationality: 'US' } },
        { isLead: false, traveller: { nationality: 'US' } },
      ]),
    ).toEqual({ nationality: 'INTL', nationalities: ['IN', 'US', 'US'] });
  });

  it('reorders alone market to the end', () => {
    expect(withAloneGuestNationality(['IN', 'US'], 'IN')).toEqual({
      nationality: 'INTL',
      nationalities: ['US', 'IN'],
    });
    expect(withAloneGuestNationality(['IN', 'US', 'US'], 'IN')).toEqual({
      nationality: 'INTL',
      nationalities: ['US', 'US', 'IN'],
    });
  });

  it('pins named traveller as alone SGL', () => {
    const travellers = [
      {
        id: 'tt1',
        nationality: 'IN',
        traveller: { fullName: 'Asha', nationality: 'IN' },
      },
      {
        id: 'tt2',
        nationality: 'US',
        traveller: { fullName: 'Sam', nationality: 'US' },
      },
    ];
    expect(
      withAloneTripTraveller(['IN', 'US'], travellers, 'tt1'),
    ).toEqual({
      nationality: 'INTL',
      nationalities: ['US', 'IN'],
      aloneTravellerId: 'tt1',
    });
    expect(tripTravellerDisplayName(travellers[0])).toBe('Asha');
  });

  it('formats exact and INTL fallback cues', () => {
    expect(
      formatHotelNationalityNote({ nationality: 'IN', guestNationality: 'IN' }),
    ).toMatch(/Indian/);
    expect(
      formatHotelNationalityNote({ nationality: 'US', guestNationality: 'US' }),
    ).toMatch(/United States/);
    expect(
      formatHotelNationalityNote({
        nationality: 'INTL',
        guestNationality: 'US',
      }),
    ).toMatch(/INTL/);
  });
});
