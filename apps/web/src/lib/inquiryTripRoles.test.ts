import { describe, expect, it } from 'vitest';
import {
  confirmedOpsTrips,
  isConfirmedOpsTrip,
  isProposalTrip,
  pickActiveProposalTrip,
  pickPrimaryOpsTrip,
  proposalTrips,
  type InquiryLinkedTrip,
} from './inquiryTripRoles';

describe('inquiryTripRoles', () => {
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
    {
      id: '4',
      tripNumber: 'TRP-4',
      title: 'Confirmed',
      status: 'confirmed',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: '5',
      tripNumber: 'TRP-5',
      title: 'Cancelled',
      status: 'cancelled',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ];

  it('classifies proposal vs confirmed ops (cancelled is neither)', () => {
    expect(isProposalTrip('planning')).toBe(true);
    expect(isProposalTrip('quoted')).toBe(true);
    expect(isConfirmedOpsTrip('confirmed')).toBe(true);
    expect(isProposalTrip('cancelled')).toBe(false);
    expect(isConfirmedOpsTrip('cancelled')).toBe(false);
  });

  it('picks awaiting_approval over quoted over planning', () => {
    expect(pickActiveProposalTrip(trips)?.id).toBe('3');
  });

  it('picks newest within same status', () => {
    const twoPlanning: InquiryLinkedTrip[] = [
      {
        id: 'a',
        tripNumber: 'A',
        title: 'A',
        status: 'planning',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        tripNumber: 'B',
        title: 'B',
        status: 'planning',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    expect(pickActiveProposalTrip(twoPlanning)?.id).toBe('b');
  });

  it('splits lists and primary ops trip', () => {
    expect(proposalTrips(trips).map((t) => t.id)).toEqual(['2', '3', '1']);
    expect(confirmedOpsTrips(trips).map((t) => t.id)).toEqual(['4']);
    expect(pickPrimaryOpsTrip(trips)?.id).toBe('4');
  });
});
