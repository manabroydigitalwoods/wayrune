import { describe, expect, it } from 'vitest';
import {
  dualWriteCoverageNames,
  isAllowedCoveragePlaceKind,
  normalizeServedPlaceIds,
  servedPlaceIdsFromRows,
  supplierCoverageProfileKey,
  supplierMatchesPlaceViaCoverage,
} from './supplier-served-places';

describe('normalizeServedPlaceIds', () => {
  it('dedupes, trims, preserves order, caps', () => {
    expect(
      normalizeServedPlaceIds([' a ', 'b', 'a', '', 'c', 'b'], 3),
    ).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for non-arrays', () => {
    expect(normalizeServedPlaceIds(null)).toEqual([]);
    expect(normalizeServedPlaceIds('x')).toEqual([]);
  });
});

describe('servedPlaceIdsFromRows', () => {
  it('null when not configured', () => {
    expect(
      servedPlaceIdsFromRows({ servedCoverageConfigured: false, placeIds: ['p1'] }),
    ).toBeNull();
  });

  it('empty array when configured with no rows', () => {
    expect(
      servedPlaceIdsFromRows({ servedCoverageConfigured: true, placeIds: [] }),
    ).toEqual([]);
  });
});

describe('coverage kinds and types', () => {
  it('allows destination kinds only', () => {
    expect(isAllowedCoveragePlaceKind('city')).toBe(true);
    expect(isAllowedCoveragePlaceKind('airport')).toBe(false);
    expect(isAllowedCoveragePlaceKind('railway_station')).toBe(false);
  });

  it('physical stay types do not match via coverage', () => {
    expect(supplierMatchesPlaceViaCoverage('hotel')).toBe(false);
    expect(supplierMatchesPlaceViaCoverage('dmc')).toBe(true);
    expect(supplierMatchesPlaceViaCoverage('guide')).toBe(true);
  });

  it('maps dual-write keys by type', () => {
    expect(supplierCoverageProfileKey('dmc')).toBe('destinationsServed');
    expect(supplierCoverageProfileKey('guide')).toBe('destinations');
    expect(supplierCoverageProfileKey('driver')).toBe('serviceAreas');
    expect(supplierCoverageProfileKey('car_rental')).toBe('routesServed');
  });
});

describe('dualWriteCoverageNames', () => {
  it('writes DMC destinationsServed array', () => {
    expect(dualWriteCoverageNames({}, 'dmc', ['Gangtok', 'Pelling'])).toEqual({
      destinationsServed: ['Gangtok', 'Pelling'],
    });
  });

  it('clears key when empty', () => {
    expect(
      dualWriteCoverageNames({ destinationsServed: ['X'] }, 'dmc', []),
    ).toEqual({});
  });
});
