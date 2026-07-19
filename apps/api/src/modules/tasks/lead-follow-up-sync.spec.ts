import { describe, expect, it } from 'vitest';
import {
  parseFollowUpAtDate,
  shouldResolveLeadFromInquiryTask,
  shouldSyncLeadFollowUpAt,
  shouldSyncTaskDueFromLeadFollowUp,
} from './lead-follow-up-sync';

describe('shouldSyncLeadFollowUpAt', () => {
  it('syncs lead tasks with a due date', () => {
    expect(
      shouldSyncLeadFollowUpAt({
        entityType: 'lead',
        entityId: 'lead_1',
        dueAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('skips missing due or non-lead entities', () => {
    expect(
      shouldSyncLeadFollowUpAt({
        entityType: 'lead',
        entityId: 'lead_1',
        dueAt: null,
      }),
    ).toBe(false);
    expect(
      shouldSyncLeadFollowUpAt({
        entityType: 'party',
        entityId: 'p1',
        dueAt: '2026-07-18T10:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('shouldResolveLeadFromInquiryTask', () => {
  it('resolves inquiry tasks with due dates', () => {
    expect(
      shouldResolveLeadFromInquiryTask({
        entityType: 'inquiry',
        entityId: 'inq_1',
        dueAt: new Date(),
      }),
    ).toBe(true);
  });

  it('skips lead entities (handled by direct sync)', () => {
    expect(
      shouldResolveLeadFromInquiryTask({
        entityType: 'lead',
        entityId: 'lead_1',
        dueAt: new Date(),
      }),
    ).toBe(false);
  });
});

describe('shouldSyncTaskDueFromLeadFollowUp', () => {
  it('syncs when followUpAt is provided as a date', () => {
    expect(
      shouldSyncTaskDueFromLeadFollowUp({
        followUpAtProvided: true,
        followUpAt: '2026-07-19T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('skips clear / omitted follow-up', () => {
    expect(
      shouldSyncTaskDueFromLeadFollowUp({
        followUpAtProvided: true,
        followUpAt: null,
      }),
    ).toBe(false);
    expect(
      shouldSyncTaskDueFromLeadFollowUp({
        followUpAtProvided: false,
        followUpAt: '2026-07-19T10:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('parseFollowUpAtDate', () => {
  it('parses ISO strings and rejects invalid', () => {
    expect(parseFollowUpAtDate('2026-07-19T10:00:00.000Z')?.toISOString()).toBe(
      '2026-07-19T10:00:00.000Z',
    );
    expect(parseFollowUpAtDate(null)).toBeNull();
    expect(parseFollowUpAtDate('not-a-date')).toBeNull();
  });
});
