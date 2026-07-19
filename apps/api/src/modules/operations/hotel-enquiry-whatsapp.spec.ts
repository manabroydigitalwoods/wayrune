import { describe, expect, it } from 'vitest';
import {
  composeHotelEnquiryWhatsappText,
  normalizeWhatsappPhone,
} from './hotel-enquiry-whatsapp';

describe('hotel enquiry whatsapp', () => {
  it('normalizes India 10-digit mobiles', () => {
    expect(normalizeWhatsappPhone('+91 98311 00101')).toBe('919831100101');
    expect(normalizeWhatsappPhone('9831100101')).toBe('919831100101');
    expect(normalizeWhatsappPhone('12')).toBeNull();
  });

  it('composes a supplier enquiry message', () => {
    const text = composeHotelEnquiryWhatsappText({
      agencyName: 'Demo Travel',
      hotelName: 'Darjeeling Heritage Lodge',
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      guestName: 'Sharma family',
      bookingTitle: 'Darjeeling Heritage Lodge · Deluxe mountain view · MAP',
      checkIn: '2026-04-10',
      checkOut: '2026-04-12',
      rooms: 1,
      roomType: 'Deluxe mountain view',
      mealPlan: 'MAP',
      nights: 2,
    });
    expect(text).toContain('Darjeeling Heritage Lodge');
    expect(text).toContain('TRP-SEED-02');
    expect(text).toContain('Deluxe mountain view');
    expect(text).toContain('Demo Travel');
  });
});
