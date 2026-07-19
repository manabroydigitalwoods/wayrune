import { describe, expect, it } from 'vitest';
import {
  findDriverConflictBookingIds,
  findFleetUnitConflictBookingIds,
  mergeTransferAssignment,
  parseTransferAssignment,
  transferAssignmentInterval,
} from './transfer-assignment';

describe('transfer-assignment', () => {
  it('parses and merges assignment without dropping hotel keys', () => {
    expect(parseTransferAssignment({ roomType: 'Deluxe' })).toEqual({
      driverSupplierId: null,
      vehicleLabel: null,
      fleetUnitId: null,
    });
    const merged = mergeTransferAssignment(
      { roomType: 'Deluxe', driverSupplierId: 'old' },
      { driverSupplierId: 'drv1', vehicleLabel: 'Innova', fleetUnitId: 'u1' },
    );
    expect(merged.roomType).toBe('Deluxe');
    expect(merged.driverSupplierId).toBe('drv1');
    expect(merged.vehicleLabel).toBe('Innova');
    expect(merged.fleetUnitId).toBe('u1');
    const cleared = mergeTransferAssignment(merged, {
      driverSupplierId: null,
      vehicleLabel: '',
    });
    expect(cleared.driverSupplierId).toBeUndefined();
    expect(cleared.vehicleLabel).toBeUndefined();
    expect(cleared.fleetUnitId).toBeUndefined();
    expect(cleared.roomType).toBe('Deluxe');
  });

  it('clears fleetUnitId when vehicleLabel is cleared alone', () => {
    const withUnit = mergeTransferAssignment(
      { fleetUnitId: 'u1', vehicleLabel: 'Innova' },
      { vehicleLabel: '' },
    );
    expect(withUnit.vehicleLabel).toBeUndefined();
    expect(withUnit.fleetUnitId).toBeUndefined();
  });

  it('defaults end to next day when missing', () => {
    const int = transferAssignmentInterval({
      startAt: '2026-04-10',
      endAt: null,
    });
    expect(int?.start.toISOString().slice(0, 10)).toBe('2026-04-10');
    expect(int?.end.toISOString().slice(0, 10)).toBe('2026-04-11');
  });

  it('flags overlapping transfers with the same driver', () => {
    const conflicted = findDriverConflictBookingIds([
      {
        id: 'a',
        type: 'transfer',
        status: 'confirmed',
        startAt: '2026-04-10',
        endAt: null,
        driverSupplierId: 'drv1',
      },
      {
        id: 'b',
        type: 'transfer',
        status: 'confirmed',
        startAt: '2026-04-10',
        endAt: '2026-04-11',
        driverSupplierId: 'drv1',
      },
      {
        id: 'c',
        type: 'transfer',
        status: 'confirmed',
        startAt: '2026-04-12',
        driverSupplierId: 'drv1',
      },
      {
        id: 'd',
        type: 'hotel',
        status: 'confirmed',
        startAt: '2026-04-10',
        driverSupplierId: 'drv1',
      },
    ]);
    expect(conflicted.has('a')).toBe(true);
    expect(conflicted.has('b')).toBe(true);
    expect(conflicted.has('c')).toBe(false);
    expect(conflicted.has('d')).toBe(false);
  });

  it('flags overlapping transfers with the same fleet unit', () => {
    const conflicted = findFleetUnitConflictBookingIds([
      {
        id: 'a',
        type: 'transfer',
        status: 'confirmed',
        startAt: '2026-04-10',
        fleetUnitId: 'unit1',
      },
      {
        id: 'b',
        type: 'transfer',
        status: 'pending',
        startAt: '2026-04-10',
        fleetUnitId: 'unit1',
      },
      {
        id: 'c',
        type: 'transfer',
        status: 'confirmed',
        startAt: '2026-04-10',
        fleetUnitId: 'unit2',
      },
    ]);
    expect(conflicted.has('a')).toBe(true);
    expect(conflicted.has('b')).toBe(true);
    expect(conflicted.has('c')).toBe(false);
  });
});
