/** Trade/agent parties use org agentMarkupPercent when set; else defaultMarkupPercent. */

export const AGENT_MARKUP_BUSINESS_TYPES = [
  'travel_agency',
  'reseller',
  'dmc',
] as const;

export type AgentMarkupPartyLike = {
  businessType?: string | null;
  type?: string | null;
} | null;

export function partyUsesAgentMarkup(party: AgentMarkupPartyLike): boolean {
  const bt = String(party?.businessType || '')
    .trim()
    .toLowerCase();
  return (AGENT_MARKUP_BUSINESS_TYPES as readonly string[]).includes(bt);
}

export function resolveOrgMarkupPercent(
  settings: {
    defaultMarkupPercent?: unknown;
    agentMarkupPercent?: unknown;
  } | null
    | undefined,
  opts?: { party?: AgentMarkupPartyLike },
): number {
  const fallback = 20;
  const defRaw = Number(settings?.defaultMarkupPercent);
  const defaultPct = Number.isFinite(defRaw) ? defRaw : fallback;

  if (!partyUsesAgentMarkup(opts?.party ?? null)) {
    return defaultPct;
  }

  const agentRaw = Number(settings?.agentMarkupPercent);
  if (!Number.isFinite(agentRaw)) return defaultPct;
  return agentRaw;
}
