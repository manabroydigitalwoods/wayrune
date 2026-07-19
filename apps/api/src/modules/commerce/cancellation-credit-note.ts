/** When apply succeeds and policy expects a guest refund, draft an open credit note. */
export function cancellationApplyCreditNotePlan(input: {
  expectedRefund: number | string | null | undefined;
  applyFailed: number;
}): { amount: number } | null {
  const amount = Number(input.expectedRefund ?? 0);
  if (!(amount > 0) || input.applyFailed > 0) return null;
  return { amount };
}
