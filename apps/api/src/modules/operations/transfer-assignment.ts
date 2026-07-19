/** Transfer driver/vehicle assignment stored on BookingComponent.travellerRequirementsJson. */

export type TransferAssignment = {
  driverSupplierId: string | null;
  vehicleLabel: string | null;
  /** Partner AssetFleetUnit id when supplier has linkedAssetId fleet. */
  fleetUnitId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseTransferAssignment(json: unknown): TransferAssignment {
  const root = asRecord(json);
  const driverSupplierId =
    typeof root.driverSupplierId === 'string' && root.driverSupplierId.trim()
      ? root.driverSupplierId.trim()
      : null;
  const vehicleLabel =
    typeof root.vehicleLabel === 'string' && root.vehicleLabel.trim()
      ? root.vehicleLabel.trim()
      : null;
  const fleetUnitId =
    typeof root.fleetUnitId === 'string' && root.fleetUnitId.trim()
      ? root.fleetUnitId.trim()
      : null;
  return { driverSupplierId, vehicleLabel, fleetUnitId };
}

/** Merge assignment keys into existing travellerRequirementsJson (preserves hotel keys). */
export function mergeTransferAssignment(
  existingJson: unknown,
  patch: {
    driverSupplierId?: string | null;
    vehicleLabel?: string | null;
    fleetUnitId?: string | null;
  },
): Record<string, unknown> {
  const next = { ...asRecord(existingJson) };
  if (patch.driverSupplierId !== undefined) {
    if (patch.driverSupplierId == null || !String(patch.driverSupplierId).trim()) {
      delete next.driverSupplierId;
      // Clearing driver also clears unit pick.
      delete next.fleetUnitId;
    } else {
      next.driverSupplierId = String(patch.driverSupplierId).trim();
    }
  }
  if (patch.vehicleLabel !== undefined) {
    if (patch.vehicleLabel == null || !String(patch.vehicleLabel).trim()) {
      delete next.vehicleLabel;
      // Clearing vehicle label also clears unit pick.
      delete next.fleetUnitId;
    } else {
      next.vehicleLabel = String(patch.vehicleLabel).trim();
    }
  }
  if (patch.fleetUnitId !== undefined) {
    if (patch.fleetUnitId == null || !String(patch.fleetUnitId).trim()) {
      delete next.fleetUnitId;
    } else {
      next.fleetUnitId = String(patch.fleetUnitId).trim();
    }
  }
  return next;
}

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

/** Inclusive start / exclusive end in UTC days for overlap checks. */
export function transferAssignmentInterval(input: {
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  tripStartDate?: Date | string | null;
}): { start: Date; end: Date } | null {
  const when = asDate(input.startAt) || asDate(input.tripStartDate);
  if (!when) return null;
  const start = startOfUtcDay(when);
  const endRaw = asDate(input.endAt);
  const end = endRaw
    ? startOfUtcDay(endRaw).getTime() > start.getTime()
      ? startOfUtcDay(endRaw)
      : addUtcDays(start, 1)
    : addUtcDays(start, 1);
  return { start, end };
}

function intervalsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * Booking ids that share the same driverSupplierId with an overlapping transfer window.
 */
export function findDriverConflictBookingIds(
  bookings: Array<{
    id: string;
    type: string;
    status: string;
    startAt?: Date | string | null;
    endAt?: Date | string | null;
    tripStartDate?: Date | string | null;
    driverSupplierId?: string | null;
  }>,
): Set<string> {
  const transfers = bookings.filter(
    (b) =>
      b.type === 'transfer' &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected' &&
      Boolean(b.driverSupplierId?.trim()),
  );
  const conflicted = new Set<string>();
  for (let i = 0; i < transfers.length; i++) {
    const a = transfers[i]!;
    const aInt = transferAssignmentInterval(a);
    if (!aInt) continue;
    for (let j = i + 1; j < transfers.length; j++) {
      const b = transfers[j]!;
      if (a.driverSupplierId !== b.driverSupplierId) continue;
      const bInt = transferAssignmentInterval(b);
      if (!bInt) continue;
      if (intervalsOverlap(aInt, bInt)) {
        conflicted.add(a.id);
        conflicted.add(b.id);
      }
    }
  }
  return conflicted;
}

/**
 * Booking ids that share the same fleetUnitId with an overlapping transfer window.
 */
export function findFleetUnitConflictBookingIds(
  bookings: Array<{
    id: string;
    type: string;
    status: string;
    startAt?: Date | string | null;
    endAt?: Date | string | null;
    tripStartDate?: Date | string | null;
    fleetUnitId?: string | null;
  }>,
): Set<string> {
  const transfers = bookings.filter(
    (b) =>
      b.type === 'transfer' &&
      b.status !== 'cancelled' &&
      b.status !== 'rejected' &&
      Boolean(b.fleetUnitId?.trim()),
  );
  const conflicted = new Set<string>();
  for (let i = 0; i < transfers.length; i++) {
    const a = transfers[i]!;
    const aInt = transferAssignmentInterval(a);
    if (!aInt) continue;
    for (let j = i + 1; j < transfers.length; j++) {
      const b = transfers[j]!;
      if (a.fleetUnitId !== b.fleetUnitId) continue;
      const bInt = transferAssignmentInterval(b);
      if (!bInt) continue;
      if (intervalsOverlap(aInt, bInt)) {
        conflicted.add(a.id);
        conflicted.add(b.id);
      }
    }
  }
  return conflicted;
}

export function formatFleetUnitLabel(unit: {
  name: string;
  plateNumber?: string | null;
}): string {
  const plate = unit.plateNumber?.trim();
  return plate ? `${unit.name} · ${plate}` : unit.name;
}
