import { describe, expect, it } from 'vitest';
import {
  computeSalesSlaMetrics,
  formatHoursCompact,
  hoursBetween,
  medianSorted,
  buildFitClaimProtocol,
  buildFitClaimProtocolFromRows,
  fitClaimRemainingSamples,
  FIT_BUILD_DEMO_SEED_SOURCE,
  FIT_CLAIM_MIN_SAMPLE_SIZE,
  FIT_CLAIM_TARGET_MINUTES,
  salesSlaMedianTone,
  salesSlaTargetsFromSettings,
} from './sales-sla-metrics';

describe('medianSorted', () => {
  it('returns null for empty', () => {
    expect(medianSorted([])).toBeNull();
  });

  it('handles odd and even lengths', () => {
    expect(medianSorted([3, 1, 2])).toBe(2);
    expect(medianSorted([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('computeSalesSlaMetrics', () => {
  const t0 = new Date('2026-07-01T08:00:00.000Z');

  it('computes medians from first touch and first quote', () => {
    const rows = [
      {
        createdAt: t0,
        firstTouchAt: new Date(t0.getTime() + 2 * 3_600_000),
        firstQuoteAt: new Date(t0.getTime() + 24 * 3_600_000),
      },
      {
        createdAt: t0,
        firstTouchAt: new Date(t0.getTime() + 6 * 3_600_000),
        firstQuoteAt: new Date(t0.getTime() + 48 * 3_600_000),
      },
      {
        createdAt: t0,
        firstTouchAt: null,
        firstQuoteAt: null,
      },
    ];
    const m = computeSalesSlaMetrics(rows);
    expect(m.firstTouchSampleSize).toBe(2);
    expect(m.leadToQuoteSampleSize).toBe(2);
    expect(m.medianFirstTouchHours).toBe(4);
    expect(m.medianLeadToQuoteHours).toBe(36);
    expect(m.fitBuildSampleSize).toBe(0);
    expect(m.medianFitBuildMinutes).toBeNull();
    expect(m.fitBuildDemoSampleSize).toBe(0);
  });

  it('computes median FIT build minutes', () => {
    const m = computeSalesSlaMetrics([], [{ minutes: 2 }, { minutes: 4 }, { minutes: 6 }]);
    expect(m.fitBuildSampleSize).toBe(3);
    expect(m.medianFitBuildMinutes).toBe(4);
    expect(m.fitBuildDemoSampleSize).toBe(0);
  });

  it('excludes demo_seed from FIT median and sample size', () => {
    const m = computeSalesSlaMetrics(
      [],
      [
        { minutes: 2 },
        { minutes: 4 },
        { minutes: 1, source: FIT_BUILD_DEMO_SEED_SOURCE },
        { minutes: 1, source: FIT_BUILD_DEMO_SEED_SOURCE },
      ],
    );
    expect(m.fitBuildSampleSize).toBe(2);
    expect(m.medianFitBuildMinutes).toBe(3);
    expect(m.fitBuildDemoSampleSize).toBe(2);
  });

  it('ignores touch/quote before createdAt', () => {
    const m = computeSalesSlaMetrics([
      {
        createdAt: t0,
        firstTouchAt: new Date(t0.getTime() - 1000),
        firstQuoteAt: new Date(t0.getTime() - 1000),
      },
    ]);
    expect(m.firstTouchSampleSize).toBe(0);
    expect(m.medianFirstTouchHours).toBeNull();
  });
});

describe('formatHoursCompact', () => {
  it('formats minutes, hours, and days', () => {
    expect(formatHoursCompact(0.25)).toBe('15m');
    expect(formatHoursCompact(4)).toBe('4h');
    expect(formatHoursCompact(72)).toBe('3d');
    expect(formatHoursCompact(null)).toBe('—');
  });
});

describe('hoursBetween', () => {
  it('returns fractional hours', () => {
    const a = new Date('2026-07-01T00:00:00.000Z');
    const b = new Date('2026-07-01T01:30:00.000Z');
    expect(hoursBetween(a, b)).toBe(1.5);
  });
});

describe('salesSlaTargetsFromSettings', () => {
  it('reads valid targets and ignores invalid', () => {
    expect(
      salesSlaTargetsFromSettings({
        firstTouchTargetHours: 4,
        leadToQuoteTargetHours: 48,
        fitBuildTargetMinutes: 30,
      }),
    ).toEqual({
      firstTouchTargetHours: 4,
      leadToQuoteTargetHours: 48,
      fitBuildTargetMinutes: 30,
    });
    expect(
      salesSlaTargetsFromSettings({
        firstTouchTargetHours: null,
        leadToQuoteTargetHours: 0,
        fitBuildTargetMinutes: 99999,
      }),
    ).toEqual({
      firstTouchTargetHours: null,
      leadToQuoteTargetHours: null,
      fitBuildTargetMinutes: null,
    });
  });
});

describe('salesSlaMedianTone', () => {
  it('tones success / warn / danger / neutral', () => {
    expect(salesSlaMedianTone(3, 4)).toBe('success');
    expect(salesSlaMedianTone(5, 4)).toBe('warn');
    expect(salesSlaMedianTone(7, 4)).toBe('danger');
    expect(salesSlaMedianTone(5, null)).toBe('neutral');
    expect(salesSlaMedianTone(null, 4)).toBe('neutral');
  });
});

describe('fitClaimRemainingSamples', () => {
  it('counts remaining real samples to min', () => {
    expect(fitClaimRemainingSamples({ sampleSize: 5, minSampleSize: 20 })).toBe(15);
    expect(fitClaimRemainingSamples({ sampleSize: 20, minSampleSize: 20 })).toBe(0);
    expect(fitClaimRemainingSamples({ sampleSize: 25, minSampleSize: 20 })).toBe(0);
  });
});

describe('buildFitClaimProtocol', () => {
  it('stays testing until sample and median clear the gate', () => {
    expect(
      buildFitClaimProtocol({ sampleSize: 5, medianMinutes: 2 }),
    ).toMatchObject({
      claimStatus: 'testing',
      publicClaimAllowed: false,
      targetMinutes: FIT_CLAIM_TARGET_MINUTES,
      minSampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
      sampleSize: 5,
      medianMinutes: 2,
      demoSampleSize: 0,
      demoClaimReady: false,
    });
    expect(
      buildFitClaimProtocol({
        sampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
        medianMinutes: 4,
      }).publicClaimAllowed,
    ).toBe(false);
    expect(
      buildFitClaimProtocol({
        sampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
        medianMinutes: 2.5,
      }),
    ).toMatchObject({
      claimStatus: 'ready',
      publicClaimAllowed: true,
    });
  });
});

describe('buildFitClaimProtocolFromRows', () => {
  it('excludes demo_seed from publicClaimAllowed', () => {
    const demoRows = Array.from({ length: 20 }, (_, i) => ({
      minutes: 2,
      source: FIT_BUILD_DEMO_SEED_SOURCE,
    }));
    const protocol = buildFitClaimProtocolFromRows(demoRows);
    expect(protocol.publicClaimAllowed).toBe(false);
    expect(protocol.sampleSize).toBe(0);
    expect(protocol.demoSampleSize).toBe(20);
    expect(protocol.demoClaimReady).toBe(true);
  });

  it('clears the gate on real samples only', () => {
    const real = Array.from({ length: 20 }, () => ({
      minutes: 2.5,
      source: null as string | null,
    }));
    const mixed = [
      ...real,
      { minutes: 1, source: FIT_BUILD_DEMO_SEED_SOURCE },
    ];
    const protocol = buildFitClaimProtocolFromRows(mixed);
    expect(protocol.publicClaimAllowed).toBe(true);
    expect(protocol.sampleSize).toBe(20);
    expect(protocol.demoSampleSize).toBe(1);
    expect(protocol.demoClaimReady).toBe(false);
  });
});
