import { describe, expect, it } from 'vitest';
import { partyAgentMarkupCue } from './partyAgentMarkupCue';

describe('partyAgentMarkupCue', () => {
  it('shows agent or custom override cues', () => {
    expect(partyAgentMarkupCue({ businessType: 'travel_agency' })).toMatch(
      /Agent markup/,
    );
    expect(
      partyAgentMarkupCue({
        businessType: 'travel_agency',
        metadataJson: { markupPercent: 8 },
      }),
    ).toMatch(/Custom markup 8%/);
    expect(partyAgentMarkupCue({ businessType: 'corporate' })).toBeNull();
    expect(partyAgentMarkupCue({ businessType: null })).toBeNull();
  });
});
