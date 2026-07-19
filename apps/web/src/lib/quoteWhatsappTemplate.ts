/** Client-side Quote WA template helpers (mirrors API quote-whatsapp-template). */

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

/** Whether org WhatsApp Cloud credentials look configured (masked token counts). */
export function isWhatsappCloudConfigured(settingsJson: unknown): boolean {
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
  if (wa.enabled !== true) return false;
  const phone =
    typeof wa.phoneNumberId === 'string' ? wa.phoneNumberId.trim() : '';
  if (!phone) return false;
  if (wa.accessTokenConfigured === true) return true;
  const token = typeof wa.accessToken === 'string' ? wa.accessToken.trim() : '';
  return Boolean(token && token !== '••••••••');
}

export type QuoteWhatsappSendCue = {
  tone: 'ok' | 'warn' | 'info';
  message: string;
  /** Link target when missing template / Cloud. */
  linkKind: 'integrations' | null;
};

export function quoteWhatsappSendCue(input: {
  cloudConfigured: boolean;
  templateReady: boolean;
}): QuoteWhatsappSendCue {
  if (!input.cloudConfigured) {
    return {
      tone: 'info',
      message:
        'Cloud not configured — Send opens WhatsApp for a manual message, then Mark as sent.',
      linkKind: 'integrations',
    };
  }
  if (!input.templateReady) {
    return {
      tone: 'warn',
      message:
        'Cold send needs a Quote proposal template under Integrations (or a customer reply in the last 24h).',
      linkKind: 'integrations',
    };
  }
  return {
    tone: 'ok',
    message: 'Template ready for cold Cloud send · session text inside 24h.',
    linkKind: null,
  };
}
