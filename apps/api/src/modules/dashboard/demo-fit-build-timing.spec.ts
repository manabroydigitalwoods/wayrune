import { describe, expect, it } from 'vitest';
import {
  FIT_CLAIM_MIN_SAMPLE_SIZE,
  FIT_CLAIM_TARGET_MINUTES,
  buildFitClaimProtocol,
  medianSorted,
} from './sales-sla-metrics';
import {
  DEMO_FIT_BUILD_ENTITY_PREFIX,
  DEMO_FIT_BUILD_SEED_SOURCE,
  buildDemoFitBuildTimingSamples,
  demoFitBuildSamplesClearClaimGate,
} from './demo-fit-build-timing';

describe('demo-fit-build-timing', () => {
  it('builds 20 demo-scoped samples with seed entity ids', () => {
    const samples = buildDemoFitBuildTimingSamples();
    expect(samples).toHaveLength(FIT_CLAIM_MIN_SAMPLE_SIZE);
    expect(samples[0]?.entityId).toBe(`${DEMO_FIT_BUILD_ENTITY_PREFIX}01`);
    expect(samples.every((s) => s.metadata.source === DEMO_FIT_BUILD_SEED_SOURCE)).toBe(
      true,
    );
    expect(samples.every((s) => s.daysAgo >= 1 && s.daysAgo <= 30)).toBe(true);
  });

  it('clears the claim gate (n≥20 and median ≤3m)', () => {
    const samples = buildDemoFitBuildTimingSamples();
    const minutes = samples.map((s) => s.minutes);
    const median = medianSorted(minutes);
    expect(median).not.toBeNull();
    expect(median!).toBeLessThanOrEqual(FIT_CLAIM_TARGET_MINUTES);
    expect(
      buildFitClaimProtocol({
        sampleSize: samples.length,
        medianMinutes: median,
      }),
    ).toMatchObject({
      claimStatus: 'ready',
      publicClaimAllowed: true,
    });
    expect(demoFitBuildSamplesClearClaimGate(samples)).toBe(true);
  });
});
