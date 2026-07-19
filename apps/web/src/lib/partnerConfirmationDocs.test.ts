import { describe, expect, it } from 'vitest';
import {
  BOOKING_COMPONENT_ENTITY_TYPE,
  PARTNER_CONFIRMATION_DOCUMENT_TYPE,
  latestPartnerConfirmationByBookingId,
  partnerConfirmationFilesBatchPath,
  partnerConfirmationFilesPath,
} from './partnerConfirmationDocs';

describe('partnerConfirmationFilesPath', () => {
  it('queries booking_component + partner_confirmation', () => {
    const path = partnerConfirmationFilesPath('bc_1');
    expect(path).toContain('entityType=booking_component');
    expect(path).toContain('entityId=bc_1');
    expect(path).toContain(`documentType=${PARTNER_CONFIRMATION_DOCUMENT_TYPE}`);
    expect(BOOKING_COMPONENT_ENTITY_TYPE).toBe('booking_component');
  });
});

describe('partnerConfirmationFilesBatchPath', () => {
  it('repeats entityId for each booking', () => {
    const path = partnerConfirmationFilesBatchPath(['bc_1', 'bc_2']);
    expect(path).toContain('entityId=bc_1');
    expect(path).toContain('entityId=bc_2');
    expect(path).toContain(`documentType=${PARTNER_CONFIRMATION_DOCUMENT_TYPE}`);
  });
});

describe('latestPartnerConfirmationByBookingId', () => {
  it('keeps first (newest) doc per booking', () => {
    const map = latestPartnerConfirmationByBookingId([
      { id: 'd1', name: 'a.pdf', entityId: 'bc_1' },
      { id: 'd2', name: 'b.pdf', entityId: 'bc_1' },
      { id: 'd3', name: 'c.pdf', entityId: 'bc_2' },
    ]);
    expect(map.get('bc_1')?.id).toBe('d1');
    expect(map.get('bc_2')?.id).toBe('d3');
    expect(map.size).toBe(2);
  });
});
