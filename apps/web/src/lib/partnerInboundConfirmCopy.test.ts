import { describe, expect, it } from 'vitest';
import {
  opsBookingConfirmDescription,
  opsBookingConfirmPlaceholder,
  opsConfirmCueFromBooking,
  partnerInboundConfirmDescription,
  partnerInboundConfirmPlaceholder,
  partnerInboundServiceCue,
  partnerInboundTypeLabel,
  transferCapacityConfirmToastCue,
} from './partnerInboundConfirmCopy';

describe('partnerInboundConfirmCopy', () => {
  it('maps type labels and placeholders', () => {
    expect(partnerInboundTypeLabel('transfer')).toBe('Transfer');
    expect(partnerInboundConfirmPlaceholder('hotel')).toMatch(/Hotel conf/);
    expect(partnerInboundConfirmPlaceholder('transfer')).toMatch(/Vehicle/);
    expect(partnerInboundConfirmPlaceholder('activity')).toMatch(/activity ref/);
    expect(opsBookingConfirmPlaceholder('transfer')).toBe(
      partnerInboundConfirmPlaceholder('transfer'),
    );
  });

  it('builds type-aware descriptions', () => {
    expect(partnerInboundConfirmDescription('hotel')).toMatch(/allotment hold/);
    expect(partnerInboundConfirmDescription('transfer')).toMatch(/transfer hold/);
    expect(partnerInboundConfirmDescription('activity')).not.toMatch(/allotment/);
    expect(opsBookingConfirmDescription('hotel')).toMatch(/Finance \(AUTO/);
    expect(opsBookingConfirmDescription('transfer')).toMatch(/transfer hold/);
    expect(opsBookingConfirmDescription('activity')).toMatch(/Finance \(AUTO/);
    expect(opsBookingConfirmDescription('activity')).not.toMatch(/allotment/);
  });

  it('composes service cues', () => {
    expect(
      partnerInboundServiceCue('transfer', {
        vehicleLabel: 'Innova',
        vehicles: 2,
        startAt: '2026-07-20T06:30:00.000Z',
      }),
    ).toBe('Innova · 2 vehicles · 2026-07-20');
    expect(
      partnerInboundServiceCue('transfer', {
        vehicleLabel: 'Innova',
        capacityWarn: true,
        startAt: '2026-07-20T06:30:00.000Z',
      }),
    ).toBe('Innova · over capacity · 2026-07-20');
    expect(
      partnerInboundServiceCue('hotel', {
        startAt: '2026-07-20T12:00:00.000Z',
        endAt: '2026-07-22T12:00:00.000Z',
      }),
    ).toBe('2026-07-20 → 2026-07-22');
    expect(partnerInboundServiceCue('activity', {})).toBeNull();
  });

  it('builds Ops confirm cue with soft capacity', () => {
    const cue = opsConfirmCueFromBooking({
      startAt: '2026-07-20T06:30:00.000Z',
      travellerRequirementsJson: {
        vehicleTypeName: 'Innova',
        adults: 8,
        vehicles: 1,
        vehicleSeats: 7,
      },
    });
    expect(cue.vehicleLabel).toBe('Innova');
    expect(cue.capacityWarn).toBe(true);
    expect(cue.capacityNote).toMatch(/^Insufficient capacity/);
  });

  it('adds soft capacity toast cue', () => {
    expect(transferCapacityConfirmToastCue({ capacityWarn: true })).toMatch(
      /capacity short/,
    );
    expect(transferCapacityConfirmToastCue({ capacityWarn: false })).toBe('');
  });
});
