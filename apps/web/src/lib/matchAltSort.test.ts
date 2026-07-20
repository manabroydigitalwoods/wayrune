import { describe, expect, it } from 'vitest';
import { sortMatchAlternatives } from './matchAltSort';

describe('matchAltSort', () => {
  const alts = [
    { id: 'a', estimatedBuy: 9000, preferred: false, score: 0.5 },
    { id: 'b', estimatedBuy: 7000, preferred: true, score: 0.4 },
    { id: 'c', estimatedBuy: 8000, preferred: false, score: 0.9 },
  ];

  it('sorts lowest buy', () => {
    expect(sortMatchAlternatives(alts, 'lowest_buy').map((x) => x.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('sorts preferred first', () => {
    expect(sortMatchAlternatives(alts, 'preferred').map((x) => x.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('sorts best by score then buy', () => {
    expect(sortMatchAlternatives(alts, 'best').map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('falls back to unitCost then infinity when estimatedBuy is absent', () => {
    const rows = [
      { id: 'noBuy' },
      { id: 'unit', unitCost: 5000 },
      { id: 'est', estimatedBuy: 4000 },
    ];
    expect(sortMatchAlternatives(rows, 'lowest_buy').map((x) => x.id)).toEqual([
      'est',
      'unit',
      'noBuy',
    ]);
  });

  it('breaks preferred ties by lowest buy', () => {
    const rows = [
      { id: 'p-high', preferred: true, estimatedBuy: 9000 },
      { id: 'p-low', preferred: true, estimatedBuy: 6000 },
      { id: 'plain', preferred: false, estimatedBuy: 1000 },
    ];
    expect(sortMatchAlternatives(rows, 'preferred').map((x) => x.id)).toEqual([
      'p-low',
      'p-high',
      'plain',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...alts];
    const before = input.map((x) => x.id);
    sortMatchAlternatives(input, 'lowest_buy');
    expect(input.map((x) => x.id)).toEqual(before);
  });
});
