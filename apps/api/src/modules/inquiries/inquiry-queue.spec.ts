import { describe, expect, it } from 'vitest';
import {
  buildInquiryListWhere,
  inquiryPlanningStaleWhere,
} from './inquiry-queue';

describe('buildInquiryListWhere', () => {
  const orgId = 'org-1';

  it('scopes planning queue to open and qualified', () => {
    const where = buildInquiryListWhere(orgId, { queue: 'planning' });
    expect(where).toMatchObject({
      organizationId: orgId,
      deletedAt: null,
      status: { in: ['open', 'qualified'] },
    });
  });

  it('scopes my_requests to viewer-owned or unassigned', () => {
    const where = buildInquiryListWhere(orgId, {
      queue: 'my_requests',
      viewerUserId: 'user-1',
    });
    expect(where).toMatchObject({
      status: { not: 'lost' },
      OR: [{ ownerId: null }, { ownerId: 'user-1' }],
    });
  });

  it('filters incomplete requests', () => {
    const where = buildInquiryListWhere(orgId, {
      queue: 'planning',
      incomplete: true,
    });
    expect(where.AND).toBeDefined();
    expect(Array.isArray(where.AND)).toBe(true);
  });

  it('filters unassigned owner', () => {
    const where = buildInquiryListWhere(orgId, {
      queue: 'planning',
      ownerId: null,
    });
    expect(where).toMatchObject({ ownerId: null });
  });

  it('filters stale planning by updatedAt cutoff', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const where = buildInquiryListWhere(orgId, {
      queue: 'planning',
      stale: true,
      agingHours: 4,
    });
    // Force planning statuses even if queue omitted later
    expect(where.AND).toBeDefined();
    const and = where.AND as Array<Record<string, unknown>>;
    expect(and[0]).toMatchObject({
      status: { in: ['open', 'qualified'] },
    });
    const stalePart = inquiryPlanningStaleWhere(4, now);
    expect(stalePart.updatedAt).toEqual({
      lt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    });
  });
});

describe('inquiryPlanningStaleWhere', () => {
  it('clamps aging hours to 1–72', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    expect(inquiryPlanningStaleWhere(0, now).updatedAt).toEqual({
      lt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    });
    expect(inquiryPlanningStaleWhere(100, now).updatedAt).toEqual({
      lt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    });
  });
});
