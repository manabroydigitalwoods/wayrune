import { describe, expect, it } from 'vitest';
import {
  buildPartyListWhere,
  partyB2bWhere,
  PARTY_ACTIVE_TRIP_STATUSES,
} from './party-list';

describe('buildPartyListWhere', () => {
  it('scopes to org and excludes soft-deleted', () => {
    expect(buildPartyListWhere('org-1', {})).toEqual({
      organizationId: 'org-1',
      deletedAt: null,
    });
  });

  it('adds B2B filter when requested', () => {
    expect(buildPartyListWhere('org-1', { b2b: true })).toEqual({
      AND: [
        { organizationId: 'org-1', deletedAt: null },
        partyB2bWhere(),
      ],
    });
  });

  it('combines type, B2B, and search', () => {
    const where = buildPartyListWhere('org-1', {
      type: 'organization',
      b2b: true,
      q: 'North',
    });
    expect(where).toEqual({
      AND: [
        { organizationId: 'org-1', deletedAt: null },
        { type: 'organization' },
        partyB2bWhere(),
        {
          OR: [
            { displayName: { contains: 'North' } },
            { email: { contains: 'North' } },
            { phone: { contains: 'North' } },
          ],
        },
      ],
    });
  });
});

describe('PARTY_ACTIVE_TRIP_STATUSES', () => {
  it('excludes completed and cancelled', () => {
    expect(PARTY_ACTIVE_TRIP_STATUSES).not.toContain('completed');
    expect(PARTY_ACTIVE_TRIP_STATUSES).not.toContain('cancelled');
    expect(PARTY_ACTIVE_TRIP_STATUSES).toContain('planning');
  });
});
