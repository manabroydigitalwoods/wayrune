/** Transfer capacity cue for quote Match — hard-blocks send when party exceeds seats. */

import { lineNeedsCapacityRiskAck } from '@wayrune/contracts';

/** Minimum vehicles so seats × vehicles ≥ party (ceil). Null when seats/party unknown. */
export function minVehiclesForParty(
  party: number | null | undefined,
  seatsPerVehicle: number | null | undefined,
): number | null {
  const seats = Number(seatsPerVehicle);
  const pax = Math.max(0, Math.round(Number(party) || 0));
  if (!Number.isFinite(seats) || seats <= 0 || pax <= 0) return null;
  return Math.max(1, Math.ceil(pax / seats));
}

/**
 * Raise vehicles to fit party when Match returns seats. Never decreases a higher user count.
 */
export function bumpTransferVehiclesForCapacity(input: {
  vehicles?: number | null;
  party?: number | null;
  seatsPerVehicle?: number | null;
}): { vehicles: number; bumped: boolean; previous: number } {
  const previous = Math.max(1, Math.round(Number(input.vehicles) || 1));
  const min = minVehiclesForParty(input.party, input.seatsPerVehicle);
  if (min == null || previous >= min) {
    return { vehicles: previous, bumped: false, previous };
  }
  return { vehicles: min, bumped: true, previous };
}

export function formatTransferCapacityNote(input: {
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

/** True when party exceeds seats × vehicles. */
export function transferCapacityIsWarn(note: string | null | undefined): boolean {
  if (!note) return false;
  return (
    note.startsWith('Insufficient capacity') ||
    note.startsWith('Soft warning') // legacy stamps still risk
  );
}

export function transferCapacityTone(
  note: string | null | undefined,
): 'block' | 'info' {
  return transferCapacityIsWarn(note) ? 'block' : 'info';
}

/** Merge capacity stamp onto rate provenance (transfer Match). */
export function withCapacityProvenance<T extends Record<string, unknown>>(
  provenance: T | null | undefined,
  note: string | null | undefined,
): (T & {
  capacityNote?: string;
  capacityWarn?: boolean;
  capacityRiskAckForNote?: string;
  capacityRiskAckReason?: string;
}) | undefined {
  if (!provenance) return undefined;
  const trimmed = note?.trim() || '';
  const warn = transferCapacityIsWarn(trimmed);
  const next = { ...provenance } as T & {
    capacityNote?: string;
    capacityWarn?: boolean;
    capacityRiskAckForNote?: string;
    capacityRiskAckReason?: string;
  };
  if (trimmed) next.capacityNote = trimmed;
  else delete next.capacityNote;
  if (warn) {
    next.capacityWarn = true;
    const prevAck =
      typeof (provenance as { capacityRiskAckForNote?: unknown })
        .capacityRiskAckForNote === 'string'
        ? String(
            (provenance as { capacityRiskAckForNote?: string })
              .capacityRiskAckForNote,
          ).trim()
        : '';
    const prevReason =
      typeof (provenance as { capacityRiskAckReason?: unknown })
        .capacityRiskAckReason === 'string'
        ? String(
            (provenance as { capacityRiskAckReason?: string })
              .capacityRiskAckReason,
          ).trim()
        : '';
    if (prevAck && trimmed && prevAck === trimmed && prevReason) {
      next.capacityRiskAckForNote = prevAck;
      next.capacityRiskAckReason = prevReason;
    } else {
      delete next.capacityRiskAckForNote;
      delete next.capacityRiskAckReason;
    }
  } else {
    delete next.capacityWarn;
    delete next.capacityRiskAckForNote;
    delete next.capacityRiskAckReason;
  }
  return next;
}

/** Whether stamped provenance blocks customer send / approval. */
export function transferCapacityBlocksSend(provenance: {
  capacityWarn?: boolean | null;
  capacityNote?: string | null;
  capacityRiskAckForNote?: string | null;
  capacityRiskAckReason?: string | null;
} | null | undefined): boolean {
  if (!provenance) return false;
  return lineNeedsCapacityRiskAck(provenance);
}

/**
 * Recompute capacity note/warn from stamped seats + current party/vehicles
 * (Vehicles edit without rematch). No-op when seats unknown.
 */
export function restampTransferCapacity<T extends Record<string, unknown>>(opts: {
  provenance: T | null | undefined;
  party?: number | null;
  vehicles?: number | null;
  seatsPerVehicle?: number | null;
}): {
  note: string | null;
  provenance: (T & {
    capacityNote?: string;
    capacityWarn?: boolean;
    capacityRiskAckForNote?: string;
    vehicleSeats?: number;
  }) | undefined;
} {
  const seatsRaw =
    opts.seatsPerVehicle ??
    (typeof (opts.provenance as { vehicleSeats?: unknown } | null | undefined)
      ?.vehicleSeats === 'number'
      ? (opts.provenance as { vehicleSeats?: number }).vehicleSeats
      : null);
  const seats = Number(seatsRaw);
  if (!Number.isFinite(seats) || seats <= 0) {
    return {
      note: opts.provenance
        ? typeof (opts.provenance as { capacityNote?: unknown }).capacityNote ===
          'string'
          ? String((opts.provenance as { capacityNote?: string }).capacityNote)
          : null
        : null,
      provenance: opts.provenance
        ? (opts.provenance as T & {
            capacityNote?: string;
            capacityWarn?: boolean;
            capacityRiskAckForNote?: string;
            vehicleSeats?: number;
          })
        : undefined,
    };
  }
  const note = formatTransferCapacityNote({
    party: opts.party,
    seatsPerVehicle: seats,
    vehicles: opts.vehicles,
  });
  const stamped = withCapacityProvenance(opts.provenance, note);
  if (!stamped) {
    return { note, provenance: undefined };
  }
  return {
    note,
    provenance: { ...stamped, vehicleSeats: seats },
  };
}

/**
 * Raise vehicles to fit party (same as Match), then restamp capacity.
 * Used when Adults/Children change without rematch.
 */
export function bumpAndRestampTransferCapacity<T extends Record<string, unknown>>(opts: {
  provenance: T | null | undefined;
  party?: number | null;
  vehicles?: number | null;
  seatsPerVehicle?: number | null;
}): {
  note: string | null;
  vehicles: number;
  bumped: boolean;
  previousVehicles: number;
  provenance: (T & {
    capacityNote?: string;
    capacityWarn?: boolean;
    capacityRiskAckForNote?: string;
    vehicleSeats?: number;
  }) | undefined;
} {
  const seatsRaw =
    opts.seatsPerVehicle ??
    (typeof (opts.provenance as { vehicleSeats?: unknown } | null | undefined)
      ?.vehicleSeats === 'number'
      ? (opts.provenance as { vehicleSeats?: number }).vehicleSeats
      : null);
  const bump = bumpTransferVehiclesForCapacity({
    vehicles: opts.vehicles,
    party: opts.party,
    seatsPerVehicle: seatsRaw,
  });
  const live = restampTransferCapacity({
    provenance: opts.provenance,
    party: opts.party,
    vehicles: bump.vehicles,
    seatsPerVehicle: seatsRaw,
  });
  return {
    note: live.note,
    vehicles: bump.vehicles,
    bumped: bump.bumped,
    previousVehicles: bump.previous,
    provenance: live.provenance,
  };
}
