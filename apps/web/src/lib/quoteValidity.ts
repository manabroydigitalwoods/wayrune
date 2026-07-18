/** Default quotation validity window when org has no override. */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7;

export function quoteValidityDaysFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_QUOTE_VALIDITY_DAYS;
  }
  const raw = (settings as Record<string, unknown>).defaultQuoteValidityDays;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 365) return DEFAULT_QUOTE_VALIDITY_DAYS;
  return Math.floor(n);
}

/** YYYY-MM-DD in local calendar. */
export function defaultValidUntilIso(days = DEFAULT_QUOTE_VALIDITY_DAYS, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatValidUntilDisplay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const VALIDITY_LINE =
  /^(valid\s+for\s+\d+\s+days?|valid\s+until\b.*)$/i;

/**
 * Keep proposal terms aligned with structured validUntil.
 * Replaces free-text “Valid for N days” / “Valid until …” with the calculated date.
 */
export function syncTermsWithValidUntil(terms: string, validUntil: string): string {
  const lines = terms
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() === '' || !VALIDITY_LINE.test(l.trim()));
  const cleaned = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!validUntil.trim()) return cleaned;
  const line = `Valid until ${formatValidUntilDisplay(validUntil.trim())}`;
  return cleaned ? `${cleaned}\n${line}` : line;
}
