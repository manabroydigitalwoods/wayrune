import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, MessageSquare } from 'lucide-react';
import {
  Button,
  SoftIcon,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toastError,
} from '@wayrune/ui';
import { api } from '../../api';
import { SettingsNavShell } from '../../components/settings/SettingsNavShell';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import {
  AGENCY_ROUTES,
  settingsInboxChatPath,
} from '../../lib/agencyRoutes';
import { parseIntegrationsSettings } from '../integrations/types';

type ChannelRow = {
  id: string;
  name: string;
  description: string;
  connectedTo: string;
  enabled: boolean;
  href: string;
  icon: typeof MessageCircle;
};

export function InboxSettingsPage() {
  useDocumentTitle('Settings · Inbox');
  const { toOrgPath, orgRef } = useOrgNavigate();
  const [tab, setTab] = useState('channels');
  const [loading, setLoading] = useState(true);
  const [chatflowCount, setChatflowCount] = useState(0);
  const [whatsappOn, setWhatsappOn] = useState(false);
  const [emailOn, setEmailOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api('/organizations/current'),
      api<unknown[]>('/presence/chat-widgets').catch(() => []),
    ])
      .then(([org, widgets]) => {
        if (cancelled) return;
        const parsed = parseIntegrationsSettings(
          (org as { settingsJson?: unknown }).settingsJson,
        );
        setWhatsappOn(parsed.whatsapp.enabled);
        setEmailOn(parsed.emailIngest.enabled);
        setChatflowCount((widgets || []).length);
      })
      .catch((e) => toastError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const channels: ChannelRow[] = [
    {
      id: 'chat',
      name: 'Chat',
      description: 'Live form chat & chatflows',
      connectedTo: chatflowCount
        ? `${chatflowCount} chatflow${chatflowCount === 1 ? '' : 's'}`
        : 'Not configured',
      enabled: chatflowCount > 0,
      href: settingsInboxChatPath(orgRef || ''),
      icon: MessageCircle,
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'Cloud API messaging',
      connectedTo: whatsappOn ? 'Integrations' : 'Not connected',
      enabled: whatsappOn,
      href: toOrgPath(AGENCY_ROUTES.settingsIntegrations),
      icon: MessageSquare,
    },
    {
      id: 'email',
      name: 'Email',
      description: 'Email ingest into Inbox',
      connectedTo: emailOn ? 'Integrations' : 'Not connected',
      enabled: emailOn,
      href: toOrgPath(AGENCY_ROUTES.settingsIntegrations),
      icon: Mail,
    },
  ];

  return (
    <SettingsNavShell
      activeId="inbox"
      actions={
        <Button asChild size="sm">
          <Link to={settingsInboxChatPath(orgRef || '')}>Open chat settings</Link>
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="slas">SLAs</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading channels…' : 'Channels connected to this inbox.'}
          </p>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Connected to</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {channels.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link to={row.href} className="flex items-center gap-3 text-left">
                        <SoftIcon icon={row.icon} tone="primary" />
                        <div>
                          <div className="font-medium text-foreground">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.description}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.connectedTo}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={row.enabled} disabled aria-readonly />
                        <StatusBadge
                          value={row.enabled ? 'connected' : 'available'}
                          label={row.enabled ? 'On' : 'Off'}
                          showIcon={false}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="slas" className="mt-4 rounded-xl border px-4 py-8 text-center">
          <p className="text-sm font-medium">SLAs coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unread and waiting timers will live here. Automation rules remain under Integrations for
            now.
          </p>
        </TabsContent>

        <TabsContent value="access" className="mt-4 rounded-xl border px-4 py-8 text-center">
          <p className="text-sm font-medium">Access coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Team and role access for this inbox will be configurable here.
          </p>
        </TabsContent>
      </Tabs>
    </SettingsNavShell>
  );
}
