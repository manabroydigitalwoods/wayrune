import { describe, expect, it } from 'vitest';
import {
  inboxAgingFilterLabel,
  inboxAgingHoursFromSettings,
} from './inboxAgingLabel';

describe('inboxAgingLabel', () => {
  it('reads org inbox aging hours with bounds', () => {
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 6 })).toBe(6);
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 0 })).toBe(4);
    expect(inboxAgingHoursFromSettings({ inboxAgingHours: 99 })).toBe(4);
    expect(inboxAgingHoursFromSettings(null)).toBe(4);
  });

  it('formats aging filter chip label', () => {
    expect(inboxAgingFilterLabel(4)).toBe('Aging 4h+');
    expect(inboxAgingFilterLabel(12)).toBe('Aging 12h+');
  });
});
