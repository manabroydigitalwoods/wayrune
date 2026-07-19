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

/** 0–72; omit → 24; invalid → 24. */
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

/** Calendar day + N days, stored as UTC noon to keep the date stable across TZ. */
export function defaultValidUntilDate(
  days = DEFAULT_QUOTE_VALIDITY_DAYS,
  from = new Date(),
): Date {
  const local = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  local.setDate(local.getDate() + days);
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), 12, 0, 0),
  );
}

export function formatValidUntilDisplay(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!m) return isoDay;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** True when validUntil calendar day is strictly before today's local calendar day. */
export function isQuoteValidUntilExpired(
  validUntil: Date | string | null | undefined,
  today = new Date(),
): boolean {
  if (validUntil == null || validUntil === '') return false;
  const iso =
    validUntil instanceof Date
      ? validUntil.toISOString().slice(0, 10)
      : String(validUntil).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayIso;
}

function validUntilIsoDay(
  validUntil: Date | string | null | undefined,
): string | null {
  if (validUntil == null || validUntil === '') return null;
  const iso =
    validUntil instanceof Date
      ? validUntil.toISOString().slice(0, 10)
      : String(validUntil).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Whole local calendar days from today until validUntil (0 = expires today). Null if missing/invalid/expired. */
export function quoteValidUntilDaysRemaining(
  validUntil: Date | string | null | undefined,
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

/**
 * Eligible for validity refresh when opted in (near-expiry, not yet expired).
 * Expired quotes never qualify here — use grace + extendValidity instead.
 */
export function shouldAutoExtendQuoteValidity(
  validUntil: Date | string | null | undefined,
  opts?: { withinDays?: number; today?: Date; graceHours?: number },
): boolean {
  const today = opts?.today ?? new Date();
  if (isQuoteValidUntilExpired(validUntil, today)) return false;
  const withinDays = Math.max(0, opts?.withinDays ?? 2);
  const remaining = quoteValidUntilDaysRemaining(validUntil, today);
  return remaining != null && remaining <= withinDays;
}

/**
 * Expired calendar day, but still within graceHours after local start of the day
 * after validUntil (midnight). graceHours ≤ 0 → never in grace.
 */
export function isQuoteWithinPostExpiryGrace(
  validUntil: Date | string | null | undefined,
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

/** Expired and outside post-expiry grace → hard-block send (reset date first). */
export function shouldBlockSendPastGrace(
  validUntil: Date | string | null | undefined,
  graceHours: number,
  now = new Date(),
): boolean {
  if (!isQuoteValidUntilExpired(validUntil, now)) return false;
  return !isQuoteWithinPostExpiryGrace(validUntil, graceHours, now);
}

/**
 * Whether send should refresh validUntil (always opt-in via extendValidity):
 * - near-expiry (not expired) + flag → yes
 * - in grace + flag → yes
 * - otherwise → no (no silent auto-extend)
 */
export function shouldExtendValidityOnSend(
  validUntil: Date | string | null | undefined,
  opts: {
    graceHours: number;
    extendValidity?: boolean;
    withinDays?: number;
    today?: Date;
  },
): boolean {
  if (!opts.extendValidity) return false;
  const today = opts.today ?? new Date();
  if (isQuoteWithinPostExpiryGrace(validUntil, opts.graceHours, today)) {
    return true;
  }
  return shouldAutoExtendQuoteValidity(validUntil, {
    withinDays: opts.withinDays,
    today,
    graceHours: opts.graceHours,
  });
}

const VALIDITY_LINE =
  /^(valid\s+for\s+\d+\s+days?|valid\s+until\b.*)$/i;

/**
 * Keep proposal terms aligned with structured validUntil.
 * Replaces free-text “Valid for N days” / “Valid until …” with the calculated date.
 */
export function syncTermsWithValidUntil(
  terms: string | null | undefined,
  validUntil: Date | string,
): string {
  const isoDay =
    validUntil instanceof Date
      ? validUntil.toISOString().slice(0, 10)
      : String(validUntil).slice(0, 10);
  const lines = String(terms || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() === '' || !VALIDITY_LINE.test(l.trim()));
  const cleaned = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!isoDay) return cleaned;
  const line = `Valid until ${formatValidUntilDisplay(isoDay)}`;
  return cleaned ? `${cleaned}\n${line}` : line;
}
