import { describe, expect, it } from 'vitest';
import { parseFileListEntityIds } from './files-list-query';

describe('parseFileListEntityIds', () => {
  it('merges single, repeated, and CSV ids', () => {
    expect(parseFileListEntityIds('a')).toEqual(['a']);
    expect(parseFileListEntityIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseFileListEntityIds('a', 'b,c')).toEqual(['a', 'b', 'c']);
    expect(parseFileListEntityIds(undefined, '')).toEqual([]);
  });
});
