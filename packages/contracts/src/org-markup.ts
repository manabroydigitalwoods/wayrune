/** Trade/agent parties use org agentMarkupPercent when set; else defaultMarkupPercent. */

export const AGENT_MARKUP_BUSINESS_TYPES = [
  'travel_agency',
  'reseller',
  'dmc',
] as const;

export type AgentMarkupPartyLike = {
  businessType?: string | null;
  type?: string | null;
  /** Per-party override % (takes precedence over org default / agent %). */
  markupPercent?: number | null;
  metadataJson?: unknown;
} | null;

export function partyUsesAgentMarkup(party: AgentMarkupPartyLike): boolean {
  const bt = String(party?.businessType || '')
    .trim()
    .toLowerCase();
  return (AGENT_MARKUP_BUSINESS_TYPES as readonly string[]).includes(bt);
}

/** Read optional per-party markup % from a top-level field or metadataJson. */
export function partyMarkupPercentOverride(
  party: AgentMarkupPartyLike,
): number | null {
  if (!party) return null;
  const direct = Number(party.markupPercent);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const meta =
    party.metadataJson &&
    typeof party.metadataJson === 'object' &&
    !Array.isArray(party.metadataJson)
      ? (party.metadataJson as Record<string, unknown>)
      : null;
  if (!meta) return null;
  const fromMeta = Number(meta.markupPercent);
  if (Number.isFinite(fromMeta) && fromMeta >= 0) return fromMeta;
  return null;
}

/**
 * Resolve markup % for Match / Apply default:
 * 1. Party override (any client type)
 * 2. Org agentMarkupPercent for trade B2B types
 * 3. Org defaultMarkupPercent (fallback 20)
 */
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

  const partyOverride = partyMarkupPercentOverride(opts?.party ?? null);
  if (partyOverride != null) return partyOverride;

  if (!partyUsesAgentMarkup(opts?.party ?? null)) {
    return defaultPct;
  }

  const agentRaw = Number(settings?.agentMarkupPercent);
  if (!Number.isFinite(agentRaw)) return defaultPct;
  return agentRaw;
}

export function partyMarkupCue(party: AgentMarkupPartyLike): string | null {
  const override = partyMarkupPercentOverride(party);
  if (override != null) {
    return `Custom markup ${override}% applies on Match rates for this client (overrides org default / agent %).`;
  }
  if (!partyUsesAgentMarkup(party)) return null;
  return 'Agent markup applies on Match rates for this B2B client (Settings → Agent markup %).';
}

export type PartyMarkupStampSource =
  | 'party_override'
  | 'agent'
  | 'org_default';

/** Resolve the party/org markup % + source label frozen onto quote lines at send. */
export function resolvePartyMarkupStamp(
  settings: {
    defaultMarkupPercent?: unknown;
    agentMarkupPercent?: unknown;
  } | null
    | undefined,
  party?: AgentMarkupPartyLike,
): { percent: number; source: PartyMarkupStampSource } {
  const percent = resolveOrgMarkupPercent(settings, { party });
  if (partyMarkupPercentOverride(party ?? null) != null) {
    return { percent, source: 'party_override' };
  }
  if (partyUsesAgentMarkup(party ?? null)) {
    const agentRaw = Number(settings?.agentMarkupPercent);
    if (Number.isFinite(agentRaw)) {
      return { percent, source: 'agent' };
    }
  }
  return { percent, source: 'org_default' };
}

export function partyMarkupStampSourceLabel(
  source: PartyMarkupStampSource | null | undefined,
): string {
  switch (source) {
    case 'party_override':
      return 'client override';
    case 'agent':
      return 'agent / B2B';
    case 'org_default':
      return 'org default';
    default:
      return 'markup';
  }
}

/**
 * Freeze resolved party markup onto each quote line's details at send.
 * Idempotent — skips lines that already carry partyMarkupPercent.
 */
export function stampPartyMarkupOntoQuoteItems<
  T extends { details?: Record<string, unknown> | null },
>(
  items: T[],
  stamp: { percent: number; source: PartyMarkupStampSource },
): { items: T[]; stampedCount: number } {
  let stampedCount = 0;
  const next = items.map((item) => {
    const prev =
      item.details &&
      typeof item.details === 'object' &&
      !Array.isArray(item.details)
        ? (item.details as Record<string, unknown>)
        : {};
    const existing = Number(prev.partyMarkupPercent);
    if (Number.isFinite(existing) && existing >= 0) {
      return item;
    }
    stampedCount += 1;
    return {
      ...item,
      details: {
        ...prev,
        partyMarkupPercent: stamp.percent,
        partyMarkupSource: stamp.source,
      },
    };
  });
  return { items: next, stampedCount };
}

