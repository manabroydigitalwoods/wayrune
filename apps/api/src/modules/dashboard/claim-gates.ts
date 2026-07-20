import type { FitClaimProtocol } from './sales-sla-metrics';
import type { PublicScaleProtocol } from './public-scale-metrics';

/** Ops steps for clearing the public FIT speed claim (registry flip is manual). */
export function fitClaimOpsChecklist(
  protocol: Pick<
    FitClaimProtocol,
    | 'sampleSize'
    | 'minSampleSize'
    | 'medianMinutes'
    | 'targetMinutes'
    | 'publicClaimAllowed'
    | 'demoClaimReady'
    | 'demoSampleSize'
  >,
): string[] {
  const steps: string[] = [];
  const remaining = Math.max(0, protocol.minSampleSize - protocol.sampleSize);
  if (remaining > 0) {
    steps.push(
      `Record ${remaining} more real FIT quote sends on this org (workspace open → first successful send; demo seed excluded).`,
    );
  }
  if (protocol.medianMinutes == null && protocol.sampleSize === 0) {
    steps.push('No real FIT timing samples yet — send priced quotes from the trip workspace.');
  } else if (
    protocol.medianMinutes != null &&
    protocol.medianMinutes > protocol.targetMinutes
  ) {
    steps.push(
      `Median ${protocol.medianMinutes.toFixed(1)}m exceeds ${protocol.targetMinutes}m target — improve in-session Match/pricing before public claim.`,
    );
  }
  if (protocol.demoClaimReady && protocol.demoSampleSize > 0) {
    steps.push(
      `Demo seed shows ready locally (${protocol.demoSampleSize} samples) — never counts toward public marketing.`,
    );
  }
  if (protocol.publicClaimAllowed) {
    steps.push(
      'Technical gate clear for this org — product still keeps claim registry on Testing until explicit sign-off.',
    );
  } else {
    steps.push('Keep public “under 3 minutes” copy on Testing until this gate clears.');
  }
  return steps;
}

/** Ops steps for publishing measured scale on /docs. */
export function publicScaleOpsChecklist(protocol: PublicScaleProtocol): string[] {
  const steps: string[] = [];
  const { minima } = protocol;
  if (protocol.activeAgencyOrgs < minima.activeAgencyOrgs) {
    steps.push(
      `Need ${minima.activeAgencyOrgs - protocol.activeAgencyOrgs} more active agency orgs with a sent quote in ${protocol.windowDays}d (have ${protocol.activeAgencyOrgs}/${minima.activeAgencyOrgs}).`,
    );
  }
  if (protocol.tripsWithAcceptedQuote < minima.tripsWithAcceptedQuote) {
    steps.push(
      `Need ${minima.tripsWithAcceptedQuote - protocol.tripsWithAcceptedQuote} more trips with accepted quotes in ${protocol.windowDays}d (have ${protocol.tripsWithAcceptedQuote}/${minima.tripsWithAcceptedQuote}).`,
    );
  }
  if (protocol.quotesSent90d < minima.quotesSent90d) {
    steps.push(
      `Need ${minima.quotesSent90d - protocol.quotesSent90d} more sent quotes in ${protocol.windowDays}d (have ${protocol.quotesSent90d}/${minima.quotesSent90d}).`,
    );
  }
  if (protocol.publicScaleAllowed) {
    steps.push(
      'Platform gate clear — copy GET /platform/scale snapshot into public-scale-snapshot.json, then publish /docs strip after review.',
    );
  } else {
    steps.push('Do not invent scale numbers on marketing pages until this gate clears.');
  }
  return steps;
}
