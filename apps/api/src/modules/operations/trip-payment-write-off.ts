/** Dual-control write-off stamps on TripPayment.notes (no schema migration). */

export type WriteOffApprovalStatus = 'none' | 'awaiting_approval' | 'approved';

export type TripPaymentWriteOff = {
  status: WriteOffApprovalStatus;
  amount: number;
  reason: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

const MARKER_RE = /\n?⟦wo:v1⟧([\s\S]*?)⟦\/wo⟧/;

const EMPTY: TripPaymentWriteOff = {
  status: 'none',
  amount: 0,
  reason: null,
  requestedBy: null,
  requestedAt: null,
  approvedBy: null,
  approvedAt: null,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human notes without the machine write-off marker. */
export function stripTripPaymentWriteOffMarker(
  notes: string | null | undefined,
): string {
  const raw = notes || '';
  return raw.replace(MARKER_RE, '').trimEnd();
}

export function parseTripPaymentWriteOff(
  notes: string | null | undefined,
): TripPaymentWriteOff {
  const raw = notes || '';
  const m = raw.match(MARKER_RE);
  if (!m?.[1]) return { ...EMPTY };
  try {
    const o = JSON.parse(m[1]!) as Record<string, unknown>;
    const statusRaw = o.status;
    const status: WriteOffApprovalStatus =
      statusRaw === 'awaiting_approval' || statusRaw === 'approved'
        ? statusRaw
        : 'none';
    const amount = round2(Number(o.amount));
    return {
      status,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      reason: typeof o.reason === 'string' ? o.reason : null,
      requestedBy: typeof o.requestedBy === 'string' ? o.requestedBy : null,
      requestedAt: typeof o.requestedAt === 'string' ? o.requestedAt : null,
      approvedBy: typeof o.approvedBy === 'string' ? o.approvedBy : null,
      approvedAt: typeof o.approvedAt === 'string' ? o.approvedAt : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function encodeTripPaymentWriteOffNotes(
  humanNotes: string | null | undefined,
  wo: TripPaymentWriteOff,
): string | null {
  const human = stripTripPaymentWriteOffMarker(humanNotes).trim();
  if (wo.status === 'none' || !(wo.amount > 0)) {
    return human || null;
  }
  const payload = JSON.stringify({
    status: wo.status,
    amount: wo.amount,
    reason: wo.reason,
    requestedBy: wo.requestedBy,
    requestedAt: wo.requestedAt,
    approvedBy: wo.approvedBy,
    approvedAt: wo.approvedAt,
  });
  const marker = `⟦wo:v1⟧${payload}⟦/wo⟧`;
  return human ? `${human}\n${marker}` : marker;
}

/** Outstanding after cash paid and approved write-off. */
export function tripPaymentOutstanding(opts: {
  amount: number;
  amountPaid: number;
  notes?: string | null;
}): number {
  const wo = parseTripPaymentWriteOff(opts.notes);
  const writeOff =
    wo.status === 'approved' && wo.amount > 0 ? wo.amount : 0;
  return Math.max(0, round2(opts.amount - opts.amountPaid - writeOff));
}

export function assertCanRequestWriteOff(input: {
  direction: string;
  status: string;
  outstanding: number;
  writeOffStatus: WriteOffApprovalStatus;
}): void {
  if (input.direction !== 'customer') {
    throw new Error('Write-off applies to customer receivables only');
  }
  if (input.status === 'cancelled' || input.status === 'paid') {
    throw new Error('Payment is already closed');
  }
  if (input.outstanding <= 0.001) {
    throw new Error('No outstanding balance to write off');
  }
  if (input.writeOffStatus === 'awaiting_approval') {
    throw new Error('Write-off already awaiting approval');
  }
  if (input.writeOffStatus === 'approved') {
    throw new Error('Write-off already approved');
  }
}

export function planRequestWriteOff(input: {
  notes: string | null | undefined;
  amount: number;
  reason: string;
  userId: string;
  at?: Date;
}): { notes: string; amount: number } {
  const amount = round2(Number(input.amount));
  if (!(amount > 0)) throw new Error('Write-off amount must be positive');
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Write-off reason is required');
  const at = (input.at ?? new Date()).toISOString();
  const notes = encodeTripPaymentWriteOffNotes(input.notes, {
    status: 'awaiting_approval',
    amount,
    reason,
    requestedBy: input.userId,
    requestedAt: at,
    approvedBy: null,
    approvedAt: null,
  });
  return { notes: notes || '', amount };
}

export function planApproveWriteOff(input: {
  notes: string | null | undefined;
  userId: string;
  at?: Date;
}): { notes: string; amount: number } {
  const prior = parseTripPaymentWriteOff(input.notes);
  if (prior.status !== 'awaiting_approval' || !(prior.amount > 0)) {
    throw new Error('No write-off awaiting approval');
  }
  if (prior.requestedBy && prior.requestedBy === input.userId) {
    throw new Error('Requester cannot approve their own write-off');
  }
  const at = (input.at ?? new Date()).toISOString();
  const notes = encodeTripPaymentWriteOffNotes(input.notes, {
    ...prior,
    status: 'approved',
    approvedBy: input.userId,
    approvedAt: at,
  });
  return { notes: notes || '', amount: prior.amount };
}
