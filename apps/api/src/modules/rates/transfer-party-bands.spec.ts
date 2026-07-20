import { describe, expect, it } from 'vitest';
import {
  applyPerVehicleChildExtras,
  buildPartyBandsFromTransferCsvRow,
  parseTransferPartyBands,
  pickTransferPartyBand,
  transferPartyBandMatchAccepted,
  transferPerVehicleChildExtrasAccepted,
  TRANSFER_PARTY_BANDS_MAX,
} from './transfer-party-bands';

describe('parseTransferPartyBands', () => {
  it('parses and sorts ≤6 bands', () => {
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

  it(`keeps the highest ${TRANSFER_PARTY_BANDS_MAX} when more are present`, () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((partySize) => ({
      partySize,
      unitCost: partySize * 1000,
    }));
    expect(parseTransferPartyBands({ partyBands: many })).toEqual(
      many.slice(-TRANSFER_PARTY_BANDS_MAX),
    );
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

describe('buildPartyBandsFromTransferCsvRow', () => {
  it('builds 2/4/6 bands from optional CSV cols', () => {
    expect(
      buildPartyBandsFromTransferCsvRow({
        partyBand2UnitCost: 4500,
        partyBand4UnitCost: 5200,
        partyBand6UnitCost: 6500,
      }),
    ).toEqual([
      { partySize: 2, unitCost: 4500 },
      { partySize: 4, unitCost: 5200 },
      { partySize: 6, unitCost: 6500 },
    ]);
  });

  it('builds dense 2–12 bands when set', () => {
    expect(
      buildPartyBandsFromTransferCsvRow({
        partyBand2UnitCost: 4500,
        partyBand4UnitCost: 5200,
        partyBand6UnitCost: 6500,
        partyBand8UnitCost: 7800,
        partyBand10UnitCost: 9000,
        partyBand12UnitCost: 10500,
      }),
    ).toEqual([
      { partySize: 2, unitCost: 4500 },
      { partySize: 4, unitCost: 5200 },
      { partySize: 6, unitCost: 6500 },
      { partySize: 8, unitCost: 7800 },
      { partySize: 10, unitCost: 9000 },
      { partySize: 12, unitCost: 10500 },
    ]);
  });

  it('returns null when no band cols set', () => {
    expect(buildPartyBandsFromTransferCsvRow({})).toBeNull();
    expect(
      buildPartyBandsFromTransferCsvRow({
        partyBand2UnitCost: null,
        partyBand4UnitCost: undefined,
      }),
    ).toBeNull();
  });

  it('keeps sparse bands', () => {
    expect(
      buildPartyBandsFromTransferCsvRow({ partyBand4UnitCost: 5200 }),
    ).toEqual([{ partySize: 4, unitCost: 5200 }]);
  });
});

describe('applyPerVehicleChildExtras', () => {
  it('adds explicit child/infant costs on the cab', () => {
    expect(
      applyPerVehicleChildExtras({
        vehicleUnitCost: 4500,
        childUnitCost: 900,
        infantUnitCost: 200,
        childHeads: 2,
        infantHeads: 1,
      }),
    ).toEqual({
      unitCost: 6500,
      childExtras: 1800,
      infantExtras: 200,
      childrenCharged: 2,
      infantsCharged: 1,
    });
  });

  it('ignores factor-style blanks (null chart costs)', () => {
    expect(
      applyPerVehicleChildExtras({
        vehicleUnitCost: 4500,
        childUnitCost: null,
        infantUnitCost: undefined,
        childHeads: 2,
        infantHeads: 1,
      }),
    ).toEqual({
      unitCost: 4500,
      childExtras: 0,
      infantExtras: 0,
      childrenCharged: 0,
      infantsCharged: 0,
    });
  });
});

describe('transferPerVehicleChildExtrasAccepted', () => {
  it('formats explain cue', () => {
    expect(
      transferPerVehicleChildExtrasAccepted({
        childrenCharged: 2,
        infantsCharged: 1,
        childExtras: 1800,
        infantExtras: 200,
      }),
    ).toBe('+2 child · ₹1800 · +1 infant · ₹200');
  });

  it('returns null when nothing charged', () => {
    expect(
      transferPerVehicleChildExtrasAccepted({
        childrenCharged: 0,
        infantsCharged: 0,
        childExtras: 0,
        infantExtras: 0,
      }),
    ).toBeNull();
  });
});
