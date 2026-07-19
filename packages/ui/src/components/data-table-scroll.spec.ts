import { describe, expect, it } from 'vitest';
import { dataTablePageIndexForRowId } from './data-table';

describe('dataTablePageIndexForRowId', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`);

  it('returns null when missing', () => {
    expect(dataTablePageIndexForRowId(ids, null, 25)).toBeNull();
    expect(dataTablePageIndexForRowId(ids, 'missing', 25)).toBeNull();
  });

  it('maps to the correct page', () => {
    expect(dataTablePageIndexForRowId(ids, 'line-1', 25)).toBe(0);
    expect(dataTablePageIndexForRowId(ids, 'line-25', 25)).toBe(0);
    expect(dataTablePageIndexForRowId(ids, 'line-26', 25)).toBe(1);
  });
});
