import { describe, expect, it } from 'vitest';
import {
  buildProposalAssumptions,
  buildSeededItineraryDays,
  computeInquiryProposalReadiness,
  pickActiveInquiryProposalTrip,
  resolveTripDayCount,
  type InquiryLinkedTrip,
} from './inquiry-proposal-seed';

describe('pickActiveInquiryProposalTrip', () => {
  const trips: InquiryLinkedTrip[] = [
    {
      id: '1',
      tripNumber: 'TRP-1',
      title: 'Old planning',
      status: 'planning',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      tripNumber: 'TRP-2',
      title: 'Quoted',
      status: 'quoted',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: '3',
      tripNumber: 'TRP-3',
      title: 'Awaiting',
      status: 'awaiting_approval',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
  ];

  it('picks awaiting_approval over quoted over planning', () => {
    expect(pickActiveInquiryProposalTrip(trips)?.id).toBe('3');
  });
});

describe('computeInquiryProposalReadiness', () => {
  it('is draftable with destination, adults, travel type', () => {
    const r = computeInquiryProposalReadiness({
      destinations: [{ name: 'Darjeeling' }],
      adults: 2,
      travelType: 'leisure',
    });
    expect(r.draftable).toBe(true);
    expect(r.itinerarySeedable).toBe(false);
    expect(r.itineraryGaps).toContain('startDate');
  });

  it('is itinerary seedable with start + nights', () => {
    const r = computeInquiryProposalReadiness({
      destinations: [{ name: 'Darjeeling' }],
      adults: 2,
      travelType: 'leisure',
      startDate: '2026-09-05',
      nights: 3,
    });
    expect(r.itinerarySeedable).toBe(true);
  });
});

describe('resolveTripDayCount', () => {
  it('maps 3 nights to 4 days', () => {
    expect(
      resolveTripDayCount({ startDate: '2026-09-05', nights: 3 }),
    ).toEqual({
      dayCount: 4,
      nightsUsed: 3,
      dateConflict: false,
      sameDay: false,
    });
  });

  it('same-day start===end → 1 day', () => {
    expect(
      resolveTripDayCount({
        startDate: '2026-09-05',
        endDate: '2026-09-05',
      }),
    ).toMatchObject({ dayCount: 1, sameDay: true });
  });

  it('prefers nights when conflicting with end', () => {
    const r = resolveTripDayCount({
      startDate: '2026-09-05',
      endDate: '2026-09-10',
      nights: 3,
    });
    expect(r?.dayCount).toBe(4);
    expect(r?.dateConflict).toBe(true);
  });
});

describe('buildSeededItineraryDays', () => {
  it('builds arrival/experience/departure for single dest', () => {
    const days = buildSeededItineraryDays({
      dayCount: 4,
      startYmd: '2026-09-05',
      destinationNames: ['Darjeeling'],
      multiStop: false,
    });
    expect(days).toHaveLength(4);
    expect(days[0]!.title).toContain('Arrival');
    expect(days[3]!.title).toContain('Departure');
    expect(days[0]!.date).toBe('2026-09-05');
    expect(days[3]!.date).toBe('2026-09-08');
  });
});

describe('buildProposalAssumptions', () => {
  it('marks inferred room and default hotel as needing confirmation', () => {
    const a = buildProposalAssumptions({ adults: 2 });
    expect(a.find((x) => x.key === 'hotel_category')?.requiresConfirmation).toBe(true);
    expect(a.find((x) => x.key === 'room_configuration')?.value).toBe('1 double room');
  });
});
