import { describe, expect, it } from 'vitest';
import {
  formatHoursCompact,
  formatHoursTargetCue,
  formatMinutesTargetCue,
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
