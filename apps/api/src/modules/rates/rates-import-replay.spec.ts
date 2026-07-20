import { describe, expect, it } from 'vitest';
import {
  buildRatesImportReplayCsv,
  composeRatesImportReplaySkipLines,
  RATES_IMPORT_REPLAY_SKIP_LINE_CAP,
} from './rates-import-replay';

describe('composeRatesImportReplaySkipLines', () => {
  it('returns skip data lines in row order', () => {
    expect(
      composeRatesImportReplaySkipLines({
        results: [
          { row: 1, status: 'ok' },
          { row: 2, status: 'skip' },
          { row: 3, status: 'skip' },
        ],
        replaySource: {
          headerLine: 'name,cost',
          dataLines: ['a,1', 'b,2', 'c,3'],
        },
      }),
    ).toEqual(['b,2', 'c,3']);
  });

  it('caps replay lines', () => {
    const results = Array.from({ length: RATES_IMPORT_REPLAY_SKIP_LINE_CAP + 5 }, (_, i) => ({
      row: i + 1,
      status: 'skip' as const,
    }));
    const dataLines = results.map((_, i) => `row${i},1`);
    expect(
      composeRatesImportReplaySkipLines({
        results,
        replaySource: { headerLine: 'name,cost', dataLines },
      }),
    ).toHaveLength(RATES_IMPORT_REPLAY_SKIP_LINE_CAP);
  });
});

describe('buildRatesImportReplayCsv', () => {
  it('builds header + skip lines', () => {
    expect(
      buildRatesImportReplayCsv({
        replayHeaderLine: 'name,cost',
        replaySkipLines: ['bad,0'],
      }),
    ).toBe('name,cost\nbad,0');
  });

  it('returns null when replay unavailable', () => {
    expect(buildRatesImportReplayCsv({ replayHeaderLine: null, replaySkipLines: [] })).toBeNull();
  });
});
