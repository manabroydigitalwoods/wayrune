import { describe, expect, it } from 'vitest';
import {
  PUBLIC_SCALE_SNAPSHOT,
  publicScaleStripVisible,
} from './publicScaleSnapshot';

describe('publicScaleSnapshot', () => {
  it('hides strip while snapshot is not allowed', () => {
    expect(PUBLIC_SCALE_SNAPSHOT.publicScaleAllowed).toBe(false);
    expect(publicScaleStripVisible()).toBe(false);
  });

  it('shows strip only when all measured fields present', () => {
    expect(
      publicScaleStripVisible({
        asOf: '2026-07-20',
        publicScaleAllowed: true,
        activeAgencyOrgs: 12,
        tripsWithAcceptedQuote: 80,
        quotesSent90d: 200,
        measured: true,
      }),
    ).toBe(true);
    expect(
      publicScaleStripVisible({
        asOf: '2026-07-20',
        publicScaleAllowed: true,
        activeAgencyOrgs: null,
        tripsWithAcceptedQuote: 80,
        quotesSent90d: 200,
        measured: true,
      }),
    ).toBe(false);
  });
});
