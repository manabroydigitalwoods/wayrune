import { describe, expect, it } from 'vitest';
import { composeActivityEnquiryWhatsappText } from './activity-enquiry-whatsapp';

describe('activity enquiry whatsapp', () => {
  it('composes a supplier enquiry message', () => {
    const text = composeActivityEnquiryWhatsappText({
      agencyName: 'Demo Travel',
      supplierName: 'Tiger Hill desk',
      tripNumber: 'TRP-SEED-03',
      tripTitle: 'Darjeeling long weekend',
      guestName: 'Sharma family',
      bookingTitle: 'Tiger Hill sunrise · PRIVATE',
      serviceDate: '2026-04-11',
      placeName: 'Tiger Hill',
      privateOrSic: 'private',
      adults: 2,
      children: 1,
    });
    expect(text).toContain('Tiger Hill desk');
    expect(text).toContain('TRP-SEED-03');
    expect(text).toContain('Tiger Hill sunrise');
    expect(text).toContain('Demo Travel');
  });
});
