import { describe, expect, it } from 'vitest';
import { composeTransferEnquiryWhatsappText } from './transfer-enquiry-whatsapp';

describe('transfer enquiry whatsapp', () => {
  it('composes a supplier enquiry message', () => {
    const text = composeTransferEnquiryWhatsappText({
      agencyName: 'Demo Travel',
      supplierName: 'Hill Fleet',
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      guestName: 'Sharma family',
      bookingTitle: 'Bagdogra → Darjeeling Innova',
      serviceDate: '2026-04-10',
      fromPlaceName: 'Bagdogra',
      toPlaceName: 'Darjeeling',
      vehicleName: 'Innova',
      vehicles: 1,
    });
    expect(text).toContain('Hill Fleet');
    expect(text).toContain('TRP-SEED-02');
    expect(text).toContain('Bagdogra → Darjeeling');
    expect(text).toContain('Demo Travel');
  });
});
