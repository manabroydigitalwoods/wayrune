import { describe, expect, it } from 'vitest';
import {
  formatTemplateVersionWhen,
  showTemplateHistoryCue,
  templateHistoryHasPriors,
  canUseTemplateHistoryVersion,
  templateHistoryPriorActionsCue,
  showTemplateHistoryDiffCue,
  formatTemplateHistoryDiffLines,
} from './quoteTemplateHistory';

describe('quoteTemplateHistory', () => {
  it('shows history cue past v1', () => {
    expect(showTemplateHistoryCue(1)).toBe(false);
    expect(showTemplateHistoryCue(2)).toBe(true);
    expect(showTemplateHistoryCue(null)).toBe(false);
  });

  it('detects prior versions', () => {
    expect(
      templateHistoryHasPriors([
        { id: 'a', name: 'X', versionNumber: 2, status: 'active', createdAt: '' },
        { id: 'b', name: 'X', versionNumber: 1, status: 'superseded', createdAt: '' },
      ]),
    ).toBe(true);
    expect(
      templateHistoryHasPriors([
        { id: 'a', name: 'X', versionNumber: 1, status: 'active', createdAt: '' },
      ]),
    ).toBe(false);
  });

  it('formats created dates', () => {
    expect(formatTemplateVersionWhen('2026-07-01T12:00:00.000Z')).toMatch(/2026/);
    expect(formatTemplateVersionWhen(null)).toBe('');
  });

  it('allows Use on superseded priors only', () => {
    expect(canUseTemplateHistoryVersion('superseded')).toBe(true);
    expect(canUseTemplateHistoryVersion('active')).toBe(false);
    expect(canUseTemplateHistoryVersion('archived')).toBe(false);
  });

  it('explains Use vs Restore', () => {
    expect(templateHistoryPriorActionsCue()).toMatch(/Use applies/i);
    expect(templateHistoryPriorActionsCue()).toMatch(/Restore/i);
  });

  it('shows Diff cue when prior has diffVsActive', () => {
    expect(
      showTemplateHistoryDiffCue({
        status: 'superseded',
        diffVsActive: { summary: '+1 / −1 lines' },
      }),
    ).toBe(true);
    expect(
      showTemplateHistoryDiffCue({
        status: 'superseded',
        diffVsActive: { summary: null },
      }),
    ).toBe(true);
    expect(showTemplateHistoryDiffCue({ status: 'active', diffVsActive: undefined })).toBe(
      false,
    );
  });

  it('formats Diff expand lines', () => {
    expect(formatTemplateHistoryDiffLines({ summary: null })).toEqual([
      'No changes vs current',
    ]);
    expect(
      formatTemplateHistoryDiffLines({
        summary: '+1 / −1 lines',
        addedTitles: ['New hotel'],
        removedTitles: ['Old hotel'],
        metaChanges: ['destination'],
      }),
    ).toEqual([
      '+1 / −1 lines',
      'Added in current: New hotel',
      'Only in this version: Old hotel',
      'Meta: destination',
    ]);
  });
});
