/** Allowed booking component statuses and confirm transitions (ops hotel chain). */

export const BOOKING_COMPONENT_STATUSES = [
  'pending',
  'requested',
  'sent',
  'confirmed',
  'cancelled',
  'rejected',
] as const;

export type BookingComponentStatus = (typeof BOOKING_COMPONENT_STATUSES)[number];

const CONFIRM_FROM = new Set(['pending', 'requested', 'sent']);

export function isBookingComponentStatus(value: string): value is BookingComponentStatus {
  return (BOOKING_COMPONENT_STATUSES as readonly string[]).includes(value);
}

/** Whether a booking may move to `confirmed` from its current status. */
export function canConfirmBookingFrom(status: string): boolean {
  return CONFIRM_FROM.has(status);
}

export function assertCanConfirmBooking(input: {
  currentStatus: string;
  confirmationRef: string | null | undefined;
}): void {
  if (!canConfirmBookingFrom(input.currentStatus)) {
    throw new Error(
      `Cannot confirm from status “${input.currentStatus.replace(/_/g, ' ')}”`,
    );
  }
  const ref = input.confirmationRef?.trim();
  if (!ref) {
    throw new Error('Confirmation reference is required before confirming');
  }
}
