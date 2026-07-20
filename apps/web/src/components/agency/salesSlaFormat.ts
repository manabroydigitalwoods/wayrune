/** Compact hour display for sales SLA strip (mirrors API helper). */
export function formatHoursCompact(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded}h`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

export type SalesSlaTone = 'neutral' | 'success' | 'warn' | 'danger';

/**
 * Tone a median against an optional target (same units).
 * Over target → warn; over 1.5× → danger; at/under → success; missing → neutral.
 */
export function salesSlaMedianTone(
  median: number | null | undefined,
  target: number | null | undefined,
): SalesSlaTone {
  if (median == null || !Number.isFinite(median) || target == null || !(target > 0)) {
    return 'neutral';
  }
  if (median <= target) return 'success';
  if (median > target * 1.5) return 'danger';
  return 'warn';
}

export function formatHoursTargetCue(
  targetHours: number | null | undefined,
): string | null {
  if (targetHours == null || !(targetHours > 0)) return null;
  return `target ${formatHoursCompact(targetHours)}`;
}

export function formatMinutesTargetCue(
  targetMinutes: number | null | undefined,
): string | null {
  if (targetMinutes == null || !(targetMinutes > 0)) return null;
  if (targetMinutes < 60) return `target ${Math.round(targetMinutes)}m`;
  const hours = Math.round((targetMinutes / 60) * 10) / 10;
  return `target ${hours}h`;
}

export type FitClaimProtocolCue = {
  claimStatus?: 'testing' | 'ready' | null;
  publicClaimAllowed?: boolean | null;
  sampleSize?: number | null;
  minSampleSize?: number | null;
  medianMinutes?: number | null;
  targetMinutes?: number | null;
  demoSampleSize?: number | null;
  demoClaimReady?: boolean | null;
};

/** Compact FIT &lt;3m claim gate cue for the sales strip. */
export function formatFitClaimProtocolCue(
  protocol: FitClaimProtocolCue | null | undefined,
): string | null {
  if (!protocol) return null;
  const n = Math.max(0, Math.floor(Number(protocol.sampleSize) || 0));
  const min = Math.max(1, Math.floor(Number(protocol.minSampleSize) || 20));
  const target = Math.max(1, Math.round(Number(protocol.targetMinutes) || 3));
  const demoN = Math.max(0, Math.floor(Number(protocol.demoSampleSize) || 0));
  if (protocol.publicClaimAllowed || protocol.claimStatus === 'ready') {
    return `claim ready · under ${target}m (n=${n})`;
  }
  if (protocol.demoClaimReady) {
    return `demo seed ready (local only) · public claim testing`;
  }
  if (n < min) {
    const median =
      protocol.medianMinutes != null && Number.isFinite(protocol.medianMinutes)
        ? ` · median ${Math.round(Number(protocol.medianMinutes))}m`
        : '';
    const demo =
      demoN > 0 ? ` · ${demoN} demo excluded` : '';
    return `testing · ${n}/${min} samples${median}${demo}`;
  }
  const median = protocol.medianMinutes;
  if (median != null && Number.isFinite(median) && median > target) {
    return `testing · median ${Math.round(median)}m · do not claim`;
  }
  return `testing · n=${n}`;
}

