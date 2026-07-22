import { describe, expect, it } from 'vitest';
import {
  quoteSendBlockedItems,
  quoteSendBlockedReason,
} from './quoteSendBlocked';

const base = {
  itemCount: 2,
  missingSellCount: 0,
  missingCostCount: 0,
  marginGateCount: 0,
  minMarginPercent: 0,
  canViewCost: true,
  hasValidUntil: true,
  travellerCount: 2,
  statusAllowsSend: true,
};

describe('quoteSendBlocked', () => {
  it('returns empty reason when ready', () => {
    expect(quoteSendBlockedReason(base)).toBe('');
    expect(quoteSendBlockedItems(base).every((i) => i.ok)).toBe(true);
  });

  it('lists travellers and sell gaps', () => {
    const input = {
      ...base,
      missingSellCount: 1,
      travellerCount: 0,
    };
    const reason = quoteSendBlockedReason(input);
    expect(reason).toMatch(/service price/);
    expect(reason).toMatch(/traveller/);
    const items = quoteSendBlockedItems(input);
    expect(items.find((i) => i.id === 'sell')?.ok).toBe(false);
    expect(items.find((i) => i.id === 'travellers')?.ok).toBe(false);
  });
});
