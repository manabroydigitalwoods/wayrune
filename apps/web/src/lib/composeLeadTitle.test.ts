import { describe, expect, it } from 'vitest';
import { composeLeadTitle, displayLeadTitle } from './composeLeadTitle';

describe('composeLeadTitle', () => {
  it('uses destination + primary trip type', () => {
    expect(
      composeLeadTitle({ contactName: 'Milan Roy', interests: ['Goa', 'Honeymoon'] }),
    ).toBe('Milan Roy — Goa honeymoon');
  });

  it('does not join every selected chip', () => {
    expect(
      composeLeadTitle({
        contactName: 'Milan Roy',
        interests: ['Family', 'Weekend', 'Honeymoon'],
      }),
    ).toBe('Milan Roy — Family honeymoon');
  });

  it('combines modifier + primary trip type when no destination', () => {
    expect(
      composeLeadTitle({ contactName: 'Sharma Family', interests: ['Weekend', 'Honeymoon'] }),
    ).toBe('Sharma Family — Weekend honeymoon');
  });

  it('falls back to contact or interests alone', () => {
    expect(composeLeadTitle({ contactName: 'Priya' })).toBe('Priya');
    expect(composeLeadTitle({ interests: ['Kerala'] })).toBe('Kerala');
  });

  it('defaults when empty', () => {
    expect(composeLeadTitle({})).toBe('New lead');
    expect(composeLeadTitle({ contactName: '  ', interests: [] })).toBe('New lead');
  });
});

describe('displayLeadTitle', () => {
  it('strips machine stage suffixes', () => {
    expect(displayLeadTitle('SCN Lead 0176 · attempted_contact')).toBe('SCN Lead 0176');
    expect(displayLeadTitle('SCN Lead 0176 · requirements_pending')).toBe('SCN Lead 0176');
    expect(displayLeadTitle('SCN Lead 0176 · proposal_sent')).toBe('SCN Lead 0176');
  });

  it('leaves normal titles alone', () => {
    expect(displayLeadTitle('Milan Roy — Goa honeymoon')).toBe('Milan Roy — Goa honeymoon');
  });
});
