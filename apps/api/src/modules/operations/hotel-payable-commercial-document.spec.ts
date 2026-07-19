import { describe, expect, it } from 'vitest';
import {
  composeHotelPayableCommercialDocument,
  HOTEL_PAYABLE_LINKED_ENTITY,
} from './hotel-payable-commercial-document';

describe('composeHotelPayableCommercialDocument', () => {
  it('builds an idempotent payable invoice payload for a hotel booking', () => {
    const doc = composeHotelPayableCommercialDocument({
      bookingId: 'bc-1',
      tripId: 'trip-1',
      supplierId: 'sup-1',
      serviceRequestId: 'sr-1',
      bookingTitle: 'Darjeeling Heritage Lodge · Deluxe · MAP',
      invoiceNumber: 'AUTO-ABCDEF12',
      amount: 13500.456,
      currency: 'inr',
      dueAt: '2026-10-05T00:00:00.000Z',
    });

    expect(doc).toMatchObject({
      docType: 'invoice',
      direction: 'payable',
      supplierId: 'sup-1',
      linkedEntityType: HOTEL_PAYABLE_LINKED_ENTITY,
      linkedEntityId: 'bc-1',
      tripId: 'trip-1',
      serviceRequestId: 'sr-1',
      documentNumber: 'AUTO-ABCDEF12',
      amount: 13500.46,
      currency: 'INR',
    });
    expect(doc.label).toContain('Payable');
    expect(doc.label).toContain('Darjeeling Heritage Lodge');
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]?.unitAmount).toBe(13500.46);
  });
});
