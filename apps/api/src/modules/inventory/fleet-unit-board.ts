/**
 * Partner-asset unit board: compose busy intervals per fleet unit (read-only).
 */

export type FleetUnitBoardBusySource =
  | 'calendar'
  | 'allocation'
  | 'driver_job'
  | 'rental';

export type FleetUnitBoardBusyInterval = {
  source: FleetUnitBoardBusySource;
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  status?: string | null;
};

export type FleetUnitBoardUnit = {
  id: string;
  name: string;
  plateNumber: string | null;
  intervals: FleetUnitBoardBusyInterval[];
};

export type FleetUnitBoardInput = {
  units: Array<{ id: string; name: string; plateNumber?: string | null }>;
  calendarBlocks: Array<{
    id: string;
    fleetUnitId: string | null;
    startAt: Date | string;
    endAt: Date | string;
    kind: string;
  }>;
  allocations: Array<{
    id: string;
    fleetUnitId: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
    status: string;
    notes?: string | null;
  }>;
  driverJobs: Array<{
    id: string;
    fleetUnitId: string | null;
    startAt: Date | string;
    endAt: Date | string;
    status: string;
    guestName?: string | null;
  }>;
  rentals: Array<{
    id: string;
    fleetUnitId: string;
    startAt: Date | string;
    endAt: Date | string;
    status: string;
    guestName?: string | null;
  }>;
  from: Date;
  to: Date;
};

function iso(d: Date | string): string {
  return new Date(d).toISOString();
}

function overlaps(
  start: Date | string,
  end: Date | string,
  from: Date,
  to: Date,
): boolean {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return e > from.getTime() && s < to.getTime();
}

const CANCELLED = new Set(['cancelled', 'released', 'no_show']);

/**
 * Build unit lanes with busy intervals overlapping [from, to).
 * Calendar "available" kind is omitted (not busy).
 */
export function buildFleetUnitBoard(input: FleetUnitBoardInput): {
  from: string;
  to: string;
  units: FleetUnitBoardUnit[];
} {
  const { from, to } = input;
  const byUnit = new Map<string, FleetUnitBoardBusyInterval[]>();
  for (const u of input.units) {
    byUnit.set(u.id, []);
  }

  const push = (
    fleetUnitId: string | null | undefined,
    interval: FleetUnitBoardBusyInterval,
  ) => {
    if (!fleetUnitId || !byUnit.has(fleetUnitId)) return;
    byUnit.get(fleetUnitId)!.push(interval);
  };

  for (const b of input.calendarBlocks) {
    if (b.kind === 'available') continue;
    if (!overlaps(b.startAt, b.endAt, from, to)) continue;
    push(b.fleetUnitId, {
      source: 'calendar',
      id: b.id,
      startAt: iso(b.startAt),
      endAt: iso(b.endAt),
      label: b.kind,
      status: b.kind,
    });
  }

  for (const a of input.allocations) {
    if (CANCELLED.has(a.status)) continue;
    if (!a.startAt || !a.endAt) continue;
    if (!overlaps(a.startAt, a.endAt, from, to)) continue;
    push(a.fleetUnitId, {
      source: 'allocation',
      id: a.id,
      startAt: iso(a.startAt),
      endAt: iso(a.endAt),
      label: a.notes?.trim() || a.status,
      status: a.status,
    });
  }

  for (const j of input.driverJobs) {
    if (CANCELLED.has(j.status)) continue;
    if (!overlaps(j.startAt, j.endAt, from, to)) continue;
    push(j.fleetUnitId, {
      source: 'driver_job',
      id: j.id,
      startAt: iso(j.startAt),
      endAt: iso(j.endAt),
      label: j.guestName?.trim() || 'Driver job',
      status: j.status,
    });
  }

  for (const r of input.rentals) {
    if (CANCELLED.has(r.status)) continue;
    if (!overlaps(r.startAt, r.endAt, from, to)) continue;
    push(r.fleetUnitId, {
      source: 'rental',
      id: r.id,
      startAt: iso(r.startAt),
      endAt: iso(r.endAt),
      label: r.guestName?.trim() || 'Rental',
      status: r.status,
    });
  }

  const units: FleetUnitBoardUnit[] = input.units.map((u) => {
    const intervals = (byUnit.get(u.id) || []).sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    );
    return {
      id: u.id,
      name: u.name,
      plateNumber: u.plateNumber ?? null,
      intervals,
    };
  });

  return { from: from.toISOString(), to: to.toISOString(), units };
}
