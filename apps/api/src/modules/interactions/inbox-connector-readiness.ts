export type InboxConnectorChannelStatus = 'ready' | 'incomplete' | 'off';

export type InboxConnectorBanner = {
  channel: string;
  tone: 'info' | 'warn';
  message: string;
};

export type InboxConnectorReadiness = {
  channels: Record<
    string,
    { replyReady: boolean; status: InboxConnectorChannelStatus }
  >;
  banners: InboxConnectorBanner[];
};

function readIntegrations(settingsJson: unknown): Record<string, unknown> {
  const settings =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  return settings.integrations && typeof settings.integrations === 'object'
    ? (settings.integrations as Record<string, unknown>)
    : {};
}

function whatsappCloudReady(integrations: Record<string, unknown>): {
  replyReady: boolean;
  status: InboxConnectorChannelStatus;
} {
  const wa =
    integrations.whatsapp && typeof integrations.whatsapp === 'object'
      ? (integrations.whatsapp as Record<string, unknown>)
      : {};
  if (wa.enabled !== true) {
    return { replyReady: false, status: 'off' };
  }
  const phone =
    typeof wa.phoneNumberId === 'string' ? wa.phoneNumberId.trim() : '';
  const tokenConfigured =
    wa.accessTokenConfigured === true ||
    (typeof wa.accessToken === 'string' &&
      Boolean(wa.accessToken.trim()) &&
      wa.accessToken.trim() !== '••••••••');
  if (phone && tokenConfigured) {
    return { replyReady: true, status: 'ready' };
  }
  return { replyReady: false, status: 'incomplete' };
}

function instagramReady(integrations: Record<string, unknown>): {
  replyReady: boolean;
  status: InboxConnectorChannelStatus;
} {
  const fb =
    integrations.facebook && typeof integrations.facebook === 'object'
      ? (integrations.facebook as Record<string, unknown>)
      : {};
  const igId =
    typeof fb.instagramBusinessAccountId === 'string'
      ? fb.instagramBusinessAccountId.trim()
      : '';
  if (fb.enabled === true && igId) {
    return { replyReady: true, status: 'ready' };
  }
  return { replyReady: false, status: 'off' };
}

function googleBusinessReady(googleConnected: boolean): {
  replyReady: boolean;
  status: InboxConnectorChannelStatus;
} {
  return googleConnected
    ? { replyReady: true, status: 'ready' }
    : { replyReady: false, status: 'off' };
}

export function resolveInboxConnectorReadiness(input: {
  settingsJson: unknown;
  googleConnected: boolean;
}): InboxConnectorReadiness {
  const integrations = readIntegrations(input.settingsJson);
  const whatsapp = whatsappCloudReady(integrations);
  const instagram = instagramReady(integrations);
  const google_business = googleBusinessReady(input.googleConnected);

  const channels: InboxConnectorReadiness['channels'] = {
    whatsapp,
    instagram,
    google_business,
    email: { replyReady: true, status: 'ready' },
    website: { replyReady: true, status: 'ready' },
  };

  const banners: InboxConnectorBanner[] = [];
  if (whatsapp.status === 'incomplete') {
    banners.push({
      channel: 'whatsapp',
      tone: 'warn',
      message:
        'WhatsApp Cloud incomplete — add Phone number ID and access token under Integrations to reply from Inbox.',
    });
  } else if (whatsapp.status === 'off') {
    banners.push({
      channel: 'whatsapp',
      tone: 'info',
      message:
        'WhatsApp Cloud not connected — configure under Integrations to reply from Inbox.',
    });
  }
  if (instagram.status === 'off') {
    banners.push({
      channel: 'instagram',
      tone: 'info',
      message:
        'Instagram not connected — link Meta Business under Integrations to reply from Inbox.',
    });
  }
  if (google_business.status === 'off') {
    banners.push({
      channel: 'google_business',
      tone: 'info',
      message:
        'Google Business not connected — connect Google Workspace under Integrations to reply to reviews and messages.',
    });
  }

  return { channels, banners };
}

export function inboxChannelReplyReady(
  channel: string,
  readiness: InboxConnectorReadiness,
): boolean {
  const row = readiness.channels[channel];
  if (row) return row.replyReady;
  return true;
}
