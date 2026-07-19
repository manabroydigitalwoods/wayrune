import { describe, expect, it } from 'vitest';
import {
  pickCommercialQuoteSourceForRewrite,
  shouldShiftQuoteDatesOnTripEdit,
  tripStartIso,
} from './trip-date-shift';

describe('tripStartIso', () => {
  it('normalizes Date and string', () => {
    expect(tripStartIso('2026-08-01T12:00:00.000Z')).toBe('2026-08-01');
    expect(tripStartIso(new Date('2026-08-01T00:00:00.000Z'))).toBe('2026-08-01');
    expect(tripStartIso(null)).toBeNull();
    expect(tripStartIso('')).toBeNull();
  });
});

describe('shouldShiftQuoteDatesOnTripEdit', () => {
  it('runs when start changes and shift is on', () => {
    expect(
      shouldShiftQuoteDatesOnTripEdit({
        previousStartIso: '2026-08-01',
        nextStartIso: '2026-09-01',
        shiftQuoteDates: true,
      }),
    ).toBe(true);
  });

  it('skips when opt-out, cleared, or unchanged', () => {
    expect(
      shouldShiftQuoteDatesOnTripEdit({
        previousStartIso: '2026-08-01',
        nextStartIso: '2026-09-01',
        shiftQuoteDates: false,
      }),
    ).toBe(false);
    expect(
      shouldShiftQuoteDatesOnTripEdit({
        previousStartIso: '2026-08-01',
        nextStartIso: null,
        shiftQuoteDates: true,
      }),
    ).toBe(false);
    expect(
      shouldShiftQuoteDatesOnTripEdit({
        previousStartIso: '2026-08-01',
        nextStartIso: '2026-08-01',
        shiftQuoteDates: true,
      }),
    ).toBe(false);
  });
});

describe('pickCommercialQuoteSourceForRewrite', () => {
  it('prefers accepted over approved and sent', () => {
    expect(
      pickCommercialQuoteSourceForRewrite([
        { id: 's', status: 'sent', updatedAt: '2026-07-19T12:00:00.000Z' },
        { id: 'a', status: 'accepted', acceptedAt: '2026-07-10T00:00:00.000Z' },
        { id: 'p', status: 'approved', updatedAt: '2026-07-18T00:00:00.000Z' },
      ]),
    ).toEqual({ id: 'a', status: 'accepted' });
  });

  it('prefers newer sent when no accepted/approved', () => {
    expect(
      pickCommercialQuoteSourceForRewrite([
        { id: 'old', status: 'sent', updatedAt: '2026-07-01T00:00:00.000Z' },
        { id: 'new', status: 'sent', updatedAt: '2026-07-19T00:00:00.000Z' },
      ]),
    ).toEqual({ id: 'new', status: 'sent' });
  });

  it('ignores draft/rejected', () => {
    expect(
      pickCommercialQuoteSourceForRewrite([
        { id: 'd', status: 'draft' },
        { id: 'r', status: 'rejected' },
      ]),
    ).toBeNull();
  });
});
