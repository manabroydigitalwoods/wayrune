import { describe, expect, it } from 'vitest';
import {
  formatHotelNationalityNote,
  HOTEL_NATIONALITY_OPTIONS,
  effectiveGuestNationalityUi,
  guestNationalitiesFromTripTravellersUi,
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
