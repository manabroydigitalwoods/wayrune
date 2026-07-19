import { describe, expect, it } from 'vitest';
import { allotmentConfirmToastCue } from './allotmentConfirmToast';

describe('allotmentConfirmToastCue', () => {
  it('composes upgrade, rebind, rematch, dates, fleet, and qty cues', () => {
    expect(allotmentConfirmToastCue({ allotmentUpgraded: true })).toBe(
      ' · allotment confirmed',
    );
    expect(
      allotmentConfirmToastCue({
        allotmentAssetRebound: true,
        allotmentDatesResynced: true,
        allotmentRoomProductRematched: true,
      }),
    ).toBe(
      ' · property rebound · room product synced · stay dates synced',
    );
    expect(
      allotmentConfirmToastCue({
        allotmentOrphanReleased: true,
        allotmentFleetWindowResynced: true,
      }),
    ).toBe(' · allotment released · transfer window synced');
  });

  it('prefers sync failure over success cues', () => {
    expect(
      allotmentConfirmToastCue({
        allotmentUpgraded: true,
        allotmentSyncFailed: 'Insufficient room availability',
      }),
    ).toMatch(/allotment not synced/);
  });
});
