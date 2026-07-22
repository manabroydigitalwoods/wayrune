import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, ExternalLink, MessageCircle, Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_INBOX_CHAT_SETTINGS,
  PRESENCE_CHAT_TARGET_OPS,
  parseInboxChatSettings,
  parsePresenceChatTargetRules,
  placementSideToPosition,
  type PresenceChatTargetOp,
  type PresenceChatTargetRule,
  type PresenceChatTargetRules,
} from '@wayrune/contracts';
import {
  Button,
  Combobox,
  Input,
  Label,
  NumberField,
  PageSkeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { SettingsNavShell } from '../../components/settings/SettingsNavShell';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import {
  AGENCY_ROUTES,
  settingsInboxChatflowsPath,
  settingsInboxChatPath,
} from '../../lib/agencyRoutes';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

type ChatflowDetail = {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  publicKey: string;
  brandName?: string | null;
  primaryColor?: string | null;
  whatsappNumber?: string | null;
  defaultGreeting?: string | null;
  position?: string | null;
  targetRulesJson?: unknown;
  includePathsJson?: unknown;
  excludePathsJson?: unknown;
};

type SiteOption = { id: string; name: string; settingsJson?: unknown };

function emptyRule(op: PresenceChatTargetOp = 'begins_with'): PresenceChatTargetRule {
  return { field: 'website_url', op, value: '' };
}

export function ChatflowEditorPage() {
  const { chatflowId } = useParams<{ chatflowId: string }>();
  const { orgRef, navigate } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<ChatflowDetail | null>(null);
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState(100);
  const [brandName, setBrandName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [target, setTarget] = useState<PresenceChatTargetRules>({ show: [], hide: [] });
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [tab, setTab] = useState('chat');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [accent, setAccent] = useState(DEFAULT_INBOX_CHAT_SETTINGS.accentColor);
  const [placementSide, setPlacementSide] = useState<'left' | 'right'>(
    DEFAULT_INBOX_CHAT_SETTINGS.placementSide,
  );
  const [allowDrag, setAllowDrag] = useState(DEFAULT_INBOX_CHAT_SETTINGS.allowDrag);

  useDocumentTitle(name ? `Settings · ${name}` : 'Settings · Chatflow');

  useEffect(() => {
    if (!chatflowId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<ChatflowDetail[]>('/presence/chat-widgets'),
      api<SiteOption[]>('/presence/sites').catch(() => []),
      api<{ name?: string; settingsJson?: unknown }>('/organizations/current').catch(() => null),
    ])
      .then(([widgets, siteRows, org]) => {
        if (cancelled) return;
        const found = (widgets || []).find((w) => w.id === chatflowId);
        if (!found) {
          toastError('Chatflow not found');
          navigate(AGENCY_ROUTES.settingsInboxChatflows);
          return;
        }
        setRow(found);
        setName(found.name);
        setEnabled(found.enabled);
        setPriority(found.priority ?? 100);
        setBrandName(found.brandName || '');
        setGreeting(found.defaultGreeting || '');
        setWhatsappNumber(found.whatsappNumber || '');
        if (org) {
          const chat = parseInboxChatSettings(org.settingsJson);
          setAccent(chat.accentColor);
          setPlacementSide(chat.placementSide);
          setAllowDrag(chat.allowDrag);
        }
        let rules = parsePresenceChatTargetRules(found.targetRulesJson);
        if (!rules.show.length && !rules.hide.length) {
          const include = Array.isArray(found.includePathsJson)
            ? (found.includePathsJson as string[])
            : [];
          const exclude = Array.isArray(found.excludePathsJson)
            ? (found.excludePathsJson as string[])
            : [];
          rules = {
            show: include.map((value) => ({
              field: 'website_url' as const,
              op: 'matches_wildcard' as const,
              value,
            })),
            hide: exclude.map((value) => ({
              field: 'website_url' as const,
              op: 'matches_wildcard' as const,
              value,
            })),
          };
        }
        setTarget(rules);
        setSites(siteRows || []);
      })
      .catch((e) => toastError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatflowId, navigate, orgRef]);

  const assignedSites = useMemo(() => {
    if (!row) return [];
    return sites.filter((s) => {
      const settings =
        s.settingsJson && typeof s.settingsJson === 'object' && !Array.isArray(s.settingsJson)
          ? (s.settingsJson as Record<string, unknown>)
          : {};
      const cw =
        settings.conversationWidget &&
        typeof settings.conversationWidget === 'object' &&
        !Array.isArray(settings.conversationWidget)
          ? (settings.conversationWidget as Record<string, unknown>)
          : {};
      return cw.widgetId === row.id;
    });
  }, [sites, row]);

  const position = placementSideToPosition(placementSide);

  const embedSnippet = useMemo(() => {
    if (!row) return '';
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `<script src="${origin}/widget.js" data-org="${orgRef}" data-key="${row.publicKey}" data-api="${apiBase}" data-widget="${row.id}" data-source="embed" data-position="${position}" data-drag="${allowDrag ? '1' : '0'}" data-color="${accent}"></script>`;
  }, [row, orgRef, position, allowDrag, accent]);

  const save = async () => {
    if (!canWrite || !row) return;
    setSaving(true);
    try {
      const cleaned: PresenceChatTargetRules = {
        show: target.show.filter((r) => r.value.trim()),
        hide: target.hide.filter((r) => r.value.trim()),
      };
      await api('/presence/chat-widgets', {
        method: 'PUT',
        body: JSON.stringify({
          key: row.key,
          name: name.trim() || row.name,
          enabled,
          priority,
          brandName: brandName.trim() || null,
          // Clear legacy per-chatflow display overrides — Inbox → Chat owns appearance.
          primaryColor: null,
          whatsappNumber: whatsappNumber.trim() || null,
          defaultGreeting: greeting.trim() || null,
          position,
          targetRules: cleaned,
        }),
      });
      toastSuccess('Chatflow saved');
      setTarget(cleaned);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateShow = (index: number, patch: Partial<PresenceChatTargetRule>) => {
    setTarget((prev) => ({
      ...prev,
      show: prev.show.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  };
  const updateHide = (index: number, patch: Partial<PresenceChatTargetRule>) => {
    setTarget((prev) => ({
      ...prev,
      hide: prev.hide.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  };

  if (loading) return <PageSkeleton variant="form" />;
  if (!row) return <PageSkeleton variant="form" />;

  const chatPath = `${settingsInboxChatPath(orgRef || '')}?section=web`;

  return (
    <SettingsNavShell
      activeId="inbox"
      contentClassName="max-w-6xl"
      title={name.trim() || 'Chatflow'}
      description="Welcome copy, targeting, and handoff for this chatflow. Appearance is set in Chat settings."
      backTo={{ href: settingsInboxChatflowsPath(orgRef || ''), label: 'Back to Chatflows' }}
      actions={
        <>
          <div className="flex items-center gap-2 rounded-full border bg-background px-2.5 py-1">
            <Switch checked={enabled} disabled={!canWrite || saving} onCheckedChange={setEnabled} />
            <span className="text-xs font-medium text-muted-foreground">
              {enabled ? 'On' : 'Off'}
            </span>
          </div>
          <Button size="sm" disabled={!canWrite || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">
        <Link to={settingsInboxChatflowsPath(orgRef || '')} className="hover:underline">
          Chatflows
        </Link>
        {' › '}
        {name.trim() || 'Edit'}
      </p>

      <Input
        className="h-10 max-w-md text-base font-semibold"
        value={name}
        disabled={!canWrite || saving}
        onChange={(e) => setName(e.target.value)}
        aria-label="Chatflow name"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-fit">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="target">Target</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <TabsContent value="chat" className="mt-0 space-y-4">
              <section className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 opacity-80">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Assignment</div>
                    <p className="text-xs text-muted-foreground">
                      Auto-assign new conversations to team members (coming soon).
                    </p>
                  </div>
                  <Switch checked={false} disabled />
                </div>
              </section>

              <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div>
                  <div className="text-sm font-semibold">Personalize</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Greeting, brand label, and WhatsApp handoff for this chatflow.
                  </p>
                </div>
                <div>
                  <Label htmlFor="cf-greeting">Welcome message</Label>
                  <Textarea
                    id="cf-greeting"
                    className="mt-1.5 resize-none"
                    rows={3}
                    value={greeting}
                    disabled={!canWrite || saving}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder="Got any questions? I'm happy to help."
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cf-brand">Brand name</Label>
                    <Input
                      id="cf-brand"
                      className="mt-1.5 h-9"
                      value={brandName}
                      disabled={!canWrite || saving}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Demo Travel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cf-wa">WhatsApp handoff number</Label>
                    <Input
                      id="cf-wa"
                      className="mt-1.5 h-9 font-mono text-sm"
                      value={whatsappNumber}
                      disabled={!canWrite || saving}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="919876543210"
                    />
                  </div>
                </div>
              </section>

              <Link
                to={chatPath}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
              >
                <span
                  className="mt-0.5 size-9 shrink-0 rounded-lg"
                  style={{ background: accent }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    Appearance
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Accent, placement, and drag are managed in Inbox → Chat — one place for every
                    chatflow and Presence site.
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {accent} · {placementSide === 'left' ? 'Bottom left' : 'Bottom right'}
                    {allowDrag ? ' · Drag on' : ' · Drag off'}
                  </p>
                </div>
              </Link>
            </TabsContent>

            <TabsContent value="target" className="mt-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose which pages this chatflow appears on. Empty show rules = all pages (still
                respects exclusions).
              </p>
              <section className="h-fit space-y-3 rounded-xl border p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Show chat
                </div>
                {target.show.map((rule, index) => (
                  <div key={`show-${index}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{index === 0 ? 'WHEN' : 'OR'}</span>
                    <span className="text-xs text-muted-foreground">Website URL</span>
                    <Combobox
                      className="w-[140px]"
                      value={rule.op}
                      disabled={!canWrite || saving}
                      onChange={(v) => updateShow(index, { op: v as PresenceChatTargetOp })}
                      options={PRESENCE_CHAT_TARGET_OPS.map((op) => ({
                        value: op,
                        label: op.replace(/_/g, ' '),
                      }))}
                    />
                    <Input
                      className="h-9 min-w-[180px] flex-1 font-mono text-xs"
                      value={rule.value}
                      disabled={!canWrite || saving}
                      onChange={(e) => updateShow(index, { value: e.target.value })}
                      placeholder="/trips/**"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canWrite}
                      onClick={() =>
                        setTarget((prev) => ({
                          ...prev,
                          show: prev.show.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={!canWrite}
                  onClick={() =>
                    setTarget((prev) => ({
                      ...prev,
                      show: [...prev.show, emptyRule('matches_wildcard')],
                    }))
                  }
                >
                  <Plus className="size-3.5" />
                  Add show rule
                </Button>
              </section>
              <section className="h-fit space-y-3 rounded-xl border p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hide chat
                </div>
                {target.hide.map((rule, index) => (
                  <div key={`hide-${index}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{index === 0 ? 'WHEN' : 'OR'}</span>
                    <span className="text-xs text-muted-foreground">Website URL</span>
                    <Combobox
                      className="w-[140px]"
                      value={rule.op}
                      disabled={!canWrite || saving}
                      onChange={(v) => updateHide(index, { op: v as PresenceChatTargetOp })}
                      options={PRESENCE_CHAT_TARGET_OPS.map((op) => ({
                        value: op,
                        label: op.replace(/_/g, ' '),
                      }))}
                    />
                    <Input
                      className="h-9 min-w-[180px] flex-1 font-mono text-xs"
                      value={rule.value}
                      disabled={!canWrite || saving}
                      onChange={(e) => updateHide(index, { value: e.target.value })}
                      placeholder="/preview/**"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canWrite}
                      onClick={() =>
                        setTarget((prev) => ({
                          ...prev,
                          hide: prev.hide.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={!canWrite}
                  onClick={() =>
                    setTarget((prev) => ({
                      ...prev,
                      hide: [...prev.hide, emptyRule('matches_wildcard')],
                    }))
                  }
                >
                  <Plus className="size-3.5" />
                  Add exclusion rule
                </Button>
              </section>
            </TabsContent>

            <TabsContent value="options" className="mt-0 space-y-4">
              <section className="space-y-3 rounded-xl border p-4">
                <div>
                  <Label>Priority</Label>
                  <NumberField
                    className="mt-1 h-9 w-28"
                    value={priority}
                    disabled={!canWrite || saving}
                    onChange={(raw) => setPriority(Number(raw) || 0)}
                    min={0}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Lower number = higher in list.
                  </p>
                </div>
                <div>
                  <Label>Public key</Label>
                  <Input className="mt-1 h-9 font-mono text-xs" value={row.publicKey} readOnly />
                </div>
                <div>
                  <Label>Embed snippet</Label>
                  <pre className="mt-1 max-h-28 overflow-auto rounded-md border bg-muted/40 p-2 text-[10px]">
                    {embedSnippet}
                  </pre>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Position and color in the snippet mirror Inbox → Chat; the live widget also
                    refreshes them from chat settings.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(embedSnippet);
                        toastSuccess('Copied');
                      } catch {
                        toastError('Copy failed');
                      }
                    }}
                  >
                    <Copy className="size-3.5" />
                    Copy embed
                  </Button>
                </div>
                <div>
                  <Label>Assigned Presence sites</Label>
                  {assignedSites.length ? (
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {assignedSites.map((s) => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      None yet — assign this chatflow in Website settings → Chat widget.
                    </p>
                  )}
                </div>
              </section>
            </TabsContent>
          </div>

          <aside className="sticky top-4 hidden h-fit lg:block">
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </div>
                <Link
                  to={chatPath}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  Edit appearance
                </Link>
              </div>
              <div className="relative h-[320px] bg-[linear-gradient(165deg,#e2e8f0_0%,#f8fafc_42%,#fff_100%)]">
                <div
                  className={cn(
                    'absolute bottom-4 flex flex-col gap-2.5',
                    placementSide === 'left' ? 'left-4 items-start' : 'right-4 items-end',
                  )}
                >
                  {previewOpen ? (
                    <div className="flex h-[260px] w-[232px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 text-white"
                        style={{ background: accent }}
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/30 text-[10px] font-bold">
                          {(brandName || name || 'T').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">
                            {brandName || name || 'Team'}
                          </div>
                          <div className="truncate text-[10px] text-white/85">
                            We typically reply in a few minutes
                          </div>
                        </div>
                        <button
                          type="button"
                          className="size-6 shrink-0 rounded-full bg-white/15 text-sm leading-none"
                          onClick={() => setPreviewOpen(false)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col bg-white">
                        <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-2.5">
                          <div className="flex items-end gap-1.5">
                            <div
                              className="size-5 shrink-0 rounded-full"
                              style={{ background: `${accent}33` }}
                            />
                            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-2.5 py-1.5 text-[10px] leading-snug text-slate-700">
                              {greeting || "Got any questions? I'm happy to help."}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-slate-200 p-2">
                          <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-2 py-1.5">
                            <span className="flex-1 text-[10px] text-slate-400">
                              Ask me anything…
                            </span>
                            <span
                              className="inline-flex size-5 items-center justify-center rounded-full text-[9px] text-white"
                              style={{ background: accent }}
                            >
                              →
                            </span>
                          </div>
                          {whatsappNumber ? (
                            <div className="mt-1.5 text-center text-[9px] font-semibold text-slate-500">
                              Continue on WhatsApp
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex size-12 items-center justify-center rounded-full text-white shadow-lg"
                    style={{ background: accent }}
                    onClick={() => setPreviewOpen((v) => !v)}
                    aria-label="Toggle chat preview"
                  >
                    {previewOpen ? (
                      <span className="text-xl leading-none">×</span>
                    ) : (
                      <MessageCircle className="size-5" strokeWidth={1.8} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </Tabs>
    </SettingsNavShell>
  );
}
