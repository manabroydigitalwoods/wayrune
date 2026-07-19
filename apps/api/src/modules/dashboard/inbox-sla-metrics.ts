/** Default aging window for inbox unread SLA when org has no override. */
export const INBOX_AGING_HOURS_DEFAULT = 4;

export type InboxUnreadRow = {
  unreadCount: number;
  lastInteractionAt: Date;
};

export type InboxSlaMetrics = {
  unreadThreads: number;
  agingUnreadThreads: number;
  agingHours: number;
};

/** Read org `settingsJson.inboxAgingHours` (1–72); default 4. */
export function inboxAgingHoursFromSettings(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return INBOX_AGING_HOURS_DEFAULT;
  }
  const raw = (settings as Record<string, unknown>).inboxAgingHours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 72) return INBOX_AGING_HOURS_DEFAULT;
  return Math.floor(n);
}

export function computeInboxSlaMetrics(
  rows: InboxUnreadRow[],
  now: Date,
  agingHours: number = INBOX_AGING_HOURS_DEFAULT,
): InboxSlaMetrics {
  const agingMs = Math.max(0, agingHours) * 3_600_000;
  let unreadThreads = 0;
  let agingUnreadThreads = 0;
  for (const row of rows) {
    if (row.unreadCount <= 0) continue;
    unreadThreads += 1;
    if (now.getTime() - row.lastInteractionAt.getTime() >= agingMs) {
      agingUnreadThreads += 1;
    }
  }
  return { unreadThreads, agingUnreadThreads, agingHours };
}

export function inboxAgingCutoff(
  now: Date,
  agingHours: number = INBOX_AGING_HOURS_DEFAULT,
): Date {
  return new Date(now.getTime() - Math.max(0, agingHours) * 3_600_000);
}
