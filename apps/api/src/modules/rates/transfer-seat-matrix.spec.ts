import { describe, expect, it } from 'vitest';
import {
  buildSeatMatrixFromTransferCsvRow,
  composeMultiVehicleTransferSplit,
  multiVehicleSplitTotalBuy,
  parseTransferSeatMatrix,
  pickTransferSeatMatrixRow,
  resolveTransferVehicleUnitCost,
  splitPartyAcrossVehicles,
  transferMultiVehicleSplitAccepted,
  transferSeatMatrixMatchAccepted,
  TRANSFER_SEAT_MATRIX_MAX,
} from './transfer-seat-matrix';

describe('parseTransferSeatMatrix', () => {
  it('parses and sorts ≤8 rows', () => {
    expect(
      parseTransferSeatMatrix({
        seatMatrix: [
          { seats: 7, unitCost: 5500 },
          { seats: 4, unitCost: 3500, childAddOn: 800 },
          { seats: 6, unitCost: 4500 },
        ],
      }),
    ).toEqual([
      { seats: 4, unitCost: 3500, childAddOn: 800 },
      { seats: 6, unitCost: 4500 },
      { seats: 7, unitCost: 5500 },
    ]);
  });

  it(`keeps the highest ${TRANSFER_SEAT_MATRIX_MAX} when more are present`, () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seats) => ({
      seats,
      unitCost: seats * 1000,
    }));
    expect(parseTransferSeatMatrix({ seatMatrix: many })).toEqual(
      many.slice(-TRANSFER_SEAT_MATRIX_MAX),
    );
  });

  it('returns empty when unset', () => {
    expect(parseTransferSeatMatrix(null)).toEqual([]);
    expect(parseTransferSeatMatrix({ partyBands: [] })).toEqual([]);
  });
});

describe('pickTransferSeatMatrixRow', () => {
  const rows = [
    { seats: 4, unitCost: 3500 },
    { seats: 6, unitCost: 4500 },
    { seats: 7, unitCost: 5500 },
    { seats: 12, unitCost: 9000 },
  ];

  it('picks closest seats ≥ need', () => {
    expect(pickTransferSeatMatrixRow({ rows, seatsNeeded: 5 })).toEqual(
      rows[1],
    );
    expect(pickTransferSeatMatrixRow({ rows, seatsNeeded: 7 })).toEqual(
      rows[2],
    );
    expect(pickTransferSeatMatrixRow({ rows, seatsNeeded: 4 })).toEqual(
      rows[0],
    );
  });

  it('falls back to largest when need exceeds all', () => {
    expect(pickTransferSeatMatrixRow({ rows, seatsNeeded: 20 })).toEqual(
      rows[3],
    );
  });
});

describe('transferSeatMatrixMatchAccepted', () => {
  it('formats explain line', () => {
    expect(
      transferSeatMatrixMatchAccepted({ seats: 7, unitCost: 5500.4 }),
    ).toBe('Seat matrix 7 seats · ₹5500');
  });
});

describe('buildSeatMatrixFromTransferCsvRow', () => {
  it('builds 4/6/7/12 rows from optional CSV cols', () => {
    expect(
      buildSeatMatrixFromTransferCsvRow({
        seatMatrix4UnitCost: 3500,
        seatMatrix6UnitCost: 4500,
        seatMatrix7UnitCost: 5500,
        seatMatrix12UnitCost: 9000,
      }),
    ).toEqual([
      { seats: 4, unitCost: 3500 },
      { seats: 6, unitCost: 4500 },
      { seats: 7, unitCost: 5500 },
      { seats: 12, unitCost: 9000 },
    ]);
  });

  it('returns null when no matrix cols set', () => {
    expect(buildSeatMatrixFromTransferCsvRow({})).toBeNull();
    expect(
      buildSeatMatrixFromTransferCsvRow({
        seatMatrix4UnitCost: null,
        seatMatrix7UnitCost: undefined,
      }),
    ).toBeNull();
  });

  it('keeps sparse rows', () => {
    expect(
      buildSeatMatrixFromTransferCsvRow({ seatMatrix7UnitCost: 5500 }),
    ).toEqual([{ seats: 7, unitCost: 5500 }]);
  });
});

describe('resolveTransferVehicleUnitCost', () => {
  it('prefers seat matrix over party bands', () => {
    const got = resolveTransferVehicleUnitCost({
      seatsNeeded: 5,
      seatMatrix: [
        { seats: 4, unitCost: 3500 },
        { seats: 6, unitCost: 4500 },
      ],
      partyBands: [{ partySize: 4, unitCost: 4000 }],
      chartUnitCost: 3000,
    });
    expect(got.unitCost).toBe(4500);
    expect(got.matrixRow?.seats).toBe(6);
    expect(got.partyBand).toBeNull();
  });

  it('falls back to party bands when matrix empty', () => {
    const got = resolveTransferVehicleUnitCost({
      seatsNeeded: 3,
      seatMatrix: [],
      partyBands: [
        { partySize: 2, unitCost: 3500 },
        { partySize: 4, unitCost: 4500 },
      ],
      chartUnitCost: 3000,
    });
    expect(got.unitCost).toBe(3500);
    expect(got.partyBand?.partySize).toBe(2);
  });

  it('falls back to chart when both empty', () => {
    expect(
      resolveTransferVehicleUnitCost({
        seatsNeeded: 4,
        seatMatrix: [],
        partyBands: [],
        chartUnitCost: 3200,
      }).unitCost,
    ).toBe(3200);
  });
});

describe('splitPartyAcrossVehicles', () => {
  it('puts remainder on the last vehicle', () => {
    expect(splitPartyAcrossVehicles(11, 2)).toEqual([5, 6]);
    expect(splitPartyAcrossVehicles(10, 3)).toEqual([3, 3, 4]);
    expect(splitPartyAcrossVehicles(8, 2)).toEqual([4, 4]);
  });
});

describe('composeMultiVehicleTransferSplit', () => {
  it('composes buy from per-vehicle party allocation', () => {
    const split = composeMultiVehicleTransferSplit({
      party: 11,
      seatsPerVehicle: 7,
      vehicles: 2,
      resolveUnitCost: (p) => (p <= 5 ? 4500 : 5500),
    });
    expect(split).toEqual({
      vehicles: 2,
      seatsPerVehicle: 7,
      partyPerVehicle: [5, 6],
      unitCosts: [4500, 5500],
    });
    expect(multiVehicleSplitTotalBuy(split!)).toBe(10000);
  });

  it('returns null when party fits one vehicle', () => {
    expect(
      composeMultiVehicleTransferSplit({
        party: 6,
        seatsPerVehicle: 7,
        vehicles: 2,
        resolveUnitCost: () => 4500,
      }),
    ).toBeNull();
  });

  it('returns null when vehicles is 1', () => {
    expect(
      composeMultiVehicleTransferSplit({
        party: 10,
        seatsPerVehicle: 7,
        vehicles: 1,
        resolveUnitCost: () => 4500,
      }),
    ).toBeNull();
  });
});

describe('transferMultiVehicleSplitAccepted', () => {
  it('formats explain cue', () => {
    expect(
      transferMultiVehicleSplitAccepted({
        vehicles: 2,
        seatsPerVehicle: 7,
        partyPerVehicle: [5, 6],
        unitCosts: [4500, 5500],
      }),
    ).toBe('Multi-vehicle 2×7 · 5pax ₹4500 + 6pax ₹5500 · ₹10000');
  });
});
