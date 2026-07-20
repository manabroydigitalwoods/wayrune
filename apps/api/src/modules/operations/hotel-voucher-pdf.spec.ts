import { describe, expect, it } from 'vitest';
import { buildHotelVoucherPdf } from './hotel-voucher-pdf';

describe('buildHotelVoucherPdf', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await buildHotelVoucherPdf({
      branding: {
        companyName: 'Demo Travel',
        tagline: null,
        primaryColor: '#0f6e56',
        logoUrl: null,
        previewFooter: 'Demo Travel · Hotel voucher',
      },
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      partyName: 'Sharma family',
      guestNames: ['Amit Sharma', 'Neha Sharma'],
      hotelName: 'Darjeeling Heritage Lodge',
      roomType: 'Deluxe mountain view',
      mealPlan: 'MAP',
      rooms: 1,
      nights: 2,
      checkIn: '2026-04-10',
      checkOut: '2026-04-12',
      confirmationRef: 'HTL-SEED-1',
      agencyPhone: '+91 98765 43210',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('accepts guestRooms room lists without failing', async () => {
    const buf = await buildHotelVoucherPdf({
      branding: {
        companyName: 'Demo Travel',
        tagline: null,
        primaryColor: '#0f6e56',
        logoUrl: null,
        previewFooter: 'Demo Travel · Hotel voucher',
      },
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      guestNames: ['Amit Sharma', 'Neha Sharma', 'Kid Sharma'],
      guestRooms: [
        { roomLabel: 'Room 1', guestNames: ['Amit Sharma', 'Kid Sharma'] },
        { roomLabel: 'Room 2', guestNames: ['Neha Sharma'] },
      ],
      hotelName: 'Darjeeling Heritage Lodge',
      rooms: 2,
      nights: 2,
      checkIn: '2026-04-10',
      checkOut: '2026-04-12',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});
