import { isWhatsappCloudConfigured } from './quoteWhatsappTemplate';

/** Inbox cue when WhatsApp Cloud is off or credentials are incomplete. */
export type InboxWhatsappCloudBanner = {
  tone: 'info' | 'warn';
  kind: 'off' | 'incomplete';
  message: string;
};

function readWhatsappSettings(settingsJson: unknown): Record<string, unknown> {
  const settings =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const integrations =
    settings.integrations && typeof settings.integrations === 'object'
      ? (settings.integrations as Record<string, unknown>)
      : {};
  return integrations.whatsapp && typeof integrations.whatsapp === 'object'
    ? (integrations.whatsapp as Record<string, unknown>)
    : {};
}

/**
 * Banner for Inbox when Cloud API cannot send replies.
 * Returns null when enabled + phoneNumberId + access token look configured.
 */
export function inboxWhatsappCloudBanner(
  settingsJson: unknown,
): InboxWhatsappCloudBanner | null {
  if (isWhatsappCloudConfigured(settingsJson)) return null;
  const wa = readWhatsappSettings(settingsJson);
  if (wa.enabled === true) {
    return {
      tone: 'warn',
      kind: 'incomplete',
      message:
        'WhatsApp Cloud incomplete — add Phone number ID and access token under Integrations to reply from Inbox.',
    };
  }
  return {
    tone: 'info',
    kind: 'off',
    message:
      'WhatsApp Cloud not connected — configure under Integrations to reply from Inbox.',
  };
}
