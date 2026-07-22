import { afterEach, describe, expect, it } from 'vitest';
import { setDateTimePrefs } from '@wayrune/ui';
import {
  followUpFromPreset,
  followUpPresetOptions,
  laterTodayFollowUp,
  presetFromFollowUp,
} from './leadFollowUpPresets';

afterEach(() => {
  setDateTimePrefs(null);
});

describe('laterTodayFollowUp', () => {
  it('stays on today and prefers 17:00 before evening', () => {
    const now = new Date(2026, 6, 21, 10, 30, 0); // 21 Jul 2026 10:30
    const at = laterTodayFollowUp(now);
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(6);
    expect(at.getDate()).toBe(21);
    expect(at.getHours()).toBe(17);
    expect(at.getMinutes()).toBe(0);
  });

  it('does not roll into tomorrow late at night', () => {
    const now = new Date(2026, 6, 21, 22, 15, 0);
    const at = laterTodayFollowUp(now);
    expect(at.getDate()).toBe(21);
    expect(at.getHours()).toBe(23);
  });
});

describe('presetFromFollowUp', () => {
  it('treats same-day morning as Today, not Custom', () => {
    const now = new Date(2026, 6, 22, 12, 0, 0);
    const morning = new Date(2026, 6, 22, 10, 0, 0);
    expect(presetFromFollowUp(morning, now)).toBe('today');
  });
});

describe('followUpPresetOptions', () => {
  it('labels later today with org time format (24h default)', () => {
    setDateTimePrefs({ dateFormat: 'd_mmm_yyyy', timeFormat: 'h24' });
    const now = new Date(2026, 6, 21, 10, 0, 0);
    const options = followUpPresetOptions(undefined, now);
    const later = options.find((o) => o.value === 'later_today');
    const today = options.find((o) => o.value === 'today');
    const tomorrow = options.find((o) => o.value === 'tomorrow');
    expect(today?.label).toBe('Today · 21 Jul');
    expect(later?.label).toBe('Later today · 17:00');
    expect(tomorrow?.label).toBe('Tomorrow · 22 Jul');
  });

  it('labels later today with 12-hour org time format', () => {
    setDateTimePrefs({ dateFormat: 'd_mmm_yyyy', timeFormat: 'h12' });
    const now = new Date(2026, 6, 21, 10, 0, 0);
    const later = followUpPresetOptions(undefined, now).find((o) => o.value === 'later_today');
    expect(later?.label).toMatch(/^Later today · 5:00\s*(am|pm|AM|PM)$/i);
  });

  it('keeps later_today on the same calendar day as today', () => {
    const now = new Date(2026, 6, 21, 23, 0, 0);
    const later = followUpFromPreset('later_today', now)!;
    const today = followUpFromPreset('today', now)!;
    expect(later.getDate()).toBe(today.getDate());
  });
});
