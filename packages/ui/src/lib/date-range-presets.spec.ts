import { describe, expect, it } from 'vitest';
import {
  formatDateRangeTriggerLabel,
  formatYmd,
  resolveDateRangePreset,
} from './date-range-presets';

/** Fixed noon so DST / local timezone doesn't shift calendar days. */
const NOW = new Date(2026, 6, 15, 12, 0, 0, 0); // Wed 15 Jul 2026

describe('resolveDateRangePreset — history', () => {
  it('resolves today', () => {
    expect(resolveDateRangePreset('today', 'history', NOW)).toEqual({
      from: '2026-07-15',
      to: '2026-07-15',
    });
  });

  it('resolves this week Mon–Sun', () => {
    expect(resolveDateRangePreset('this_week', 'history', NOW)).toEqual({
      from: '2026-07-13',
      to: '2026-07-19',
    });
  });

  it('resolves last week', () => {
    expect(resolveDateRangePreset('last_week', 'history', NOW)).toEqual({
      from: '2026-07-06',
      to: '2026-07-12',
    });
  });

  it('resolves this month', () => {
    expect(resolveDateRangePreset('this_month', 'history', NOW)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('resolves last month', () => {
    expect(resolveDateRangePreset('last_month', 'history', NOW)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
  });

  it('resolves last 3 months ending this month', () => {
    expect(resolveDateRangePreset('last_3_months', 'history', NOW)).toEqual({
      from: '2026-05-01',
      to: '2026-07-31',
    });
  });

  it('resolves last 6 months ending this month', () => {
    expect(resolveDateRangePreset('last_6_months', 'history', NOW)).toEqual({
      from: '2026-02-01',
      to: '2026-07-31',
    });
  });

  it('custom returns nulls', () => {
    expect(resolveDateRangePreset('custom', 'history', NOW)).toEqual({
      from: null,
      to: null,
    });
  });
});

describe('resolveDateRangePreset — forward', () => {
  it('resolves next 7 inclusive of today', () => {
    expect(resolveDateRangePreset('next_7', 'forward', NOW)).toEqual({
      from: '2026-07-15',
      to: '2026-07-21',
    });
  });

  it('resolves next 30 inclusive of today', () => {
    expect(resolveDateRangePreset('next_30', 'forward', NOW)).toEqual({
      from: '2026-07-15',
      to: '2026-08-13',
    });
  });

  it('resolves next 3 months as this month through +2', () => {
    expect(resolveDateRangePreset('next_3_months', 'forward', NOW)).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
  });
});

describe('formatDateRangeTriggerLabel', () => {
  it('uses preset label when set', () => {
    expect(
      formatDateRangeTriggerLabel(
        { from: '2026-07-01', to: '2026-07-31', presetId: 'this_month' },
        'history',
      ),
    ).toBe('This month');
  });

  it('falls back to ymd range for custom', () => {
    expect(
      formatDateRangeTriggerLabel(
        { from: '2026-01-01', to: '2026-01-31', presetId: 'custom' },
        'history',
      ),
    ).toBe('2026-01-01 → 2026-01-31');
  });

  it('shows empty label when cleared', () => {
    expect(formatDateRangeTriggerLabel({ from: null, to: null }, 'history')).toBe('All time');
  });
});

describe('formatYmd', () => {
  it('formats local calendar day', () => {
    expect(formatYmd(NOW)).toBe('2026-07-15');
  });
});
