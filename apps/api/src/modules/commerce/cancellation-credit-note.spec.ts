import { describe, expect, it } from 'vitest';
import {
  cancellationApplyCreditNotePlan,
  cancellationCreditNoteAlreadyAllocated,
  composeCancellationCreditNoteAllocateUpdate,
  pickCancellationCreditNoteReceivableTarget,
  receivableOutstanding,
} from './cancellation-credit-note';

describe('cancellationApplyCreditNotePlan', () => {
  it('drafts when refund > 0 and apply had no failures', () => {
    expect(
      cancellationApplyCreditNotePlan({ expectedRefund: 2500, applyFailed: 0 }),
    ).toEqual({ amount: 2500 });
  });

  it('accepts decimal string refunds', () => {
    expect(
      cancellationApplyCreditNotePlan({
        expectedRefund: '1200.50',
        applyFailed: 0,
      }),
    ).toEqual({ amount: 1200.5 });
  });

  it('skips when refund is zero or missing', () => {
    expect(
      cancellationApplyCreditNotePlan({ expectedRefund: 0, applyFailed: 0 }),
    ).toBeNull();
    expect(
      cancellationApplyCreditNotePlan({ expectedRefund: null, applyFailed: 0 }),
    ).toBeNull();
  });

  it('skips when apply had failures', () => {
    expect(
      cancellationApplyCreditNotePlan({ expectedRefund: 500, applyFailed: 1 }),
    ).toBeNull();
  });
});

describe('receivableOutstanding', () => {
  it('nets allocations and linked credit notes', () => {
    expect(
      receivableOutstanding({
        id: 'inv-1',
        amount: 1000,
        taxAmount: 100,
        status: 'open',
        allocated: 400,
        creditNoteTotal: 200,
      }),
    ).toBe(500);
  });
});

describe('pickCancellationCreditNoteReceivableTarget', () => {
  it('picks the receivable with the largest outstanding balance', () => {
    expect(
      pickCancellationCreditNoteReceivableTarget(
        [
          {
            id: 'inv-a',
            amount: 500,
            taxAmount: 0,
            status: 'open',
            allocated: 0,
            creditNoteTotal: 0,
          },
          {
            id: 'inv-b',
            amount: 2000,
            taxAmount: 0,
            status: 'partial',
            allocated: 500,
            creditNoteTotal: 0,
          },
        ],
        1200,
      ),
    ).toEqual({ documentId: 'inv-b', allocateAmount: 1200 });
  });

  it('caps refund to receivable outstanding', () => {
    expect(
      pickCancellationCreditNoteReceivableTarget(
        [
          {
            id: 'inv-a',
            amount: 800,
            taxAmount: 0,
            status: 'open',
            allocated: 300,
            creditNoteTotal: 0,
          },
        ],
        1000,
      ),
    ).toEqual({ documentId: 'inv-a', allocateAmount: 500 });
  });

  it('returns null when no receivable has outstanding balance', () => {
    expect(
      pickCancellationCreditNoteReceivableTarget(
        [
          {
            id: 'inv-a',
            amount: 1000,
            taxAmount: 0,
            status: 'paid',
            allocated: 1000,
            creditNoteTotal: 0,
          },
        ],
        500,
      ),
    ).toBeNull();
  });
});

describe('cancellationCreditNoteAlreadyAllocated', () => {
  it('is true when linked to a receivable document', () => {
    expect(
      cancellationCreditNoteAlreadyAllocated({
        linkedEntityType: 'commercial_document',
        linkedEntityId: 'inv-1',
      }),
    ).toBe(true);
  });

  it('is false when still linked only to cancellation case', () => {
    expect(
      cancellationCreditNoteAlreadyAllocated({
        linkedEntityType: 'cancellation_case',
        linkedEntityId: 'case-1',
      }),
    ).toBe(false);
  });
});

describe('composeCancellationCreditNoteAllocateUpdate', () => {
  it('links credit note to receivable with capped amount', () => {
    expect(
      composeCancellationCreditNoteAllocateUpdate({
        cancellationCaseId: 'cancel_case_abc12345',
        target: { documentId: 'inv-9', allocateAmount: 750 },
      }),
    ).toEqual({
      linkedEntityType: 'commercial_document',
      linkedEntityId: 'inv-9',
      amount: 750,
      notes: 'Credit note from cancellation ABC12345 — allocated to receivable',
    });
  });
});
