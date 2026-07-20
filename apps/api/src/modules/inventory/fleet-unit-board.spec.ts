import { describe, expect, it } from 'vitest';
import { buildFleetUnitBoard } from './fleet-unit-board';

describe('buildFleetUnitBoard', () => {
  const from = new Date('2026-07-01T00:00:00.000Z');
  const to = new Date('2026-07-08T00:00:00.000Z');

  it('composes busy sources onto unit lanes and skips available/cancelled', () => {
    const board = buildFleetUnitBoard({
      from,
      to,
      units: [
        { id: 'u1', name: 'Innova', plateNumber: 'KA-01' },
        { id: 'u2', name: 'Dzire', plateNumber: null },
      ],
      calendarBlocks: [
        {
          id: 'c1',
          fleetUnitId: 'u1',
          startAt: '2026-07-02T00:00:00.000Z',
          endAt: '2026-07-03T00:00:00.000Z',
          kind: 'blocked',
        },
        {
          id: 'c2',
          fleetUnitId: 'u1',
          startAt: '2026-07-04T00:00:00.000Z',
          endAt: '2026-07-05T00:00:00.000Z',
          kind: 'available',
        },
      ],
      allocations: [
        {
          id: 'a1',
          fleetUnitId: 'u2',
          startAt: '2026-07-03T08:00:00.000Z',
          endAt: '2026-07-03T18:00:00.000Z',
          status: 'hold',
          notes: 'Agency transfer',
        },
        {
          id: 'a2',
          fleetUnitId: 'u2',
          startAt: '2026-07-05T08:00:00.000Z',
          endAt: '2026-07-05T18:00:00.000Z',
          status: 'released',
        },
      ],
      driverJobs: [
        {
          id: 'j1',
          fleetUnitId: 'u1',
          startAt: '2026-07-06T06:00:00.000Z',
          endAt: '2026-07-06T12:00:00.000Z',
          status: 'assigned',
          guestName: 'Patel',
        },
      ],
      rentals: [
        {
          id: 'r1',
          fleetUnitId: 'u2',
          startAt: '2026-07-07T00:00:00.000Z',
          endAt: '2026-07-07T20:00:00.000Z',
          status: 'confirmed',
          guestName: 'Singh',
        },
      ],
    });

    expect(board.units).toHaveLength(2);
    const u1 = board.units.find((u) => u.id === 'u1')!;
    expect(u1.intervals.map((i) => i.source)).toEqual(['calendar', 'driver_job']);
    const u2 = board.units.find((u) => u.id === 'u2')!;
    expect(u2.intervals.map((i) => i.source)).toEqual(['allocation', 'rental']);
    expect(u2.intervals[0]!.label).toBe('Agency transfer');
  });
});
