import { describe, expect, it } from 'vitest';
import {
  composeCancellationRefundPaymentRecord,
  creditNoteRefundOutstanding,
  creditNoteRefundTotal,
  commercialDocumentPaidStateFromNote,
  parseCancellationRefundEval,
} from './cancellation-refund-settle';

describe('creditNoteRefundTotal', () => {
  it('sums amount and tax', () => {
    expect(creditNoteRefundTotal({ amount: 2500, taxAmount: 0 })).toBe(2500);
    expect(creditNoteRefundTotal({ amount: 1000, taxAmount: 180 })).toBe(1180);
  });
});

describe('creditNoteRefundOutstanding', () => {
  it('returns total minus amountPaid', () => {
    expect(
      creditNoteRefundOutstanding({ amount: 2500, taxAmount: 0, amountPaid: 0 }),
    ).toBe(2500);
    expect(
      creditNoteRefundOutstanding({ amount: 2500, taxAmount: 0, amountPaid: 1000 }),
    ).toBe(1500);
    expect(
      creditNoteRefundOutstanding({ amount: 2500, taxAmount: 0, amountPaid: 2500 }),
    ).toBe(0);
  });
});

describe('composeCancellationRefundPaymentRecord', () => {
  it('builds idempotent outbound payment payload', () => {
    expect(
      composeCancellationRefundPaymentRecord({
        cancellationCaseId: 'cancel_case_abc12345',
        creditNoteId: 'cn-1',
        tripId: 'trip-1',
        amount: 750.5,
        currency: 'inr',
        method: 'neft',
        reference: 'UTR123',
      }),
    ).toEqual({
      direction: 'outbound',
      amount: 750.5,
      currency: 'INR',
      method: 'neft',
      reference: 'UTR123',
      linkedEntityType: 'cancellation_case',
      linkedEntityId: 'cancel_case_abc12345',
      tripId: 'trip-1',
      commercialDocumentId: 'cn-1',
      notes: 'Refund settlement · cancellation ABC12345',
    });
  });
});

describe('commercialDocumentPaidStateFromNote', () => {
  it('marks credit note paid when fully settled', () => {
    expect(
      commercialDocumentPaidStateFromNote(
        { amount: 500, taxAmount: 0 },
        500,
      ),
    ).toEqual({ amountPaid: 500, status: 'paid' });
  });
});

describe('parseCancellationRefundEval', () => {
  it('reads refund fields from evaluationJson', () => {
    expect(
      parseCancellationRefundEval({
        creditNoteId: 'cn-9',
        refundPaymentId: 'pay-1',
        refundSettledAmount: 1200,
      }),
    ).toEqual({
      creditNoteId: 'cn-9',
      refundPaymentId: 'pay-1',
      refundSettledAmount: 1200,
    });
  });
});
