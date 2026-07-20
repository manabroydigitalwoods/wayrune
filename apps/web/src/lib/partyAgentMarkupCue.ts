import { partyUsesAgentMarkup } from './orgMarkup';

/** Buyer-facing cue on customer hub when agent markup applies on Match. */
export function partyAgentMarkupCue(party: {
  businessType?: string | null;
}): string | null {
  if (!partyUsesAgentMarkup(party)) return null;
  return 'Agent markup applies on Match rates for this B2B client (Settings → Agent markup %).';
}
