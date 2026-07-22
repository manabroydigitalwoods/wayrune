import { describe, expect, it } from 'vitest';
import {
  maxEditDistanceForQuery,
  scorePlaceSuggestion,
  suggestPlaceCorrections,
} from '@wayrune/contracts';

const catalog = [
  { id: 'sevoke', name: 'Sevoke', kind: 'city', key: 'sevoke' },
  { id: 'darjeeling', name: 'Darjeeling', kind: 'city', key: 'darjeeling' },
  { id: 'gangtok', name: 'Gangtok', kind: 'city', key: 'gangtok' },
  { id: 'seven', name: 'Seven Lakes Trek', kind: 'landmark', key: 'seven-lakes-trek' },
  { id: 'seva', name: 'Seva Kunj and Nidhivan', kind: 'landmark', key: 'seva-kunj' },
  { id: 'ixb', name: 'Bagdogra Airport', kind: 'airport', key: 'bagdogra-airport' },
];

describe('place typo suggestions', () => {
  it('does not trigger for short queries', () => {
    expect(maxEditDistanceForQuery(2)).toBe(-1);
    expect(scorePlaceSuggestion(catalog[0]!, 'go')).toBeNull();
    expect(suggestPlaceCorrections(catalog, 'go')).toEqual([]);
  });

  it('suggests Sevoke for Sevok when present', () => {
    const hits = suggestPlaceCorrections(catalog, 'Sevok');
    expect(hits.map((h) => h.id)).toEqual(['sevoke']);
  });

  it('suggests Darjeeling for Dargeling', () => {
    const hits = suggestPlaceCorrections(catalog, 'Dargeling');
    expect(hits.map((h) => h.id)).toContain('darjeeling');
  });

  it('suggests Darjeeling for dargiling (multi-edit romanization typo)', () => {
    const hits = suggestPlaceCorrections(catalog, 'dargiling');
    expect(hits.map((h) => h.id)).toEqual(['darjeeling']);
  });

  it('suggests Gangtok for Gangtk', () => {
    const hits = suggestPlaceCorrections(catalog, 'Gangtk');
    expect(hits.map((h) => h.id)).toEqual(['gangtok']);
  });

  it('does not suggest Seven Lakes Trek for sevok b', () => {
    const hits = suggestPlaceCorrections(catalog, 'sevok b');
    expect(hits.map((h) => h.id)).not.toContain('seven');
    expect(hits.map((h) => h.id)).not.toContain('seva');
  });

  it('returns no suggestion when catalog place is missing', () => {
    const withoutSevoke = catalog.filter((p) => p.id !== 'sevoke');
    expect(suggestPlaceCorrections(withoutSevoke, 'Sevok')).toEqual([]);
  });

  it('respects destination kinds (no airports)', () => {
    const destinations = catalog.filter((p) => p.kind !== 'airport');
    const hits = suggestPlaceCorrections(destinations, 'Bagdogara');
    expect(hits.every((h) => h.kind !== 'airport')).toBe(true);
  });

  it('caps at three suggestions', () => {
    const many = [
      { id: 'a', name: 'Siliguri', kind: 'city' },
      { id: 'b', name: 'Siliguri Town', kind: 'area' },
      { id: 'c', name: 'Siliguri Junction', kind: 'city' },
      { id: 'd', name: 'Siliguri Road', kind: 'area' },
    ];
    expect(suggestPlaceCorrections(many, 'Siligiri', { max: 3 })).toHaveLength(3);
  });
});
