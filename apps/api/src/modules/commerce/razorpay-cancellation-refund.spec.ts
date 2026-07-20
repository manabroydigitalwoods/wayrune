import { describe, expect, it } from 'vitest';
import {
  assertMockRazorpayRefundAllowed,
  looksLikeRazorpayPaymentId,
  mockRazorpayRefundReference,
  parseCancellationRefundSettleMode,
  pickRazorpaySourcePaymentId,
  resolveCancellationRefundSettleAmount,
} from './razorpay-cancellation-refund';

describe('resolveCancellationRefundSettleAmount', () => {
  it('defaults to full due', () => {
    expect(resolveCancellationRefundSettleAmount({ refundDue: 1500 })).toBe(1500);
  });

  it('caps partial amount to due', () => {
    expect(
      resolveCancellationRefundSettleAmount({ refundDue: 1500, amount: 500 }),
    ).toBe(500);
  });

  it('rejects over due', () => {
    expect(() =>
      resolveCancellationRefundSettleAmount({ refundDue: 100, amount: 101 }),
    ).toThrow(/exceeds outstanding due/);
  });
});

describe('pickRazorpaySourcePaymentId', () => {
  it('picks newest pay_ reference', () => {
    expect(
      pickRazorpaySourcePaymentId([
        { reference: 'pay_old', paidAt: '2026-01-01' },
        { reference: 'UTR', paidAt: '2026-06-01' },
        { reference: 'pay_new', paidAt: '2026-07-01' },
      ]),
    ).toBe('pay_new');
  });

  it('returns null when none', () => {
    expect(pickRazorpaySourcePaymentId([{ reference: 'neft' }])).toBeNull();
  });
});

describe('looksLikeRazorpayPaymentId', () => {
  it('accepts pay_ ids', () => {
    expect(looksLikeRazorpayPaymentId('pay_Abc123')).toBe(true);
    expect(looksLikeRazorpayPaymentId('rfnd_x')).toBe(false);
  });
});

describe('parseCancellationRefundSettleMode', () => {
  it('defaults to manual', () => {
    expect(parseCancellationRefundSettleMode(undefined)).toBe('manual');
    expect(parseCancellationRefundSettleMode('razorpay')).toBe('razorpay');
    expect(parseCancellationRefundSettleMode('mock_razorpay')).toBe(
      'mock_razorpay',
    );
  });
});

describe('mock gates', () => {
  it('blocks mock outside local', () => {
    expect(() =>
      assertMockRazorpayRefundAllowed({ APP_ENV: 'production' }),
    ).toThrow(/local/);
  });

  it('allows mock in local', () => {
    expect(() =>
      assertMockRazorpayRefundAllowed({ APP_ENV: 'local' }),
    ).not.toThrow();
  });

  it('builds mock reference', () => {
    expect(mockRazorpayRefundReference('cancel_case_abc12345')).toBe(
      'mock_rfnd_abc12345',
    );
  });
});
