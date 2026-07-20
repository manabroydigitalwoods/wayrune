import { describe, expect, it } from 'vitest';
import {
  buildRevisionMarginDelta,
  commercialTotalsFromLines,
  commercialTotalsFromVersion,
  resolveRevisionBaseline,
  signedMoneyDelta,
  signedPpDelta,
} from './revisionMarginDelta';

describe('revisionMarginDelta', () => {
  it('computes live-style totals skipping nulls', () => {
    const snap = commercialTotalsFromLines([
      { quantity: 2, unitCost: 100, unitSell: 150, taxPercent: 10 },
      { quantity: 1, unitCost: null, unitSell: 50, taxPercent: 0 },
    ]);
    expect(snap.costTotal).toBe(200);
    expect(snap.sellExTax).toBe(350); // 300 + 50
    expect(snap.sellTotal).toBe(380); // 300*1.1 + 50
    expect(snap.marginAmount).toBe(150);
    expect(snap.incomplete).toBe(true);
  });

  it('recomputes baseline from itemsJson', () => {
    const snap = commercialTotalsFromVersion({
      id: 'v1',
      itemsJson: [
        { quantity: 1, unitCost: 1000, unitSell: 1200, taxPercent: 0 },
      ],
    });
    expect(snap?.costTotal).toBe(1000);
    expect(snap?.marginPercent).toBeCloseTo(16.666, 1);
  });

  it('resolves prior version then accepted fallback', () => {
    const prior = resolveRevisionBaseline({
      versions: [
        { id: 'a', versionNumber: 1, status: 'sent' },
        { id: 'b', versionNumber: 2, status: 'draft' },
      ],
      selectedVersionId: 'b',
    });
    expect(prior).toEqual({
      baseline: { id: 'a', versionNumber: 1, status: 'sent' },
      source: 'prior_version',
    });

    const fromAccepted = resolveRevisionBaseline({
      versions: [{ id: 'new', versionNumber: 1, status: 'draft', label: 'v1 (from accepted)' }],
      selectedVersionId: 'new',
      tripAcceptedVersions: [
        { id: 'acc', versionNumber: 3, status: 'accepted' },
      ],
    });
    expect(fromAccepted?.source).toBe('accepted');
    expect(fromAccepted?.baseline.id).toBe('acc');
  });

  it('builds delta and signed helpers', () => {
    const before = commercialTotalsFromLines([
      { quantity: 1, unitCost: 100, unitSell: 120, taxPercent: 0 },
    ]);
    const after = commercialTotalsFromLines([
      { quantity: 1, unitCost: 100, unitSell: 140, taxPercent: 0 },
    ]);
    const delta = buildRevisionMarginDelta({
      before,
      after,
      source: 'prior_version',
      canViewCost: true,
      baselineLabel: 'v1',
    });
    expect(delta?.deltaSellExTax).toBe(20);
    expect(delta?.deltaMarginPp).toBeCloseTo(after.marginPercent - before.marginPercent);
    expect(signedMoneyDelta(20)).toEqual({ sign: '+', abs: 20 });
    expect(signedPpDelta(-1.2).sign).toBe('−');
  });

  it('hides when cost cannot be viewed', () => {
    expect(
      buildRevisionMarginDelta({
        before: commercialTotalsFromLines([
          { quantity: 1, unitCost: 1, unitSell: 2, taxPercent: 0 },
        ]),
        after: commercialTotalsFromLines([
          { quantity: 1, unitCost: 1, unitSell: 3, taxPercent: 0 },
        ]),
        source: 'accepted',
        canViewCost: false,
      }),
    ).toBeNull();
  });
});
