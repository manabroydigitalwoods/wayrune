import { describe, expect, it } from 'vitest';
import {
  clearTemplateIdIfFilteredOut,
  collectUniquePickerMetaChips,
  filterTemplatesByFolderAndTag,
  formatPackagePickerDescription,
  pickerMetaChips,
} from './quoteTemplatePickerFilter';

describe('filterTemplatesByFolderAndTag', () => {
  const rows = [
    {
      id: 'dj',
      name: 'Darjeeling',
      content: { folder: 'Hill stations', tags: ['hill', 'family'], items: [1, 2] },
    },
    {
      id: 'goa',
      name: 'Goa',
      content: { folder: 'Beach', tags: ['beach', 'honeymoon'], destinationHint: 'Goa', items: [1] },
    },
  ];

  it('matches all when filters empty', () => {
    expect(filterTemplatesByFolderAndTag(rows, {})).toHaveLength(2);
  });

  it('filters by folder and tag', () => {
    expect(filterTemplatesByFolderAndTag(rows, { folder: 'Beach' }).map((r) => r.id)).toEqual([
      'goa',
    ]);
    expect(filterTemplatesByFolderAndTag(rows, { tag: 'hill' }).map((r) => r.id)).toEqual(['dj']);
    expect(
      filterTemplatesByFolderAndTag(rows, { folder: 'Hill', tag: 'beach' }),
    ).toHaveLength(0);
  });

  it('filters by folder path prefix', () => {
    const nested = [
      {
        id: 'dj',
        name: 'Darjeeling',
        content: { folder: 'Hill stations/Darjeeling', tags: ['hill'] },
      },
      {
        id: 'goa',
        name: 'Goa',
        content: { folder: 'Beach/Goa', tags: ['beach'] },
      },
    ];
    expect(
      filterTemplatesByFolderAndTag(nested, { folder: 'Hill stations' }).map((r) => r.id),
    ).toEqual(['dj']);
    expect(
      filterTemplatesByFolderAndTag(nested, { folder: 'Hill stations/Darjeeling' }).map(
        (r) => r.id,
      ),
    ).toEqual(['dj']);
  });
});

describe('formatPackagePickerDescription', () => {
  it('joins folder, tags, hint, lines', () => {
    expect(
      formatPackagePickerDescription({
        folder: 'Beach',
        tags: ['honeymoon'],
        destinationHint: 'Goa',
        items: [1, 2, 3],
      }),
    ).toBe('Beach · honeymoon · Goa · 3 lines');
  });
});

describe('clearTemplateIdIfFilteredOut', () => {
  it('clears when selected id is not visible', () => {
    expect(clearTemplateIdIfFilteredOut('goa', ['dj'])).toBe('');
    expect(clearTemplateIdIfFilteredOut('goa', ['goa', 'dj'])).toBe('goa');
    expect(clearTemplateIdIfFilteredOut('', ['dj'])).toBe('');
  });
});

describe('pickerMetaChips', () => {
  it('trims folder and tags', () => {
    expect(
      pickerMetaChips({ folder: ' Beach ', tags: [' honeymoon ', '', 'beach'] }),
    ).toEqual({ folder: 'Beach', tags: ['honeymoon', 'beach'] });
    expect(pickerMetaChips(null)).toEqual({ tags: [] });
  });
});

describe('collectUniquePickerMetaChips', () => {
  it('dedupes folders and tags across rows', () => {
    expect(
      collectUniquePickerMetaChips([
        { id: 'a', name: 'A', content: { folder: 'Beach', tags: ['beach', 'honeymoon'] } },
        { id: 'b', name: 'B', content: { folder: 'beach', tags: ['Beach', 'family'] } },
        { id: 'c', name: 'C', content: { folder: 'Hill stations', tags: ['hill'] } },
      ]),
    ).toEqual({
      folders: ['Beach', 'Hill stations'],
      tags: ['beach', 'honeymoon', 'family', 'hill'],
    });
  });
});
