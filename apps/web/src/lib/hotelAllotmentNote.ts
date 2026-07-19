/** Hotel allotment cue for quote Match — hard-blocks send when inventory is short. */

import { lineNeedsAllotmentRiskAck } from '@wayrune/contracts';

export type AllotmentProductRow = {
  remaining: number;
  name?: string;
};

export function formatHotelAllotmentNote(input: {
  products?: AllotmentProductRow[] | null;
  message?: string | null;
  roomsRequested?: number | null;
}): string | null {
  const products = input.products ?? [];
  if (!products.length) {
    return (
      input.message?.trim() ||
      'No inventory linked yet — confirmations will skip allotment.'
    );
  }
  const total = products.reduce((s, p) => s + Math.max(0, Number(p.remaining) || 0), 0);
  const rooms = Math.max(1, Math.round(input.roomsRequested ?? 1));
  if (total <= 0) {
    return 'Insufficient allotment: no rooms remaining for these nights.';
  }
  if (total < rooms) {
    return `Insufficient allotment: only ${total} room(s) remaining — you requested ${rooms}.`;
  }
  return `${total} room(s) remaining across ${products.length} product(s) for these nights.`;
}

/** True when linked inventory cannot cover requested rooms. */
export function hotelAllotmentIsWarn(note: string | null | undefined): boolean {
  if (!note) return false;
  return (
    note.startsWith('Insufficient allotment') ||
    note.startsWith('Soft warning') // legacy stamps still risk
  );
}

export function hotelAllotmentTone(
  note: string | null | undefined,
): 'block' | 'info' {
  return hotelAllotmentIsWarn(note) ? 'block' : 'info';
}

/** Merge allotment stamp onto rate provenance (Match / availability). */
export function withAllotmentProvenance<T extends Record<string, unknown>>(
  provenance: T | null | undefined,
  note: string | null | undefined,
): (T & {
  allotmentNote?: string;
  allotmentWarn?: boolean;
  allotmentRiskAckForNote?: string;
  allotmentRiskAckReason?: string;
}) | undefined {
  if (!provenance) return undefined;
  const trimmed = note?.trim() || '';
  const warn = hotelAllotmentIsWarn(trimmed);
  const next = { ...provenance } as T & {
    allotmentNote?: string;
    allotmentWarn?: boolean;
    allotmentRiskAckForNote?: string;
    allotmentRiskAckReason?: string;
  };
  if (trimmed) next.allotmentNote = trimmed;
  else delete next.allotmentNote;
  if (warn) {
    next.allotmentWarn = true;
    const prevAck =
      typeof (provenance as { allotmentRiskAckForNote?: unknown })
        .allotmentRiskAckForNote === 'string'
        ? String(
            (provenance as { allotmentRiskAckForNote?: string })
              .allotmentRiskAckForNote,
          ).trim()
        : '';
    const prevReason =
      typeof (provenance as { allotmentRiskAckReason?: unknown })
        .allotmentRiskAckReason === 'string'
        ? String(
            (provenance as { allotmentRiskAckReason?: string })
              .allotmentRiskAckReason,
          ).trim()
        : '';
    if (prevAck && trimmed && prevAck === trimmed && prevReason) {
      next.allotmentRiskAckForNote = prevAck;
      next.allotmentRiskAckReason = prevReason;
    } else {
      delete next.allotmentRiskAckForNote;
      delete next.allotmentRiskAckReason;
    }
  } else {
    delete next.allotmentWarn;
    delete next.allotmentRiskAckForNote;
    delete next.allotmentRiskAckReason;
  }
  return next;
}

/** Whether stamped provenance blocks customer send / approval. */
export function hotelAllotmentBlocksSend(provenance: {
  allotmentWarn?: boolean | null;
  allotmentNote?: string | null;
  allotmentRiskAckForNote?: string | null;
  allotmentRiskAckReason?: string | null;
} | null | undefined): boolean {
  if (!provenance) return false;
  return lineNeedsAllotmentRiskAck(provenance);
}
