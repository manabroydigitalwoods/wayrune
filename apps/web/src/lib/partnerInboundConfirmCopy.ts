import {
  formatTransferCapacityNote,
  transferCapacityIsWarn,
} from './transferCapacityNote';

export type PartnerInboundConfirmCue = {
  startAt?: string | null;
  endAt?: string | null;
  vehicleLabel?: string | null;
  vehicles?: number | null;
  party?: number | null;
  seatsPerVehicle?: number | null;
  capacityNote?: string | null;
  capacityWarn?: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  transfer: 'Transfer',
  activity: 'Activity',
  flight_ref: 'Flight ref',
  other: 'Other',
};

export function partnerInboundTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type || 'Booking';
}

export function partnerInboundConfirmPlaceholder(type: string): string {
  if (type === 'transfer') return 'Vehicle / job ref';
  if (type === 'activity') return 'Voucher / activity ref';
  return 'Hotel conf # / PNR';
}

/** Alias — same placeholders for Ops Confirm sheet. */
export const opsBookingConfirmPlaceholder = partnerInboundConfirmPlaceholder;

export function partnerInboundConfirmDescription(type: string): string {
  if (type === 'transfer') {
    return 'Sets status to confirmed, syncs any transfer hold, and schedules the agency supplier payable when cost exists. Optionally attach a confirmation PDF or image.';
  }
  if (type === 'activity') {
    return 'Sets status to confirmed and schedules the agency supplier payable when cost exists. Optionally attach a confirmation PDF or image.';
  }
  return 'Sets status to confirmed, upgrades any allotment hold, and schedules the agency supplier payable when cost exists. Optionally attach a confirmation PDF or image for the agency.';
}

/** Ops Confirm sheet — type-aware, agency Finance voice. */
export function opsBookingConfirmDescription(type: string): string {
  if (type === 'transfer') {
    return 'Sets status to confirmed, syncs any transfer hold, and schedules a supplier payable in Finance (AUTO-…). Then mark vouchered when the guest note is ready.';
  }
  if (type === 'activity') {
    return 'Sets status to confirmed and schedules a supplier payable in Finance (AUTO-…). Then mark vouchered when the guest note is ready.';
  }
  return 'Sets status to confirmed, upgrades any allotment hold, and schedules a supplier payable in Finance (AUTO-…). Then mark vouchered when the guest note is ready.';
}

/** Soft capacity toast suffix after partner/ops confirm (never blocks). */
export function transferCapacityConfirmToastCue(res: {
  capacityWarn?: boolean;
  capacityNote?: string | null;
}): string {
  if (!res.capacityWarn) return '';
  return ' · capacity short — confirm still applied';
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

/**
 * Build confirm cues from an Ops booking row (requirements already on the client).
 * Soft capacity only — never blocks confirm.
 */
export function opsConfirmCueFromBooking(booking: {
  startAt?: string | null;
  endAt?: string | null;
  travellerRequirementsJson?: Record<string, unknown> | null;
}): PartnerInboundConfirmCue {
  const req = booking.travellerRequirementsJson || {};
  const vehicleLabel =
    typeof req.vehicleLabel === 'string' && req.vehicleLabel.trim()
      ? req.vehicleLabel.trim()
      : typeof req.vehicleTypeName === 'string' && req.vehicleTypeName.trim()
        ? req.vehicleTypeName.trim()
        : null;
  const vehicles = positiveInt(req.vehicles);
  const adults = nonNegInt(req.adults) ?? 0;
  const children = nonNegInt(req.children) ?? 0;
  const party = adults + children > 0 ? adults + children : null;
  const seatsPerVehicle =
    positiveInt(req.vehicleSeats) ?? positiveInt(req.seats);
  const capacityNote = formatTransferCapacityNote({
    party,
    seatsPerVehicle,
    vehicles,
  });
  return {
    startAt: booking.startAt ?? null,
    endAt: booking.endAt ?? null,
    vehicleLabel,
    vehicles,
    party,
    seatsPerVehicle,
    capacityNote,
    capacityWarn: transferCapacityIsWarn(capacityNote),
  };
}

/** Short service cue under the confirm sheet / inbound row. */
export function partnerInboundServiceCue(
  type: string,
  cue?: PartnerInboundConfirmCue | null,
): string | null {
  if (!cue) return null;
  const parts: string[] = [];
  if (type === 'transfer') {
    if (cue.vehicleLabel?.trim()) parts.push(cue.vehicleLabel.trim());
    if (cue.vehicles != null && cue.vehicles > 1) {
      parts.push(`${cue.vehicles} vehicles`);
    }
    if (cue.capacityWarn) parts.push('over capacity');
  }
  const startDay = cue.startAt?.slice(0, 10);
  const endDay = cue.endAt?.slice(0, 10);
  if (startDay) {
    if (type === 'hotel' && endDay && endDay !== startDay) {
      parts.push(`${startDay} → ${endDay}`);
    } else if (type === 'activity' || type === 'transfer' || type === 'hotel') {
      parts.push(startDay);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}
