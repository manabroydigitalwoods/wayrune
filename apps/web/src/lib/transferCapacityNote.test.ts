import { describe, expect, it } from 'vitest';
import {
  bumpAndRestampTransferCapacity,
  bumpTransferVehiclesForCapacity,
  formatTransferCapacityNote,
  minVehiclesForParty,
  restampTransferCapacity,
  transferCapacityBlocksSend,
  transferCapacityIsWarn,
  transferCapacityTone,
  withCapacityProvenance,
} from './transferCapacityNote';

describe('minVehiclesForParty / bumpTransferVehiclesForCapacity', () => {
  it('ceils party / seats', () => {
    expect(minVehiclesForParty(8, 7)).toBe(2);
    expect(minVehiclesForParty(7, 7)).toBe(1);
    expect(minVehiclesForParty(15, 7)).toBe(3);
    expect(minVehiclesForParty(0, 7)).toBeNull();
    expect(minVehiclesForParty(8, null)).toBeNull();
  });

  it('raises vehicles only when short', () => {
    expect(
      bumpTransferVehiclesForCapacity({
        vehicles: 1,
        party: 8,
        seatsPerVehicle: 7,
      }),
    ).toEqual({ vehicles: 2, bumped: true, previous: 1 });
    expect(
      bumpTransferVehiclesForCapacity({
        vehicles: 3,
        party: 8,
        seatsPerVehicle: 7,
      }),
    ).toEqual({ vehicles: 3, bumped: false, previous: 3 });
    expect(
      bumpTransferVehiclesForCapacity({
        vehicles: 1,
        party: 4,
        seatsPerVehicle: 7,
      }),
    ).toEqual({ vehicles: 1, bumped: false, previous: 1 });
  });
});

describe('formatTransferCapacityNote', () => {
  it('returns null without seats', () => {
    expect(formatTransferCapacityNote({ party: 4, vehicles: 1 })).toBeNull();
  });

  it('blocks when party exceeds seats × vehicles', () => {
    expect(
      formatTransferCapacityNote({
        party: 8,
        seatsPerVehicle: 7,
        vehicles: 1,
      }),
    ).toMatch(/^Insufficient capacity: party of 8 exceeds 7/);
    expect(
      formatTransferCapacityNote({
        party: 15,
        seatsPerVehicle: 7,
        vehicles: 2,
      }),
    ).toMatch(/^Insufficient capacity: party of 15 exceeds 14/);
  });

  it('fits when under capacity', () => {
    expect(
      formatTransferCapacityNote({
        party: 6,
        seatsPerVehicle: 7,
        vehicles: 1,
      }),
    ).toMatch(/^Party of 6 fits 7/);
    expect(
      formatTransferCapacityNote({
        party: 10,
        seatsPerVehicle: 7,
        vehicles: 2,
      }),
    ).toMatch(/^Party of 10 fits 14/);
  });

  it('describes seats when party unknown', () => {
    expect(
      formatTransferCapacityNote({ seatsPerVehicle: 7, vehicles: 2 }),
    ).toBe('14 seat(s) across 2 vehicle(s).');
  });
});

describe('transferCapacityTone / blocksSend', () => {
  it('blocks on insufficient and legacy soft stamps', () => {
    expect(transferCapacityTone('Insufficient capacity: party of 8 exceeds 7')).toBe(
      'block',
    );
    expect(transferCapacityTone('Soft warning: party of 8 exceeds 7')).toBe('block');
    expect(transferCapacityTone('Party of 4 fits 7')).toBe('info');
    expect(transferCapacityIsWarn('Insufficient capacity: x')).toBe(true);
    expect(
      transferCapacityBlocksSend({
        capacityWarn: true,
        capacityNote: 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
      }),
    ).toBe(true);
    expect(
      transferCapacityBlocksSend({
        capacityWarn: true,
        capacityNote: 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
        capacityRiskAckForNote:
          'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
      }),
    ).toBe(true);
    expect(
      transferCapacityBlocksSend({
        capacityWarn: true,
        capacityNote: 'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
        capacityRiskAckForNote:
          'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
        capacityRiskAckReason: 'Client accepts tight seat',
      }),
    ).toBe(false);
    expect(
      transferCapacityBlocksSend({ capacityNote: 'Party of 4 fits 7' }),
    ).toBe(false);
  });
});

describe('withCapacityProvenance', () => {
  it('stamps warn flag', () => {
    const stamped = withCapacityProvenance(
      { rateId: 't1' },
      'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
    );
    expect(stamped?.capacityWarn).toBe(true);
    expect(stamped?.capacityNote).toMatch(/^Insufficient capacity/);
  });
});

describe('restampTransferCapacity', () => {
  it('reblocks when vehicles drop below party need and clears ack', () => {
    const fits =
      'Party of 8 fits 14 seat(s) (7×2).';
    const short =
      'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).';
    const out = restampTransferCapacity({
      provenance: {
        rateId: 't1',
        vehicleSeats: 7,
        capacityNote: fits,
        capacityRiskAckForNote: fits,
      },
      party: 8,
      vehicles: 1,
    });
    expect(out.note).toBe(short);
    expect(out.provenance?.capacityWarn).toBe(true);
    expect(out.provenance?.capacityRiskAckForNote).toBeUndefined();
    expect(out.provenance?.vehicleSeats).toBe(7);
  });

  it('clears warn when vehicles raised to fit', () => {
    const out = restampTransferCapacity({
      provenance: {
        rateId: 't1',
        vehicleSeats: 7,
        capacityWarn: true,
        capacityNote:
          'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
      },
      party: 8,
      vehicles: 2,
    });
    expect(out.note).toMatch(/^Party of 8 fits 14/);
    expect(out.provenance?.capacityWarn).toBeUndefined();
  });

  it('no-ops restamp logic when seats unknown', () => {
    const out = restampTransferCapacity({
      provenance: {
        rateId: 't1',
        capacityNote: 'Party of 4 fits 7 seat(s) (7×1).',
      },
      party: 8,
      vehicles: 1,
    });
    expect(out.note).toBe('Party of 4 fits 7 seat(s) (7×1).');
  });

  it('reblocks when party rises above seats × vehicles', () => {
    const out = restampTransferCapacity({
      provenance: {
        rateId: 't1',
        vehicleSeats: 7,
        capacityNote: 'Party of 4 fits 7 seat(s) (7×1).',
      },
      party: 8,
      vehicles: 1,
    });
    expect(out.note).toMatch(/^Insufficient capacity: party of 8 exceeds 7/);
    expect(out.provenance?.capacityWarn).toBe(true);
    expect(out.provenance?.capacityRiskAckForNote).toBeUndefined();
  });

  it('clears warn when party drops back under capacity', () => {
    const out = restampTransferCapacity({
      provenance: {
        rateId: 't1',
        vehicleSeats: 7,
        capacityWarn: true,
        capacityNote:
          'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
        capacityRiskAckForNote:
          'Insufficient capacity: party of 8 exceeds 7 seat(s) (7×1).',
      },
      party: 4,
      vehicles: 1,
    });
    expect(out.note).toMatch(/^Party of 4 fits 7/);
    expect(out.provenance?.capacityWarn).toBeUndefined();
    expect(out.provenance?.capacityRiskAckForNote).toBeUndefined();
  });
});

describe('bumpAndRestampTransferCapacity', () => {
  it('raises vehicles then stamps fit note', () => {
    const out = bumpAndRestampTransferCapacity({
      provenance: {
        rateId: 't1',
        vehicleSeats: 7,
        capacityNote: 'Party of 4 fits 7 seat(s) (7×1).',
      },
      party: 8,
      vehicles: 1,
    });
    expect(out.bumped).toBe(true);
    expect(out.previousVehicles).toBe(1);
    expect(out.vehicles).toBe(2);
    expect(out.note).toMatch(/^Party of 8 fits 14/);
    expect(out.provenance?.capacityWarn).toBeUndefined();
    expect(out.provenance?.vehicleSeats).toBe(7);
  });

  it('does not decrease a higher vehicle count', () => {
    const out = bumpAndRestampTransferCapacity({
      provenance: { rateId: 't1', vehicleSeats: 7 },
      party: 8,
      vehicles: 3,
    });
    expect(out.bumped).toBe(false);
    expect(out.vehicles).toBe(3);
    expect(out.note).toMatch(/^Party of 8 fits 21/);
  });

  it('restamps without bump when seats unknown', () => {
    const out = bumpAndRestampTransferCapacity({
      provenance: {
        rateId: 't1',
        capacityNote: 'Party of 4 fits 7 seat(s) (7×1).',
      },
      party: 8,
      vehicles: 1,
    });
    expect(out.bumped).toBe(false);
    expect(out.vehicles).toBe(1);
    expect(out.note).toBe('Party of 4 fits 7 seat(s) (7×1).');
  });
});
