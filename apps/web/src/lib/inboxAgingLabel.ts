/** Inbox unread aging — mirrors API inbox-sla-metrics for UI labels. */

export const INBOX_AGING_HOURS_DEFAULT = 4;

export function inboxAgingHoursFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return INBOX_AGING_HOURS_DEFAULT;
  }
  const raw = (settings as Record<string, unknown>).inboxAgingHours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 72) return INBOX_AGING_HOURS_DEFAULT;
  return Math.floor(n);
}

export function inboxAgingFilterLabel(hours: number = INBOX_AGING_HOURS_DEFAULT): string {
  const h = Math.max(1, Math.floor(hours));
  return `Aging ${h}h+`;
}
