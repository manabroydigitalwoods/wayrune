import { commercialDocumentPaidState } from '../operations/hotel-payable-settle';

/** Outbound refund payment keyed on the cancellation case (idempotent settle). */
export const CANCELLATION_REFUND_LINKED_ENTITY = 'cancellation_case' as const;

export type CreditNoteForRefundSettle = {
  amount: number | string | { toString(): string };
  taxAmount?: number | string | { toString(): string } | null;
  amountPaid?: number | string | { toString(): string } | null;
};

export function creditNoteRefundTotal(note: CreditNoteForRefundSettle): number {
  return (
    Math.round(
      (Number(note.amount) + Number(note.taxAmount || 0)) * 100,
    ) / 100
  );
}

/** Cash still owed on a payable credit note (outbound allocations / amountPaid). */
export function creditNoteRefundOutstanding(
  note: CreditNoteForRefundSettle,
): number {
  const total = creditNoteRefundTotal(note);
  const paid = Math.max(
    0,
    Math.round(Number(note.amountPaid || 0) * 100) / 100,
  );
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

export function composeCancellationRefundPaymentRecord(input: {
  cancellationCaseId: string;
  creditNoteId: string;
  tripId: string;
  amount: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
}) {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const suffix = input.cancellationCaseId.slice(-8).toUpperCase();
  return {
    direction: 'outbound' as const,
    amount,
    currency: (input.currency || 'INR').toUpperCase().slice(0, 3),
    method: input.method?.trim() || null,
    reference: input.reference?.trim() || null,
    linkedEntityType: CANCELLATION_REFUND_LINKED_ENTITY,
    linkedEntityId: input.cancellationCaseId,
    tripId: input.tripId,
    commercialDocumentId: input.creditNoteId,
    notes: `Refund settlement · cancellation ${suffix}`,
  };
}

export function commercialDocumentPaidStateFromNote(
  note: CreditNoteForRefundSettle,
  amountPaid: number,
) {
  return commercialDocumentPaidState({
    amount: Number(note.amount),
    taxAmount: Number(note.taxAmount || 0),
    amountPaid,
  });
}

export function parseCancellationRefundEval(evalJson: unknown): {
  creditNoteId: string | null;
  refundPaymentId: string | null;
  refundSettledAmount: number | null;
} {
  const o =
    evalJson && typeof evalJson === 'object' && !Array.isArray(evalJson)
      ? (evalJson as Record<string, unknown>)
      : {};
  return {
    creditNoteId:
      typeof o.creditNoteId === 'string' ? o.creditNoteId : null,
    refundPaymentId:
      typeof o.refundPaymentId === 'string' ? o.refundPaymentId : null,
    refundSettledAmount:
      typeof o.refundSettledAmount === 'number' ? o.refundSettledAmount : null,
  };
}
