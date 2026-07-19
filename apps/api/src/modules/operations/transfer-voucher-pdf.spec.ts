import { describe, expect, it } from 'vitest';
import { buildTransferVoucherPdf } from './transfer-voucher-pdf';

describe('buildTransferVoucherPdf', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await buildTransferVoucherPdf({
      branding: {
        companyName: 'Demo Travel',
        tagline: null,
        primaryColor: '#0f6e56',
        logoUrl: null,
        previewFooter: 'Demo Travel · Transfer voucher',
      },
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      partyName: 'Sharma family',
      guestNames: ['Amit Sharma', 'Neha Sharma'],
      supplierName: 'North Bengal Fleet Rentals',
      fromPlace: 'Bagdogra Airport',
      toPlace: 'Darjeeling',
      vehicleName: 'Innova',
      vehicles: 1,
      serviceDate: '2026-10-05',
      confirmationRef: 'XFER-SEED-1',
      agencyPhone: '+91 98765 43210',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});
