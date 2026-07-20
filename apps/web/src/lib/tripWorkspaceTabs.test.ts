import { describe, expect, it } from 'vitest';
import {
  recommendedTabForTripStatus,
  tabAttentionCounts,
  tabLabelWithCue,
} from './tripWorkspaceTabs';

describe('tripWorkspaceTabs', () => {
  it('recommends quotations while quote is outstanding', () => {
    expect(recommendedTabForTripStatus('quoted')).toBe('quotations');
    expect(recommendedTabForTripStatus('awaiting_approval')).toBe('quotations');
  });

  it('recommends operations during booking workflow', () => {
    expect(recommendedTabForTripStatus('confirmed')).toBe('operations');
    expect(recommendedTabForTripStatus('booking_in_progress')).toBe('operations');
  });

  it('counts attention flags per tab', () => {
    const counts = tabAttentionCounts([
      { tab: 'operations', severity: 'danger' },
      { tab: 'operations', severity: 'warn' },
      { tab: 'finance', severity: 'warn' },
      { tab: 'finance', severity: 'info' },
    ]);
    expect(counts.operations).toBe(2);
    expect(counts.finance).toBe(1);
  });

  it('adds Next cue on recommended tab from overview', () => {
    expect(
      tabLabelWithCue('Quotations', 'quotations', {
        activeTab: 'overview',
        tripStatus: 'quoted',
      }),
    ).toBe('Quotations · Next');
    expect(
      tabLabelWithCue('Quotations', 'quotations', {
        activeTab: 'quotations',
        tripStatus: 'quoted',
        attention: 2,
      }),
    ).toBe('Quotations');
  });
});
