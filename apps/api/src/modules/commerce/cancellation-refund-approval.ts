/** Dual-control stamps on cancellation `evaluationJson` before refund settle. */

export type RefundApprovalStatus = 'none' | 'awaiting_approval' | 'approved';

export type RefundApprovalFields = {
  refundApprovalStatus: RefundApprovalStatus;
  refundRequestedAmount: number | null;
  refundRequestReason: string | null;
  refundRequestedBy: string | null;
  refundRequestedAt: string | null;
  refundApprovedBy: string | null;
  refundApprovedAt: string | null;
};

const STATUSES = new Set<RefundApprovalStatus>([
  'none',
  'awaiting_approval',
  'approved',
]);

export function parseRefundApproval(
  evalJson: unknown,
): RefundApprovalFields {
  const o =
    evalJson && typeof evalJson === 'object' && !Array.isArray(evalJson)
      ? (evalJson as Record<string, unknown>)
      : {};
  const raw = o.refundApprovalStatus;
  const status: RefundApprovalStatus =
    typeof raw === 'string' && STATUSES.has(raw as RefundApprovalStatus)
      ? (raw as RefundApprovalStatus)
      : 'none';
  return {
    refundApprovalStatus: status,
    refundRequestedAmount:
      typeof o.refundRequestedAmount === 'number'
        ? o.refundRequestedAmount
        : null,
    refundRequestReason:
      typeof o.refundRequestReason === 'string' ? o.refundRequestReason : null,
    refundRequestedBy:
      typeof o.refundRequestedBy === 'string' ? o.refundRequestedBy : null,
    refundRequestedAt:
      typeof o.refundRequestedAt === 'string' ? o.refundRequestedAt : null,
    refundApprovedBy:
      typeof o.refundApprovedBy === 'string' ? o.refundApprovedBy : null,
    refundApprovedAt:
      typeof o.refundApprovedAt === 'string' ? o.refundApprovedAt : null,
  };
}

export function assertCanRequestRefund(input: {
  executionStatus: string;
  refundDue: number;
  refundApprovalStatus: RefundApprovalStatus;
}): void {
  if (input.executionStatus !== 'applied') {
    throw new Error(
      'Cancellation case must be applied before requesting a refund',
    );
  }
  if (input.refundDue <= 0.001) {
    throw new Error('No refund due to request');
  }
  if (input.refundApprovalStatus === 'awaiting_approval') {
    throw new Error('Refund already awaiting approval');
  }
  if (input.refundApprovalStatus === 'approved') {
    throw new Error('Refund already approved — settle or re-open via ops');
  }
}

export function planRequestRefundStamp(input: {
  priorEval: Record<string, unknown>;
  amount: number;
  reason: string;
  userId: string;
  at?: Date;
}): Record<string, unknown> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const reason = input.reason.trim();
  if (!(amount > 0)) throw new Error('Refund request amount must be positive');
  if (!reason) throw new Error('Refund request reason is required');
  const at = (input.at ?? new Date()).toISOString();
  return {
    ...input.priorEval,
    refundApprovalStatus: 'awaiting_approval' satisfies RefundApprovalStatus,
    refundRequestedAmount: amount,
    refundRequestReason: reason.slice(0, 500),
    refundRequestedBy: input.userId,
    refundRequestedAt: at,
    refundApprovedBy: null,
    refundApprovedAt: null,
  };
}

export function assertCanApproveRefund(input: {
  refundApprovalStatus: RefundApprovalStatus;
  refundRequestedAmount: number | null;
}): void {
  if (input.refundApprovalStatus !== 'awaiting_approval') {
    throw new Error('Refund is not awaiting approval');
  }
  if (
    input.refundRequestedAmount == null ||
    !(input.refundRequestedAmount > 0)
  ) {
    throw new Error('Refund request is missing amount fingerprint');
  }
}

export function planApproveRefundStamp(input: {
  priorEval: Record<string, unknown>;
  userId: string;
  at?: Date;
}): Record<string, unknown> {
  const at = (input.at ?? new Date()).toISOString();
  return {
    ...input.priorEval,
    refundApprovalStatus: 'approved' satisfies RefundApprovalStatus,
    refundApprovedBy: input.userId,
    refundApprovedAt: at,
  };
}

/** Fail-closed settle gate: must be approved; settle amount ≤ request fingerprint. */
export function assertRefundApprovedForSettle(input: {
  refundApprovalStatus: RefundApprovalStatus;
  refundRequestedAmount: number | null;
  settleAmount: number;
}): void {
  if (input.refundApprovalStatus !== 'approved') {
    throw new Error(
      'Refund must be approved before settlement (request → approve → settle)',
    );
  }
  const finger = input.refundRequestedAmount;
  if (finger == null || !(finger > 0)) {
    throw new Error('Approved refund is missing amount fingerprint');
  }
  const settle = Math.round(Number(input.settleAmount) * 100) / 100;
  if (!(settle > 0)) {
    throw new Error('Settle amount must be positive');
  }
  if (settle - finger > 0.001) {
    throw new Error(
      `Settle amount ${settle} exceeds approved request ${finger}`,
    );
  }
}
