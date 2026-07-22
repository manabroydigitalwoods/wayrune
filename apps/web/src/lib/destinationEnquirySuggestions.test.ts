import { describe, expect, it } from 'vitest';
import {
  classifyDestinationSearchHits,
  mergeEnquiryDestinationSuggestions,
  normalizeDestinationSuggestionKey,
  parseDestinationSuggestionNames,
  readLeadDestinationText,
} from './destinationEnquirySuggestions';

describe('parseDestinationSuggestionNames', () => {
  it('splits commas, newlines, semicolons; trims; dedupes', () => {
    expect(
      parseDestinationSuggestionNames(`Gangtok, Pelling
Darjeeling; Gangtok`),
    ).toEqual(['Gangtok', 'Pelling', 'Darjeeling']);
  });

  it('does not split multi-word destinations', () => {
    expect(parseDestinationSuggestionNames('North Sikkim, New Delhi, Abu Dhabi')).toEqual([
      'North Sikkim',
      'New Delhi',
      'Abu Dhabi',
    ]);
  });

  it('collapses repeated whitespace inside a fragment', () => {
    expect(parseDestinationSuggestionNames('  Gangtok  ,  North   Sikkim  ')).toEqual([
      'Gangtok',
      'North Sikkim',
    ]);
  });

  it('returns empty for blank', () => {
    expect(parseDestinationSuggestionNames('')).toEqual([]);
    expect(parseDestinationSuggestionNames('  , ; \n')).toEqual([]);
    expect(parseDestinationSuggestionNames(null)).toEqual([]);
  });
});

describe('mergeEnquiryDestinationSuggestions', () => {
  it('dedupes visitor text and matching lead tag', () => {
    const merged = mergeEnquiryDestinationSuggestions({
      destinationText: 'Goa, Pelling',
      tags: ['Goa', 'Honeymoon'],
    });
    expect(merged).toEqual([
      { name: 'Goa', sources: ['visitor_text', 'lead_tag'] },
      { name: 'Pelling', sources: ['visitor_text'] },
    ]);
  });

  it('keeps suggestions that are already selected so UI can show Already added', () => {
    const merged = mergeEnquiryDestinationSuggestions({
      destinationText: 'Gangtok, Pelling',
      selectedDestinations: [{ placeId: 'p1', name: 'Gangtok', kind: 'city' }],
    });
    expect(merged.map((s) => s.name)).toEqual(['Gangtok', 'Pelling']);
  });

  it('uses tag destinations when no destinationText', () => {
    expect(
      mergeEnquiryDestinationSuggestions({ tags: ['Kerala', 'Family'] }).map((s) => s.name),
    ).toEqual(['Kerala']);
  });
});

describe('classifyDestinationSearchHits', () => {
  const hits = [
    { id: '1', name: 'Gangtok', kind: 'city', parent: { id: 's', name: 'Sikkim', kind: 'state' } },
    { id: '2', name: 'Gangtok Airport', kind: 'airport' },
    { id: '3', name: 'Pelling', kind: 'city', parent: { id: 's', name: 'Sikkim', kind: 'state' } },
    { id: '4', name: 'Pelling', kind: 'area', parent: { id: 'w', name: 'West Sikkim', kind: 'region' } },
  ];

  it('resolves single exact match', () => {
    expect(classifyDestinationSearchHits('Gangtok', hits)).toEqual({
      status: 'exact',
      match: { placeId: '1', name: 'Gangtok', kind: 'city', description: undefined },
    });
  });

  it('marks multiple exact names ambiguous regardless of kind/parent', () => {
    expect(classifyDestinationSearchHits('Pelling', hits)).toEqual({ status: 'ambiguous' });
  });

  it('resolves unique prefix when no exact', () => {
    expect(
      classifyDestinationSearchHits('Darj', [
        { id: 'd', name: 'Darjeeling', kind: 'city' },
        { id: 'g', name: 'Gangtok', kind: 'city' },
      ]),
    ).toEqual({
      status: 'exact',
      match: { placeId: 'd', name: 'Darjeeling', kind: 'city', description: undefined },
    });
  });

  it('does not treat substring-only as exact', () => {
    expect(
      classifyDestinationSearchHits('eling', [{ id: 'd', name: 'Darjeeling', kind: 'city' }]),
    ).toEqual({ status: 'unresolved' });
  });

  it('returns unresolved for empty query', () => {
    expect(classifyDestinationSearchHits('  ', hits)).toEqual({ status: 'unresolved' });
  });
});

describe('readLeadDestinationText', () => {
  it('reads destinationText from custom fields', () => {
    expect(readLeadDestinationText({ destinationText: ' Gangtok ' })).toBe('Gangtok');
    expect(readLeadDestinationText({})).toBeUndefined();
    expect(readLeadDestinationText(null)).toBeUndefined();
  });
});

describe('normalizeDestinationSuggestionKey', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeDestinationSuggestionKey('  North   Sikkim ')).toBe('north sikkim');
  });
});
