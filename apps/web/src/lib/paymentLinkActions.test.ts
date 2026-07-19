import { describe, expect, it } from 'vitest';
import { toastForPaymentLinkWhatsapp } from './paymentLinkActions';

describe('toastForPaymentLinkWhatsapp', () => {
  it('handles cloud send', () => {
    expect(toastForPaymentLinkWhatsapp({ sent: true })).toEqual({
      ok: true,
      message: 'Payment link sent on WhatsApp',
    });
    expect(toastForPaymentLinkWhatsapp({ sent: true, demo: true }).message).toMatch(
      /demo mode/,
    );
  });

  it('handles wa.me fallback with mark-as-sent cue', () => {
    const r = toastForPaymentLinkWhatsapp({
      fallbackWaMeUrl: 'https://wa.me/91',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.openUrl).toBe('https://wa.me/91');
      expect(r.needsMarkSent).toBe(true);
      expect(r.message).toMatch(/mark as sent/i);
    }
  });

  it('fails when neither sent nor fallback', () => {
    expect(toastForPaymentLinkWhatsapp({}).ok).toBe(false);
  });
});
