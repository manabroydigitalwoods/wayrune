import { describe, expect, it } from 'vitest';
import {
  CreateTripSchema,
  UpdateTripDatesSchema,
  tripTravelEndOnOrAfterStart,
} from '@wayrune/contracts';

describe('tripTravelEndOnOrAfterStart', () => {
  it('allows missing either side', () => {
    expect(tripTravelEndOnOrAfterStart(undefined, undefined)).toBe(true);
    expect(tripTravelEndOnOrAfterStart('2026-08-01', undefined)).toBe(true);
    expect(tripTravelEndOnOrAfterStart(undefined, '2026-08-05')).toBe(true);
    expect(tripTravelEndOnOrAfterStart('', '2026-08-05')).toBe(true);
  });

  it('requires end on or after start when both set', () => {
    expect(tripTravelEndOnOrAfterStart('2026-08-01', '2026-08-01')).toBe(true);
    expect(tripTravelEndOnOrAfterStart('2026-08-01', '2026-08-05')).toBe(true);
    expect(tripTravelEndOnOrAfterStart('2026-08-05', '2026-08-01')).toBe(false);
  });
});

describe('CreateTripSchema travel dates', () => {
  it('accepts create with optional dates', () => {
    const ok = CreateTripSchema.safeParse({
      title: 'Goa FIT',
      startDate: '2026-12-10',
      endDate: '2026-12-14',
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.startDate).toBe('2026-12-10');
      expect(ok.data.endDate).toBe('2026-12-14');
    }
  });

  it('accepts undated create', () => {
    expect(CreateTripSchema.safeParse({ title: 'TBD' }).success).toBe(true);
  });

  it('rejects end before start', () => {
    const bad = CreateTripSchema.safeParse({
      title: 'Goa FIT',
      startDate: '2026-12-14',
      endDate: '2026-12-10',
    });
    expect(bad.success).toBe(false);
  });
});

describe('UpdateTripDatesSchema', () => {
  it('accepts patch with both dates', () => {
    const ok = UpdateTripDatesSchema.safeParse({
      startDate: '2026-12-10',
      endDate: '2026-12-14',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.shiftQuoteDates).toBe(true);
  });

  it('accepts clearing dates', () => {
    const ok = UpdateTripDatesSchema.safeParse({
      startDate: null,
      endDate: null,
    });
    expect(ok.success).toBe(true);
  });

  it('accepts opting out of quote date shift', () => {
    const ok = UpdateTripDatesSchema.safeParse({
      startDate: '2026-12-10',
      endDate: '2026-12-14',
      shiftQuoteDates: false,
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.shiftQuoteDates).toBe(false);
  });

  it('rejects end before start', () => {
    const bad = UpdateTripDatesSchema.safeParse({
      startDate: '2026-12-14',
      endDate: '2026-12-10',
    });
    expect(bad.success).toBe(false);
  });
});
