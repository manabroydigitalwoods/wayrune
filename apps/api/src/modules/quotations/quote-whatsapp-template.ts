/** Resolve which Meta template to use for cold quote WhatsApp sends. */

export type QuoteWaTemplateCandidate = {
  id: string;
  name: string;
  metaTemplateName: string;
  isActive?: boolean;
};

function readQuoteProposalTemplateId(settingsJson: unknown): string {
  const settings =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const integrations =
    settings.integrations && typeof settings.integrations === 'object'
      ? (settings.integrations as Record<string, unknown>)
      : {};
  const wa =
    integrations.whatsapp && typeof integrations.whatsapp === 'object'
      ? (integrations.whatsapp as Record<string, unknown>)
      : {};
  return typeof wa.quoteProposalTemplateId === 'string'
    ? wa.quoteProposalTemplateId.trim()
    : '';
}

function isQuoteProposalNameMatch(t: QuoteWaTemplateCandidate): boolean {
  return (
    t.name.trim().toLowerCase() === 'quote proposal' ||
    t.metaTemplateName.trim().toLowerCase() === 'quote_proposal'
  );
}

/**
 * Pick active quote-proposal template: explicit org id first, then name /
 * metaTemplateName fallbacks used by cold Cloud send.
 */
export function pickQuoteProposalTemplate<T extends QuoteWaTemplateCandidate>(
  templates: T[],
  settingsJson: unknown,
): T | null {
  const active = templates.filter((t) => t.isActive !== false);
  const templateId = readQuoteProposalTemplateId(settingsJson);
  if (templateId) {
    const byId = active.find((t) => t.id === templateId);
    if (byId) return byId;
  }
  return active.find(isQuoteProposalNameMatch) ?? null;
}
