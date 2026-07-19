/** Payment-link checkout guards (mock allow + Razorpay order binding). */

export function allowMockTripPayments(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_MOCK_PAYMENTS === '1' || env.ALLOW_MOCK_PAYMENTS === 'true') {
    return true;
  }
  return env.APP_ENV === 'local';
}

export function outstandingToPaise(outstanding: number): number {
  return Math.round(Math.max(0, outstanding) * 100);
}

export function assertRazorpayOrderBound(input: {
  storedOrderId: string | null | undefined;
  storedAmountPaise: number | null | undefined;
  confirmOrderId: string;
  currentOutstandingPaise: number;
}): void {
  if (!input.storedOrderId?.trim()) {
    throw new Error(
      'No Razorpay order on this instalment — start checkout again from the payment link',
    );
  }
  if (input.storedOrderId.trim() !== input.confirmOrderId.trim()) {
    throw new Error(
      'Payment order does not match this instalment — start checkout again from the payment link',
    );
  }
  if (
    input.storedAmountPaise == null ||
    !Number.isFinite(input.storedAmountPaise) ||
    input.storedAmountPaise <= 0
  ) {
    throw new Error('Payment order amount is missing — start checkout again');
  }
  if (input.storedAmountPaise !== input.currentOutstandingPaise) {
    throw new Error(
      'Instalment amount changed after checkout started — ask for a fresh payment link',
    );
  }
}
