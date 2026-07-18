import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, History, RotateCcw } from 'lucide-react';
import {
  Button,
  Combobox,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  StatusBadge,
  Textarea,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import {
  parsePresenceConversationWidget,
} from '@wayrune/contracts';
import { api } from '../../api';
import {
  normalizeSiteDomainInput,
  siteHostLabel,
  sitePlatformHost,
  sitePublicUrl,
} from './builder/helpers';
import type { Identity, Site } from './builder/types';

type ThemeOption = { id: string; key: string; name: string };

type SettingsTab =
  | 'general'
  | 'seo'
  | 'analytics'
  | 'variables'
  | 'insights'
  | 'publish'
  | 'widget';

const SITE_SETTINGS_TAB_PARAM = 'siteSettingsTab';
const SETTINGS_TABS: SettingsTab[] = [
  'general',
  'seo',
  'widget',
  'variables',
  'analytics',
  'insights',
  'publish',
];

function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return Boolean(value && (SETTINGS_TABS as string[]).includes(value));
}
type PublishVersion = {
  id: string;
  version: number;
  label?: string | null;
  createdAt: string;
};

type SitePageOption = {
  id: string;
  title: string;
  path: string;
  site: { id: string };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function SiteSettingsDialog({
  open,
  onOpenChange,
  site,
  themes,
  identity,
  canWrite,
  onSaved,
  initialTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site | null;
  themes: ThemeOption[];
  identity: Identity | null;
  canWrite: boolean;
  onSaved?: () => void;
  initialTab?: SettingsTab;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [kind, setKind] = useState('marketing');
  const [themeId, setThemeId] = useState('');
  const [homePageId, setHomePageId] = useState('');
  const [sitePages, setSitePages] = useState<SitePageOption[]>([]);
  const [titleSuffix, setTitleSuffix] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [defaultOgImage, setDefaultOgImage] = useState('');
  const [canonicalBase, setCanonicalBase] = useState('');
  const [siteNoindex, setSiteNoindex] = useState(false);
  const [gaId, setGaId] = useState('');
  const [gtmId, setGtmId] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const [customHeadHtml, setCustomHeadHtml] = useState('');
  const [widgetId, setWidgetId] = useState('');
  const [widgetEnabledOverride, setWidgetEnabledOverride] = useState<'follow' | 'off'>('follow');
  const [chatWidgets, setChatWidgets] = useState<
    Array<{ id: string; name: string; key: string; enabled: boolean }>
  >([]);
  const [variablesText, setVariablesText] = useState('{\n  "support_hours": "9am–6pm"\n}');
  const [insights, setInsights] = useState<{
    pageViews: number;
    ctaClicks: number;
    formSubmits: number;
    whatsappClicks: number;
    topPaths: Array<{ path: string; count: number }>;
    ab: Record<string, { impressions: number; conversions: number }>;
  } | null>(null);
  const [versions, setVersions] = useState<PublishVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectTab = (next: SettingsTab) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'general') params.delete(SITE_SETTINGS_TAB_PARAM);
        else params.set(SITE_SETTINGS_TAB_PARAM, next);
        return params;
      },
      { replace: true },
    );
  };

  /** Keep active tab in the URL so Save → site refresh does not jump back to General. */
  useEffect(() => {
    if (!open) return;
    const fromUrl = searchParams.get(SITE_SETTINGS_TAB_PARAM);
    const next: SettingsTab = isSettingsTab(fromUrl)
      ? fromUrl
      : isSettingsTab(initialTab)
        ? initialTab
        : 'general';
    setTab(next);
    if (next !== 'general' && fromUrl !== next) {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set(SITE_SETTINGS_TAB_PARAM, next);
          return params;
        },
        { replace: true },
      );
    }
    // Only when the dialog opens — not on every site payload refresh after Save.
    // Do not clear `siteSettingsTab` on close so Save/reopen keeps the same tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open]);

  useEffect(() => {
    if (!open || !site) return;
    setName(site.name || '');
    setPrimaryDomain(site.primaryDomain || '');
    setKind(site.kind || 'marketing');
    setThemeId(site.theme?.id || '');
    setHomePageId(site.homePageId || site.homePage?.id || '');
    const settings = asRecord(site.settingsJson);
    const seo = asRecord(settings.seo);
    const analytics = asRecord(settings.analytics);
    setTitleSuffix(typeof seo.titleSuffix === 'string' ? seo.titleSuffix : '');
    setDefaultDescription(typeof seo.defaultDescription === 'string' ? seo.defaultDescription : '');
    setDefaultOgImage(typeof seo.defaultOgImage === 'string' ? seo.defaultOgImage : '');
    setCanonicalBase(typeof seo.canonicalBase === 'string' ? seo.canonicalBase : '');
    setSiteNoindex(seo.noindex === true);
    setGaId(typeof analytics.googleAnalyticsId === 'string' ? analytics.googleAnalyticsId : '');
    setGtmId(typeof analytics.googleTagManagerId === 'string' ? analytics.googleTagManagerId : '');
    setMetaPixelId(typeof analytics.metaPixelId === 'string' ? analytics.metaPixelId : '');
    setCustomHeadHtml(typeof analytics.customHeadHtml === 'string' ? analytics.customHeadHtml : '');
    const widget = parsePresenceConversationWidget(settings);
    setWidgetId(widget.widgetId || '');
    setWidgetEnabledOverride(widget.enabledOverride === false ? 'off' : 'follow');
    const vars = asRecord(settings.variables);
    setVariablesText(JSON.stringify(vars, null, 2) || '{\n}');
  }, [open, site]);

  useEffect(() => {
    if (!open || !site) return;
    let cancelled = false;
    void api<Array<{ id: string; name: string; key: string; enabled: boolean }>>(
      '/presence/chat-widgets',
    )
      .then((rows) => {
        if (!cancelled) setChatWidgets(rows || []);
      })
      .catch(() => {
        if (!cancelled) setChatWidgets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, site]);

  useEffect(() => {
    if (!open || !site) return;
    let cancelled = false;
    void api<SitePageOption[]>('/presence/pages')
      .then((rows) => {
        if (cancelled) return;
        setSitePages((rows || []).filter((row) => row.site?.id === site.id));
      })
      .catch(() => {
        if (!cancelled) setSitePages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, site]);

  useEffect(() => {
    if (!open || !site || tab !== 'publish') return;
    setLoadingVersions(true);
    api<PublishVersion[]>(`/presence/sites/${site.id}/publish-versions`)
      .then((rows) => setVersions(rows || []))
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [open, site, tab]);

  useEffect(() => {
    if (!open || !site || tab !== 'insights') return;
    api<{
      pageViews: number;
      ctaClicks: number;
      formSubmits: number;
      whatsappClicks: number;
      topPaths: Array<{ path: string; count: number }>;
      ab: Record<string, { impressions: number; conversions: number }>;
    }>(`/presence/sites/${site.id}/analytics`)
      .then((row) => setInsights(row))
      .catch(() => setInsights(null));
  }, [open, site, tab]);

  const save = async () => {
    if (!site || !canWrite) return;
    setSaving(true);
    try {
      let variables: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(variablesText || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          variables = parsed as Record<string, unknown>;
        } else {
          throw new Error('Variables must be a JSON object');
        }
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Invalid variables JSON');
        setSaving(false);
        return;
      }
      const prev = asRecord(site.settingsJson);
      await api(`/presence/sites/${site.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim() || site.name,
          primaryDomain: primaryDomain.trim()
            ? normalizeSiteDomainInput(primaryDomain)
            : null,
          kind,
          themeId: themeId || undefined,
          homePageId: homePageId || null,
          settingsJson: {
            ...prev,
            variables,
            seo: {
              titleSuffix: titleSuffix.trim() || undefined,
              defaultDescription: defaultDescription.trim() || undefined,
              defaultOgImage: defaultOgImage.trim() || undefined,
              canonicalBase: canonicalBase.trim() || undefined,
              noindex: siteNoindex || undefined,
            },
            analytics: {
              googleAnalyticsId: gaId.trim() || undefined,
              googleTagManagerId: gtmId.trim() || undefined,
              metaPixelId: metaPixelId.trim() || undefined,
              customHeadHtml: customHeadHtml.trim() || undefined,
            },
            conversationWidget: {
              widgetId: widgetId.trim() || null,
              enabledOverride: widgetEnabledOverride === 'off' ? false : null,
            },
          },
        }),
      });
      toastSuccess('Website settings saved');
      onSaved?.();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const publishNow = async () => {
    if (!site || !canWrite) return;
    setPublishing(true);
    try {
      await api(`/presence/sites/${site.id}/publish`, { method: 'POST', body: '{}' });
      toastSuccess('Website published');
      const rows = await api<PublishVersion[]>(`/presence/sites/${site.id}/publish-versions`);
      setVersions(rows || []);
      onSaved?.();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const rollback = async (versionId: string) => {
    if (!site || !canWrite) return;
    setRollingBack(versionId);
    try {
      await api(`/presence/sites/${site.id}/publish-versions/${versionId}/rollback`, {
        method: 'POST',
        body: '{}',
      });
      toastSuccess('Rolled back to selected version');
      onSaved?.();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  };

  if (!site) return null;

  const previewSite = {
    ...site,
    name,
    primaryDomain: primaryDomain.trim() || null,
    isPrimary: site.isPrimary,
  };
  const publicUrl = sitePublicUrl(identity, previewSite);
  const hostLabel = siteHostLabel(identity, previewSite);

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'seo', label: 'SEO' },
    { id: 'widget', label: 'Chat widget' },
    { id: 'variables', label: 'Variables' },
    { id: 'analytics', label: 'Scripts' },
    { id: 'insights', label: 'Analytics' },
    { id: 'publish', label: 'Publish' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,560px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Website settings</DialogTitle>
          <DialogDescription>
            Name, domain, theme, SEO, scripts, analytics, and publish for{' '}
            <span className="text-foreground">{site.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap gap-1 border-b px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                'px-3 py-2 text-xs font-medium',
                tab === t.id
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <DialogBody
          className={cn(
            'min-h-0 flex-1 space-y-4 overflow-y-auto',
            !canWrite && tab !== 'publish' && tab !== 'insights' && 'pointer-events-none opacity-70',
          )}
        >
          {tab === 'general' ? (
            <>
              <Field label="Name">
                <Input
                  className="h-9"
                  value={name}
                  disabled={!canWrite || saving}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field
                label="Custom domain"
                hint={
                  site.isPrimary && !primaryDomain.trim()
                    ? `Optional — Primary is always on ${sitePlatformHost(identity, site) || 'your org subdomain'}.`
                    : `Optional — this site is on ${sitePlatformHost(identity, site) || 'a platform subdomain'} until you connect your own domain.`
                }
              >
                <Input
                  className="h-9 font-mono text-sm"
                  placeholder="www.example.com"
                  value={primaryDomain}
                  disabled={!canWrite || saving}
                  onChange={(e) => setPrimaryDomain(e.target.value)}
                />
                {hostLabel ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {publicUrl ? (
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {hostLabel}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      hostLabel
                    )}
                  </p>
                ) : null}
              </Field>
              <Field label="Theme" hint="Edit colors and type from the page builder → Site chrome.">
                <Combobox
                  value={themeId}
                  onChange={setThemeId}
                  disabled={!canWrite || saving}
                  options={themes.map((theme) => ({
                    value: theme.id,
                    label: theme.name,
                    description: theme.key,
                  }))}
                />
              </Field>
              <Field label="Home page" hint="Public site root (/) resolves to this page.">
                <Combobox
                  value={homePageId}
                  onChange={setHomePageId}
                  disabled={!canWrite || saving || sitePages.length === 0}
                  placeholder={sitePages.length ? 'Select home page' : 'No pages yet'}
                  options={sitePages.map((page) => ({
                    value: page.id,
                    label: page.title,
                    description: page.path,
                  }))}
                />
              </Field>
              <Field label="Site type">
                <Combobox
                  value={kind}
                  onChange={setKind}
                  disabled={!canWrite || saving}
                  options={[
                    { value: 'marketing', label: 'Marketing' },
                    { value: 'landing', label: 'Landing' },
                  ]}
                />
              </Field>
              {site.isPrimary ? (
                <Field label="Role">
                  <StatusBadge value="primary" label="Primary website" tone="success" />
                </Field>
              ) : null}
            </>
          ) : null}

          {tab === 'seo' ? (
            <>
              <Field label="Title suffix" hint="Appended after page titles, e.g. · Acme Travel">
                <Input
                  className="h-9"
                  value={titleSuffix}
                  disabled={!canWrite || saving}
                  onChange={(e) => setTitleSuffix(e.target.value)}
                  placeholder={site.name}
                />
              </Field>
              <Field label="Default description">
                <Textarea
                  className="min-h-[72px] text-sm"
                  value={defaultDescription}
                  disabled={!canWrite || saving}
                  onChange={(e) => setDefaultDescription(e.target.value)}
                />
              </Field>
              <Field label="Default Open Graph image URL">
                <Input
                  className="h-9"
                  value={defaultOgImage}
                  disabled={!canWrite || saving}
                  onChange={(e) => setDefaultOgImage(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Canonical base URL" hint="e.g. https://www.example.com">
                <Input
                  className="h-9 font-mono text-sm"
                  value={canonicalBase}
                  disabled={!canWrite || saving}
                  onChange={(e) => setCanonicalBase(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={siteNoindex}
                  disabled={!canWrite || saving}
                  onChange={(e) => setSiteNoindex(e.target.checked)}
                />
                Noindex entire site
              </label>
            </>
          ) : null}

          {tab === 'widget' ? (
            <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Pick which chatflow appears on this site. Branding, placement, and URL targeting live
                under{' '}
                <span className="font-medium text-foreground">Settings → Inbox → Chat → Chatflows</span>.
              </p>
              <Field
                label="Assigned chatflow"
                hint={
                  chatWidgets.length
                    ? 'Create or edit chatflows under Settings → Inbox → Chat → Chatflows.'
                    : 'No chatflows yet — create one under Settings → Inbox → Chat → Chatflows.'
                }
              >
                <Combobox
                  size="sm"
                  value={widgetId}
                  onChange={setWidgetId}
                  disabled={!canWrite || saving}
                  options={[
                    { value: '', label: 'None (hide chat)' },
                    ...chatWidgets.map((w) => ({
                      value: w.id,
                      label: w.enabled ? w.name : `${w.name} (Off)`,
                      description: `${w.key}${w.enabled ? ' · enabled' : ' · disabled — turn On in Chatflows'}`,
                    })),
                  ]}
                />
              </Field>
              {widgetId && chatWidgets.some((w) => w.id === widgetId && !w.enabled) ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-900 dark:text-amber-100">
                  This chatflow is <strong>Off</strong>. With “Follow widget enabled flag”, chat will not
                  appear. Enable it under Settings → Inbox → Chat → Chatflows, then reload the live site.
                </p>
              ) : null}
              <Field label="Show on this site">
                <Combobox
                  size="sm"
                  value={widgetEnabledOverride}
                  onChange={(value) => setWidgetEnabledOverride(value === 'off' ? 'off' : 'follow')}
                  disabled={!canWrite || saving || !widgetId}
                  options={[
                    {
                      value: 'follow',
                      label: 'Follow widget enabled flag',
                      description: 'Show when the assigned widget is enabled',
                    },
                    {
                      value: 'off',
                      label: 'Hide on this site',
                      description: 'Never inject the floating widget here',
                    },
                  ]}
                />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                Chat appears on the <strong>live / published site</strong> (or preview URL), not inside
                the page builder canvas.
              </p>
            </>
          ) : null}

          {tab === 'variables' ? (
            <>
              <Field
                label="Custom variables (JSON)"
                hint="Use as {{ key }} in section props. Built-ins: organization.name, phone, whatsapp, email, site.name…"
              >
                <Textarea
                  className="min-h-[180px] font-mono text-xs"
                  value={variablesText}
                  disabled={!canWrite || saving}
                  onChange={(e) => setVariablesText(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-3 text-sm">
              {!insights ? (
                <p className="text-muted-foreground">No analytics yet — publish the site to collect events.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ['Page views', insights.pageViews],
                      ['CTA clicks', insights.ctaClicks],
                      ['Forms', insights.formSubmits],
                      ['WhatsApp', insights.whatsappClicks],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-md border px-3 py-2">
                        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                        <div className="text-lg font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Top paths</div>
                    <ul className="space-y-1 text-xs">
                      {(insights.topPaths || []).map((row) => (
                        <li key={row.path} className="flex justify-between gap-2">
                          <span className="truncate font-mono">{row.path}</span>
                          <span>{row.count}</span>
                        </li>
                      ))}
                      {!insights.topPaths?.length ? (
                        <li className="text-muted-foreground">No path data yet.</li>
                      ) : null}
                    </ul>
                  </div>
                  {Object.keys(insights.ab || {}).length ? (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">A/B</div>
                      <ul className="space-y-1 text-xs">
                        {Object.entries(insights.ab).map(([variant, stats]) => (
                          <li key={variant}>
                            Variant {variant}: {stats.impressions} impressions · {stats.conversions}{' '}
                            conversions
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === 'analytics' ? (
            <>
              <Field label="Google Analytics ID" hint="G-XXXXXXXX">
                <Input
                  className="h-9 font-mono text-sm"
                  value={gaId}
                  disabled={!canWrite || saving}
                  onChange={(e) => setGaId(e.target.value)}
                />
              </Field>
              <Field label="Google Tag Manager ID" hint="GTM-XXXXXXX">
                <Input
                  className="h-9 font-mono text-sm"
                  value={gtmId}
                  disabled={!canWrite || saving}
                  onChange={(e) => setGtmId(e.target.value)}
                />
              </Field>
              <Field label="Meta Pixel ID">
                <Input
                  className="h-9 font-mono text-sm"
                  value={metaPixelId}
                  disabled={!canWrite || saving}
                  onChange={(e) => setMetaPixelId(e.target.value)}
                />
              </Field>
              <Field label="Custom head HTML" hint="Optional scripts/meta injected into every page.">
                <Textarea
                  className="min-h-[100px] font-mono text-xs"
                  value={customHeadHtml}
                  disabled={!canWrite || saving}
                  onChange={(e) => setCustomHeadHtml(e.target.value)}
                />
              </Field>
            </>
          ) : null}

          {tab === 'publish' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Status:{' '}
                  <StatusBadge
                    value={site.status}
                    label={site.status === 'published' ? 'Published' : 'Draft'}
                    tone={site.status === 'published' ? 'success' : 'neutral'}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canWrite || publishing}
                  onClick={() => void publishNow()}
                >
                  {publishing ? 'Publishing…' : 'Publish now'}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <History className="size-4" />
                Publish history
              </div>
              {loadingVersions ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : versions.length ? (
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">Version {v.version}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString()}
                          {v.label ? ` · ${v.label}` : ''}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!canWrite || rollingBack === v.id}
                        onClick={() => void rollback(v.id)}
                      >
                        <RotateCcw className="mr-1 size-3.5" />
                        {rollingBack === v.id ? '…' : 'Rollback'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No publish versions yet. Publish to create the first snapshot.
                </p>
              )}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {tab !== 'publish' && tab !== 'insights' ? (
            <Button type="button" disabled={!canWrite || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
