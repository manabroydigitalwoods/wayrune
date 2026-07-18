import { describe, expect, it } from 'vitest';
import {
  buildPageSuggest,
  buildSiteSuggest,
  pageRolesFromPath,
  scoreSuggestMatch,
} from './presence-suggest-stamp';

describe('presence-suggest-stamp', () => {
  it('merges starter → theme → baseline → overrides', () => {
    const suggest = buildSiteSuggest({
      orgKind: 'travel_agency',
      siteKind: 'marketing',
      starterSuggest: { orgKinds: ['hotel'], priority: 10 },
      themeSuggest: { moods: ['travel'], priority: 90, siteKinds: ['landing'] },
      overrides: { useCases: ['branding'] },
    });
    expect(suggest.orgKinds).toEqual(expect.arrayContaining(['hotel', 'travel_agency']));
    expect(suggest.siteKinds).toEqual(expect.arrayContaining(['landing', 'marketing']));
    expect(suggest.moods).toEqual(['travel']);
    expect(suggest.useCases).toEqual(['branding']);
    expect(suggest.priority).toBe(90);
  });

  it('maps page roles from path', () => {
    expect(pageRolesFromPath('/')).toEqual(['home']);
    expect(pageRolesFromPath('/contact')).toEqual(['contact']);
    expect(pageRolesFromPath('/destinations/goa')).toEqual(['destinations']);
    expect(pageRolesFromPath('/tours')).toEqual(['tours']);
    expect(pageRolesFromPath('/about')).toEqual(['about']);
    expect(buildPageSuggest({ path: '/trips' }).pageRoles).toEqual(['tours']);
  });

  it('scores org and site kind matches', () => {
    const score = scoreSuggestMatch(
      { orgKinds: ['travel_agency'], siteKinds: ['marketing'], priority: 100 },
      { orgKind: 'travel_agency', siteKind: 'marketing' },
    );
    expect(score).toBe(165);
  });
});
