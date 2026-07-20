import { describe, expect, it } from 'vitest';
import {
  applySiblingReorder,
  clearSiblingOrderPrefix,
  parsePackageSiblingOrder,
  remapPackageSiblingOrder,
  removeTemplateIdFromSiblingOrder,
  sortTemplateIdsBySiblingOrder,
  withPackageSiblingOrder,
} from './quote-template-sibling-order';

describe('parsePackageSiblingOrder', () => {
  it('normalizes folder keys and dedupes ids', () => {
    expect(
      parsePackageSiblingOrder({
        packageSiblingOrder: {
          ' Beach/Goa ': ['b', 'a', 'a', ''],
          '': ['root1'],
        },
      }),
    ).toEqual({
      'Beach/Goa': ['b', 'a'],
      '': ['root1'],
    });
  });

  it('returns empty for unset', () => {
    expect(parsePackageSiblingOrder(null)).toEqual({});
    expect(parsePackageSiblingOrder({})).toEqual({});
  });
});

describe('withPackageSiblingOrder', () => {
  it('writes and clears packageSiblingOrder', () => {
    expect(
      withPackageSiblingOrder({ fxRates: { USD: 83 } }, { Beach: ['t1'] }),
    ).toEqual({ fxRates: { USD: 83 }, packageSiblingOrder: { Beach: ['t1'] } });
    expect(
      withPackageSiblingOrder({ packageSiblingOrder: { Beach: ['t1'] } }, {}),
    ).toEqual({});
  });
});

describe('sortTemplateIdsBySiblingOrder', () => {
  it('applies saved order then name for the rest', () => {
    expect(
      sortTemplateIdsBySiblingOrder({
        folder: 'Beach',
        items: [
          { id: 'c', name: 'Charlie' },
          { id: 'a', name: 'Alpha' },
          { id: 'b', name: 'Bravo' },
        ],
        orderMap: { Beach: ['b', 'missing', 'a'] },
      }),
    ).toEqual(['b', 'a', 'c']);
  });

  it('falls back to name when no saved order', () => {
    expect(
      sortTemplateIdsBySiblingOrder({
        folder: null,
        items: [
          { id: '2', name: 'Zed' },
          { id: '1', name: 'Ada' },
        ],
        orderMap: {},
      }),
    ).toEqual(['1', '2']);
  });
});

describe('applySiblingReorder', () => {
  it('keeps only ids in folder and appends missing', () => {
    expect(
      applySiblingReorder({
        folder: 'Beach',
        orderedIds: ['b', 'ghost', 'a'],
        idsInFolder: ['a', 'b', 'c'],
        previous: { Other: ['x'] },
      }),
    ).toEqual({
      Other: ['x'],
      Beach: ['b', 'a', 'c'],
    });
  });
});

describe('removeTemplateIdFromSiblingOrder / clear / remap', () => {
  it('removes an id from all folders', () => {
    expect(
      removeTemplateIdFromSiblingOrder(
        { Beach: ['a', 'b'], '': ['b', 'c'] },
        'b',
      ),
    ).toEqual({ Beach: ['a'], '': ['c'] });
  });

  it('clears prefix keys', () => {
    expect(
      clearSiblingOrderPrefix(
        {
          Beach: ['a'],
          'Beach/Goa': ['b'],
          Hills: ['c'],
        },
        'Beach',
      ),
    ).toEqual({ Hills: ['c'] });
  });

  it('remaps keys on folder rename', () => {
    expect(
      remapPackageSiblingOrder(
        { 'Hill stations/Darjeeling': ['a'], Beach: ['b'] },
        'Hill stations',
        'Mountains',
      ),
    ).toEqual({
      'Mountains/Darjeeling': ['a'],
      Beach: ['b'],
    });
  });
});
