/** Org-wide movement board — upcoming hotel check-ins, transfers, and activities with risk chips. */

import {
  NEAR_DEPARTURE_DAYS,
  daysUntil,
  isOpenBooking,
} from './trip-control';
import {
  findDriverConflictBookingIds,
  findFleetUnitConflictBookingIds,
} from './transfer-assignment';

export type MovementBoardBooking = {
  id: string;
  type: string;
  title: string;
  status: string;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  confirmationRef?: string | null;
  voucherNote?: string | null;
  supplierName?: string | null;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  tripStartDate?: Date | string | null;
  tripEndDate?: Date | string | null;
  /** Assigned driver supplier (transfer assignment JSON). */
  driverSupplierId?: string | null;
  driverName?: string | null;
  vehicleLabel?: string | null;
  fleetUnitId?: string | null;
};

export type MovementBoardTripFinance = {
  tripId: string;
  overdueCount: number;
  supplierDue: number;
};

export type MovementBoardFlag = {
  code: string;
  severity: 'danger' | 'warn' | 'info';
  label: string;
};

export type MovementBoardRow = {
  bookingId: string;
  tripId: string;
  tripNumber: string;
  tripTitle: string;
  type: string;
  title: string;
  status: string;
  /** Effective movement date (booking startAt or trip start). */
  movementAt: string;
  endAt: string | null;
  supplierName: string | null;
  confirmationRef: string | null;
  driverName: string | null;
  vehicleLabel: string | null;
  /** Assigned driver/fleet supplier id (transfers); used for drag-assign highlight. */
  driverSupplierId: string | null;
  fleetUnitId: string | null;
  flags: MovementBoardFlag[];
};

export type MovementBoardSummary = {
  hotels: number;
  transfers: number;
  activities: number;
  flagged: number;
  overduePayTrips: number;
  voucherPending: number;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function movementWindow(days: number, now = new Date()): {
  from: Date;
  to: Date;
  days: number;
} {
  const n = Math.min(90, Math.max(1, Math.floor(days) || 14));
  const from = startOfUtcDay(now);
  const to = addUtcDays(from, n);
  return { from, to, days: n };
}

/** Parse YYYY-MM-DD as UTC calendar day start. */
export function parseUtcYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd.trim())) return null;
  const [y, m, d] = ymd.trim().split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Inclusive calendar from/to (YYYY-MM-DD) → exclusive end Date for window filters.
 * Aligns with UI DateRangeFilter day strings; compares as UTC calendar days.
 */
export function movementWindowFromRange(
  fromYmd: string,
  toYmd: string,
): { from: Date; to: Date; days: number } | null {
  const from = parseUtcYmd(fromYmd);
  const toInclusive = parseUtcYmd(toYmd);
  if (!from || !toInclusive) return null;
  if (toInclusive.getTime() < from.getTime()) return null;
  const to = addUtcDays(toInclusive, 1);
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return { from, to, days: Math.min(366, days) };
}

export function resolveMovementWindow(opts: {
  days?: number;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { from: Date; to: Date; days: number } {
  if (opts.from && opts.to) {
    const ranged = movementWindowFromRange(opts.from, opts.to);
    if (ranged) return ranged;
  }
  return movementWindow(opts.days ?? 14, opts.now);
}

export function effectiveMovementDate(
  booking: Pick<MovementBoardBooking, 'startAt' | 'tripStartDate'>,
): Date | null {
  return asDate(booking.startAt) || asDate(booking.tripStartDate);
}

export function bookingInMovementWindow(
  booking: MovementBoardBooking,
  from: Date,
  to: Date,
): boolean {
  if (booking.status === 'cancelled' || booking.status === 'rejected') return false;
  if (
    booking.type !== 'hotel' &&
    booking.type !== 'transfer' &&
    booking.type !== 'activity'
  ) {
    return false;
  }
  const when = effectiveMovementDate(booking);
  if (!when) return false;
  const day = startOfUtcDay(when);
  return day.getTime() >= from.getTime() && day.getTime() < to.getTime();
}

function tripHasTransfer(
  tripId: string,
  all: MovementBoardBooking[],
): boolean {
  return all.some(
    (b) =>
      b.tripId === tripId &&
      b.type === 'transfer' &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected',
  );
}

function tripHasHotel(tripId: string, all: MovementBoardBooking[]): boolean {
  return all.some(
    (b) =>
      b.tripId === tripId &&
      b.type === 'hotel' &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected',
  );
}

export function buildMovementBoardRow(
  booking: MovementBoardBooking,
  opts: {
    allBookings: MovementBoardBooking[];
    financeByTrip: Map<string, MovementBoardTripFinance>;
    driverConflictIds?: Set<string>;
    fleetConflictIds?: Set<string>;
    now?: Date;
  },
): MovementBoardRow | null {
  const now = opts.now ?? new Date();
  const when = effectiveMovementDate(booking);
  if (!when) return null;

  const tripDays = daysUntil(booking.tripStartDate, now);
  const nearDeparture =
    tripDays != null && tripDays >= 0 && tripDays <= NEAR_DEPARTURE_DAYS;
  const bookingDays = daysUntil(when, now);
  const nearMovement =
    bookingDays != null && bookingDays >= 0 && bookingDays <= NEAR_DEPARTURE_DAYS;

  const flags: MovementBoardFlag[] = [];

  if (isOpenBooking(booking.status)) {
    if (booking.type === 'hotel') {
      flags.push({
        code: 'unconfirmed_hotel',
        severity: nearDeparture || nearMovement ? 'danger' : 'warn',
        label:
          nearDeparture || nearMovement
            ? 'Hotel unconfirmed near departure'
            : 'Hotel enquiry open',
      });
    } else if (booking.type === 'transfer') {
      flags.push({
        code: 'unconfirmed_transfer',
        severity: nearDeparture || nearMovement ? 'danger' : 'warn',
        label:
          nearDeparture || nearMovement
            ? 'Transfer unconfirmed near departure'
            : 'Transfer still open',
      });
    }
  }

  if (
    (booking.type === 'hotel' ||
      booking.type === 'transfer' ||
      booking.type === 'activity') &&
    booking.status === 'confirmed' &&
    !String(booking.voucherNote || '').trim()
  ) {
    flags.push({
      code: 'voucher_pending',
      severity: nearDeparture || nearMovement ? 'warn' : 'info',
      label:
        booking.type === 'transfer'
          ? 'Transfer voucher pending'
          : booking.type === 'activity'
            ? 'Activity voucher pending'
            : 'Voucher pending',
    });
  }

  if (
    tripHasHotel(booking.tripId, opts.allBookings) &&
    !tripHasTransfer(booking.tripId, opts.allBookings)
  ) {
    flags.push({
      code: 'missing_transfer',
      severity: nearDeparture ? 'warn' : 'info',
      label: 'No transfer on trip',
    });
  }

  if (opts.driverConflictIds?.has(booking.id)) {
    flags.push({
      code: 'driver_conflict',
      severity: 'danger',
      label: booking.driverName
        ? `Driver double-booked (${booking.driverName})`
        : 'Driver double-booked',
    });
  }

  if (opts.fleetConflictIds?.has(booking.id)) {
    flags.push({
      code: 'vehicle_conflict',
      severity: 'danger',
      label: booking.vehicleLabel
        ? `Vehicle double-booked (${booking.vehicleLabel})`
        : 'Vehicle double-booked',
    });
  }

  const fin = opts.financeByTrip.get(booking.tripId);
  if (fin && fin.overdueCount > 0) {
    flags.push({
      code: 'payment_overdue',
      severity: 'danger',
      label: `${fin.overdueCount} overdue payment${fin.overdueCount === 1 ? '' : 's'}`,
    });
  } else if (fin && fin.supplierDue > 0) {
    flags.push({
      code: 'supplier_payable_open',
      severity: nearDeparture ? 'warn' : 'info',
      label: 'Supplier payable open',
    });
  }

  // Dedupe by code (missing_transfer can repeat per hotel row — keep once)
  const seen = new Set<string>();
  const uniqueFlags = flags.filter((f) => {
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });

  const end = asDate(booking.endAt);

  return {
    bookingId: booking.id,
    tripId: booking.tripId,
    tripNumber: booking.tripNumber,
    tripTitle: booking.tripTitle,
    type: booking.type,
    title: booking.title,
    status: booking.status,
    movementAt: isoDay(when),
    endAt: end ? isoDay(end) : null,
    supplierName: booking.supplierName?.trim() || null,
    confirmationRef: booking.confirmationRef?.trim() || null,
    driverName: booking.driverName?.trim() || null,
    vehicleLabel: booking.vehicleLabel?.trim() || null,
    driverSupplierId: booking.driverSupplierId?.trim() || null,
    fleetUnitId: booking.fleetUnitId?.trim() || null,
    flags: uniqueFlags,
  };
}

export function buildMovementBoard(opts: {
  bookings: MovementBoardBooking[];
  financeByTrip: Map<string, MovementBoardTripFinance>;
  days?: number;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): {
  window: { from: string; to: string; days: number };
  rows: MovementBoardRow[];
  summary: MovementBoardSummary;
} {
  const now = opts.now ?? new Date();
  const win = resolveMovementWindow({
    days: opts.days,
    from: opts.from,
    to: opts.to,
    now,
  });
  const inWindow = opts.bookings.filter((b) =>
    bookingInMovementWindow(b, win.from, win.to),
  );

  const driverConflictIds = findDriverConflictBookingIds(opts.bookings);
  const fleetConflictIds = findFleetUnitConflictBookingIds(opts.bookings);

  const rows = inWindow
    .map((b) =>
      buildMovementBoardRow(b, {
        allBookings: opts.bookings,
        financeByTrip: opts.financeByTrip,
        driverConflictIds,
        fleetConflictIds,
        now,
      }),
    )
    .filter((r): r is MovementBoardRow => Boolean(r))
    .sort((a, b) => {
      const d = a.movementAt.localeCompare(b.movementAt);
      if (d) return d;
      return a.tripNumber.localeCompare(b.tripNumber);
    });

  const overduePayTrips = new Set(
    [...opts.financeByTrip.values()]
      .filter((f) => f.overdueCount > 0)
      .map((f) => f.tripId),
  );

  return {
    window: {
      from: isoDay(win.from),
      to: isoDay(win.to),
      days: win.days,
    },
    rows,
    summary: {
      hotels: rows.filter((r) => r.type === 'hotel').length,
      transfers: rows.filter((r) => r.type === 'transfer').length,
      activities: rows.filter((r) => r.type === 'activity').length,
      flagged: rows.filter((r) => r.flags.some((f) => f.severity !== 'info')).length,
      overduePayTrips: [...overduePayTrips].filter((id) =>
        rows.some((r) => r.tripId === id),
      ).length,
      voucherPending: rows.filter((r) =>
        r.flags.some((f) => f.code === 'voucher_pending'),
      ).length,
    },
  };
}
