/** Allotment / capacity hard-block → send/approve acknowledge gate. */

function noteLooksLikeAllotmentRisk(note: string): boolean {
  return (
    note.startsWith('Insufficient allotment') || note.startsWith('Soft warning')
  );
}

function noteLooksLikeCapacityRisk(note: string): boolean {
  return (
    note.startsWith('Insufficient capacity') ||
    note.startsWith('Soft warning: party of')
  );
}

/** True when allotment is short and the editor has not acknowledged this note + reason. */
export function lineNeedsAllotmentRiskAck(opts: {
  allotmentWarn?: boolean | null;
  allotmentNote?: string | null;
  allotmentRiskAckForNote?: string | null;
  allotmentRiskAckReason?: string | null;
}): boolean {
  const note = opts.allotmentNote?.trim() || '';
  const warn =
    opts.allotmentWarn === true || (note ? noteLooksLikeAllotmentRisk(note) : false);
  if (!warn) return false;
  const ack = opts.allotmentRiskAckForNote?.trim() || '';
  const reason = opts.allotmentRiskAckReason?.trim() || '';
  if (!note) return !(ack && reason);
  return ack !== note || !reason;
}

/** True when capacity is short and the editor has not acknowledged this note + reason. */
export function lineNeedsCapacityRiskAck(opts: {
  capacityWarn?: boolean | null;
  capacityNote?: string | null;
  capacityRiskAckForNote?: string | null;
  capacityRiskAckReason?: string | null;
}): boolean {
  const note = opts.capacityNote?.trim() || '';
  const warn =
    opts.capacityWarn === true || (note ? noteLooksLikeCapacityRisk(note) : false);
  if (!warn) return false;
  const ack = opts.capacityRiskAckForNote?.trim() || '';
  const reason = opts.capacityRiskAckReason?.trim() || '';
  if (!note) return !(ack && reason);
  return ack !== note || !reason;
}
