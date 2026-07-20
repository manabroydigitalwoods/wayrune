/** Hotel max-stay cue for quote Match — hard-blocks send when stay is long. */

import { lineNeedsMaxStayRiskAck } from '@wayrune/contracts';

export type HotelMaxStayCalc = {
  maxStayNights?: number | null;
  stayNights?: number | null;
  maxStayLong?: boolean | null;
  maxStayNote?: string | null;
};

export function formatHotelMaxStayNote(
  calc: HotelMaxStayCalc | null | undefined,
): string | null {
  if (!calc?.maxStayLong) return null;
  const note = calc.maxStayNote?.trim();
  if (note) return note;
  const max = Math.max(0, Math.round(Number(calc.maxStayNights) || 0));
  const nights = Math.max(0, Math.round(Number(calc.stayNights) || 0));
  if (max < 1) return null;
  return `Max stay ${max} night${max === 1 ? '' : 's'} — this stay is ${nights}`;
}

/** True when Match stamped a above-max stay overage. */
export function hotelMaxStayIsWarn(note: string | null | undefined): boolean {
  if (!note) return false;
  return note.startsWith('Max stay') && note.includes('this stay is');
}

export function hotelMaxStayTone(
  note: string | null | undefined,
): 'block' | 'info' {
  return hotelMaxStayIsWarn(note) ? 'block' : 'info';
}

/** Merge max-stay stamp onto rate provenance (Match). */
export function withMaxStayProvenance<T extends Record<string, unknown>>(
  provenance: T | null | undefined,
  note: string | null | undefined,
): (T & {
  maxStayNote?: string;
  maxStayWarn?: boolean;
  maxStayRiskAckForNote?: string;
  maxStayRiskAckReason?: string;
}) | undefined {
  if (!provenance) return undefined;
  const trimmed = note?.trim() || '';
  const warn = hotelMaxStayIsWarn(trimmed);
  const next = { ...provenance } as T & {
    maxStayNote?: string;
    maxStayWarn?: boolean;
    maxStayRiskAckForNote?: string;
    maxStayRiskAckReason?: string;
  };
  if (trimmed) next.maxStayNote = trimmed;
  else delete next.maxStayNote;
  if (warn) {
    next.maxStayWarn = true;
    const prevAck =
      typeof (provenance as { maxStayRiskAckForNote?: unknown })
        .maxStayRiskAckForNote === 'string'
        ? String(
            (provenance as { maxStayRiskAckForNote?: string })
              .maxStayRiskAckForNote,
          ).trim()
        : '';
    const prevReason =
      typeof (provenance as { maxStayRiskAckReason?: unknown })
        .maxStayRiskAckReason === 'string'
        ? String(
            (provenance as { maxStayRiskAckReason?: string })
              .maxStayRiskAckReason,
          ).trim()
        : '';
    if (prevAck && trimmed && prevAck === trimmed && prevReason) {
      next.maxStayRiskAckForNote = prevAck;
      next.maxStayRiskAckReason = prevReason;
    } else {
      delete next.maxStayRiskAckForNote;
      delete next.maxStayRiskAckReason;
    }
  } else {
    delete next.maxStayWarn;
    delete next.maxStayRiskAckForNote;
    delete next.maxStayRiskAckReason;
  }
  return next;
}

/** Whether stamped provenance blocks customer send / approval. */
export function hotelMaxStayBlocksSend(provenance: {
  maxStayWarn?: boolean | null;
  maxStayNote?: string | null;
  maxStayRiskAckForNote?: string | null;
  maxStayRiskAckReason?: string | null;
  calculation?: {
    maxStayLong?: boolean | null;
    maxStayNote?: string | null;
  } | null;
} | null | undefined): boolean {
  if (!provenance) return false;
  return lineNeedsMaxStayRiskAck({
    maxStayWarn: provenance.maxStayWarn,
    maxStayNote:
      provenance.maxStayNote || provenance.calculation?.maxStayNote,
    maxStayRiskAckForNote: provenance.maxStayRiskAckForNote,
    maxStayRiskAckReason: provenance.maxStayRiskAckReason,
    maxStayLong: provenance.calculation?.maxStayLong,
  });
}
