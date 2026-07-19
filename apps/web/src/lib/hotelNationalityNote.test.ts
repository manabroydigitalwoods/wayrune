import { describe, expect, it } from 'vitest';
import {
  formatHotelNationalityNote,
  HOTEL_NATIONALITY_OPTIONS,
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
