import { describe, expect, it } from 'vitest';
import {
  selectUnreadSlaCandidates,
  stampUnreadSlaMarker,
  unreadSlaAlreadyFired,
  unreadSlaMarker,
} from './unread-sla-fire';

describe('unread-sla-fire markers', () => {
  const at = new Date('2026-07-19T08:00:00.000Z');

  it('builds a stable marker from lastInteractionAt', () => {
    expect(unreadSlaMarker(at)).toBe('[unread_sla:2026-07-19T08:00:00.000Z]');
  });

  it('detects already-fired and stamps once', () => {
    expect(unreadSlaAlreadyFired(null, at)).toBe(false);
    const stamped = stampUnreadSlaMarker('Hello', at);
    expect(stamped).toBe('[unread_sla:2026-07-19T08:00:00.000Z] Hello');
    expect(unreadSlaAlreadyFired(stamped, at)).toBe(true);
    expect(stampUnreadSlaMarker(stamped, at)).toBe(stamped);
  });

  it('replaces an older episode marker', () => {
    const older = stampUnreadSlaMarker(
      'Thread',
      new Date('2026-07-18T08:00:00.000Z'),
    );
    expect(stampUnreadSlaMarker(older, at)).toBe(
      '[unread_sla:2026-07-19T08:00:00.000Z] Thread',
    );
  });
});

describe('selectUnreadSlaCandidates', () => {
  const cutoff = new Date('2026-07-19T08:00:00.000Z');

  it('keeps aging unread open threads without a marker', () => {
    const rows = [
      {
        id: 'c1',
        organizationId: 'o1',
        subject: null,
        lastInteractionAt: new Date('2026-07-19T06:00:00.000Z'),
        unreadCount: 2,
        status: 'open',
      },
      {
        id: 'c2',
        organizationId: 'o1',
        subject: null,
        lastInteractionAt: new Date('2026-07-19T09:00:00.000Z'),
        unreadCount: 1,
        status: 'open',
      },
      {
        id: 'c3',
        organizationId: 'o1',
        subject: unreadSlaMarker(new Date('2026-07-19T05:00:00.000Z')),
        lastInteractionAt: new Date('2026-07-19T05:00:00.000Z'),
        unreadCount: 1,
        status: 'open',
      },
      {
        id: 'c4',
        organizationId: 'o1',
        subject: null,
        lastInteractionAt: new Date('2026-07-19T05:00:00.000Z'),
        unreadCount: 0,
        status: 'open',
      },
      {
        id: 'c5',
        organizationId: 'o1',
        subject: null,
        lastInteractionAt: new Date('2026-07-19T05:00:00.000Z'),
        unreadCount: 1,
        status: 'closed',
      },
    ];
    expect(selectUnreadSlaCandidates(rows, cutoff).map((r) => r.id)).toEqual([
      'c1',
    ]);
  });
});
