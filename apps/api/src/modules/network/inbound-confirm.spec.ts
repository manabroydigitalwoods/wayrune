import { describe, expect, it } from 'vitest';
import { ConfirmInboundBookingSchema } from '@wayrune/contracts';
import {
  BOOKING_COMPONENT_ENTITY_TYPE,
  isAllowedPartnerConfirmationMime,
  MAX_PARTNER_CONFIRMATION_BYTES,
  PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  partnerConfirmationDocumentBinding,
  partnerConfirmationFilesBatchQuery,
  partnerConfirmationFilesQuery,
} from './inbound-booking-document';

describe('ConfirmInboundBookingSchema', () => {
  it('requires confirmationRef when confirming', () => {
    expect(() =>
      ConfirmInboundBookingSchema.parse({ status: 'confirmed' }),
    ).toThrow(/Confirmation reference is required/);
    expect(() =>
      ConfirmInboundBookingSchema.parse({ status: 'confirmed', confirmationRef: '   ' }),
    ).toThrow(/Confirmation reference is required/);
    expect(
      ConfirmInboundBookingSchema.parse({
        status: 'confirmed',
        confirmationRef: 'HTL-991',
      }).confirmationRef,
    ).toBe('HTL-991');
  });

  it('allows requested without confirmationRef', () => {
    expect(ConfirmInboundBookingSchema.parse({ status: 'requested' }).status).toBe(
      'requested',
    );
  });
});

describe('partner confirmation document binding', () => {
  it('binds to agency booking_component with stable documentType', () => {
    expect(partnerConfirmationDocumentBinding('bc_1')).toEqual({
      entityType: BOOKING_COMPONENT_ENTITY_TYPE,
      entityId: 'bc_1',
      documentType: PARTNER_CONFIRMATION_DOCUMENT_TYPE,
    });
  });

  it('allows PDF and common images only', () => {
    expect(isAllowedPartnerConfirmationMime('application/pdf')).toBe(true);
    expect(isAllowedPartnerConfirmationMime('image/png')).toBe(true);
    expect(isAllowedPartnerConfirmationMime('image/jpeg')).toBe(true);
    expect(isAllowedPartnerConfirmationMime('text/plain')).toBe(false);
    expect(MAX_PARTNER_CONFIRMATION_BYTES).toBe(8 * 1024 * 1024);
  });

  it('builds agency files list query for Ops', () => {
    expect(partnerConfirmationFilesQuery('bc_9')).toBe(
      '/files?entityType=booking_component&entityId=bc_9&documentType=partner_confirmation',
    );
  });

  it('builds batch files list query', () => {
    const path = partnerConfirmationFilesBatchQuery(['bc_1', 'bc_2']);
    expect(path).toContain('entityId=bc_1');
    expect(path).toContain('entityId=bc_2');
    expect(path).toContain('documentType=partner_confirmation');
  });
});
