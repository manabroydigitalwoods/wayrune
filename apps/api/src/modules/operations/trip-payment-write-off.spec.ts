import { describe, expect, it } from 'vitest';
import {
  assertCanRequestWriteOff,
  parseTripPaymentWriteOff,
  planApproveWriteOff,
  planRequestWriteOff,
  stripTripPaymentWriteOffMarker,
  tripPaymentOutstanding,
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
});
