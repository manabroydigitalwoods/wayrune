/** Razorpay outbound refund helpers (cancellation settle path). */

import { allowMockTripPayments, outstandingToPaise } from '../operations/payment-link-checkout';

export type CancellationRefundSettleMode = 'manual' | 'razorpay' | 'mock_razorpay';

export function parseCancellationRefundSettleMode(
  raw: unknown,
): CancellationRefundSettleMode {
  if (raw === 'razorpay' || raw === 'mock_razorpay') return raw;
  return 'manual';
}

/** Cap optional settle amount to refund due (full due when omitted). */
export function resolveCancellationRefundSettleAmount(opts: {
  refundDue: number;
  amount?: number | null;
}): number {
  const due = Math.round(Math.max(0, Number(opts.refundDue) || 0) * 100) / 100;
  if (due <= 0) return 0;
  if (opts.amount == null || !Number.isFinite(Number(opts.amount))) {
    return due;
  }
  const asked = Math.round(Number(opts.amount) * 100) / 100;
  if (asked <= 0) {
    throw new Error('Refund amount must be positive');
  }
  if (asked > due + 0.001) {
    throw new Error(
      `Refund amount ${asked} exceeds outstanding due ${due}`,
    );
  }
  return Math.min(asked, due);
}

export function looksLikeRazorpayPaymentId(ref: string | null | undefined): boolean {
  const t = ref?.trim() || '';
  return /^pay_[A-Za-z0-9]+$/.test(t);
}

/** Prefer newest paid customer TripPayment with a Razorpay pay_… reference. */
export function pickRazorpaySourcePaymentId(
  rows: Array<{ reference?: string | null; paidAt?: Date | string | null }>,
): string | null {
  const candidates = rows
    .map((r) => ({
      id: r.reference?.trim() || '',
      at: r.paidAt ? new Date(r.paidAt).getTime() : 0,
    }))
    .filter((r) => looksLikeRazorpayPaymentId(r.id))
    .sort((a, b) => b.at - a.at);
  return candidates[0]?.id || null;
}

export function mockRazorpayRefundReference(cancellationCaseId: string): string {
  const suffix = cancellationCaseId.slice(-8).toLowerCase();
  return `mock_rfnd_${suffix}`;
}

export async function createRazorpayPaymentRefund(opts: {
  paymentId: string;
  amountInr: number;
  keyId: string;
  keySecret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ refundId: string }> {
  const paise = outstandingToPaise(opts.amountInr);
  if (paise <= 0) {
    throw new Error('Refund amount must be positive');
  }
  const auth = Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString('base64');
  const fetchFn = opts.fetchImpl || fetch;
  const res = await fetchFn(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(opts.paymentId)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: paise }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { description?: string };
  };
  if (!res.ok || !body.id) {
    throw new Error(
      body.error?.description ||
        `Razorpay refund failed (${res.status})`,
    );
  }
  return { refundId: body.id };
}

export function assertMockRazorpayRefundAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!allowMockTripPayments(env)) {
    throw new Error(
      'Mock Razorpay refunds are only allowed in local / ALLOW_MOCK_PAYMENTS',
    );
  }
}
