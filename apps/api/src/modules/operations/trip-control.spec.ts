import { describe, expect, it } from 'vitest';
import {
  buildTripControlSummary,
  daysUntil,
  isOpenBooking,
  NEAR_DEPARTURE_DAYS,
} from './trip-control';

describe('trip-control', () => {
  const financeBase = {
    orgCurrency: 'INR',
    quote: {
      sellTotal: 50000,
      marginAmount: 8000,
      marginPercent: 16,
      currency: 'INR',
    },
    summary: {
      customerDue: 0,
      customerPaid: 20000,
      supplierDue: 0,
      supplierPaid: 0,
      overdueCount: 0,
    },
  };

  const readinessDone = {
    items: [{ done: true }, { done: true }],
    allDone: true,
  };

  it('treats requested as open', () => {
    expect(isOpenBooking('requested')).toBe(true);
    expect(isOpenBooking('confirmed')).toBe(false);
    expect(isOpenBooking('cancelled')).toBe(false);
  });

  it('computes days until departure', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(daysUntil('2026-11-12', now)).toBe(11);
    expect(daysUntil(null, now)).toBeNull();
  });

  it('flags unconfirmed hotel near departure as danger', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    const summary = buildTripControlSummary({
      tripStartDate: '2026-11-12',
      now,
      bookings: [
        {
          id: 'b1',
          type: 'hotel',
          title: 'Darjeeling Heritage Lodge',
          status: 'requested',
          startAt: '2026-11-12',
        },
      ],
      finance: financeBase,
      readiness: { items: [{ done: false }], allDone: false },
    });
    expect(summary.daysToStart).toBe(7);
    expect(summary.nearDepartureDays).toBe(NEAR_DEPARTURE_DAYS);
    const hotel = summary.flags.find((f) => f.code === 'unconfirmed_hotel');
    expect(hotel?.severity).toBe('danger');
    expect(summary.allClear).toBe(false);
  });

  it('flags voucher pending and missing transfer', () => {
    const summary = buildTripControlSummary({
      tripStartDate: '2027-03-01',
      now: new Date('2026-11-01T12:00:00Z'),
      bookings: [
        {
          id: 'h1',
          type: 'hotel',
          title: 'Hotel',
          status: 'confirmed',
          voucherNote: null,
        },
      ],
      finance: {
        ...financeBase,
        summary: { ...financeBase.summary, supplierDue: 13500 },
      },
      readiness: readinessDone,
    });
    expect(summary.counts.vouchersPending).toBe(1);
    expect(summary.flags.some((f) => f.code === 'voucher_pending')).toBe(true);
    expect(summary.flags.some((f) => f.code === 'missing_transfer')).toBe(true);
    expect(summary.flags.some((f) => f.code === 'supplier_payable_open')).toBe(true);
  });

  it('flags open activity and pending cancellation cases', () => {
    const summary = buildTripControlSummary({
      tripStartDate: '2026-11-12',
      now: new Date('2026-11-05T12:00:00Z'),
      bookings: [
        {
          id: 'a1',
          type: 'activity',
          title: 'Tiger Hill sunrise',
          status: 'requested',
          startAt: '2026-11-10',
        },
      ],
      finance: financeBase,
      readiness: readinessDone,
      openCancellationCases: 2,
    });
    expect(summary.counts.activitiesOpen).toBe(1);
    expect(summary.flags.some((f) => f.code === 'unconfirmed_activity')).toBe(true);
    const cancel = summary.flags.find((f) => f.code === 'open_cancellation_cases');
    expect(cancel?.severity).toBe('danger');
    expect(cancel?.tab).toBe('commerce');
  });

  it('flags customer over credit limit', () => {
    const summary = buildTripControlSummary({
      tripStartDate: '2027-06-01',
      bookings: [],
      finance: {
        ...financeBase,
        partyCredit: {
          limited: true,
          creditLimit: 500000,
          outstanding: 520000,
          exposure: 520000,
          headroom: 0,
          overLimit: true,
          overBy: 20000,
        },
      },
      readiness: readinessDone,
    });
    expect(summary.flags.some((f) => f.code === 'credit_limit_exceeded')).toBe(true);
  });

  it('is allClear when only info flags remain', () => {
    const summary = buildTripControlSummary({
      tripStartDate: '2027-06-01',
      now: new Date('2026-11-01T12:00:00Z'),
      bookings: [],
      finance: { ...financeBase, quote: null },
      readiness: readinessDone,
    });
    expect(summary.flags.every((f) => f.severity === 'info')).toBe(true);
    expect(summary.allClear).toBe(true);
  });
});
