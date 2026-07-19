import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv } from './downloadCsv';

describe('downloadCsv', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('builds csv with header', () => {
    const csv = rowsToCsv(['Trip', 'Amount'], [['TRP-01', 1000], ['TRP-02', 2000]]);
    expect(csv).toBe('Trip,Amount\nTRP-01,1000\nTRP-02,2000\n');
  });
});
