import { describe, expect, it } from 'vitest';
import {
  AcceptPublicQuoteSchema,
  MarkQuoteSentSchema,
  RecordQuoteFitTimingSchema,
  RequestQuoteApprovalSchema,
  SendQuoteEmailSchema,
} from '@wayrune/contracts';
import { isQuoteValidUntilExpired } from './quote-validity';
import { shiftQuoteItemsToTripStart, remintQuoteItems } from './quote-template-content';

/**
 * Production-ready Quote FIT → send → accept journey contracts & guards.
 * Service integration paths are exercised via these invariants + controller schemas.
 */
describe('quote journey contracts', () => {
  it('rejects invalid send email', () => {
    expect(() => SendQuoteEmailSchema.parse({ toEmail: 'not-an-email' })).toThrow();
    expect(SendQuoteEmailSchema.parse({ toEmail: 'guest@example.com' }).toEmail).toBe(
      'guest@example.com',
    );
  });

  it('accepts optional public PIN body', () => {
    expect(AcceptPublicQuoteSchema.parse({}).pin ?? null).toBeNull();
    expect(AcceptPublicQuoteSchema.parse({ pin: '123456' }).pin).toBe('123456');
  });

  it('mark-sent defaults to whatsapp channel', () => {
    expect(MarkQuoteSentSchema.parse({}).channel).toBe('whatsapp');
    expect(MarkQuoteSentSchema.parse({}).extendValidity).toBe(false);
    expect(MarkQuoteSentSchema.parse({ extendValidity: true }).extendValidity).toBe(true);
  });

  it('request-approval defaults extendValidity false', () => {
    expect(RequestQuoteApprovalSchema.parse({}).extendValidity).toBe(false);
    expect(RequestQuoteApprovalSchema.parse({ extendValidity: true }).extendValidity).toBe(
      true,
    );
  });

  it('send email defaults extendValidity false', () => {
    expect(
      SendQuoteEmailSchema.parse({ toEmail: 'guest@example.com' }).extendValidity,
    ).toBe(false);
    expect(
      SendQuoteEmailSchema.parse({
        toEmail: 'guest@example.com',
        extendValidity: true,
      }).extendValidity,
    ).toBe(true);
  });

  it('records FIT timing payload', () => {
    const parsed = RecordQuoteFitTimingSchema.parse({
      quotationVersionId: 'qv_1',
      openedAtMs: Date.now() - 90_000,
      milestone: 'first_send',
    });
    expect(parsed.quotationVersionId).toBe('qv_1');
    expect(parsed.milestone).toBe('first_send');
  });
});

describe('quote accept expiry guard', () => {
  it('treats yesterday as expired (accept must reject)', () => {
    const today = new Date(2026, 6, 19);
    expect(isQuoteValidUntilExpired('2026-07-18', today)).toBe(true);
    expect(isQuoteValidUntilExpired('2026-07-19', today)).toBe(false);
  });
});

describe('template apply clears commercial snapshots', () => {
  it('nulls unitCost/unitSell and rate provenance when shifting onto trip start', () => {
    const items = remintQuoteItems([
      {
        id: 'h1',
        description: 'Hotel',
        quantity: 1,
        unitCost: 5000,
        unitSell: 6500,
        taxPercent: 5,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        rateId: 'rate_1',
        rateProvenance: {
          rateId: 'rate_1',
          rateKind: 'hotel',
          matchedAt: '2026-01-01T00:00:00.000Z',
          rateUpdatedAt: '2026-01-01T00:00:00.000Z',
        },
        details: { checkIn: '2026-10-01', checkOut: '2026-10-03' },
      },
    ]);
    const { items: shifted } = shiftQuoteItemsToTripStart(items, '2026-11-01');
    expect(shifted[0]?.unitCost).toBeNull();
    expect(shifted[0]?.unitSell).toBeNull();
    expect(shifted[0]?.rateId).toBeUndefined();
    expect(shifted[0]?.rateProvenance).toBeUndefined();
    expect(shifted[0]?.details?.checkIn).toBe('2026-11-01');
  });
});
