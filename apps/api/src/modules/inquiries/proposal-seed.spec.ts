import { describe, expect, it } from 'vitest';
import {
  buildInquirySourceSnapshot,
  readinessFromInquiry,
} from './proposal-seed';
import {
  buildSeededItineraryDays,
  resolveTripDayCount,
} from '@wayrune/contracts';

describe('proposal-seed helpers', () => {
  const baseInquiry = {
    id: 'inq1',
    inquiryNumber: 'INQ-00001',
    travelType: 'leisure',
    domesticOrIntl: 'domestic',
    origin: null,
    originPlaceId: null,
    originJson: null,
    destinationsJson: [{ name: 'Darjeeling' }],
    stopsJson: [],
    startDate: new Date('2026-09-05T00:00:00.000Z'),
    endDate: new Date('2026-09-08T00:00:00.000Z'),
    nights: 3,
    adults: 2,
    children: 0,
    infants: 0,
    budgetAmount: 50000,
    budgetCurrency: 'INR',
    hotelCategory: null,
    meals: null,
    transportPref: null,
    flightsRequired: false,
    roomRequirements: null,
    dateFlexible: false,
    interestsJson: null,
    specialRequirements: null,
  };

  it('marks draftable inquiries without dates', () => {
    const r = readinessFromInquiry({
      ...baseInquiry,
      startDate: null,
      endDate: null,
      nights: null,
      budgetAmount: null,
    });
    expect(r.draftable).toBe(true);
    expect(r.itinerarySeedable).toBe(false);
  });

  it('snapshots inquiry without mutating later', () => {
    const snap = buildInquirySourceSnapshot(baseInquiry);
    expect(snap.inquiryNumber).toBe('INQ-00001');
    expect(snap.budgetAmount).toBe(50000);
    expect(snap.adults).toBe(2);
  });

  it('snapshots origin from canonical originJson', () => {
    const snap = buildInquirySourceSnapshot({
      ...baseInquiry,
      originJson: { placeId: 'p-blr', name: 'Bengaluru', kind: 'city' },
      origin: 'ShouldNotWin',
      originPlaceId: 'other',
    });
    expect(snap.origin).toEqual({
      placeId: 'p-blr',
      name: 'Bengaluru',
      kind: 'city',
    });
  });

  it('snapshots origin from legacy dual columns when originJson empty', () => {
    const snap = buildInquirySourceSnapshot({
      ...baseInquiry,
      originJson: null,
      origin: 'Chennai',
      originPlaceId: 'p-maa',
    });
    expect(snap.origin).toEqual({ placeId: 'p-maa', name: 'Chennai' });
  });

  it('resolves 3 nights to 4 days with conflict flag', () => {
    const r = resolveTripDayCount({
      startDate: '2026-09-05',
      endDate: '2026-09-10',
      nights: 3,
    });
    expect(r?.dayCount).toBe(4);
    expect(r?.dateConflict).toBe(true);
    const days = buildSeededItineraryDays({
      dayCount: r!.dayCount,
      startYmd: '2026-09-05',
      destinations: [{ placeId: 'p-darj', name: 'Darjeeling', kind: 'city' }],
      multiStop: false,
    });
    expect(days).toHaveLength(4);
    expect(days[0]?.destinationRef).toEqual({
      placeId: 'p-darj',
      name: 'Darjeeling',
      kind: 'city',
    });
    expect(days.every((d) => d.destinationRef?.placeId === 'p-darj')).toBe(true);
  });
});
