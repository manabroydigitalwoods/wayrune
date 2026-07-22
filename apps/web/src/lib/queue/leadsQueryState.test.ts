import { describe, expect, it } from 'vitest';
import {
  facetCountLabel,
  leadsApiQueryFromState,
  leadsQueryHasFilters,
  leadsSortPatchFromSorting,
  parseLeadsQueryState,
  patchLeadsQueryParams,
  serializeLeadsQueryState,
} from './leadsQueryState';

describe('leadsQueryState', () => {
  it('parses view and filters', () => {
    const state = parseLeadsQueryState(
      new URLSearchParams(
        'view=table&owner=me&followUp=overdue&stage=qualified&source=google&campaign=c1&q=roy',
      ),
    );
    expect(state).toEqual({
      view: 'table',
      owner: 'me',
      followUp: 'overdue',
      followUpFrom: null,
      followUpTo: null,
      followUpPeriod: null,
      stage: 'qualified',
      priority: undefined,
      source: 'google',
      campaign: 'c1',
      q: 'roy',
      sort: undefined,
      dir: undefined,
    });
  });

  it('parses and serializes table sort', () => {
    const state = parseLeadsQueryState(
      new URLSearchParams('view=table&sort=priority&dir=desc'),
    );
    expect(state.sort).toBe('priority');
    expect(state.dir).toBe('desc');
    expect(serializeLeadsQueryState(state).toString()).toBe(
      'view=table&sort=priority&dir=desc',
    );
  });

  it('ignores unknown sort columns and defaults dir to asc', () => {
    expect(parseLeadsQueryState(new URLSearchParams('view=table&sort=nope&dir=desc')).sort).toBe(
      undefined,
    );
    expect(parseLeadsQueryState(new URLSearchParams('view=table&sort=title')).dir).toBe('asc');
  });

  it('maps sorting state to query patch', () => {
    expect(leadsSortPatchFromSorting([{ id: 'contact', desc: true }])).toEqual({
      sort: 'contact',
      dir: 'desc',
    });
    expect(leadsSortPatchFromSorting([])).toEqual({ sort: undefined, dir: undefined });
  });

  it('serializes omitting empty values', () => {
    const qs = serializeLeadsQueryState({
      view: 'board',
      owner: 'me',
      followUpFrom: null,
      followUpTo: null,
      followUpPeriod: null,
    }).toString();
    expect(qs).toBe('view=board&owner=me');
  });

  it('clearFilters keeps view, q, and sort', () => {
    const current = new URLSearchParams(
      'view=board&owner=me&followUp=overdue&q=a&sort=title&dir=asc',
    );
    const next = patchLeadsQueryParams(current, { clearFilters: true });
    expect(next.get('view')).toBe('board');
    expect(next.get('q')).toBe('a');
    expect(next.get('owner')).toBeNull();
    expect(next.get('followUp')).toBeNull();
    expect(next.get('sort')).toBe('title');
    expect(next.get('dir')).toBe('asc');
  });

  it('clearFilters can also clear search when q is passed', () => {
    const current = new URLSearchParams('view=table&owner=me&q=sasd');
    const next = patchLeadsQueryParams(current, { clearFilters: true, q: '' });
    expect(next.get('view')).toBe('table');
    expect(next.get('q')).toBeNull();
    expect(next.get('owner')).toBeNull();
  });

  it('builds API query with stageKey', () => {
    const qs = leadsApiQueryFromState(
      {
        view: 'table',
        owner: 'me',
        followUp: 'overdue',
        stage: 'new',
        source: 'whatsapp',
        campaign: 'camp-1',
        q: 'priya',
        followUpFrom: null,
        followUpTo: null,
        followUpPeriod: null,
      },
      { pageSize: 50 },
    );
    const params = new URLSearchParams(qs);
    expect(params.get('pageSize')).toBe('50');
    expect(params.get('owner')).toBe('me');
    expect(params.get('followUp')).toBe('overdue');
    expect(params.get('stageKey')).toBe('new');
    expect(params.get('sourceKey')).toBe('whatsapp');
    expect(params.get('campaignId')).toBe('camp-1');
    expect(params.get('q')).toBe('priya');
  });

  it('facet count labels hide empty buckets', () => {
    expect(facetCountLabel(undefined, 'source', 'google')).toBeUndefined();
    expect(
      facetCountLabel(
        {
          source: { google: 8 },
          stage: {},
          priority: {},
          owner: {},
          followUp: {},
          campaign: {},
        },
        'source',
        'google',
      ),
    ).toBe('8');
    expect(
      facetCountLabel(
        {
          source: { google: 8 },
          stage: {},
          priority: {},
          owner: {},
          followUp: {},
          campaign: {},
        },
        'source',
        'referral',
      ),
    ).toBeUndefined();
  });

  it('detects active filters', () => {
    expect(leadsQueryHasFilters({ view: 'board' })).toBe(false);
    expect(leadsQueryHasFilters({ view: 'board', owner: 'me' })).toBe(true);
    expect(leadsQueryHasFilters({ view: 'board', source: 'google' })).toBe(true);
    expect(leadsQueryHasFilters({ view: 'board', followUp: 'none' })).toBe(true);
  });
});
