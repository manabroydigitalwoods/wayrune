import { describe, expect, it } from 'vitest';
import { statusLabel } from './status-badge';

describe('statusLabel', () => {
  it('maps known enums to human labels', () => {
    expect(statusLabel('awaiting_approval')).toBe('Awaiting approval');
    expect(statusLabel('won')).toBe('Won');
  });

  it('humanizes unknown keys', () => {
    expect(statusLabel('proposal_sent')).toBe('Proposal Sent');
  });
});
