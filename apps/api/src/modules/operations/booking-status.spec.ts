import { describe, expect, it } from 'vitest';
import {
  assertCanConfirmBooking,
  canConfirmBookingFrom,
  isBookingComponentStatus,
} from './booking-status';

describe('booking-status', () => {
  it('recognises known statuses', () => {
    expect(isBookingComponentStatus('confirmed')).toBe(true);
    expect(isBookingComponentStatus('bogus')).toBe(false);
  });

  it('allows confirm from enquiry pipeline statuses only', () => {
    expect(canConfirmBookingFrom('requested')).toBe(true);
    expect(canConfirmBookingFrom('sent')).toBe(true);
    expect(canConfirmBookingFrom('confirmed')).toBe(false);
    expect(canConfirmBookingFrom('cancelled')).toBe(false);
  });

  it('requires confirmation ref to confirm', () => {
    expect(() =>
      assertCanConfirmBooking({ currentStatus: 'sent', confirmationRef: '  ' }),
    ).toThrow(/confirmation reference/i);
    expect(() =>
      assertCanConfirmBooking({
        currentStatus: 'sent',
        confirmationRef: 'HTL-123',
      }),
    ).not.toThrow();
  });
});
