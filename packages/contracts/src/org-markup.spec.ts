import { describe, expect, it } from 'vitest';
import {
  partyMarkupCue,
  partyMarkupPercentOverride,
  partyUsesAgentMarkup,
  resolveOrgMarkupPercent,
} from './org-markup';

describe('partyUsesAgentMarkup', () => {
  it('detects trade / agent business types', () => {
    expect(partyUsesAgentMarkup({ businessType: 'travel_agency' })).toBe(true);
    expect(partyUsesAgentMarkup({ businessType: 'reseller' })).toBe(true);
    expect(partyUsesAgentMarkup({ businessType: 'dmc' })).toBe(true);
    expect(partyUsesAgentMarkup({ businessType: 'corporate' })).toBe(false);
    expect(partyUsesAgentMarkup({ businessType: null })).toBe(false);
    expect(partyUsesAgentMarkup(null)).toBe(false);
  });
});

describe('partyMarkupPercentOverride', () => {
  it('reads top-level or metadataJson.markupPercent', () => {
    expect(partyMarkupPercentOverride({ markupPercent: 8 })).toBe(8);
    expect(
      partyMarkupPercentOverride({
        metadataJson: { markupPercent: 15 },
      }),
    ).toBe(15);
    expect(partyMarkupPercentOverride({ businessType: 'dmc' })).toBeNull();
  });
});

describe('resolveOrgMarkupPercent', () => {
  it('uses default for retail and agent override when set', () => {
    expect(
      resolveOrgMarkupPercent(
        { defaultMarkupPercent: 25, agentMarkupPercent: 12 },
        { party: { businessType: 'individual' } },
      ),
    ).toBe(25);
    expect(
      resolveOrgMarkupPercent(
        { defaultMarkupPercent: 25, agentMarkupPercent: 12 },
        { party: { businessType: 'travel_agency' } },
      ),
    ).toBe(12);
  });

  it('falls back to default when agent percent unset', () => {
    expect(
      resolveOrgMarkupPercent(
        { defaultMarkupPercent: 18 },
        { party: { businessType: 'dmc' } },
      ),
    ).toBe(18);
    expect(resolveOrgMarkupPercent(null)).toBe(20);
  });

  it('prefers per-party override over org agent and default', () => {
    expect(
      resolveOrgMarkupPercent(
        { defaultMarkupPercent: 25, agentMarkupPercent: 12 },
        {
          party: {
            businessType: 'travel_agency',
            metadataJson: { markupPercent: 7 },
          },
        },
      ),
    ).toBe(7);
    expect(
      resolveOrgMarkupPercent(
        { defaultMarkupPercent: 25 },
        { party: { markupPercent: 30 } },
      ),
    ).toBe(30);
  });
});

describe('partyMarkupCue', () => {
  it('names custom override or agent default', () => {
    expect(partyMarkupCue({ markupPercent: 9 })).toMatch(/Custom markup 9%/);
    expect(partyMarkupCue({ businessType: 'dmc' })).toMatch(/Agent markup/);
    expect(partyMarkupCue({ businessType: 'corporate' })).toBeNull();
  });
});
