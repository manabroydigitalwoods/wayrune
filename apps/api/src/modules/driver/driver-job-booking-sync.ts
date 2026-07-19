/** Map partner DriverJob status → agency BookingComponent status (thin reverse sync). */

export type DriverJobStatus =
  | 'offered'
  | 'assigned'
  | 'en_route'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | string;

/**
 * Returns agency booking status to apply, or null when reverse sync should no-op.
 * Never auto-cancels the booking on job cancel (ops must confirm) — only soft demotes
 * confirmed/held → requested so the board shows the duty dropped.
 */
export function bookingStatusFromDriverJob(
  jobStatus: DriverJobStatus,
  currentBookingStatus: string,
): string | null {
  if (
    currentBookingStatus === 'cancelled' ||
    currentBookingStatus === 'rejected'
  ) {
    return null;
  }

  switch (jobStatus) {
    case 'assigned':
    case 'en_route':
      if (currentBookingStatus === 'confirmed') return null;
      return 'confirmed';
    case 'completed':
      return currentBookingStatus === 'confirmed' ? null : 'confirmed';
    case 'cancelled':
    case 'no_show':
      if (
        currentBookingStatus === 'confirmed' ||
        currentBookingStatus === 'held'
      ) {
        return 'requested';
      }
      return null;
    default:
      return null;
  }
}
