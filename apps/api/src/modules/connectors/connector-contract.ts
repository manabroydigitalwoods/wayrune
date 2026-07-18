import { CONNECTOR_CAPABILITIES, type ConnectorCapabilities } from '@wayrune/contracts';

/**
 * Connector contract: every inbound adapter must Normalize → Interaction → Conversation.
 * No connector creates Lead / Inquiry / Trip directly.
 */
export type ConnectorKey = keyof typeof CONNECTOR_CAPABILITIES | string;

export type NormalizedInboundMessage = {
  connectorKey: ConnectorKey;
  channel: string;
  summary: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  acquisitionKey?: string | null;
  idempotencyKey: string;
  direction?: 'inbound' | 'outbound';
  rawPayload?: Record<string, unknown>;
};

export function capabilitiesFor(connectorKey: string): ConnectorCapabilities {
  return (
    CONNECTOR_CAPABILITIES[connectorKey] ?? {
      receive: true,
      reply: false,
      templates: false,
      media: false,
      readStatus: false,
      buttons: false,
      automation: false,
    }
  );
}

export function assertCanReply(connectorKey: string) {
  const caps = capabilitiesFor(connectorKey);
  if (!caps.reply) {
    throw new Error(`Connector ${connectorKey} does not support reply`);
  }
}

export function assertCanTemplates(connectorKey: string) {
  const caps = capabilitiesFor(connectorKey);
  if (!caps.templates) {
    throw new Error(`Connector ${connectorKey} does not support templates`);
  }
}

export { CONNECTOR_CAPABILITIES };
