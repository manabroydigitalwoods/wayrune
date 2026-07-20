import { describe, expect, it } from 'vitest';
import {
  buildPublicScaleProtocol,
  snapshotFromProtocol,
  PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS,
  PUBLIC_SCALE_MIN_QUOTES_SENT,
  PUBLIC_SCALE_MIN_TRIPS_ACCEPTED,
} from './public-scale-metrics';

describe('buildPublicScaleProtocol', () => {
  it('stays testing below minima', () => {
    const p = buildPublicScaleProtocol({
      activeAgencyOrgs: 3,
      tripsWithAcceptedQuote: 10,
      quotesSent90d: 40,
    });
    expect(p.publicScaleAllowed).toBe(false);
    expect(p.claimStatus).toBe('testing');
    expect(snapshotFromProtocol(p).activeAgencyOrgs).toBeNull();
  });

  it('allows public strip only when all minima clear', () => {
    const p = buildPublicScaleProtocol({
      activeAgencyOrgs: PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS,
      tripsWithAcceptedQuote: PUBLIC_SCALE_MIN_TRIPS_ACCEPTED,
      quotesSent90d: PUBLIC_SCALE_MIN_QUOTES_SENT,
    });
    expect(p.publicScaleAllowed).toBe(true);
    expect(p.claimStatus).toBe('ready');
    const snap = snapshotFromProtocol(p);
    expect(snap.publicScaleAllowed).toBe(true);
    expect(snap.activeAgencyOrgs).toBe(PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS);
    expect(snap.measured).toBe(true);
  });
});
