import { parseTransferAssignment } from '../operations/transfer-assignment';

export type InboundPartnerConfirmCue = {
  startAt: string | null;
  endAt: string | null;
  vehicleLabel: string | null;
  vehicles: number | null;
  party: number | null;
  seatsPerVehicle: number | null;
  capacityNote: string | null;
  capacityWarn: boolean;
};

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

function asRecord(json: unknown): Record<string, unknown> {
  return json && typeof json === 'object' && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(500, Math.floor(n));
}

function nonNegInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(500, Math.floor(n));
}

function vehiclesFromRequirements(json: unknown): number | null {
  return positiveInt(asRecord(json).vehicles);
}

function partyFromRequirements(json: unknown): number | null {
  const root = asRecord(json);
  const adults = nonNegInt(root.adults) ?? 0;
  const children = nonNegInt(root.children) ?? 0;
  const total = adults + children;
  return total > 0 ? total : null;
}

function seatsFromRequirements(json: unknown): number | null {
  const root = asRecord(json);
  return positiveInt(root.vehicleSeats) ?? positiveInt(root.seats);
}

export function formatInboundTransferCapacityNote(input: {
  party?: number | null;
  seatsPerVehicle?: number | null;
  vehicles?: number | null;
}): string | null {
  const seats = Number(input.seatsPerVehicle);
  if (!Number.isFinite(seats) || seats <= 0) return null;
  const vehicles = Math.max(1, Math.round(Number(input.vehicles) || 1));
  const capacity = seats * vehicles;
  const party = Math.max(0, Math.round(Number(input.party) || 0));
  if (party <= 0) {
    return `${capacity} seat(s) across ${vehicles} vehicle(s).`;
  }
  if (party > capacity) {
    return `Insufficient capacity: party of ${party} exceeds ${capacity} seat(s) (${seats}×${vehicles}).`;
  }
  return `Party of ${party} fits ${capacity} seat(s) (${seats}×${vehicles}).`;
}

export function inboundTransferCapacityWarn(note: string | null | undefined): boolean {
  return Boolean(note?.startsWith('Insufficient capacity'));
}

/** Project service-date / vehicle / soft capacity cues for partner inbound confirm UX. */
export function inboundPartnerConfirmCueFromBooking(
  booking: {
    startAt?: Date | string | null;
    endAt?: Date | string | null;
    travellerRequirementsJson?: unknown;
  },
  opts?: {
    /** Fallback party when requirements lack adults/children. */
    party?: number | null;
    /** Fallback seats when requirements lack vehicleSeats (e.g. VehicleType.seats). */
    seatsPerVehicle?: number | null;
  },
): InboundPartnerConfirmCue {
  const assignment = parseTransferAssignment(booking.travellerRequirementsJson);
  const vehicles = vehiclesFromRequirements(booking.travellerRequirementsJson);
  const party =
    partyFromRequirements(booking.travellerRequirementsJson) ??
    (opts?.party != null && opts.party > 0 ? Math.floor(opts.party) : null);
  const seatsPerVehicle =
    seatsFromRequirements(booking.travellerRequirementsJson) ??
    (opts?.seatsPerVehicle != null && opts.seatsPerVehicle > 0
      ? Math.floor(opts.seatsPerVehicle)
      : null);
  const capacityNote = formatInboundTransferCapacityNote({
    party,
    seatsPerVehicle,
    vehicles,
  });
  return {
    startAt: isoOrNull(booking.startAt),
    endAt: isoOrNull(booking.endAt),
    vehicleLabel: assignment.vehicleLabel,
    vehicles,
    party,
    seatsPerVehicle,
    capacityNote,
    capacityWarn: inboundTransferCapacityWarn(capacityNote),
  };
}
