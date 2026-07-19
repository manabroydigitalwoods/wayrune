/** Hotel min-stay cue for quote Match — hard-blocks send when stay is short. */

import { lineNeedsMinStayRiskAck } from '@wayrune/contracts';

export type HotelMinStayCalc = {
  minStayNights?: number | null;
  stayNights?: number | null;
  minStayShort?: boolean | null;
  minStayNote?: string | null;
};

export function formatHotelMinStayNote(
  calc: HotelMinStayCalc | null | undefined,
): string | null {
  if (!calc?.minStayShort) return null;
  const note = calc.minStayNote?.trim();
  if (note) return note;
  const min = Math.max(0, Math.round(Number(calc.minStayNights) || 0));
  const nights = Math.max(0, Math.round(Number(calc.stayNights) || 0));
  if (min < 1) return null;
  return `Min stay ${min} night${min === 1 ? '' : 's'} — this stay is ${nights}`;
}

/** True when Match stamped a below-min stay shortfall. */
export function hotelMinStayIsWarn(note: string | null | undefined): boolean {
  if (!note) return false;
  return note.startsWith('Min stay') && note.includes('this stay is');
}

export function hotelMinStayTone(
  note: string | null | undefined,
): 'block' | 'info' {
  return hotelMinStayIsWarn(note) ? 'block' : 'info';
}

/** Merge min-stay stamp onto rate provenance (Match). */
export function withMinStayProvenance<T extends Record<string, unknown>>(
  provenance: T | null | undefined,
  note: string | null | undefined,
): (T & {
  minStayNote?: string;
  minStayWarn?: boolean;
  minStayRiskAckForNote?: string;
  minStayRiskAckReason?: string;
}) | undefined {
  if (!provenance) return undefined;
  const trimmed = note?.trim() || '';
  const warn = hotelMinStayIsWarn(trimmed);
  const next = { ...provenance } as T & {
    minStayNote?: string;
    minStayWarn?: boolean;
    minStayRiskAckForNote?: string;
    minStayRiskAckReason?: string;
  };
  if (trimmed) next.minStayNote = trimmed;
  else delete next.minStayNote;
  if (warn) {
    next.minStayWarn = true;
    const prevAck =
      typeof (provenance as { minStayRiskAckForNote?: unknown })
        .minStayRiskAckForNote === 'string'
        ? String(
            (provenance as { minStayRiskAckForNote?: string })
              .minStayRiskAckForNote,
          ).trim()
        : '';
    const prevReason =
      typeof (provenance as { minStayRiskAckReason?: unknown })
        .minStayRiskAckReason === 'string'
        ? String(
            (provenance as { minStayRiskAckReason?: string })
              .minStayRiskAckReason,
          ).trim()
        : '';
    if (prevAck && trimmed && prevAck === trimmed && prevReason) {
      next.minStayRiskAckForNote = prevAck;
      next.minStayRiskAckReason = prevReason;
    } else {
      delete next.minStayRiskAckForNote;
      delete next.minStayRiskAckReason;
    }
  } else {
    delete next.minStayWarn;
    delete next.minStayRiskAckForNote;
    delete next.minStayRiskAckReason;
  }
  return next;
}

/** Whether stamped provenance blocks customer send / approval. */
export function hotelMinStayBlocksSend(provenance: {
  minStayWarn?: boolean | null;
  minStayNote?: string | null;
  minStayRiskAckForNote?: string | null;
  minStayRiskAckReason?: string | null;
  calculation?: {
    minStayShort?: boolean | null;
    minStayNote?: string | null;
  } | null;
} | null | undefined): boolean {
  if (!provenance) return false;
  return lineNeedsMinStayRiskAck({
    minStayWarn: provenance.minStayWarn,
    minStayNote:
      provenance.minStayNote || provenance.calculation?.minStayNote,
    minStayRiskAckForNote: provenance.minStayRiskAckForNote,
    minStayRiskAckReason: provenance.minStayRiskAckReason,
    minStayShort: provenance.calculation?.minStayShort,
  });
}
