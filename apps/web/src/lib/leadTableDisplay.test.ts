import { afterEach, describe, expect, it } from 'vitest';
import { setDateTimePrefs } from '@wayrune/ui';
import {
  formatLeadFollowUp,
  formatLeadSourceName,
  ownerInitials,
  ownerShortName,
} from './leadTableDisplay';

afterEach(() => {
  setDateTimePrefs(null);
});

describe('formatLeadFollowUp', () => {
  const now = new Date(2026, 6, 21, 12, 0, 0);

  it('labels overdue, today, tomorrow, and unscheduled', () => {
    expect(formatLeadFollowUp(null, now).label).toBe('Not scheduled');
    expect(formatLeadFollowUp(new Date(2026, 6, 19, 9, 0, 0), now).label).toBe(
      'Overdue by 2 days',
    );
    expect(formatLeadFollowUp(new Date(2026, 6, 21, 16, 0, 0), now).label).toMatch(/^Today/);
    expect(formatLeadFollowUp(new Date(2026, 6, 21, 10, 0, 0), now).label).toBe(
      'Overdue by 2 hours',
    );
    expect(formatLeadFollowUp(new Date(2026, 6, 22, 9, 0, 0), now).label).toMatch(/^Tomorrow/);
  });

  it('labels same-day overdue in minutes', () => {
    expect(formatLeadFollowUp(new Date(2026, 6, 21, 11, 15, 0), now).label).toBe(
      'Overdue by 45 min',
    );
  });
});

describe('formatLeadSourceName', () => {
  it('hides system creation channels', () => {
    expect(formatLeadSourceName({ key: 'manual', name: 'Manual' })).toBe('—');
    expect(formatLeadSourceName({ key: 'csv', name: 'CSV Import' })).toBe('—');
    expect(formatLeadSourceName({ key: 'google', name: 'Google' })).toBe('Google');
  });
});

describe('owner helpers', () => {
  it('builds initials and short name', () => {
    expect(ownerInitials('Dipak Sharma')).toBe('DS');
    expect(ownerShortName('Dipak Sharma')).toBe('Dipak');
  });
});
