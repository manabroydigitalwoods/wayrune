import { describe, expect, it } from 'vitest';
import {
  partyUsesAgentMarkup,
  resolveOrgMarkupPercent,
} from './orgMarkup';

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
});
