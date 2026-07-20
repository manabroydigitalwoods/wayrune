import { describe, expect, it } from 'vitest';
import {
  clampAlternativesLimit,
  pickPreferredOrBest,
  sortRankedRates,
  toMatchAlternatives,
} from './rate-resolve-alternatives';

describe('rate-resolve-alternatives', () => {
  it('clamps alternativesLimit', () => {
    expect(clampAlternativesLimit(undefined)).toBe(0);
    expect(clampAlternativesLimit(3)).toBe(3);
    expect(clampAlternativesLimit(99)).toBe(5);
    expect(clampAlternativesLimit(-1)).toBe(0);
  });

  it('promotes preferred rate when eligible', () => {
    const ranked = sortRankedRates([
      { row: { id: 'a' }, score: 30 },
      { row: { id: 'b' }, score: 20 },
      { row: { id: 'c' }, score: 10 },
    ]);
    const { best, rest } = pickPreferredOrBest(ranked, 'b');
    expect(best?.row.id).toBe('b');
    expect(rest.map((r) => r.row.id)).toEqual(['a', 'c']);
  });

  it('falls back to top score when preferred missing', () => {
    const ranked = sortRankedRates([
      { row: { id: 'a' }, score: 30 },
      { row: { id: 'b' }, score: 20 },
    ]);
    const { best, rest } = pickPreferredOrBest(ranked, 'missing');
    expect(best?.row.id).toBe('a');
    expect(rest.map((r) => r.row.id)).toEqual(['b']);
  });

  it('builds alternative payloads', () => {
    const alts = toMatchAlternatives(
      [
        { row: { id: 'x', roomType: 'DLX', mealPlan: 'CP' }, score: 15 },
        { row: { id: 'y', roomType: 'STD', mealPlan: 'EP' }, score: 10 },
      ],
      1,
      (r) => `${r.roomType} · ${r.mealPlan}`,
      () => 4500,
    );
    expect(alts).toEqual([
      {
        rateId: 'x',
        label: 'DLX · CP',
        score: 15,
        chartUnitCost: 4500,
        previewBuyTotal: null,
      },
    ]);
  });

  it('attaches previewBuyTotal when provided', () => {
    const alts = toMatchAlternatives(
      [{ row: { id: 'x' }, score: 10 }],
      1,
      () => 'Alt',
      () => 100,
      () => 2500,
    );
    expect(alts[0]?.previewBuyTotal).toBe(2500);
  });
});
