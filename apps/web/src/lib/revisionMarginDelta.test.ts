import { describe, expect, it } from 'vitest';
import {
  buildRevisionMarginDelta,
  commercialTotalsFromLines,
  commercialTotalsFromVersion,
  resolveRevisionBaseline,
  revisionChangedLineSummaries,
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

  it('computes tax delta and changed-line summaries', () => {
    const before = commercialTotalsFromLines([
      { quantity: 1, unitCost: 100, unitSell: 200, taxPercent: 5 },
      { quantity: 1, unitCost: 50, unitSell: 80, taxPercent: 0 },
    ]);
    const after = commercialTotalsFromLines([
      { quantity: 1, unitCost: 100, unitSell: 200, taxPercent: 18 },
      { quantity: 2, unitCost: 50, unitSell: 90, taxPercent: 0 },
    ]);
    const delta = buildRevisionMarginDelta({
      before,
      after,
      source: 'prior_version',
      canViewCost: true,
      beforeLines: [
        { id: 'h1', description: 'Hotel', quantity: 1, unitCost: 100, unitSell: 200, taxPercent: 5 },
        { id: 't1', description: 'Transfer', quantity: 1, unitCost: 50, unitSell: 80, taxPercent: 0 },
      ],
      afterLines: [
        { id: 'h1', description: 'Hotel', quantity: 1, unitCost: 100, unitSell: 200, taxPercent: 18 },
        { id: 't1', description: 'Transfer', quantity: 2, unitCost: 50, unitSell: 90, taxPercent: 0 },
        { id: 'a1', description: 'Activity', quantity: 1, unitCost: 20, unitSell: 40, taxPercent: 0 },
      ],
    });
    // Tax rose on the hotel line: 200*0.05 -> 200*0.18.
    expect(delta?.deltaTax).toBeCloseTo(200 * 0.18 - 200 * 0.05, 5);
    expect(delta?.changedLineSummaries).toContain('~ Hotel');
    expect(delta?.changedLineSummaries).toContain('~ Transfer');
    expect(delta?.changedLineSummaries).toContain('+ Activity');
  });

  it('summarizes added, removed, and changed lines', () => {
    const summaries = revisionChangedLineSummaries(
      [
        { id: 'a', description: 'Keep', quantity: 1, unitCost: 1, unitSell: 2, taxPercent: 0 },
        { id: 'b', description: 'Drop me', quantity: 1, unitCost: 1, unitSell: 2, taxPercent: 0 },
      ],
      [
        { id: 'a', description: 'Keep', quantity: 1, unitCost: 1, unitSell: 2, taxPercent: 0 },
        { id: 'c', description: 'New one', quantity: 1, unitCost: 1, unitSell: 2, taxPercent: 0 },
      ],
    );
    expect(summaries).toContain('+ New one');
    expect(summaries).toContain('− Drop me');
    expect(summaries).not.toContain('~ Keep');
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
