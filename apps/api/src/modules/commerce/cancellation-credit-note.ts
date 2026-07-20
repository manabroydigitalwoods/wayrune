import type { Prisma } from '@prisma/client';

/** When apply succeeds and policy expects a guest refund, draft an open credit note. */
export function cancellationApplyCreditNotePlan(input: {
  expectedRefund: number | string | null | undefined;
  applyFailed: number;
}): { amount: number } | null {
  const amount = Number(input.expectedRefund ?? 0);
  if (!(amount > 0) || input.applyFailed > 0) return null;
  return { amount };
}

export type ReceivableForCreditAllocation = {
  id: string;
  amount: number;
  taxAmount: number;
  status: string;
  allocated: number;
  creditNoteTotal: number;
};

export function receivableOutstanding(
  receivable: ReceivableForCreditAllocation,
): number {
  const total = receivable.amount + receivable.taxAmount;
  const net = total - receivable.creditNoteTotal - receivable.allocated;
  return Math.max(0, Math.round(net * 100) / 100);
}

/** Pick the receivable with the largest outstanding balance (cap refund to that). */
export function pickCancellationCreditNoteReceivableTarget(
  receivables: ReceivableForCreditAllocation[],
  refundAmount: number,
): { documentId: string; allocateAmount: number } | null {
  if (!(refundAmount > 0)) return null;
  const candidates = receivables
    .filter((r) => r.status !== 'cancelled' && r.status !== 'void')
    .map((r) => ({ id: r.id, outstanding: receivableOutstanding(r) }))
    .filter((c) => c.outstanding > 0.001)
    .sort((a, b) => b.outstanding - a.outstanding);
  if (!candidates.length) return null;
  const target = candidates[0]!;
  const allocateAmount = Math.min(
    refundAmount,
    target.outstanding,
  );
  return {
    documentId: target.id,
    allocateAmount: Math.round(allocateAmount * 100) / 100,
  };
}

export function cancellationCreditNoteAlreadyAllocated(note: {
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
}): boolean {
  return (
    note.linkedEntityType === 'commercial_document' &&
    Boolean(note.linkedEntityId?.trim())
  );
}

export function composeCancellationCreditNoteAllocateUpdate(input: {
  cancellationCaseId: string;
  target: { documentId: string; allocateAmount: number };
}): {
  linkedEntityType: 'commercial_document';
  linkedEntityId: string;
  amount: number;
  notes: string;
} {
  const suffix = input.cancellationCaseId.slice(-8).toUpperCase();
  return {
    linkedEntityType: 'commercial_document',
    linkedEntityId: input.target.documentId,
    amount: input.target.allocateAmount,
    notes: `Credit note from cancellation ${suffix} — allocated to receivable`,
  };
}

export async function loadTripReceivablesForCreditAllocation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tripId: string,
): Promise<ReceivableForCreditAllocation[]> {
  const docs = await tx.commercialDocument.findMany({
    where: {
      organizationId,
      tripId,
      direction: 'receivable',
      docType: 'invoice',
      status: { notIn: ['cancelled', 'void'] },
    },
    include: { allocations: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!docs.length) return [];

  const docIds = docs.map((d) => d.id);
  const linkedCredits = await tx.commercialDocument.findMany({
    where: {
      organizationId,
      docType: 'credit_note',
      linkedEntityType: 'commercial_document',
      linkedEntityId: { in: docIds },
      status: { notIn: ['cancelled', 'void'] },
    },
    select: { linkedEntityId: true, amount: true, taxAmount: true },
  });
  const creditByDoc = new Map<string, number>();
  for (const cn of linkedCredits) {
    if (!cn.linkedEntityId) continue;
    creditByDoc.set(
      cn.linkedEntityId,
      (creditByDoc.get(cn.linkedEntityId) ?? 0) +
        Number(cn.amount) +
        Number(cn.taxAmount),
    );
  }

  return docs.map((d) => ({
    id: d.id,
    amount: Number(d.amount),
    taxAmount: Number(d.taxAmount),
    status: d.status,
    allocated: d.allocations.reduce((s, a) => s + Number(a.amount), 0),
    creditNoteTotal: creditByDoc.get(d.id) ?? 0,
  }));
}
