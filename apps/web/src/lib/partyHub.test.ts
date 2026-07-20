import { describe, expect, it } from 'vitest';
import { partyAgentMarkupCue } from './partyAgentMarkupCue';
import { formatPartyImportSkipReason } from './partyImportSkip';

describe('partyAgentMarkupCue', () => {
  it('shows cue for trade parties only', () => {
    expect(partyAgentMarkupCue({ businessType: 'travel_agency' })).toMatch(
      /Agent markup/,
    );
    expect(partyAgentMarkupCue({ businessType: 'corporate' })).toBeNull();
    expect(partyAgentMarkupCue({ businessType: null })).toBeNull();
  });
});

describe('formatPartyImportSkipReason', () => {
  it('humanizes duplicate email', () => {
    expect(formatPartyImportSkipReason('email_exists')).toBe('duplicate email');
  });
});
