import { describe, expect, it } from 'vitest';
import {
  endDateFromStartAndNights,
  nightsFromStartAndEnd,
  patchTravelDates,
} from './inquiryTravelDates';

describe('inquiryTravelDates', () => {
  it('derives end from start + nights', () => {
    expect(endDateFromStartAndNights('2026-09-05', 3)).toBe('2026-09-08');
  });

  it('derives nights from start and end', () => {
    expect(nightsFromStartAndEnd('2026-09-05', '2026-09-08')).toBe(3);
  });

  it('patches nights and updates end', () => {
    expect(
      patchTravelDates({
        startDate: '2026-09-05',
        nights: 2,
        endDate: '2026-09-07',
        change: 'nights',
        nextNights: 5,
      }),
    ).toEqual({ startDate: '2026-09-05', nights: 5, endDate: '2026-09-10' });
  });

  it('patches end and updates nights', () => {
    expect(
      patchTravelDates({
        startDate: '2026-09-05',
        nights: 3,
        endDate: '2026-09-08',
        change: 'end',
        nextEnd: '2026-09-12',
      }),
    ).toEqual({ startDate: '2026-09-05', nights: 7, endDate: '2026-09-12' });
  });
});
