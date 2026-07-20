/** Skip-row replay payload for rate CSV/XLSX import batches. */

export const RATES_IMPORT_REPLAY_SKIP_LINE_CAP = 50;

export type RatesImportReplaySource = {
  headerLine: string;
  dataLines: string[];
};

/** Collect original CSV data lines for rows that skipped on commit. */
export function composeRatesImportReplaySkipLines(input: {
  results: Array<{ row: number; status: 'ok' | 'skip' }>;
  replaySource?: RatesImportReplaySource | null;
}): string[] {
  const header = input.replaySource?.headerLine?.trim();
  const lines = input.replaySource?.dataLines ?? [];
  if (!header || !lines.length) return [];

  const skipRows = input.results
    .filter((r) => r.status === 'skip')
    .map((r) => r.row)
    .sort((a, b) => a - b);

  const out: string[] = [];
  for (const row of skipRows) {
    const line = lines[row - 1]?.trim();
    if (!line) continue;
    out.push(line);
    if (out.length >= RATES_IMPORT_REPLAY_SKIP_LINE_CAP) break;
  }
  return out;
}

export function buildRatesImportReplayCsv(meta: {
  replayHeaderLine?: string | null;
  replaySkipLines?: string[] | null;
}): string | null {
  const header = meta.replayHeaderLine?.trim();
  const skips = (meta.replaySkipLines ?? []).map((l) => l.trim()).filter(Boolean);
  if (!header || !skips.length) return null;
  return [header, ...skips].join('\n');
}
