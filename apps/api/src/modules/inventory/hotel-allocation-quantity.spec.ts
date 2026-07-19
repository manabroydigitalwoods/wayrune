import { describe, expect, it } from 'vitest';
import {
  allotmentHoldWarnMessage,
  allocationAssetNeedsRebind,
  allocationDatesNeedResync,
  allocationFleetWindowNeedsResync,
  allocationNeedsOrphanRelease,
  allocationQuantityNeedsResync,
  allocationRoomProductNeedsRematch,
  bookingFleetUnitId,
  bookingRoomProductId,
  canResyncAllocationAsset,
  canResyncAllocationDates,
  canResyncAllocationQuantity,
  hotelAllocationQuantity,
  matchRoomProductIdByTypeName,
  normalizeRoomTypeLabel,
  stayDayIso,
  shouldUpgradeAllotmentHoldOnConfirm,
} from './hotel-allocation-quantity';

describe('hotelAllocationQuantity', () => {
  it('prefers requiredQuantity then rooms json', () => {
    expect(hotelAllocationQuantity({ requiredQuantity: 3 })).toBe(3);
    expect(
      hotelAllocationQuantity({
        travellerRequirementsJson: { rooms: 2 },
      }),
    ).toBe(2);
    expect(hotelAllocationQuantity({})).toBe(1);
  });

  it('clamps to 1..50', () => {
    expect(hotelAllocationQuantity({ requiredQuantity: 0 })).toBe(1);
    expect(hotelAllocationQuantity({ requiredQuantity: 99 })).toBe(50);
  });
});

describe('shouldUpgradeAllotmentHoldOnConfirm', () => {
  it('upgrades hold when booking confirms', () => {
    expect(
      shouldUpgradeAllotmentHoldOnConfirm({
        allocationStatus: 'hold',
        bookingStatus: 'confirmed',
      }),
    ).toBe(true);
  });

  it('is idempotent for already-confirmed and non-confirm statuses', () => {
    expect(
      shouldUpgradeAllotmentHoldOnConfirm({
        allocationStatus: 'confirmed',
        bookingStatus: 'confirmed',
      }),
    ).toBe(false);
    expect(
      shouldUpgradeAllotmentHoldOnConfirm({
        allocationStatus: 'hold',
        bookingStatus: 'requested',
      }),
    ).toBe(false);
  });
});

describe('allocationQuantityNeedsResync / canResyncAllocationQuantity', () => {
  it('detects qty mismatch vs booking rooms', () => {
    expect(
      allocationQuantityNeedsResync({
        allocationQuantity: 1,
        requiredQuantity: 3,
      }),
    ).toBe(true);
    expect(
      allocationQuantityNeedsResync({
        allocationQuantity: 2,
        travellerRequirementsJson: { rooms: 2 },
      }),
    ).toBe(false);
  });

  it('allows decrease always; increase only when remaining covers delta', () => {
    expect(
      canResyncAllocationQuantity({
        remaining: 0,
        allocationQuantity: 3,
        neededQuantity: 1,
      }),
    ).toBe(true);
    expect(
      canResyncAllocationQuantity({
        remaining: 1,
        allocationQuantity: 1,
        neededQuantity: 3,
      }),
    ).toBe(false);
    expect(
      canResyncAllocationQuantity({
        remaining: 2,
        allocationQuantity: 1,
        neededQuantity: 3,
      }),
    ).toBe(true);
  });
});

describe('allocationDatesNeedResync / canResyncAllocationDates', () => {
  it('compares UTC stay days', () => {
    expect(stayDayIso(new Date('2026-07-01T12:00:00.000Z'))).toBe('2026-07-01');
    expect(
      allocationDatesNeedResync({
        allocationCheckIn: new Date('2026-07-01'),
        allocationCheckOut: new Date('2026-07-03'),
        bookingStartAt: new Date('2026-07-01'),
        bookingEndAt: new Date('2026-07-03'),
      }),
    ).toBe(false);
    expect(
      allocationDatesNeedResync({
        allocationCheckIn: new Date('2026-07-01'),
        allocationCheckOut: new Date('2026-07-03'),
        bookingStartAt: new Date('2026-07-02'),
        bookingEndAt: new Date('2026-07-04'),
      }),
    ).toBe(true);
  });

  it('credits overlapping allocation qty on soft capacity check', () => {
    expect(
      canResyncAllocationDates({
        remaining: 0,
        allocationQuantity: 2,
        neededQuantity: 2,
        allocationOverlapsNewWindow: true,
      }),
    ).toBe(true);
    expect(
      canResyncAllocationDates({
        remaining: 0,
        allocationQuantity: 2,
        neededQuantity: 2,
        allocationOverlapsNewWindow: false,
      }),
    ).toBe(false);
  });
});

describe('allocationAssetNeedsRebind / canResyncAllocationAsset', () => {
  it('detects asset mismatch when both ids present', () => {
    expect(
      allocationAssetNeedsRebind({
        allocationAssetId: 'asset-a',
        targetAssetId: 'asset-b',
      }),
    ).toBe(true);
    expect(
      allocationAssetNeedsRebind({
        allocationAssetId: 'asset-a',
        targetAssetId: 'asset-a',
      }),
    ).toBe(false);
    expect(
      allocationAssetNeedsRebind({
        allocationAssetId: 'asset-a',
        targetAssetId: null,
      }),
    ).toBe(false);
  });

  it('requires remaining seats on the new asset', () => {
    expect(
      canResyncAllocationAsset({ remaining: 2, neededQuantity: 2 }),
    ).toBe(true);
    expect(
      canResyncAllocationAsset({ remaining: 1, neededQuantity: 2 }),
    ).toBe(false);
  });
});

describe('orphan / room-product / fleet window helpers', () => {
  it('flags orphan release when target asset is missing', () => {
    expect(
      allocationNeedsOrphanRelease({
        allocationAssetId: 'asset-a',
        targetAssetId: null,
      }),
    ).toBe(true);
    expect(
      allocationNeedsOrphanRelease({
        allocationAssetId: 'asset-a',
        targetAssetId: 'asset-b',
      }),
    ).toBe(false);
  });

  it('rematches only when booking stamps a different room product', () => {
    expect(bookingRoomProductId({ roomProductId: ' rp-2 ' })).toBe('rp-2');
    expect(
      allocationRoomProductNeedsRematch({
        allocationRoomProductId: 'rp-1',
        bookingRoomProductId: 'rp-2',
      }),
    ).toBe(true);
    expect(
      allocationRoomProductNeedsRematch({
        allocationRoomProductId: 'rp-1',
        bookingRoomProductId: null,
      }),
    ).toBe(false);
  });

  it('matches room product by unique normalized roomType name', () => {
    expect(normalizeRoomTypeLabel('  Deluxe   Room ')).toBe('deluxe room');
    expect(
      matchRoomProductIdByTypeName({
        roomType: 'Deluxe Room',
        products: [
          { id: 'rp-1', name: 'deluxe room' },
          { id: 'rp-2', name: 'Suite' },
        ],
      }),
    ).toBe('rp-1');
    expect(
      matchRoomProductIdByTypeName({
        roomType: 'Deluxe',
        products: [
          { id: 'rp-1', name: 'Deluxe' },
          { id: 'rp-2', name: 'deluxe' },
        ],
      }),
    ).toBeNull();
  });

  it('detects transfer window or unit changes', () => {
    expect(bookingFleetUnitId({ fleetUnitId: 'fu-1' })).toBe('fu-1');
    expect(
      allocationFleetWindowNeedsResync({
        allocationStartAt: new Date('2026-07-01T10:00:00.000Z'),
        allocationEndAt: new Date('2026-07-01T12:00:00.000Z'),
        allocationFleetUnitId: 'fu-1',
        bookingStartAt: new Date('2026-07-01T14:00:00.000Z'),
        bookingEndAt: new Date('2026-07-01T16:00:00.000Z'),
        bookingFleetUnitId: 'fu-1',
      }),
    ).toBe(true);
    expect(
      allocationFleetWindowNeedsResync({
        allocationStartAt: new Date('2026-07-01T10:00:00.000Z'),
        allocationEndAt: new Date('2026-07-01T12:00:00.000Z'),
        allocationFleetUnitId: 'fu-1',
        bookingStartAt: new Date('2026-07-01T10:00:00.000Z'),
        bookingEndAt: new Date('2026-07-01T12:00:00.000Z'),
        bookingFleetUnitId: 'fu-2',
      }),
    ).toBe(true);
  });
});

describe('allotmentHoldWarnMessage', () => {
  it('warns on failed allocate, not on missing inventory', () => {
    expect(
      allotmentHoldWarnMessage('Lodge', {
        ok: false,
        failed: 'Insufficient room availability',
      }),
    ).toMatch(/Allotment hold failed/);
    expect(
      allotmentHoldWarnMessage('Lodge', {
        ok: false,
        skipped: 'missing_asset_or_dates',
      }),
    ).toBeNull();
    expect(
      allotmentHoldWarnMessage('Lodge', { ok: true, allocationId: 'a1' }),
    ).toBeNull();
    expect(
      allotmentHoldWarnMessage('Lodge', {
        ok: true,
        allocationId: 'a1',
        upgraded: true,
      }),
    ).toBeNull();
  });
});
