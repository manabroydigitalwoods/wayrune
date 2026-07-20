/** Client parse of TripPayment write-off notes marker (mirrors API). */

export type TripPaymentWriteOffStatus =
  | 'none'
  | 'awaiting_approval'
  | 'approved';

export type TripPaymentWriteOffCue = {
  status: TripPaymentWriteOffStatus;
  amount: number;
  reason: string | null;
};

const MARKER_RE = /\n?⟦wo:v1⟧([\s\S]*?)⟦\/wo⟧/;

export function parseTripPaymentWriteOffNotes(
  notes: string | null | undefined,
): TripPaymentWriteOffCue {
  const m = (notes || '').match(MARKER_RE);
  if (!m?.[1]) return { status: 'none', amount: 0, reason: null };
  try {
    const o = JSON.parse(m[1]!) as Record<string, unknown>;
    const status =
      o.status === 'awaiting_approval' || o.status === 'approved'
        ? o.status
        : 'none';
    const amount = Math.round(Number(o.amount) * 100) / 100;
    return {
      status,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      reason: typeof o.reason === 'string' ? o.reason : null,
    };
  } catch {
    return { status: 'none', amount: 0, reason: null };
  }
}

export function tripPaymentOutstandingUi(opts: {
  amount: number;
  amountPaid: number;
  notes?: string | null;
}): number {
  const wo = parseTripPaymentWriteOffNotes(opts.notes);
  const writeOff =
    wo.status === 'approved' && wo.amount > 0 ? wo.amount : 0;
  return Math.max(
    0,
    Math.round((opts.amount - opts.amountPaid - writeOff) * 100) / 100,
  );
}
