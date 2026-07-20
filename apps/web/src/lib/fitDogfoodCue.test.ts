import { describe, expect, it } from 'vitest';
import {
  fitClaimRemainingSamples,
  formatFitClaimRemainingCue,
  formatFitDogfoodWorkspaceCue,
} from './fitDogfoodCue';

describe('fitDogfoodCue', () => {
  it('counts remaining samples', () => {
    expect(fitClaimRemainingSamples({ sampleSize: 3, minSampleSize: 20 })).toBe(17);
    expect(fitClaimRemainingSamples({ sampleSize: 20, minSampleSize: 20 })).toBe(0);
  });

  it('formats workspace cue with remaining and demo exclude', () => {
    expect(formatFitDogfoodWorkspaceCue(null)).toMatch(/records FIT build timing/);
    expect(
      formatFitDogfoodWorkspaceCue({
        sampleSize: 5,
        minSampleSize: 20,
        medianMinutes: 4,
        demoSampleSize: 20,
        targetMinutes: 3,
      }),
    ).toBe(
      'This send counts toward FIT timing · 5/20 real · median 4m · 20 demo excluded · 15 more to gate',
    );
    expect(
      formatFitDogfoodWorkspaceCue({
        sampleSize: 22,
        minSampleSize: 20,
        medianMinutes: 2,
        publicClaimAllowed: true,
        targetMinutes: 3,
      }),
    ).toMatch(/gate clear.*Testing until sign-off/);
  });

  it('formats remaining cue', () => {
    expect(
      formatFitClaimRemainingCue({ sampleSize: 19, minSampleSize: 20 }),
    ).toBe('1 more real send to reach 20');
    expect(
      formatFitClaimRemainingCue({ sampleSize: 20, minSampleSize: 20 }),
    ).toBeNull();
  });
});
