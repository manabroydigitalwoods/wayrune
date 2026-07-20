/**
 * Demo-only FIT build timing samples for local claim-gate demos.
 * Never call from production write paths or FIT pack install.
 */

import {
  buildFitClaimProtocol,
  FIT_CLAIM_MIN_SAMPLE_SIZE,
  FIT_CLAIM_TARGET_MINUTES,
  medianSorted,
} from './sales-sla-metrics';

export const DEMO_FIT_BUILD_SEED_SOURCE = 'demo_seed';
export const DEMO_FIT_BUILD_ENTITY_PREFIX = 'seed-fit-build-';

/** Fixed under-3m minutes so median clears the public-claim gate when n≥20. */
export const DEMO_FIT_BUILD_MINUTES: readonly number[] = [
  1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.5, 2.6, 2.6, 2.7, 2.7,
  2.8, 2.8, 2.8, 2.9,
];

export type DemoFitBuildTimingSample = {
  entityId: string;
  minutes: number;
  /** Days ago (within 30d window). */
  daysAgo: number;
  metadata: {
    minutes: number;
    milestone: 'first_send';
    source: typeof DEMO_FIT_BUILD_SEED_SOURCE;
  };
};

/** Build idempotent demo samples (default n = min sample for claim gate). */
export function buildDemoFitBuildTimingSamples(
  count = FIT_CLAIM_MIN_SAMPLE_SIZE,
): DemoFitBuildTimingSample[] {
  const n = Math.max(0, Math.min(count, DEMO_FIT_BUILD_MINUTES.length));
  const samples: DemoFitBuildTimingSample[] = [];
  for (let i = 0; i < n; i++) {
    const minutes = DEMO_FIT_BUILD_MINUTES[i]!;
    samples.push({
      entityId: `${DEMO_FIT_BUILD_ENTITY_PREFIX}${String(i + 1).padStart(2, '0')}`,
      minutes,
      daysAgo: 1 + (i % 25),
      metadata: {
        minutes,
        milestone: 'first_send',
        source: DEMO_FIT_BUILD_SEED_SOURCE,
      },
    });
  }
  return samples;
}

/** Assert demo samples would clear the claim gate (for specs / seed sanity). */
export function demoFitBuildSamplesClearClaimGate(
  samples: DemoFitBuildTimingSample[] = buildDemoFitBuildTimingSamples(),
): boolean {
  const minutes = samples.map((s) => s.minutes);
  const protocol = buildFitClaimProtocol({
    sampleSize: minutes.length,
    medianMinutes: medianSorted(minutes),
  });
  return (
    protocol.publicClaimAllowed &&
    protocol.sampleSize >= FIT_CLAIM_MIN_SAMPLE_SIZE &&
    (protocol.medianMinutes ?? Infinity) <= FIT_CLAIM_TARGET_MINUTES
  );
}
