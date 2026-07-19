/**
 * Trip booking service-status vocabulary (R3).
 * Stored BookingComponent.status stays coarse; display status can be derived
 * (payment_pending / voucher_pending) from invoices + voucherNote.
 *
 * Ladder: unrequested → enquiry → awaiting → available → on_hold →
 * confirmed → payment_pending → voucher_pending → cancelled
 */

export const BOOKING_SERVICE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Unrequested', storeAs: 'pending' },
  { value: 'required', label: 'Unrequested (required)', storeAs: 'required' },
  { value: 'drafted', label: 'Unrequested (draft)', storeAs: 'drafted' },
  { value: 'requested', label: 'Enquiry', storeAs: 'requested' },
  { value: 'sent', label: 'Enquiry (sent)', storeAs: 'sent' },
  { value: 'acknowledged', label: 'Awaiting', storeAs: 'acknowledged' },
  { value: 'available', label: 'Available', storeAs: 'available' },
  { value: 'held', label: 'On hold', storeAs: 'held' },
  { value: 'confirmed', label: 'Confirmed', storeAs: 'confirmed' },
  { value: 'rejected', label: 'Rejected', storeAs: 'rejected' },
  { value: 'expired', label: 'Expired', storeAs: 'expired' },
  { value: 'cancelled', label: 'Cancelled', storeAs: 'cancelled' },
] as const;

export type BookingServiceStatusKey =
  | 'unrequested'
  | 'enquiry'
  | 'awaiting'
  | 'available'
  | 'on_hold'
  | 'confirmed'
  | 'payment_pending'
  | 'voucher_pending'
  | 'cancelled'
  | 'rejected'
  | 'expired';

const LABELS: Record<BookingServiceStatusKey, string> = {
  unrequested: 'Unrequested',
  enquiry: 'Enquiry',
  awaiting: 'Awaiting',
  available: 'Available',
  on_hold: 'On hold',
  confirmed: 'Confirmed',
  payment_pending: 'Payment pending',
  voucher_pending: 'Voucher pending',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired',
};

export type BookingServiceStatusInput = {
  status: string;
  type?: string;
  voucherNote?: string | null;
  invoices?: Array<{ status: string }> | null;
};

export function bookingServiceStatusLabel(key: BookingServiceStatusKey): string {
  return LABELS[key];
}

/** Map raw stored status (+ derived finance/voucher signals) → display status. */
export function resolveBookingServiceStatus(
  b: BookingServiceStatusInput,
): { key: BookingServiceStatusKey; label: string } {
  const raw = (b.status || '').toLowerCase();

  if (raw === 'cancelled') return pack('cancelled');
  if (raw === 'rejected') return pack('rejected');
  if (raw === 'expired') return pack('expired');

  if (raw === 'confirmed') {
    const invoices = (b.invoices || []).filter((i) => i.status !== 'cancelled');
    const unpaid = invoices.some((i) => i.status !== 'paid');
    const hasVoucher = Boolean(String(b.voucherNote || '').trim());

    // Ladder after confirm: payment → voucher (matches R3 vocabulary order).
    if (unpaid) return pack('payment_pending');
    if (
      !hasVoucher &&
      (b.type === 'hotel' || b.type === 'transfer' || b.type === 'activity')
    ) {
      return pack('voucher_pending');
    }
    return pack('confirmed');
  }

  if (raw === 'held') return pack('on_hold');
  if (raw === 'available') return pack('available');
  if (raw === 'acknowledged') return pack('awaiting');
  if (raw === 'requested' || raw === 'sent') return pack('enquiry');
  if (raw === 'pending' || raw === 'required' || raw === 'drafted') {
    return pack('unrequested');
  }

  return pack('unrequested');
}

function pack(key: BookingServiceStatusKey) {
  return { key, label: LABELS[key] };
}
