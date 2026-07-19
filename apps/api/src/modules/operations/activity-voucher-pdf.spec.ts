import { describe, expect, it } from 'vitest';
import { buildActivityVoucherPdf } from './activity-voucher-pdf';

describe('buildActivityVoucherPdf', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await buildActivityVoucherPdf({
      branding: {
        companyName: 'Demo Travel',
        tagline: null,
        primaryColor: '#0f6e56',
        logoUrl: null,
        previewFooter: 'Demo Travel · Activity voucher',
      },
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Darjeeling long weekend',
      partyName: 'Sharma family',
      guestNames: ['Amit Sharma', 'Neha Sharma'],
      activityName: 'Tiger Hill sunrise',
      supplierName: 'Tiger Hill Sunrise Desk',
      placeName: 'Tiger Hill',
      serviceDate: '2026-10-06',
      privateOrSic: 'private',
      adults: 2,
      children: 0,
      confirmationRef: 'ACT-SEED-1',
      agencyPhone: '+91 98765 43210',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});
