import { describe, expect, it } from 'vitest';
import {
  parseTransferPartyBands,
  pickTransferPartyBand,
  transferPartyBandMatchAccepted,
} from './transfer-party-bands';

describe('parseTransferPartyBands', () => {
  it('parses and sorts ≤3 bands', () => {
    expect(
      parseTransferPartyBands({
        partyBands: [
          { partySize: 6, unitCost: 5500 },
          { partySize: 2, unitCost: 3500 },
          { partySize: 4, unitCost: 4500 },
        ],
      }),
    ).toEqual([
      { partySize: 2, unitCost: 3500 },
      { partySize: 4, unitCost: 4500 },
      { partySize: 6, unitCost: 5500 },
    ]);
  });

  it('returns empty when unset', () => {
    expect(parseTransferPartyBands(null)).toEqual([]);
  });
});

describe('pickTransferPartyBand', () => {
  const bands = [
    { partySize: 2, unitCost: 3500 },
    { partySize: 4, unitCost: 4500 },
    { partySize: 6, unitCost: 5500 },
  ];

  it('picks highest band ≤ party', () => {
    expect(pickTransferPartyBand({ bands, party: 3 })).toEqual(bands[0]);
    expect(pickTransferPartyBand({ bands, party: 4 })).toEqual(bands[1]);
    expect(pickTransferPartyBand({ bands, party: 8 })).toEqual(bands[2]);
  });

  it('falls back to lowest when party below all', () => {
    expect(pickTransferPartyBand({ bands, party: 1 })).toEqual(bands[0]);
  });
});

describe('transferPartyBandMatchAccepted', () => {
  it('formats explain line', () => {
    expect(
      transferPartyBandMatchAccepted({ partySize: 4, unitCost: 4500.4 }),
    ).toBe('Party band ≤4 · ₹4500');
  });
});
