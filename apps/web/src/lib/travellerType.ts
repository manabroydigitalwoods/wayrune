/** Normalize trip traveller type for edit/create sheets. */
export function normalizeTravellerType(
  raw: string | null | undefined,
): 'adult' | 'child' | 'infant' {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'child' || t === 'infant') return t;
  return 'adult';
}
