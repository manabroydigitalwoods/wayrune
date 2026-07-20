import { describe, expect, it } from 'vitest';
import {
  addPackageFolderToIndex,
  mergePackageFolderSources,
  parsePackageFolderIndex,
  remapPackageFolderIndex,
  removePackageFolderFromIndex,
  removePackageFolderPrefixFromIndex,
  withPackageFolderIndex,
} from './quote-template-folder-index';

describe('quote-template-folder-index', () => {
  it('parses and de-dupes index paths', () => {
    expect(
      parsePackageFolderIndex({
        packageFolderIndex: [' Beach/Goa ', 'Beach/Goa', 'Hill stations', ''],
      }),
    ).toEqual(['Beach/Goa', 'Hill stations']);
  });

  it('merges index with template folders for empty nodes', () => {
    expect(
      mergePackageFolderSources(
        ['Empty/Shelf', 'Beach/Goa'],
        ['Beach/Goa', 'Hill stations/Darjeeling'],
      ),
    ).toEqual(['Empty/Shelf', 'Beach/Goa', 'Hill stations/Darjeeling']);
  });

  it('adds and removes index entries', () => {
    const added = addPackageFolderToIndex(['Beach'], 'Hill stations/New');
    expect(added).toEqual(['Beach', 'Hill stations/New']);
    expect(addPackageFolderToIndex(added, 'beach')).toEqual(added);
    expect(removePackageFolderFromIndex(added, 'Beach')).toEqual([
      'Hill stations/New',
    ]);
    expect(
      removePackageFolderPrefixFromIndex(
        ['Hill stations', 'Hill stations/Darjeeling', 'Beach/Goa'],
        'Hill stations',
      ),
    ).toEqual(['Beach/Goa']);
  });

  it('remaps index on folder rename/move', () => {
    expect(
      remapPackageFolderIndex(
        ['Hill stations', 'Hill stations/Darjeeling', 'Beach/Goa'],
        'Hill stations',
        'Mountains',
      ),
    ).toEqual(['Mountains', 'Mountains/Darjeeling', 'Beach/Goa']);
    expect(
      remapPackageFolderIndex(
        ['Hill stations/Darjeeling', 'Beach'],
        'Hill stations',
        '',
      ),
    ).toEqual(['Darjeeling', 'Beach']);
  });

  it('writes packageFolderIndex into settingsJson', () => {
    expect(
      withPackageFolderIndex({ fxRates: { USD: 83 } }, ['Beach', '']),
    ).toEqual({ fxRates: { USD: 83 }, packageFolderIndex: ['Beach'] });
    expect(withPackageFolderIndex({ packageFolderIndex: ['X'] }, [])).toEqual(
      {},
    );
  });
});
