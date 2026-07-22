import { describe, expect, it } from 'vitest';
import {
  looksLikeTransportCode,
  parsePlaceKinds,
  rankPlacesForPurpose,
  resolvePurposeKinds,
  salesPlaceSecondaryLabel,
} from '@wayrune/contracts';

describe('place search purpose', () => {
  it('resolves destination default kinds including country', () => {
    expect(resolvePurposeKinds('destination', undefined)).toContain('country');
    expect(resolvePurposeKinds('destination', undefined)).toContain('city');
    expect(resolvePurposeKinds('destination', undefined)).not.toContain('airport');
  });

  it('kinds override replaces defaults', () => {
    expect(resolvePurposeKinds('destination', parsePlaceKinds('airport,railway_station'))).toEqual([
      'airport',
      'railway_station',
    ]);
  });

  it('ranks exact Thailand country before weaker city text match', () => {
    const ranked = rankPlacesForPurpose(
      [
        { id: '1', name: 'New Thailand Resort Area', kind: 'city' },
        { id: '2', name: 'Thailand', kind: 'country' },
        { id: '3', name: 'Thai', kind: 'city' },
      ],
      { q: 'Thailand', purpose: 'destination' },
    );
    expect(ranked[0]?.id).toBe('2');
    expect(ranked[0]?.matchType).toBe('exact');
  });

  it('detects transport codes', () => {
    expect(looksLikeTransportCode('IXA')).toBe(true);
    expect(looksLikeTransportCode('NJP')).toBe(true);
    expect(looksLikeTransportCode('darjeeling')).toBe(false);
    // Short lowercase prefixes are destination text, not IATA/station codes
    expect(looksLikeTransportCode('da')).toBe(false);
    expect(looksLikeTransportCode('dar')).toBe(false);
    expect(looksLikeTransportCode('darj')).toBe(false);
    expect(looksLikeTransportCode('goa')).toBe(false);
  });

  it('formats sales rows without System noise', () => {
    expect(
      salesPlaceSecondaryLabel({
        name: 'Agartala',
        kind: 'city',
        country: 'India',
        parent: { name: 'Tripura', kind: 'state' },
      }),
    ).toBe('City · Tripura, India');
    expect(
      salesPlaceSecondaryLabel({
        name: 'Thailand',
        kind: 'country',
        country: 'Thailand',
      }),
    ).toBe('Country');
    expect(
      salesPlaceSecondaryLabel({
        name: 'Agartala Airport',
        kind: 'airport',
        country: 'India',
        parent: { name: 'Tripura', kind: 'state' },
        profile: { iataCode: 'IXA' },
      }),
    ).toBe('Airport · IXA · Tripura, India');
  });
});
