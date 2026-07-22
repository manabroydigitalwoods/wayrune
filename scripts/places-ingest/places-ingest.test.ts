import { describe, expect, it } from 'vitest';
import { classifyPlaceResolve, mergeProfileJson } from './conflict';
import {
  buildProfileJson,
  dedupePlaceRowsByKey,
  parseCsvText,
  splitSuitabilityTags,
} from './parse';
import { legacyLeafKey, normalizePlaceName, type ParsedPlaceRow } from './types';

function row(partial: Partial<ParsedPlaceRow> & Pick<ParsedPlaceRow, 'key' | 'name' | 'kind'>): ParsedPlaceRow {
  return {
    parentKey: null,
    country: 'India',
    region: null,
    domesticOrIntl: 'domestic',
    isSystem: true,
    isActive: true,
    profile: {},
    sourceFile: 'test.csv',
    ...partial,
  };
}

describe('parseCsvText', () => {
  it('handles quotes and commas', () => {
    const rows = parseCsvText('a,b\n"x,y",z\n');
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['x,y', 'z']);
  });

  it('strips BOM conceptually via leading cell', () => {
    const rows = parseCsvText('\uFEFFname,key\nGoa,india/goa\n');
    expect(rows[0]?.[0]).toBe('name');
  });
});

describe('splitSuitabilityTags / buildProfileJson', () => {
  it('splits pipe tags', () => {
    expect(splitSuitabilityTags('a|b | c')).toEqual(['a', 'b', 'c']);
  });

  it('maps profile fields', () => {
    const profile = buildProfileJson({
      description: 'Nice',
      latitude: '12.5',
      suitabilityTags: 'beach|hills',
      iataCode: 'goi',
      sourceUrl: 'https://example.com',
    });
    expect(profile).toMatchObject({
      description: 'Nice',
      latitude: 12.5,
      suitabilityTags: ['beach', 'hills'],
      iataCode: 'GOI',
      sourceUrl: 'https://example.com',
    });
  });
});

describe('dedupePlaceRowsByKey', () => {
  it('first wins', () => {
    const { unique, duplicateKeys } = dedupePlaceRowsByKey([
      row({ key: 'india', name: 'India', kind: 'country', sourceFile: 'a.csv' }),
      row({ key: 'india', name: 'India', kind: 'country', sourceFile: 'b.csv' }),
      row({ key: 'india/goa', name: 'Goa', kind: 'state' }),
    ]);
    expect(unique).toHaveLength(2);
    expect(unique[0]?.sourceFile).toBe('a.csv');
    expect(duplicateKeys).toEqual(['india']);
  });
});

describe('classifyPlaceResolve', () => {
  it('updates on exact key', () => {
    const action = classifyPlaceResolve({
      row: row({ key: 'india/goa', name: 'Goa', kind: 'state' }),
      byExactKey: {
        id: '1',
        key: 'india/goa',
        name: 'Goa',
        kind: 'state',
        isSystem: true,
      },
      byLegacyLeaf: [],
      byTransportCode: [],
    });
    expect(action.action).toBe('update');
  });

  it('conflicts on exact key kind mismatch', () => {
    const action = classifyPlaceResolve({
      row: row({ key: 'x', name: 'X', kind: 'city' }),
      byExactKey: {
        id: '1',
        key: 'x',
        name: 'X',
        kind: 'landmark',
        isSystem: true,
      },
      byLegacyLeaf: [],
      byTransportCode: [],
    });
    expect(action.action).toBe('conflict_kind');
  });

  it('merges legacy short key when kind+name match', () => {
    const action = classifyPlaceResolve({
      row: row({
        key: 'india/south-india/kerala',
        name: 'Kerala',
        kind: 'state',
      }),
      byExactKey: null,
      byLegacyLeaf: [
        { id: 'k1', key: 'kerala', name: 'Kerala', kind: 'state', isSystem: true },
      ],
      byTransportCode: [],
    });
    expect(action).toEqual({
      action: 'merged_legacy',
      existing: expect.objectContaining({ id: 'k1' }),
      previousKey: 'kerala',
    });
  });

  it('conflicts when legacy leaf name mismatches for non-transport', () => {
    const action = classifyPlaceResolve({
      row: row({ key: 'india/goa', name: 'Goa State', kind: 'state' }),
      byExactKey: null,
      byLegacyLeaf: [
        { id: 'g1', key: 'goa', name: 'Goa Beach', kind: 'state', isSystem: true },
      ],
      byTransportCode: [],
    });
    expect(action.action).toBe('conflict_name');
  });

  it('falls through to IATA when airport leaf name mismatches', () => {
    const action = classifyPlaceResolve({
      row: row({
        key: 'india/assam/dibrugarh-airport',
        name: 'Dibrugarh Airport (Mohanbari)',
        kind: 'airport',
        profile: { iataCode: 'DIB' },
      }),
      byExactKey: null,
      byLegacyLeaf: [
        {
          id: 'a0',
          key: 'dibrugarh-airport',
          name: 'Dibrugarh Airport',
          kind: 'airport',
          isSystem: true,
        },
      ],
      byTransportCode: [
        {
          id: 'a1',
          key: 'dib',
          name: 'Dibrugarh Airport',
          kind: 'airport',
          isSystem: true,
          profileJson: { iataCode: 'DIB' },
        },
      ],
    });
    expect(action.action).toBe('merged_legacy');
    if (action.action === 'merged_legacy') {
      expect(action.existing.id).toBe('a1');
    }
  });

  it('merges airport by IATA', () => {
    const action = classifyPlaceResolve({
      row: row({
        key: 'india/goa/dabolim-airport',
        name: 'Goa Dabolim Airport',
        kind: 'airport',
        profile: { iataCode: 'GOI' },
      }),
      byExactKey: null,
      byLegacyLeaf: [],
      byTransportCode: [
        {
          id: 'a1',
          key: 'goi',
          name: 'Goa Dabolim Airport',
          kind: 'airport',
          isSystem: true,
          profileJson: { iataCode: 'GOI' },
        },
      ],
    });
    expect(action.action).toBe('merged_legacy');
  });
});

describe('mergeProfileJson / helpers', () => {
  it('preserves unknown keys and accumulates legacyKeys', () => {
    const merged = mergeProfileJson(
      { description: 'old', custom: 1, legacyKeys: ['a'] },
      { description: 'new', iataCode: 'IXB' },
      'kerala',
    );
    expect(merged.description).toBe('new');
    expect(merged.custom).toBe(1);
    expect(merged.iataCode).toBe('IXB');
    expect(merged.legacyKeys?.sort()).toEqual(['a', 'kerala']);
  });

  it('legacyLeafKey and normalizePlaceName', () => {
    expect(legacyLeafKey('india/south-india/kerala')).toBe('kerala');
    expect(normalizePlaceName('  North  Goa ')).toBe('north goa');
  });
});
