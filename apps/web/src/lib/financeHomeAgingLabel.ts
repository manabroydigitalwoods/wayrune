/** Finance home aging StatCard labels (dominant-currency honesty). */

export function agingHomeStatLabel(
  base: string,
  otherCurrencyCount?: number | null,
): string {
  const n = otherCurrencyCount ?? 0;
  if (n <= 0) return base;
  return `${base} · ${n} FX excl.`;
}
