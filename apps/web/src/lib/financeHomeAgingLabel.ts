/** Finance home aging / portfolio StatCard labels. */

export function agingHomeStatLabel(
  base: string,
  otherCurrencyCount?: number | null,
  convertedTripCount?: number | null,
): string {
  const excl = otherCurrencyCount ?? 0;
  const converted = convertedTripCount ?? 0;
  const parts = [base];
  if (converted > 0) parts.push(`${converted} FX conv.`);
  if (excl > 0) parts.push(`${excl} FX excl.`);
  if (parts.length === 1) return base;
  return parts.join(' · ');
}
