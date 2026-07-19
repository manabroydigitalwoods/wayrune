import { describe, expect, it } from 'vitest';
import {
  INBOX_AGING_HOURS_DEFAULT,
  computeInboxSlaMetrics,
  inboxAgingCutoff,
  inboxAgingHoursFromSettings,
} from './inbox-sla-metrics';

describe('computeInboxSlaMetrics', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('counts unread and aging unread threads', () => {
    const m = computeInboxSlaMetrics(
      [
        {
          unreadCount: 2,
          lastInteractionAt: new Date('2026-07-19T11:30:00.000Z'), // 30m
        },
        {
          unreadCount: 1,
          lastInteractionAt: new Date('2026-07-19T06:00:00.000Z'), // 6h
        },
        {
          unreadCount: 0,
          lastInteractionAt: new Date('2026-07-18T12:00:00.000Z'),
        },
      ],
      now,
      4,
    );
    expect(m.unreadThreads).toBe(2);
    expect(m.agingUnreadThreads).toBe(1);
    expect(m.agingHours).toBe(INBOX_AGING_HOURS_DEFAULT);
  });

  it('treats exactly agingHours as aging', () => {
    const m = computeInboxSlaMetrics(
      [
        {
          unreadCount: 1,
          lastInteractionAt: new Date(now.getTime() - 4 * 3_600_000),
        },
      ],
      now,
      4,
    );
    expect(m.agingUnreadThreads).toBe(1);
  });

  it('honours a non-default aging window', () => {
    const m = computeInboxSlaMetrics(
      [
        {
          unreadCount: 1,
          lastInteractionAt: new Date(now.getTime() - 3 * 3_600_000),
        },
      ],
      now,
      2,
    );
    expect(m.agingUnreadThreads).toBe(1);
    expect(m.agingHours).toBe(2);
  });
});

describe('inboxAgingHoursFromSettings', () => {
  it('defaults to 4 and clamps invalid values', () => {
    expect(inboxAgingHoursFromSettings(null)).toBe(4);
    expect(inboxAgingHoursFromSettings({})).toBe(4);
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 8 })).toBe(8);
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 0 })).toBe(4);
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 100 })).toBe(4);
  });
});

describe('inboxAgingCutoff', () => {
  it('subtracts aging hours', () => {
    const now = new Date('2026-07-19T12:00:00.000Z');
    expect(inboxAgingCutoff(now, 4).toISOString()).toBe('2026-07-19T08:00:00.000Z');
  });
});
