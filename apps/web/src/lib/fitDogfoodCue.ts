/**
 * Guided FIT dogfood / claim-gate cues (workspace + About).
 * Does not flip marketing registry — telemetry only.
 */

export type FitClaimProgressInput = {
  sampleSize?: number | null;
  minSampleSize?: number | null;
  medianMinutes?: number | null;
  targetMinutes?: number | null;
  demoSampleSize?: number | null;
  publicClaimAllowed?: boolean | null;
};

export function fitClaimRemainingSamples(
  protocol: Pick<FitClaimProgressInput, 'sampleSize' | 'minSampleSize'>,
): number {
  const n = Math.max(0, Math.floor(Number(protocol.sampleSize) || 0));
  const min = Math.max(1, Math.floor(Number(protocol.minSampleSize) || 20));
  return Math.max(0, min - n);
}

/** Compact workspace line under the FIT progress rail (caller appends About link). */
export function formatFitDogfoodWorkspaceCue(
  protocol: FitClaimProgressInput | null | undefined,
): string {
  if (!protocol) {
    return 'First successful send on this tab records FIT build timing';
  }
  const n = Math.max(0, Math.floor(Number(protocol.sampleSize) || 0));
  const min = Math.max(1, Math.floor(Number(protocol.minSampleSize) || 20));
  const remaining = fitClaimRemainingSamples(protocol);
  const target = Math.max(1, Math.round(Number(protocol.targetMinutes) || 3));
  if (protocol.publicClaimAllowed) {
    return `FIT timing gate clear for this org (n=${n}, median ≤${target}m) · registry stays Testing until sign-off`;
  }
  const median =
    protocol.medianMinutes != null && Number.isFinite(protocol.medianMinutes)
      ? ` · median ${Math.round(Number(protocol.medianMinutes))}m`
      : '';
  const demoN = Math.max(0, Math.floor(Number(protocol.demoSampleSize) || 0));
  const demo = demoN > 0 ? ` · ${demoN} demo excluded` : '';
  if (remaining > 0) {
    return `This send counts toward FIT timing · ${n}/${min} real${median}${demo} · ${remaining} more to gate`;
  }
  return `FIT samples met (${n}/${min})${median} · median must stay ≤${target}m`;
}

export function formatFitClaimRemainingCue(
  protocol: FitClaimProgressInput | null | undefined,
): string | null {
  if (!protocol) return null;
  const remaining = fitClaimRemainingSamples(protocol);
  if (remaining <= 0) return null;
  return `${remaining} more real send${remaining === 1 ? '' : 's'} to reach ${protocol.minSampleSize ?? 20}`;
}
