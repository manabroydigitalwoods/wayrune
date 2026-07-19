import { describe, expect, it } from 'vitest';
import {
  formatWhatsappSessionCue,
  formatWhatsappSessionRemaining,
} from './whatsappSessionCue';

describe('formatWhatsappSessionRemaining', () => {
  it('formats hours and minutes', () => {
    expect(formatWhatsappSessionRemaining(18 * 60 * 60 * 1000)).toBe('18h 0m left');
    expect(formatWhatsappSessionRemaining(90 * 60 * 1000)).toBe('1h 30m left');
    expect(formatWhatsappSessionRemaining(5 * 60 * 1000)).toBe('5m left');
    expect(formatWhatsappSessionRemaining(30_000)).toBe('under 1m left');
    expect(formatWhatsappSessionRemaining(0)).toBe('ended');
  });
});

describe('formatWhatsappSessionCue', () => {
  it('closed when not open', () => {
    expect(formatWhatsappSessionCue({ open: false, remainingMs: 0 }).tone).toBe('closed');
    expect(formatWhatsappSessionCue({ open: true, remainingMs: 0 }).tone).toBe('closed');
  });

  it('ok when remaining', () => {
    const cue = formatWhatsappSessionCue({
      open: true,
      remainingMs: 2 * 60 * 60 * 1000,
    });
    expect(cue.tone).toBe('ok');
    expect(cue.label).toContain('Session open');
    expect(cue.label).toContain('2h');
  });

  it('demo cue', () => {
    const cue = formatWhatsappSessionCue({
      open: true,
      remainingMs: 0,
      demo: true,
    });
    expect(cue.tone).toBe('ok');
    expect(cue.label).toContain('Demo');
  });
});
