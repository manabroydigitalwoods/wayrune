import { describe, expect, it } from 'vitest';
import {
  FIT_CLAIM_MIN_SAMPLE_SIZE,
  FIT_CLAIM_TARGET_MINUTES,
  buildFitClaimProtocol,
} from './sales-sla-metrics';
import {
  PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS,
  PUBLIC_SCALE_MIN_QUOTES_SENT,
  PUBLIC_SCALE_MIN_TRIPS_ACCEPTED,
  buildPublicScaleProtocol,
} from './public-scale-metrics';
import { fitClaimOpsChecklist, publicScaleOpsChecklist } from './claim-gates';

describe('fitClaimOpsChecklist', () => {
  it('asks for more samples when under minimum', () => {
    const protocol = buildFitClaimProtocol({ sampleSize: 5, medianMinutes: 2.5 });
    const steps = fitClaimOpsChecklist(protocol);
    expect(steps.some((s) => s.includes(String(FIT_CLAIM_MIN_SAMPLE_SIZE - 5)))).toBe(true);
    expect(steps.some((s) => /Testing until/.test(s))).toBe(true);
  });

  it('flags high median', () => {
    const protocol = buildFitClaimProtocol({
      sampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
      medianMinutes: FIT_CLAIM_TARGET_MINUTES + 2,
    });
    expect(fitClaimOpsChecklist(protocol).some((s) => /exceeds/.test(s))).toBe(true);
  });

  it('notes manual registry when gate clear', () => {
    const protocol = buildFitClaimProtocol({
      sampleSize: FIT_CLAIM_MIN_SAMPLE_SIZE,
      medianMinutes: 2,
    });
    expect(protocol.publicClaimAllowed).toBe(true);
    expect(
      fitClaimOpsChecklist(protocol).some((s) => /Technical gate clear/.test(s)),
    ).toBe(true);
  });
});

describe('publicScaleOpsChecklist', () => {
  it('lists shortfalls against minima', () => {
    const protocol = buildPublicScaleProtocol({
      activeAgencyOrgs: 2,
      tripsWithAcceptedQuote: 10,
      quotesSent90d: 20,
    });
    const steps = publicScaleOpsChecklist(protocol);
    expect(steps.some((s) => s.includes(String(PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS - 2)))).toBe(
      true,
    );
    expect(steps.some((s) => s.includes(String(PUBLIC_SCALE_MIN_TRIPS_ACCEPTED - 10)))).toBe(true);
    expect(steps.some((s) => s.includes(String(PUBLIC_SCALE_MIN_QUOTES_SENT - 20)))).toBe(true);
  });
});
