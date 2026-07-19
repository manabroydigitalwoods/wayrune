/** Default quotation validity window when org has no override. */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7;

/** Default post-expiry grace before send auto-extends (hours). */
export const DEFAULT_QUOTE_VALIDITY_GRACE_HOURS = 24;

export function quoteValidityDaysFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_QUOTE_VALIDITY_DAYS;
  }
  const raw = (settings as Record<string, unknown>).defaultQuoteValidityDays;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 365) return DEFAULT_QUOTE_VALIDITY_DAYS;
  return Math.floor(n);
}

/** 0–72; omit → 24. */
export function quoteValidityGraceHoursFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_QUOTE_VALIDITY_GRACE_HOURS;
  }
  if (!('quoteValidityGraceHours' in (settings as object))) {
    return DEFAULT_QUOTE_VALIDITY_GRACE_HOURS;
  }
  const raw = (settings as Record<string, unknown>).quoteValidityGraceHours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 72) return DEFAULT_QUOTE_VALIDITY_GRACE_HOURS;
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

/** True when validUntil calendar day is strictly before today's local calendar day. */
export function isQuoteValidUntilExpired(
  validUntil: string | Date | null | undefined,
  today = new Date(),
): boolean {
  if (validUntil == null || validUntil === '') return false;
  const iso =
    validUntil instanceof Date
      ? `${validUntil.getFullYear()}-${String(validUntil.getMonth() + 1).padStart(2, '0')}-${String(validUntil.getDate()).padStart(2, '0')}`
      : String(validUntil).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayIso;
}

function validUntilIsoDay(
  validUntil: string | Date | null | undefined,
): string | null {
  if (validUntil == null || validUntil === '') return null;
  const iso =
    validUntil instanceof Date
      ? `${validUntil.getFullYear()}-${String(validUntil.getMonth() + 1).padStart(2, '0')}-${String(validUntil.getDate()).padStart(2, '0')}`
      : String(validUntil).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Whole local calendar days from today until validUntil (0 = expires today). Null if missing/invalid/expired. */
export function quoteValidUntilDaysRemaining(
  validUntil: string | Date | null | undefined,
  today = new Date(),
): number | null {
  const iso = validUntilIsoDay(validUntil);
  if (!iso) return null;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (iso < todayIso) return null;
  const end = new Date(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Soft near-expiry window (not expired). Default: today + next 2 calendar days. */
export function isQuoteValidUntilNearExpiry(
  validUntil: string | Date | null | undefined,
  opts?: { withinDays?: number; today?: Date },
): boolean {
  const withinDays = Math.max(0, opts?.withinDays ?? 2);
  const remaining = quoteValidUntilDaysRemaining(validUntil, opts?.today ?? new Date());
  return remaining != null && remaining <= withinDays;
}

export function quoteNearExpiryToastMessage(
  validUntil: string | Date | null | undefined,
  today = new Date(),
): string | null {
  const remaining = quoteValidUntilDaysRemaining(validUntil, today);
  if (remaining == null || remaining > 2) return null;
  if (remaining === 0) {
    return 'Quote expires today — check Extend on send to refresh';
  }
  return `Quote expires in ${remaining} day${remaining === 1 ? '' : 's'} — check Extend on send to refresh`;
}

/**
 * Expired calendar day, but still within graceHours after local start of the day
 * after validUntil. graceHours ≤ 0 → never in grace.
 */
export function isQuoteWithinPostExpiryGrace(
  validUntil: string | Date | null | undefined,
  graceHours: number,
  now = new Date(),
): boolean {
  if (!Number.isFinite(graceHours) || graceHours <= 0) return false;
  if (!isQuoteValidUntilExpired(validUntil, now)) return false;
  const iso = validUntilIsoDay(validUntil);
  if (!iso) return false;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  const expiryStart = new Date(y, m, d + 1, 0, 0, 0, 0);
  const ms = now.getTime() - expiryStart.getTime();
  return ms >= 0 && ms <= graceHours * 3_600_000;
}

export function quoteExpiredGraceCue(
  validUntil: string | Date | null | undefined,
  settings: unknown,
  now = new Date(),
): string | null {
  const hours = quoteValidityGraceHoursFromSettings(settings);
  if (!isQuoteWithinPostExpiryGrace(validUntil, hours, now)) return null;
  return `Expired · send keeps this date (grace ${hours}h) — or check Extend on send`;
}

/** Expired past grace → hard-block send until Reset. */
export function shouldBlockSendPastGrace(
  validUntil: string | Date | null | undefined,
  graceHours: number,
  now = new Date(),
): boolean {
  if (!isQuoteValidUntilExpired(validUntil, now)) return false;
  return !isQuoteWithinPostExpiryGrace(validUntil, graceHours, now);
}

export function quotePastGraceBlockCue(
  validUntil: string | Date | null | undefined,
  settings: unknown,
  now = new Date(),
): string | null {
  const hours = quoteValidityGraceHoursFromSettings(settings);
  if (!shouldBlockSendPastGrace(validUntil, hours, now)) return null;
  return 'Expired past grace — reset validity before send';
}

/** Prefer grace toast over extend when API reports validityGraceUsed. */
export function formatValiditySendToastSuffix(res: {
  validityExtendedTo?: string | null;
  validityGraceUsed?: boolean;
}): string {
  if (res.validityExtendedTo) {
    return ` · validity extended to ${res.validityExtendedTo}`;
  }
  if (res.validityGraceUsed) {
    return ' · validity unchanged (grace)';
  }
  return '';
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
