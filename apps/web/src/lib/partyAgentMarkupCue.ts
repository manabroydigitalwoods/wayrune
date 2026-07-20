import { partyMarkupCue } from './orgMarkup';

/** Buyer-facing cue on customer hub when custom or agent markup applies on Match. */
export function partyAgentMarkupCue(party: {
  businessType?: string | null;
  markupPercent?: number | null;
  metadataJson?: unknown;
}): string | null {
  return partyMarkupCue(party);
}
