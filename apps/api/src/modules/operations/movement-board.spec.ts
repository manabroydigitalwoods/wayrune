import { describe, expect, it } from 'vitest';
import {
  buildMovementBoard,
  bookingInMovementWindow,
  movementWindow,
  type MovementBoardBooking,
} from './movement-board';

const baseTrip = {
  tripId: 't1',
  tripNumber: 'TRP-01',
  tripTitle: 'Darjeeling',
  tripStartDate: '2026-04-10',
  tripEndDate: '2026-04-14',
};

function hotel(partial: Partial<MovementBoardBooking> = {}): MovementBoardBooking {
  return {
    id: 'h1',
    type: 'hotel',
    title: 'Heritage Lodge',
    status: 'requested',
    startAt: '2026-04-10',
    endAt: '2026-04-12',
    ...baseTrip,
    ...partial,
  };
}

describe('movement-board', () => {
  it('windows next N days from today', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const win = movementWindow(14, now);
    expect(win.from.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(win.to.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('includes hotel in window and flags missing transfer', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const bookings = [hotel()];
    const board = buildMovementBoard({
      bookings,
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]!.flags.some((f) => f.code === 'missing_transfer')).toBe(
      true,
    );
    expect(board.rows[0]!.flags.some((f) => f.code === 'unconfirmed_hotel')).toBe(
      true,
    );
    expect(board.summary.hotels).toBe(1);
  });

  it('uses trip start when booking startAt is null', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const win = movementWindow(14, now);
    const b = hotel({ id: 'h2', startAt: null, tripStartDate: '2026-04-05' });
    expect(bookingInMovementWindow(b, win.from, win.to)).toBe(true);
  });

  it('flags overdue payments from finance map', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [hotel({ status: 'confirmed', voucherNote: 'ok' })],
      financeByTrip: new Map([
        ['t1', { tripId: 't1', overdueCount: 2, supplierDue: 5000 }],
      ]),
      days: 14,
      now,
    });
    expect(board.rows[0]!.flags.some((f) => f.code === 'payment_overdue')).toBe(
      true,
    );
    expect(board.summary.overduePayTrips).toBe(1);
  });

  it('flags voucher_pending for confirmed hotel, transfer, and activity', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [
        hotel({ id: 'h1', status: 'confirmed', voucherNote: null }),
        {
          id: 'tr1',
          type: 'transfer',
          title: 'Airport pickup',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: null,
          voucherNote: null,
          ...baseTrip,
        },
        {
          id: 'a1',
          type: 'activity',
          title: 'Tiger Hill',
          status: 'confirmed',
          startAt: '2026-04-11',
          endAt: null,
          voucherNote: '  ',
          ...baseTrip,
        },
      ],
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    expect(board.summary.activities).toBe(1);
    expect(board.summary.voucherPending).toBe(3);
    expect(
      board.rows.every((r) =>
        r.flags.some((f) => f.code === 'voucher_pending'),
      ),
    ).toBe(true);
    expect(
      board.rows.find((r) => r.type === 'transfer')!.flags.find(
        (f) => f.code === 'voucher_pending',
      )!.label,
    ).toBe('Transfer voucher pending');
  });

  it('flags driver double-booking across overlapping transfers', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [
        {
          id: 'tr1',
          type: 'transfer',
          title: 'Airport pickup',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: null,
          tripId: 't1',
          tripNumber: 'TRP-01',
          tripTitle: 'A',
          tripStartDate: '2026-04-10',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
        {
          id: 'tr2',
          type: 'transfer',
          title: 'Hotel drop',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: '2026-04-11',
          tripId: 't2',
          tripNumber: 'TRP-02',
          tripTitle: 'B',
          tripStartDate: '2026-04-10',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
      ],
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    expect(board.rows).toHaveLength(2);
    expect(
      board.rows.every((r) =>
        r.flags.some((f) => f.code === 'driver_conflict'),
      ),
    ).toBe(true);
  });

  it('flags vehicle double-booking across overlapping transfers', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [
        {
          id: 'tr1',
          type: 'transfer',
          title: 'Airport pickup',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: null,
          tripId: 't1',
          tripNumber: 'TRP-01',
          tripTitle: 'A',
          tripStartDate: '2026-04-10',
          fleetUnitId: 'unit1',
          vehicleLabel: 'Innova · DL01AB1001',
        },
        {
          id: 'tr2',
          type: 'transfer',
          title: 'Hotel drop',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: '2026-04-11',
          tripId: 't2',
          tripNumber: 'TRP-02',
          tripTitle: 'B',
          tripStartDate: '2026-04-10',
          fleetUnitId: 'unit1',
          vehicleLabel: 'Innova · DL01AB1001',
        },
      ],
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    expect(board.rows).toHaveLength(2);
    expect(
      board.rows.every((r) =>
        r.flags.some((f) => f.code === 'vehicle_conflict'),
      ),
    ).toBe(true);
  });

  it('flags driver conflict when peer sits outside the display window', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [
        {
          id: 'in',
          type: 'transfer',
          title: 'Airport pickup',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: null,
          tripId: 't1',
          tripNumber: 'TRP-01',
          tripTitle: 'A',
          tripStartDate: '2026-04-10',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
        {
          id: 'out',
          type: 'transfer',
          title: 'Later drop',
          status: 'confirmed',
          startAt: '2026-05-20',
          endAt: '2026-05-21',
          tripId: 't2',
          tripNumber: 'TRP-02',
          tripTitle: 'B',
          tripStartDate: '2026-05-20',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
      ],
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    // Overlap is on Apr 10 only if intervals collide — May peer should NOT conflict.
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].flags.some((f) => f.code === 'driver_conflict')).toBe(
      false,
    );
  });

  it('flags in-window transfer when overlapping peer is outside window', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const board = buildMovementBoard({
      bookings: [
        {
          id: 'in',
          type: 'transfer',
          title: 'Airport pickup',
          status: 'confirmed',
          startAt: '2026-04-10',
          endAt: '2026-04-11',
          tripId: 't1',
          tripNumber: 'TRP-01',
          tripTitle: 'A',
          tripStartDate: '2026-04-10',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
        // Movement date before window, but interval still overlaps Apr 10.
        {
          id: 'out',
          type: 'transfer',
          title: 'Long duty',
          status: 'confirmed',
          startAt: '2026-03-20',
          endAt: '2026-04-11',
          tripId: 't2',
          tripNumber: 'TRP-02',
          tripTitle: 'B',
          tripStartDate: '2026-03-20',
          driverSupplierId: 'drv1',
          driverName: 'Raju',
        },
      ],
      financeByTrip: new Map(),
      days: 14,
      now,
    });
    expect(board.rows.map((r) => r.bookingId)).toEqual(['in']);
    expect(board.rows[0].flags.some((f) => f.code === 'driver_conflict')).toBe(
      true,
    );
  });
});
