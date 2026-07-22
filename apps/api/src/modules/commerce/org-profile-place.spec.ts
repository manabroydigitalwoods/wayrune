import { describe, expect, it } from 'vitest';
import {
  clearOrgProfileLocationSnapshots,
  deriveOrgProfileLocationSnapshots,
  isAllowedOrgProfilePlaceKind,
} from './org-profile-place';

describe('org-profile-place', () => {
  it('allows profile location kinds and rejects transport', () => {
    expect(isAllowedOrgProfilePlaceKind('city')).toBe(true);
    expect(isAllowedOrgProfilePlaceKind('country')).toBe(true);
    expect(isAllowedOrgProfilePlaceKind('airport')).toBe(false);
    expect(isAllowedOrgProfilePlaceKind('landmark')).toBe(false);
  });

  it('derives city snapshots from self + ancestors', () => {
    expect(
      deriveOrgProfileLocationSnapshots(
        {
          id: 'p_darj',
          name: 'Darjeeling',
          kind: 'city',
          country: 'India',
          region: null,
        },
        [
          { name: 'West Bengal', kind: 'state' },
          { name: 'India', kind: 'country' },
        ],
      ),
    ).toEqual({
      placeId: 'p_darj',
      city: 'Darjeeling',
      region: 'West Bengal',
      country: 'India',
    });
  });

  it('region/country selections do not invent a city', () => {
    expect(
      deriveOrgProfileLocationSnapshots(
        {
          id: 'p_wb',
          name: 'West Bengal',
          kind: 'state',
          country: 'India',
          region: null,
        },
        [{ name: 'India', kind: 'country' }],
      ),
    ).toEqual({
      placeId: 'p_wb',
      city: null,
      region: 'West Bengal',
      country: 'India',
    });

    expect(
      deriveOrgProfileLocationSnapshots(
        {
          id: 'p_in',
          name: 'India',
          kind: 'country',
          country: 'India',
          region: null,
        },
        [],
      ),
    ).toEqual({
      placeId: 'p_in',
      city: null,
      region: null,
      country: 'India',
    });
  });

  it('clear wipes id and snapshots together', () => {
    expect(clearOrgProfileLocationSnapshots()).toEqual({
      placeId: null,
      city: null,
      region: null,
      country: null,
    });
  });
});
