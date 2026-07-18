import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { BookOpen, Plug } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  RecordSheet,
  SoftIcon,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../../components/Can';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';
import {
  filterIntegrations,
  INTEGRATION_CATALOG,
  INTEGRATION_FILTERS,
  statusBadgeProps,
  type IntegrationDefinition,
  type IntegrationId,
} from './integrationRegistry';
import { EmailIngestPanel } from './panels/EmailIngestPanel';
import { EngagementAutomationPanel } from './panels/EngagementAutomationPanel';
import { FacebookPanel } from './panels/FacebookPanel';
import { GoogleWorkspacePanel } from './panels/GoogleWorkspacePanel';
import { HubSpotPanel } from './panels/HubSpotPanel';
import { WebhookPanel } from './panels/WebhookPanel';
import { WhatsAppPanel } from './panels/WhatsAppPanel';
import {
  EMPTY_INTEGRATIONS,
  parseIntegrationsSettings,
  type IntegrationsSettings,
} from './types';

export function IntegrationsPage() {
  useDocumentTitle('Integrations');
  const { toOrgPath } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);

  const [orgId, setOrgId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<IntegrationsSettings>(EMPTY_INTEGRATIONS);
  const [draft, setDraft] = useState<IntegrationsSettings>(EMPTY_INTEGRATIONS);
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState<IntegrationId | null>(null);
  const [saving, setSaving] = useState(false);
  const [googleWorkspaceConnected, setGoogleWorkspaceConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api('/organizations/current'),
      api<{ connected?: boolean }>('/integrations/google/status').catch(() => ({
        connected: false,
      })),
    ])
      .then(([org, googleStatus]) => {
        if (cancelled) return;
        const record = org as {
          id: string;
          publicCode?: number;
          settingsJson?: unknown;
        };
        const parsed = parseIntegrationsSettings(record.settingsJson);
        setOrgId(
          record.publicCode != null ? String(record.publicCode) : record.id,
        );
        setSettings(parsed);
        setGoogleWorkspaceConnected(Boolean(googleStatus.connected));
        setLoadError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load integrations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const extras = useMemo(
    () => ({ googleWorkspaceConnected }),
    [googleWorkspaceConnected],
  );

  const activeDef = useMemo(
    () => INTEGRATION_CATALOG.find((item) => item.id === activeId) ?? null,
    [activeId],
  );

  const visible = useMemo(
    () => filterIntegrations(INTEGRATION_CATALOG, settings, filter, extras),
    [settings, filter, extras],
  );

  function openConnector(item: IntegrationDefinition) {
    if (item.getStatus(settings, extras) === 'coming_soon') return;
    if (item.id === 'instagram_leads') {
      setDraft(settings);
      setActiveId('facebook_leads');
      return;
    }
    setDraft(settings);
    setActiveId(item.id);
  }

  function closeSheet() {
    setActiveId(null);
  }

  async function saveActive() {
    if (!activeId || !canWrite || activeId === 'google_workspace') return;
    setSaving(true);
    try {
      const patch = buildConnectorPatch(activeId, draft);
      const updated = await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify({ settingsJson: { integrations: patch } }),
      });
      const parsed = parseIntegrationsSettings(
        (updated as { settingsJson?: unknown }).settingsJson,
      );
      setSettings(parsed);
      setDraft(parsed);
      setActiveId(null);
      toastSuccess('Integration saved');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not save integration');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <PageHeader
        icon={Plug}
        title="Integrations"
        subtitle="CRM, messaging, and inbound webhooks for your agency."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={toOrgPath(AGENCY_ROUTES.settingsIntegrationHelp)}>
              <BookOpen className="mr-1.5 h-4 w-4" />
              How-to guide
            </Link>
          </Button>
        }
      />

      <div className="mt-4 space-y-4">
        <SuggestionChips
          aria-label="Integration filters"
          allowDeselect={false}
          options={INTEGRATION_FILTERS}
          value={filter}
          onChange={setFilter}
        />

        {visible.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((item) => {
              const status = item.getStatus(settings, extras);
              const badge = statusBadgeProps(status);
              const comingSoon = status === 'coming_soon';
              return (
                <li key={item.id}>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start gap-3">
                        <SoftIcon icon={item.icon} tone={item.softTone} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="font-medium leading-5">{item.name}</div>
                            <StatusBadge
                              value={badge.value}
                              label={badge.label}
                              showIcon={false}
                            />
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {comingSoon ? (
                          <Button type="button" size="sm" variant="outline" disabled>
                            Coming soon
                          </Button>
                        ) : (
                          <Can anyOf={CAP.orgSettingsWrite} fallback={
                            <Button type="button" size="sm" variant="outline" disabled>
                              View only
                            </Button>
                          }>
                            <Button type="button" size="sm" onClick={() => openConnector(item)}>
                              Configure
                            </Button>
                          </Can>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No integrations in this filter"
            description="Try All, or pick another category."
            icon={Plug}
          />
        )}

        <Can anyOf={CAP.orgSettingsWrite}>
          <EngagementAutomationPanel />
        </Can>
      </div>

      <RecordSheet
        open={Boolean(activeDef)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        title={activeDef?.name ?? 'Integration'}
        description={activeDef?.description}
        size="wide"
        submitting={saving}
        onSubmit={
          canWrite && activeId !== 'google_workspace' ? () => void saveActive() : undefined
        }
        submitLabel="Save"
        hideFooter={!canWrite || activeId === 'google_workspace'}
      >
        {activeId === 'google_workspace' ? (
          <GoogleWorkspacePanel
            organizationId={orgId}
            onStatusChange={setGoogleWorkspaceConnected}
          />
        ) : null}
        {activeId === 'whatsapp' ? (
          <WhatsAppPanel
            organizationId={orgId}
            value={draft.whatsapp}
            onChange={(whatsapp) => setDraft((prev) => ({ ...prev, whatsapp }))}
          />
        ) : null}
        {activeId === 'webhook' ? (
          <WebhookPanel
            organizationId={orgId}
            webhookUrl={draft.webhookUrl}
            onWebhookUrlChange={(webhookUrl) => setDraft((prev) => ({ ...prev, webhookUrl }))}
            websiteIngest={draft.websiteIngest}
            onWebsiteIngestChange={(websiteIngest) =>
              setDraft((prev) => ({ ...prev, websiteIngest }))
            }
          />
        ) : null}
        {activeId === 'hubspot' ? (
          <HubSpotPanel
            value={draft.hubspot}
            onChange={(hubspot) => setDraft((prev) => ({ ...prev, hubspot }))}
          />
        ) : null}
        {activeId === 'facebook_leads' ? (
          <FacebookPanel
            organizationId={orgId}
            value={draft.facebook}
            onChange={(facebook) => setDraft((prev) => ({ ...prev, facebook }))}
          />
        ) : null}
        {activeId === 'email_ingest' ? (
          <EmailIngestPanel
            organizationId={orgId}
            value={draft.emailIngest}
            onChange={(emailIngest) => setDraft((prev) => ({ ...prev, emailIngest }))}
          />
        ) : null}
      </RecordSheet>
    </div>
  );
}

function buildConnectorPatch(
  id: IntegrationId,
  draft: IntegrationsSettings,
): Record<string, unknown> {
  if (id === 'whatsapp') {
    return {
      whatsapp: {
        enabled: draft.whatsapp.enabled,
        phoneNumberId: draft.whatsapp.phoneNumberId.trim(),
        verifyToken: draft.whatsapp.verifyToken.trim(),
        accessToken: draft.whatsapp.accessToken.trim(),
        appSecret: draft.whatsapp.appSecret.trim(),
      },
    };
  }
  if (id === 'webhook') {
    return {
      webhookUrl: draft.webhookUrl,
      websiteIngest: {
        sharedSecret: draft.websiteIngest.sharedSecret.trim(),
      },
    };
  }
  if (id === 'hubspot') {
    return {
      hubspot: {
        enabled: draft.hubspot.enabled,
        portalId: draft.hubspot.portalId.trim(),
        accessToken: draft.hubspot.accessToken.trim(),
      },
    };
  }
  if (id === 'facebook_leads') {
    return {
      facebook: {
        enabled: draft.facebook.enabled,
        pageId: draft.facebook.pageId.trim(),
        verifyToken: draft.facebook.verifyToken.trim(),
        accessToken: draft.facebook.accessToken.trim(),
        appSecret: draft.facebook.appSecret.trim(),
        instagramBusinessAccountId: draft.facebook.instagramBusinessAccountId.trim(),
      },
    };
  }
  if (id === 'email_ingest') {
    return {
      emailIngest: {
        enabled: draft.emailIngest.enabled,
        sharedSecret: draft.emailIngest.sharedSecret.trim(),
      },
    };
  }
  return {};
}
