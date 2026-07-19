import { describe, expect, it } from 'vitest';
import { bookingStatusFromDriverJob } from './driver-job-booking-sync';

describe('bookingStatusFromDriverJob', () => {
  it('promotes pending to confirmed on assign', () => {
    expect(bookingStatusFromDriverJob('assigned', 'pending')).toBe('confirmed');
    expect(bookingStatusFromDriverJob('en_route', 'requested')).toBe('confirmed');
  });

  it('no-ops when already confirmed on assign', () => {
    expect(bookingStatusFromDriverJob('assigned', 'confirmed')).toBeNull();
  });

  it('soft demotes confirmed on partner cancel', () => {
    expect(bookingStatusFromDriverJob('cancelled', 'confirmed')).toBe('requested');
    expect(bookingStatusFromDriverJob('no_show', 'held')).toBe('requested');
  });

  it('ignores cancelled agency bookings', () => {
    expect(bookingStatusFromDriverJob('assigned', 'cancelled')).toBeNull();
  });
});
