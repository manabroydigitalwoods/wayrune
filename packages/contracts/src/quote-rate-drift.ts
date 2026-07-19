/** Soft rate-chart drift → send/approve acknowledge gate. */

export function rateChartChangedSinceMatch(opts: {
  matchedAt?: string | null;
  rateUpdatedAtAtMatch?: string | null;
  currentUpdatedAt?: string | null;
}): boolean {
  if (!opts.currentUpdatedAt?.trim()) return false;
  const baseline = opts.rateUpdatedAtAtMatch || opts.matchedAt;
  if (!baseline?.trim()) return false;
  const cur = Date.parse(opts.currentUpdatedAt);
  const base = Date.parse(baseline);
  if (!Number.isFinite(cur) || !Number.isFinite(base)) return false;
  return cur > base + 999;
}

/** True when chart drifted and the line has not acknowledged this chart updatedAt + reason. */
export function lineNeedsRateDriftAck(opts: {
  matchedAt?: string | null;
  rateUpdatedAtAtMatch?: string | null;
  currentUpdatedAt?: string | null;
  ackForUpdatedAt?: string | null;
  ackReason?: string | null;
}): boolean {
  if (
    !rateChartChangedSinceMatch({
      matchedAt: opts.matchedAt,
      rateUpdatedAtAtMatch: opts.rateUpdatedAtAtMatch,
      currentUpdatedAt: opts.currentUpdatedAt,
    })
  ) {
    return false;
  }
  const current = opts.currentUpdatedAt?.trim();
  const ack = opts.ackForUpdatedAt?.trim();
  const reason = opts.ackReason?.trim();
  if (!current) return false;
  if (!ack || !reason) return true;
  const curMs = Date.parse(current);
  const ackMs = Date.parse(ack);
  if (!Number.isFinite(curMs) || !Number.isFinite(ackMs)) return true;
  return Math.abs(curMs - ackMs) > 999;
}
