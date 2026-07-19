import { describe, expect, it } from 'vitest';
import {
  evaluateWhatsappCustomerSession,
  isWhatsappCustomerInbound,
  phonesLikelyMatch,
  WHATSAPP_CUSTOMER_SESSION_MS,
} from './whatsapp-customer-session';

describe('phonesLikelyMatch', () => {
  it('matches E.164 variants', () => {
    expect(phonesLikelyMatch('919876543210', '9876543210')).toBe(true);
    expect(phonesLikelyMatch('+91 98765 43210', '9876543210')).toBe(true);
    expect(phonesLikelyMatch('111', '222')).toBe(false);
  });
});

describe('isWhatsappCustomerInbound', () => {
  it('treats direction inbound as customer', () => {
    expect(isWhatsappCustomerInbound({ direction: 'inbound' }, '9876543210')).toBe(
      true,
    );
  });

  it('rejects outbound', () => {
    expect(
      isWhatsappCustomerInbound(
        { direction: 'outbound', from: '9876543210' },
        '9876543210',
      ),
    ).toBe(false);
  });

  it('uses from when direction missing', () => {
    expect(isWhatsappCustomerInbound({ from: '919876543210' }, '9876543210')).toBe(
      true,
    );
  });
});

describe('evaluateWhatsappCustomerSession', () => {
  const digits = '9876543210';
  const now = new Date('2026-07-19T18:00:00.000Z');

  it('closed when no inbound', () => {
    const s = evaluateWhatsappCustomerSession(
      [
        {
          createdAt: new Date('2026-07-19T17:00:00.000Z'),
          rawPayloadJson: { direction: 'outbound', to: digits },
        },
      ],
      digits,
      now,
    );
    expect(s.open).toBe(false);
    expect(s.remainingMs).toBe(0);
  });

  it('open with remaining time from latest inbound', () => {
    const lastInboundAt = new Date('2026-07-19T12:00:00.000Z');
    const s = evaluateWhatsappCustomerSession(
      [
        {
          createdAt: lastInboundAt,
          rawPayloadJson: { direction: 'inbound', from: digits },
        },
      ],
      digits,
      now,
    );
    expect(s.open).toBe(true);
    expect(s.lastInboundAt?.toISOString()).toBe(lastInboundAt.toISOString());
    expect(s.expiresAt?.getTime()).toBe(
      lastInboundAt.getTime() + WHATSAPP_CUSTOMER_SESSION_MS,
    );
    expect(s.remainingMs).toBe(18 * 60 * 60 * 1000);
  });

  it('closed when inbound older than 24h', () => {
    const s = evaluateWhatsappCustomerSession(
      [
        {
          createdAt: new Date('2026-07-18T12:00:00.000Z'),
          rawPayloadJson: { direction: 'inbound', from: digits },
        },
      ],
      digits,
      now,
    );
    expect(s.open).toBe(false);
    expect(s.remainingMs).toBe(0);
  });
});
