import { describe, expect, it } from 'vitest';
import { cancellationApplyCreditNotePlan } from './cancellation-credit-note';

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
