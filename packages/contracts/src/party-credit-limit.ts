/** B2B party credit limit vs org-wide customer receivable exposure. */

export type PartyCreditLimitEvaluation = {
  limited: boolean;
  creditLimit: number | null;
  outstanding: number;
  exposure: number;
  headroom: number | null;
  overLimit: boolean;
  overBy: number;
};

export function paymentOutstandingAmount(
  amount: number | string | { toString(): string },
  amountPaid: number | string | { toString(): string },
): number {
  const total = Number(amount);
  const paid = Number(amountPaid);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

export function evaluatePartyCreditLimit(input: {
  creditLimit: number | null | undefined;
  outstanding: number;
  pendingAmount?: number;
}): PartyCreditLimitEvaluation {
  const outstanding = Math.max(
    0,
    Math.round(Number(input.outstanding) * 100) / 100,
  );
  const pending = Math.max(0, Math.round(Number(input.pendingAmount || 0) * 100) / 100);
  const exposure = Math.round((outstanding + pending) * 100) / 100;
  const rawLimit = Number(input.creditLimit);
  const creditLimit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.round(rawLimit * 100) / 100
      : null;
  const limited = creditLimit != null;
  const headroom =
    limited != null && creditLimit != null
      ? Math.max(0, Math.round((creditLimit - exposure) * 100) / 100)
      : null;
  const overBy =
    limited && creditLimit != null
      ? Math.max(0, Math.round((exposure - creditLimit) * 100) / 100)
      : 0;
  return {
    limited,
    creditLimit,
    outstanding,
    exposure,
    headroom,
    overLimit: limited && overBy > 0.001,
    overBy,
  };
}

export function partyCreditLimitBlockMessage(
  status: Pick<PartyCreditLimitEvaluation, 'creditLimit' | 'exposure' | 'overBy'>,
  currency = 'INR',
): string {
  const limit = status.creditLimit ?? 0;
  return `Customer credit limit exceeded: exposure ${status.exposure.toFixed(2)} ${currency} vs limit ${limit.toFixed(2)} ${currency} (over by ${status.overBy.toFixed(2)}). Manager override required.`;
}

export function partyCreditLimitCue(
  status: PartyCreditLimitEvaluation,
  currency = 'INR',
): string | null {
  if (!status.limited || status.creditLimit == null) return null;
  if (status.overLimit) {
    return `Over credit limit by ${formatMoney(status.overBy, currency)} (${formatMoney(status.exposure, currency)} of ${formatMoney(status.creditLimit, currency)})`;
  }
  return `Credit headroom ${formatMoney(status.headroom ?? 0, currency)} (${formatMoney(status.outstanding, currency)} outstanding of ${formatMoney(status.creditLimit, currency)})`;
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  if (currency === 'INR') {
    return `₹${rounded.toLocaleString('en-IN')}`;
  }
  return `${rounded.toLocaleString('en-IN')} ${currency}`;
}
