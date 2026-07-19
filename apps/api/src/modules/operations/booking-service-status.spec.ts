import { describe, expect, it } from 'vitest';
import { resolveBookingServiceStatus } from './booking-service-status';

describe('booking-service-status', () => {
  it('maps requested to enquiry', () => {
    expect(resolveBookingServiceStatus({ status: 'requested' }).key).toBe('enquiry');
    expect(resolveBookingServiceStatus({ status: 'requested' }).label).toBe('Enquiry');
  });

  it('maps pending to unrequested', () => {
    expect(resolveBookingServiceStatus({ status: 'pending' }).key).toBe('unrequested');
  });

  it('derives payment_pending then voucher_pending after confirm', () => {
    expect(
      resolveBookingServiceStatus({
        status: 'confirmed',
        type: 'hotel',
        invoices: [{ status: 'open' }],
        voucherNote: null,
      }).key,
    ).toBe('payment_pending');

    expect(
      resolveBookingServiceStatus({
        status: 'confirmed',
        type: 'hotel',
        invoices: [{ status: 'paid' }],
        voucherNote: null,
      }).key,
    ).toBe('voucher_pending');

    expect(
      resolveBookingServiceStatus({
        status: 'confirmed',
        type: 'hotel',
        invoices: [{ status: 'paid' }],
        voucherNote: 'Issued',
      }).key,
    ).toBe('confirmed');

    expect(
      resolveBookingServiceStatus({
        status: 'confirmed',
        type: 'transfer',
        invoices: [],
        voucherNote: null,
      }).key,
    ).toBe('voucher_pending');

    expect(
      resolveBookingServiceStatus({
        status: 'confirmed',
        type: 'activity',
        invoices: [{ status: 'paid' }],
        voucherNote: null,
      }).key,
    ).toBe('voucher_pending');
  });
});
