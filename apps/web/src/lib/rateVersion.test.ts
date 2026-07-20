import { describe, expect, it } from 'vitest';
import {
  buildActivityRateTipDiffRows,
  buildTransferFareTipDiffRows,
  formatRateVersionHistoryLine,
  formatRateVersionTipDiffCue,
  rateVersionLabel,
  showRateVersionTipDiffExpand,
} from './rateVersion';

describe('rateVersion', () => {
  it('labels versions', () => {
    expect(rateVersionLabel(3)).toBe('v3');
  });

  it('formats transfer history line', () => {
    expect(
      formatRateVersionHistoryLine(
        {
          id: '1',
          versionNumber: 2,
          supersedesId: '0',
          isActive: true,
          unitCost: 4500,
          pricingMode: 'per_vehicle',
        },
        { kind: 'transfer' },
      ),
    ).toMatch(/^v2 · per_vehicle/);
  });

  it('formats tip diff cue', () => {
    expect(
      formatRateVersionTipDiffCue({ summary: 'weekday cost · meal plan' }),
    ).toBe('weekday cost · meal plan');
    expect(formatRateVersionTipDiffCue({ summary: null })).toBeNull();
  });

  it('builds transfer side-by-side Diff rows', () => {
    const rows = buildTransferFareTipDiffRows(
      {
        unitCost: 4000,
        childUnitCost: 2000,
        infantUnitCost: null,
        pricingMode: 'per_vehicle',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
      },
      {
        unitCost: 4500,
        childUnitCost: 2000,
        infantUnitCost: 500,
        pricingMode: 'per_adult',
        startDate: '2026-04-01',
        endDate: '2026-09-30',
      },
      ['adult cost', 'infant cost', 'pricing mode', 'dates'],
    );
    expect(rows.map((r) => r.field)).toEqual([
      'Adult cost',
      'Infant cost',
      'Pricing mode',
      'Dates',
    ]);
    expect(rows[0]?.current).toMatch(/4,?500/);
    expect(rows[1]?.thisTip).toBe('—');
    expect(rows[2]).toMatchObject({
      thisTip: 'per_vehicle',
      current: 'per_adult',
    });
  });

  it('builds activity side-by-side Diff rows', () => {
    const rows = buildActivityRateTipDiffRows(
      {
        unitCost: 1200,
        childUnitCost: 600,
        privateOrSic: 'sic',
        activityName: 'Tea garden',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      {
        unitCost: 1500,
        childUnitCost: 700,
        privateOrSic: 'private',
        activityName: 'Tea garden walk',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      ['adult cost', 'child cost', 'private/SIC', 'activity name'],
    );
    expect(rows).toHaveLength(4);
    expect(rows[2]).toMatchObject({ thisTip: 'sic', current: 'private' });
  });

  it('offers Diff expand only for superseded tips with summary', () => {
    expect(
      showRateVersionTipDiffExpand({
        isActive: true,
        diffVsActive: { summary: 'adult cost' },
      }),
    ).toBe(false);
    expect(
      showRateVersionTipDiffExpand({
        isActive: false,
        diffVsActive: { summary: 'adult cost · dates' },
      }),
    ).toBe(true);
  });
});
