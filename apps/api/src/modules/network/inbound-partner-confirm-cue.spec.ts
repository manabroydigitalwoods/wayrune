import { describe, expect, it } from 'vitest';
import {
  formatInboundTransferCapacityNote,
  inboundPartnerConfirmCueFromBooking,
  inboundTransferCapacityWarn,
} from './inbound-partner-confirm-cue';

describe('inboundPartnerConfirmCueFromBooking', () => {
  it('projects ISO dates and transfer vehicle cue', () => {
    const cue = inboundPartnerConfirmCueFromBooking({
      startAt: new Date('2026-07-20T06:30:00.000Z'),
      endAt: new Date('2026-07-20T10:00:00.000Z'),
      travellerRequirementsJson: {
        vehicleLabel: 'Innova · DL01AB1001',
        vehicles: 2,
      },
    });
    expect(cue.startAt).toBe('2026-07-20T06:30:00.000Z');
    expect(cue.endAt).toBe('2026-07-20T10:00:00.000Z');
    expect(cue.vehicleLabel).toBe('Innova · DL01AB1001');
    expect(cue.vehicles).toBe(2);
    expect(cue.capacityWarn).toBe(false);
  });

  it('returns nulls when fields missing', () => {
    expect(inboundPartnerConfirmCueFromBooking({})).toEqual({
      startAt: null,
      endAt: null,
      vehicleLabel: null,
      vehicles: null,
      party: null,
      seatsPerVehicle: null,
      capacityNote: null,
      capacityWarn: false,
    });
  });

  it('soft-warns when party exceeds seats × vehicles', () => {
    const cue = inboundPartnerConfirmCueFromBooking({
      travellerRequirementsJson: {
        adults: 6,
        children: 2,
        vehicles: 1,
        vehicleSeats: 7,
      },
    });
    expect(cue.party).toBe(8);
    expect(cue.seatsPerVehicle).toBe(7);
    expect(cue.capacityWarn).toBe(true);
    expect(cue.capacityNote).toMatch(/^Insufficient capacity/);
  });

  it('uses fallback party and VehicleType seats', () => {
    const cue = inboundPartnerConfirmCueFromBooking(
      {
        travellerRequirementsJson: {
          vehicles: 1,
          vehicleTypeId: 'vt1',
        },
      },
      { party: 4, seatsPerVehicle: 7 },
    );
    expect(cue.party).toBe(4);
    expect(cue.seatsPerVehicle).toBe(7);
    expect(cue.capacityWarn).toBe(false);
    expect(cue.capacityNote).toMatch(/Party of 4 fits/);
  });
});

describe('formatInboundTransferCapacityNote', () => {
  it('flags insufficient capacity', () => {
    const note = formatInboundTransferCapacityNote({
      party: 8,
      seatsPerVehicle: 7,
      vehicles: 1,
    });
    expect(inboundTransferCapacityWarn(note)).toBe(true);
    expect(note).toContain('8');
  });
});
