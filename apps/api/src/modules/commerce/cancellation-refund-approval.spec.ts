import { describe, expect, it } from 'vitest';
import {
  assertCanApproveRefund,
  assertCanRequestRefund,
  assertRefundApprovedForSettle,
  parseRefundApproval,
  planApproveRefundStamp,
  planRequestRefundStamp,
} from './cancellation-refund-approval';

describe('parseRefundApproval', () => {
  it('defaults to none', () => {
    expect(parseRefundApproval(null).refundApprovalStatus).toBe('none');
    expect(parseRefundApproval({}).refundApprovalStatus).toBe('none');
  });

  it('reads stamps', () => {
    expect(
      parseRefundApproval({
        refundApprovalStatus: 'awaiting_approval',
        refundRequestedAmount: 1200,
        refundRequestReason: 'Guest cancelled',
        refundRequestedBy: 'u1',
        refundRequestedAt: '2026-07-20T10:00:00.000Z',
      }),
    ).toMatchObject({
      refundApprovalStatus: 'awaiting_approval',
      refundRequestedAmount: 1200,
      refundRequestReason: 'Guest cancelled',
      refundRequestedBy: 'u1',
    });
  });
});

describe('request → approve → settle transitions', () => {
  it('requests from none when applied with due', () => {
    expect(() =>
      assertCanRequestRefund({
        executionStatus: 'applied',
        refundDue: 500,
        refundApprovalStatus: 'none',
      }),
    ).not.toThrow();
    const stamp = planRequestRefundStamp({
      priorEval: { creditNoteId: 'cn-1' },
      amount: 500,
      reason: 'Policy refund',
      userId: 'req-1',
      at: new Date('2026-07-20T12:00:00.000Z'),
    });
    expect(stamp).toMatchObject({
      creditNoteId: 'cn-1',
      refundApprovalStatus: 'awaiting_approval',
      refundRequestedAmount: 500,
      refundRequestedBy: 'req-1',
      refundApprovedBy: null,
    });
  });

  it('rejects request when not applied or already pending', () => {
    expect(() =>
      assertCanRequestRefund({
        executionStatus: 'draft',
        refundDue: 100,
        refundApprovalStatus: 'none',
      }),
    ).toThrow(/applied/);
    expect(() =>
      assertCanRequestRefund({
        executionStatus: 'applied',
        refundDue: 100,
        refundApprovalStatus: 'awaiting_approval',
      }),
    ).toThrow(/awaiting/);
  });

  it('approves only from awaiting_approval', () => {
    expect(() =>
      assertCanApproveRefund({
        refundApprovalStatus: 'none',
        refundRequestedAmount: 100,
      }),
    ).toThrow(/awaiting/);
    assertCanApproveRefund({
      refundApprovalStatus: 'awaiting_approval',
      refundRequestedAmount: 100,
    });
    const stamp = planApproveRefundStamp({
      priorEval: {
        refundApprovalStatus: 'awaiting_approval',
        refundRequestedAmount: 100,
      },
      userId: 'appr-1',
      at: new Date('2026-07-20T13:00:00.000Z'),
    });
    expect(stamp.refundApprovalStatus).toBe('approved');
    expect(stamp.refundApprovedBy).toBe('appr-1');
  });

  it('gates settle on approved + fingerprint ceiling', () => {
    expect(() =>
      assertRefundApprovedForSettle({
        refundApprovalStatus: 'awaiting_approval',
        refundRequestedAmount: 100,
        settleAmount: 100,
      }),
    ).toThrow(/approved/);
    expect(() =>
      assertRefundApprovedForSettle({
        refundApprovalStatus: 'approved',
        refundRequestedAmount: 100,
        settleAmount: 120,
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      assertRefundApprovedForSettle({
        refundApprovalStatus: 'approved',
        refundRequestedAmount: 100,
        settleAmount: 80,
      }),
    ).not.toThrow();
    expect(() =>
      assertRefundApprovedForSettle({
        refundApprovalStatus: 'approved',
        refundRequestedAmount: 100,
        settleAmount: 100,
      }),
    ).not.toThrow();
  });
});
