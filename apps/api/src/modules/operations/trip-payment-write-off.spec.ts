import { describe, expect, it } from 'vitest';
import {
  assertCanRequestWriteOff,
  collectAwaitingWriteOffs,
  parseTripPaymentWriteOff,
  planApproveWriteOff,
  planRequestWriteOff,
  stripTripPaymentWriteOffMarker,
  tripFinanceWriteOffHref,
  tripPaymentOutstanding,
  writeOffAmountExceedsOutstanding,
} from './trip-payment-write-off';

describe('trip-payment-write-off', () => {
  it('rounds outstanding after approved write-off', () => {
    const requested = planRequestWriteOff({
      notes: 'Chase later',
      amount: 500,
      reason: 'Bad debt',
      userId: 'u1',
      at: new Date('2026-07-20T10:00:00.000Z'),
    });
    expect(parseTripPaymentWriteOff(requested.notes).status).toBe(
      'awaiting_approval',
    );
    expect(stripTripPaymentWriteOffMarker(requested.notes)).toBe('Chase later');

    const approved = planApproveWriteOff({
      notes: requested.notes,
      userId: 'u2',
      at: new Date('2026-07-20T11:00:00.000Z'),
    });
    expect(parseTripPaymentWriteOff(approved.notes).status).toBe('approved');
    expect(
      tripPaymentOutstanding({
        amount: 5000,
        amountPaid: 2000,
        notes: approved.notes,
      }),
    ).toBe(2500);
  });

  it('blocks self-approve and double request', () => {
    const requested = planRequestWriteOff({
      notes: null,
      amount: 100,
      reason: 'Small residual',
      userId: 'u1',
    });
    expect(() =>
      planApproveWriteOff({ notes: requested.notes, userId: 'u1' }),
    ).toThrow(/Requester cannot approve/);
    expect(() =>
      assertCanRequestWriteOff({
        direction: 'customer',
        status: 'partial',
        outstanding: 100,
        writeOffStatus: 'awaiting_approval',
      }),
    ).toThrow(/already awaiting/);
  });

  it('flags write-off above current outstanding', () => {
    expect(
      writeOffAmountExceedsOutstanding({
        writeOffAmount: 500,
        outstanding: 400,
      }),
    ).toBe(true);
    expect(
      writeOffAmountExceedsOutstanding({
        writeOffAmount: 400,
        outstanding: 400,
      }),
    ).toBe(false);
  });

  it('collects awaiting rows with finance deep-link', () => {
    const requested = planRequestWriteOff({
      notes: null,
      amount: 250,
      reason: 'Residual',
      userId: 'u1',
      at: new Date('2026-07-20T09:00:00.000Z'),
    });
    const rows = collectAwaitingWriteOffs([
      {
        id: 'pay1',
        tripId: 'trip1',
        direction: 'customer',
        status: 'partial',
        label: 'Deposit',
        amount: 5000,
        amountPaid: 4800,
        currency: 'INR',
        notes: requested.notes,
        tripNumber: 'TRP-1',
        tripTitle: 'Darjeeling',
        partyName: 'Acme',
      },
      {
        id: 'pay2',
        tripId: 'trip2',
        direction: 'supplier',
        status: 'scheduled',
        label: 'Hotel',
        amount: 1000,
        amountPaid: 0,
        currency: 'INR',
        notes: requested.notes,
        tripNumber: 'TRP-2',
        tripTitle: 'Goa',
        partyName: null,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      paymentId: 'pay1',
      writeOffAmount: 250,
      outstanding: 200,
      amountExceedsOutstanding: true,
      href: tripFinanceWriteOffHref('trip1', 'pay1'),
    });
    expect(rows[0]!.href).toBe('/trips/trip1?tab=finance&paymentId=pay1');
  });
});
