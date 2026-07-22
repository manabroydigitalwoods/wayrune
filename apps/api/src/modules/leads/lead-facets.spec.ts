import { describe, expect, it } from 'vitest';
import { filtersOmittingFacet, type LeadListFilters } from './lead-facets';

const base: LeadListFilters = {
  stageKey: 'qualified',
  priority: 'high',
  sourceKey: 'google',
  owner: 'me',
  followUp: 'overdue',
  campaignId: 'c1',
  q: 'roy',
};

describe('filtersOmittingFacet', () => {
  it('clears only the omitted facet', () => {
    expect(filtersOmittingFacet(base, 'source')).toMatchObject({
      stageKey: 'qualified',
      priority: 'high',
      sourceKey: undefined,
      owner: 'me',
    });
    expect(filtersOmittingFacet(base, 'stage').stageKey).toBeUndefined();
    expect(filtersOmittingFacet(base, 'priority').priority).toBeUndefined();
    expect(filtersOmittingFacet(base, 'owner').owner).toBeUndefined();
    expect(filtersOmittingFacet(base, 'campaign').campaignId).toBeUndefined();
  });

  it('clears follow-up preset and due range together', () => {
    const next = filtersOmittingFacet(
      { ...base, followUpFrom: '2026-07-01', followUpTo: '2026-07-31' },
      'followUp',
    );
    expect(next.followUp).toBeUndefined();
    expect(next.followUpFrom).toBeNull();
    expect(next.followUpTo).toBeNull();
    expect(next.sourceKey).toBe('google');
  });
});
