import { describe, expect, it } from 'vitest';
import {
  formatHoursCompact,
  formatHoursTargetCue,
  formatMinutesTargetCue,
  formatFitClaimProtocolCue,
  salesSlaMedianTone,
} from './salesSlaFormat';

describe('salesSlaMedianTone', () => {
  it('tones success / warn / danger / neutral', () => {
    expect(salesSlaMedianTone(3, 4)).toBe('success');
    expect(salesSlaMedianTone(5, 4)).toBe('warn');
    expect(salesSlaMedianTone(7, 4)).toBe('danger');
    expect(salesSlaMedianTone(5, null)).toBe('neutral');
    expect(salesSlaMedianTone(null, 4)).toBe('neutral');
  });
});

describe('target cues', () => {
  it('formats hour and minute cues', () => {
    expect(formatHoursTargetCue(4)).toBe('target 4h');
    expect(formatHoursTargetCue(null)).toBeNull();
    expect(formatMinutesTargetCue(30)).toBe('target 30m');
    expect(formatMinutesTargetCue(90)).toBe('target 1.5h');
  });

  it('keeps compact hours helper', () => {
    expect(formatHoursCompact(4)).toBe('4h');
  });
});

describe('formatFitClaimProtocolCue', () => {
  it('shows testing until sample and median clear the gate', () => {
    expect(
      formatFitClaimProtocolCue({
        claimStatus: 'testing',
        publicClaimAllowed: false,
        sampleSize: 5,
        minSampleSize: 20,
        targetMinutes: 3,
      }),
    ).toBe('testing · 5/20 samples');
    expect(
      formatFitClaimProtocolCue({
        claimStatus: 'testing',
        publicClaimAllowed: false,
        sampleSize: 20,
        minSampleSize: 20,
        medianMinutes: 4,
        targetMinutes: 3,
      }),
    ).toBe('testing · median 4m · do not claim');
    expect(
      formatFitClaimProtocolCue({
        claimStatus: 'ready',
        publicClaimAllowed: true,
        sampleSize: 24,
        minSampleSize: 20,
        medianMinutes: 2,
        targetMinutes: 3,
      }),
    ).toBe('claim ready · under 3m (n=24)');
  });

  it('flags demo seed as local-only, not public claim ready', () => {
    expect(
      formatFitClaimProtocolCue({
        claimStatus: 'testing',
        publicClaimAllowed: false,
        sampleSize: 0,
        demoSampleSize: 20,
        demoClaimReady: true,
        targetMinutes: 3,
      }),
    ).toBe('demo seed ready (local only) · public claim testing');
    expect(
      formatFitClaimProtocolCue({
        claimStatus: 'testing',
        publicClaimAllowed: false,
        sampleSize: 3,
        minSampleSize: 20,
        medianMinutes: 2,
        demoSampleSize: 20,
        targetMinutes: 3,
      }),
    ).toBe('testing · 3/20 samples · median 2m · 20 demo excluded');
  });
});
