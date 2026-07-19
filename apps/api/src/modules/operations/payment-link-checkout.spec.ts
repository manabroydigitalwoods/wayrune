import { describe, expect, it } from 'vitest';
import {
  allowMockTripPayments,
  assertRazorpayOrderBound,
  outstandingToPaise,
} from './payment-link-checkout';

describe('payment-link-checkout', () => {
  it('allows mock only in local or when ALLOW_MOCK_PAYMENTS', () => {
    expect(allowMockTripPayments({ APP_ENV: 'local' })).toBe(true);
    expect(allowMockTripPayments({ APP_ENV: 'production' })).toBe(false);
    expect(
      allowMockTripPayments({
        APP_ENV: 'production',
        ALLOW_MOCK_PAYMENTS: '1',
      }),
    ).toBe(true);
    expect(
      allowMockTripPayments({
        APP_ENV: 'staging',
        NODE_ENV: 'production',
      }),
    ).toBe(false);
  });

  it('binds confirm order to stored intent', () => {
    expect(() =>
      assertRazorpayOrderBound({
        storedOrderId: 'order_a',
        storedAmountPaise: 10000,
        confirmOrderId: 'order_a',
        currentOutstandingPaise: 10000,
      }),
    ).not.toThrow();

    expect(() =>
      assertRazorpayOrderBound({
        storedOrderId: 'order_a',
        storedAmountPaise: 10000,
        confirmOrderId: 'order_b',
        currentOutstandingPaise: 10000,
      }),
    ).toThrow(/does not match/);

    expect(() =>
      assertRazorpayOrderBound({
        storedOrderId: 'order_a',
        storedAmountPaise: 10000,
        confirmOrderId: 'order_a',
        currentOutstandingPaise: 5000,
      }),
    ).toThrow(/amount changed/);

    expect(() =>
      assertRazorpayOrderBound({
        storedOrderId: null,
        storedAmountPaise: null,
        confirmOrderId: 'order_a',
        currentOutstandingPaise: 10000,
      }),
    ).toThrow(/No Razorpay order/);
  });

  it('rounds outstanding to paise', () => {
    expect(outstandingToPaise(100.5)).toBe(10050);
    expect(outstandingToPaise(0)).toBe(0);
  });
});
