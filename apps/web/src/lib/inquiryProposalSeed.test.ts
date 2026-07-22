import { describe, expect, it } from 'vitest';
import {
  computeInquiryProposalReadiness,
  pickActiveInquiryProposalTrip,
  resolveTripDayCount,
  buildSeededItineraryDays,
  buildProposalAssumptions,
} from '@wayrune/contracts';

describe('inquiry proposal seed (contracts)', () => {
  it('draftable without dates', () => {
    const r = computeInquiryProposalReadiness({
      destinations: [{ name: 'Darjeeling' }],
      adults: 2,
      travelType: 'leisure',
    });
    expect(r.draftable).toBe(true);
    expect(r.itinerarySeedable).toBe(false);
  });

  it('seeds 4 days for 3 nights', () => {
    expect(resolveTripDayCount({ startDate: '2026-09-05', nights: 3 })?.dayCount).toBe(4);
    expect(
      buildSeededItineraryDays({
        dayCount: 4,
        startYmd: '2026-09-05',
        destinationNames: ['Darjeeling'],
        multiStop: false,
      }),
    ).toHaveLength(4);
  });

  it('picks awaiting_approval proposal', () => {
    expect(
      pickActiveInquiryProposalTrip([
        { id: 'p', tripNumber: '1', title: 'p', status: 'planning', updatedAt: '2026-06-01' },
        { id: 'a', tripNumber: '2', title: 'a', status: 'awaiting_approval', updatedAt: '2026-01-01' },
      ])?.id,
    ).toBe('a');
  });

  it('builds assumptions needing confirmation', () => {
    const a = buildProposalAssumptions({ adults: 2 });
    expect(a.some((x) => x.requiresConfirmation)).toBe(true);
  });
});
