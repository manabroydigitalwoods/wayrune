/** Allotment / capacity / min-stay hard-block → send/approve acknowledge gate. */

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

function noteLooksLikeMinStayRisk(note: string): boolean {
  return note.startsWith('Min stay') && note.includes('this stay is');
}

function noteLooksLikeMaxStayRisk(note: string): boolean {
  return note.startsWith('Max stay') && note.includes('this stay is');
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

/** True when stay is below contracted min and unacked. */
export function lineNeedsMinStayRiskAck(opts: {
  minStayWarn?: boolean | null;
  minStayNote?: string | null;
  minStayRiskAckForNote?: string | null;
  minStayRiskAckReason?: string | null;
  /** Fallback from Match calculation when top-level stamp missing. */
  minStayShort?: boolean | null;
}): boolean {
  const note = opts.minStayNote?.trim() || '';
  const warn =
    opts.minStayWarn === true ||
    opts.minStayShort === true ||
    (note ? noteLooksLikeMinStayRisk(note) : false);
  if (!warn) return false;
  const ack = opts.minStayRiskAckForNote?.trim() || '';
  const reason = opts.minStayRiskAckReason?.trim() || '';
  if (!note) return !(ack && reason);
  return ack !== note || !reason;
}

/** True when stay exceeds contracted max and unacked. */
export function lineNeedsMaxStayRiskAck(opts: {
  maxStayWarn?: boolean | null;
  maxStayNote?: string | null;
  maxStayRiskAckForNote?: string | null;
  maxStayRiskAckReason?: string | null;
  /** Fallback from Match calculation when top-level stamp missing. */
  maxStayLong?: boolean | null;
}): boolean {
  const note = opts.maxStayNote?.trim() || '';
  const warn =
    opts.maxStayWarn === true ||
    opts.maxStayLong === true ||
    (note ? noteLooksLikeMaxStayRisk(note) : false);
  if (!warn) return false;
  const ack = opts.maxStayRiskAckForNote?.trim() || '';
  const reason = opts.maxStayRiskAckReason?.trim() || '';
  if (!note) return !(ack && reason);
  return ack !== note || !reason;
}
