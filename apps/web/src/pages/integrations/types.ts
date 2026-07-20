export type IntegrationsSettings = {
  hubspotEnabled: boolean;
  webhookUrl: string;
  whatsapp: {
    enabled: boolean;
    phoneNumberId: string;
    accessToken: string;
    accessTokenConfigured: boolean;
    verifyToken: string;
    appSecret: string;
    appSecretConfigured: boolean;
    /** WhatsApp Business Account ID (WABA) for template library sync. */
    whatsappBusinessAccountId: string;
    /** WhatsAppTemplate.id for cold quote Cloud sends. */
    quoteProposalTemplateId: string;
  };
  facebook: {
    enabled: boolean;
    pageId: string;
    accessToken: string;
    accessTokenConfigured: boolean;
    verifyToken: string;
    appSecret: string;
    appSecretConfigured: boolean;
    instagramBusinessAccountId: string;
  };
  emailIngest: {
    enabled: boolean;
    sharedSecret: string;
    sharedSecretConfigured: boolean;
  };
  websiteIngest: {
    sharedSecret: string;
    sharedSecretConfigured: boolean;
  };
  conversationWidget: {
    enabled: boolean;
    publicKey: string;
    brandName: string;
    primaryColor: string;
    whatsappNumber: string;
    defaultGreeting: string;
  };
  hubspot: {
    enabled: boolean;
    accessToken: string;
    accessTokenConfigured: boolean;
    portalId: string;
  };
};

export const EMPTY_INTEGRATIONS: IntegrationsSettings = {
  hubspotEnabled: false,
  webhookUrl: '',
  whatsapp: {
    enabled: false,
    phoneNumberId: '',
    accessToken: '',
    accessTokenConfigured: false,
    verifyToken: '',
    appSecret: '',
    appSecretConfigured: false,
    whatsappBusinessAccountId: '',
    quoteProposalTemplateId: '',
  },
  facebook: {
    enabled: false,
    pageId: '',
    accessToken: '',
    accessTokenConfigured: false,
    verifyToken: '',
    appSecret: '',
    appSecretConfigured: false,
    instagramBusinessAccountId: '',
  },
  emailIngest: {
    enabled: false,
    sharedSecret: '',
    sharedSecretConfigured: false,
  },
  websiteIngest: {
    sharedSecret: '',
    sharedSecretConfigured: false,
  },
  conversationWidget: {
    enabled: false,
    publicKey: '',
    brandName: '',
    primaryColor: '#0f766e',
    whatsappNumber: '',
    defaultGreeting: 'Need help planning your trip?',
  },
  hubspot: {
    enabled: false,
    accessToken: '',
    accessTokenConfigured: false,
    portalId: '',
  },
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function parseSecretBlock(
  block: Record<string, unknown>,
  secrets: Array<{ key: string; configuredKey: string }>,
) {
  const out: Record<string, unknown> = {};
  for (const { key, configuredKey } of secrets) {
    out[key] = '';
    out[configuredKey] = bool(
      block[configuredKey],
      Boolean(block[key] && !String(block[key]).startsWith('••••')),
    );
  }
  return out;
}

export function parseIntegrationsSettings(settingsJson: unknown): IntegrationsSettings {
  const settings = asRecord(settingsJson);
  const integrations = asRecord(settings.integrations);
  const wa = asRecord(integrations.whatsapp);
  const fb = asRecord(integrations.facebook);
  const email = asRecord(integrations.emailIngest);
  const website = asRecord(integrations.websiteIngest);
  const widget = asRecord(integrations.conversationWidget);
  const hubspot = asRecord(integrations.hubspot);
  const waSecrets = parseSecretBlock(wa, [
    { key: 'accessToken', configuredKey: 'accessTokenConfigured' },
    { key: 'appSecret', configuredKey: 'appSecretConfigured' },
  ]);
  const fbSecrets = parseSecretBlock(fb, [
    { key: 'accessToken', configuredKey: 'accessTokenConfigured' },
    { key: 'appSecret', configuredKey: 'appSecretConfigured' },
  ]);
  const emailSecrets = parseSecretBlock(email, [
    { key: 'sharedSecret', configuredKey: 'sharedSecretConfigured' },
  ]);
  const websiteSecrets = parseSecretBlock(website, [
    { key: 'sharedSecret', configuredKey: 'sharedSecretConfigured' },
  ]);
  const hubspotSecrets = parseSecretBlock(hubspot, [
    { key: 'accessToken', configuredKey: 'accessTokenConfigured' },
  ]);
  return {
    hubspotEnabled: bool(integrations.hubspotEnabled, false),
    webhookUrl: str(integrations.webhookUrl),
    whatsapp: {
      enabled: bool(wa.enabled, false),
      phoneNumberId: str(wa.phoneNumberId),
      accessToken: '',
      accessTokenConfigured: Boolean(waSecrets.accessTokenConfigured),
      verifyToken: str(wa.verifyToken),
      appSecret: '',
      appSecretConfigured: Boolean(waSecrets.appSecretConfigured),
      whatsappBusinessAccountId: str(
        wa.whatsappBusinessAccountId ?? wa.wabaId,
      ),
      quoteProposalTemplateId: str(wa.quoteProposalTemplateId),
    },
    facebook: {
      enabled: bool(fb.enabled, false),
      pageId: str(fb.pageId),
      accessToken: '',
      accessTokenConfigured: Boolean(fbSecrets.accessTokenConfigured),
      verifyToken: str(fb.verifyToken),
      appSecret: '',
      appSecretConfigured: Boolean(fbSecrets.appSecretConfigured),
      instagramBusinessAccountId: str(fb.instagramBusinessAccountId),
    },
    emailIngest: {
      enabled: bool(email.enabled, false),
      sharedSecret: '',
      sharedSecretConfigured: Boolean(emailSecrets.sharedSecretConfigured),
    },
    websiteIngest: {
      sharedSecret: '',
      sharedSecretConfigured: Boolean(websiteSecrets.sharedSecretConfigured),
    },
    conversationWidget: {
      enabled: bool(widget.enabled, false),
      publicKey: str(widget.publicKey),
      brandName: str(widget.brandName),
      primaryColor: str(widget.primaryColor, '#0f766e'),
      whatsappNumber: str(widget.whatsappNumber),
      defaultGreeting: str(widget.defaultGreeting, 'Need help planning your trip?'),
    },
    hubspot: {
      enabled: bool(hubspot.enabled, false),
      accessToken: '',
      accessTokenConfigured: Boolean(hubspotSecrets.accessTokenConfigured),
      portalId: str(hubspot.portalId),
    },
  };
}

export function ingestBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';
}

export function absoluteApiUrl(path: string) {
  return path.startsWith('http') ? path : `${window.location.origin}${path}`;
}
