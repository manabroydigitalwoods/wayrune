import { describe, expect, it } from 'vitest';
import {
  countLossMakingLines,
  countMarginPolicyViolations,
  lineMarginPolicyViolation,
  lineUnitMargin,
  parseMinMarginPercent,
} from './quoteMargin';

describe('lineUnitMargin', () => {
  it('detects sell below cost', () => {
    const m = lineUnitMargin(7, 6);
    expect(m?.lossMaking).toBe(true);
    expect(m?.profit).toBe(-1);
    expect(m?.belowBy).toBe(1);
    expect(m?.marginPercent).toBeCloseTo(-16.666, 2);
  });

  it('returns null when either side is missing', () => {
    expect(lineUnitMargin(null, 6)).toBeNull();
    expect(lineUnitMargin(7, null)).toBeNull();
  });

  it('treats equal cost and sell as not loss-making', () => {
    expect(lineUnitMargin(5, 5)?.lossMaking).toBe(false);
  });
});

describe('lineMarginPolicyViolation', () => {
  it('flags loss-making regardless of floor', () => {
    const v = lineMarginPolicyViolation(100, 90, 15);
    expect(v?.kind).toBe('loss');
  });

  it('flags below-floor when sell is above cost but margin is thin', () => {
    // cost 100, sell 110 → margin ≈ 9.09% < 15%
    const v = lineMarginPolicyViolation(100, 110, 15);
    expect(v?.kind).toBe('below_floor');
    expect(v?.shortfallPercent).toBeGreaterThan(0);
  });

  it('passes when margin meets floor', () => {
    // cost 100, sell 125 → margin = 20%
    expect(lineMarginPolicyViolation(100, 125, 15)).toBeNull();
  });

  it('with floor 0 only blocks loss-making', () => {
    expect(lineMarginPolicyViolation(100, 101, 0)).toBeNull();
    expect(lineMarginPolicyViolation(100, 99, 0)?.kind).toBe('loss');
  });
});

describe('countLossMakingLines', () => {
  it('ignores overridden lines when requested', () => {
    const items = [
      { unitCost: 7, unitSell: 6 },
      { unitCost: 10, unitSell: 8, marginOverride: { reason: 'Client deal' } },
      { unitCost: 5, unitSell: 6 },
    ];
    expect(countLossMakingLines(items)).toBe(2);
    expect(countLossMakingLines(items, { ignoreOverridden: true })).toBe(1);
  });
});

describe('countMarginPolicyViolations', () => {
  it('counts thin-margin lines against the floor', () => {
    const items = [
      { unitCost: 100, unitSell: 110 }, // ~9%
      { unitCost: 100, unitSell: 130 }, // ~23%
      { unitCost: 100, unitSell: 90 }, // loss
    ];
    expect(countMarginPolicyViolations(items, 15)).toBe(2);
    expect(countMarginPolicyViolations(items, 0)).toBe(1);
  });
});

describe('parseMinMarginPercent', () => {
  it('defaults to 0', () => {
    expect(parseMinMarginPercent(null)).toBe(0);
    expect(parseMinMarginPercent({})).toBe(0);
  });

  it('clamps valid values', () => {
    expect(parseMinMarginPercent({ minMarginPercent: 12.5 })).toBe(12.5);
    expect(parseMinMarginPercent({ minMarginPercent: 150 })).toBe(100);
  });
});
