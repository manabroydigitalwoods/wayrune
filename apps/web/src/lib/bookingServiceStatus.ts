/**
 * Trip booking service-status vocabulary (R3) — web mirror of API helper.
 * Keep in sync with apps/api/src/modules/operations/booking-service-status.ts
 */

export const BOOKING_SERVICE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Unrequested' },
  { value: 'required', label: 'Unrequested (required)' },
  { value: 'drafted', label: 'Unrequested (draft)' },
  { value: 'requested', label: 'Enquiry' },
  { value: 'sent', label: 'Enquiry (sent)' },
  { value: 'acknowledged', label: 'Awaiting' },
  { value: 'available', label: 'Available' },
  { value: 'held', label: 'On hold' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
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
