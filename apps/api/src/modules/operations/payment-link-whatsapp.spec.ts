import { describe, expect, it } from 'vitest';
import { composePaymentLinkWhatsappText } from './payment-link-whatsapp';

describe('composePaymentLinkWhatsappText', () => {
  it('includes amount, trip and pay URL', () => {
    const text = composePaymentLinkWhatsappText({
      agencyName: 'Demo Travel',
      guestName: 'Sneha Iyer',
      tripNumber: 'TRP-SEED-02',
      tripTitle: 'Goa honeymoon',
      label: 'Balance',
      amountDue: 45000,
      currency: 'INR',
      dueAt: '2026-09-01',
      payUrl: 'http://localhost:5173/p/pay/abc',
    });
    expect(text).toContain('Sneha Iyer');
    expect(text).toContain('TRP-SEED-02');
    expect(text).toContain('Balance');
    expect(text).toContain('/p/pay/abc');
    expect(text).toContain('Demo Travel');
  });
});
