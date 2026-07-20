import { describe, expect, it } from 'vitest';
import { buildInquiryListWhere } from './inquiry-queue';

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
});
