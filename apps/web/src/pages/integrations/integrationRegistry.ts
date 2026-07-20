import type { LucideIcon } from 'lucide-react';
import {
  Facebook,
  Globe,
  Instagram,
  Mail,
  MessageCircle,
  Workflow,
} from 'lucide-react';
import type { IntegrationsSettings } from './types';

export type IntegrationCategory = 'crm' | 'messaging' | 'webhooks';

export type IntegrationStatus = 'connected' | 'available' | 'coming_soon';

export type IntegrationId =
  | 'whatsapp'
  | 'webhook'
  | 'google_workspace'
  | 'facebook_leads'
  | 'instagram_leads'
  | 'email_ingest';

export type IntegrationDefinition = {
  id: IntegrationId;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon: LucideIcon;
  softTone: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  getStatus: (
    settings: IntegrationsSettings,
    extras?: { googleWorkspaceConnected?: boolean },
  ) => IntegrationStatus;
};

export const INTEGRATION_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'connected', label: 'Connected' },
  { value: 'crm', label: 'CRM' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'webhooks', label: 'Webhooks' },
];

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    description:
      'Connect Google once for Business Profile inbox, Calendar follow-ups, Drive quotes, and Sheets.',
    category: 'messaging',
    icon: Globe,
    softTone: 'info',
    getStatus: (_s, extras) =>
      extras?.googleWorkspaceConnected ? 'connected' : 'available',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud API',
    description: 'Inbound customer texts land in Inbox as channel WhatsApp.',
    category: 'messaging',
    icon: MessageCircle,
    softTone: 'success',
    getStatus: (s) => (s.whatsapp.enabled ? 'connected' : 'available'),
  },
  {
    id: 'webhook',
    name: 'Inbox webhook',
    description: 'Website forms and tools POST JSON into Inbox as pending touches.',
    category: 'webhooks',
    icon: Workflow,
    softTone: 'primary',
    getStatus: (s) =>
      s.websiteIngest.sharedSecretConfigured ? 'connected' : 'available',
  },
  {
    id: 'facebook_leads',
    name: 'Facebook Lead Ads',
    description: 'Meta leadgen webhooks create Inbox rows as channel Facebook.',
    category: 'crm',
    icon: Facebook,
    softTone: 'primary',
    getStatus: (s) => (s.facebook.enabled ? 'connected' : 'available'),
  },
  {
    id: 'instagram_leads',
    name: 'Instagram (leads + DMs)',
    description:
      'Uses the same Meta app as Facebook. Set an Instagram Business Account ID to also ingest and reply to DMs as channel Instagram.',
    category: 'crm',
    icon: Instagram,
    softTone: 'warning',
    getStatus: (s) => (s.facebook.enabled ? 'connected' : 'available'),
  },
  {
    id: 'email_ingest',
    name: 'Email ingest',
    description: 'Forwarding tools POST here; messages land in Inbox as channel Email.',
    category: 'messaging',
    icon: Mail,
    softTone: 'info',
    getStatus: (s) => (s.emailIngest.enabled ? 'connected' : 'available'),
  },
];

export function statusBadgeProps(status: IntegrationStatus): {
  value: string;
  label: string;
} {
  if (status === 'connected') return { value: 'active', label: 'Connected' };
  if (status === 'coming_soon') return { value: 'pending', label: 'Coming soon' };
  return { value: 'open', label: 'Available' };
}

export function filterIntegrations(
  catalog: IntegrationDefinition[],
  settings: IntegrationsSettings,
  filter: string,
  extras?: { googleWorkspaceConnected?: boolean },
) {
  const key = filter || 'all';
  return catalog.filter((item) => {
    const status = item.getStatus(settings, extras);
    if (key === 'all') return true;
    if (key === 'connected') return status === 'connected';
    return item.category === key;
  });
}
