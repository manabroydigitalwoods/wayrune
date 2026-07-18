import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import {
  DEFAULT_INBOX_CHAT_SETTINGS,
  parseInboxChatSettings,
  placementSideToPosition,
  type InboxChatSettings,
} from '@wayrune/contracts';
import {
  Button,
  Checkbox,
  Combobox,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TimePicker,
  cn,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { SettingsNavShell } from '../../components/settings/SettingsNavShell';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';
import { settingsInboxChatflowsPath, settingsInboxPath } from '../../lib/agencyRoutes';

const COLOR_PRESETS = ['#0f766e', '#0369a1', '#ff7a59', '#7c3aed', '#db2777'];

const CHAT_SECTION_PARAM = 'section';
const CHAT_TAB_PARAM = 'tab';

type ChatSection = 'general' | 'web';

function parseChatSection(value: string | null): ChatSection {
  return value === 'web' ? 'web' : 'general';
}

function parseGeneralTab(value: string | null): string {
  return value === 'availability' ? 'availability' : 'configure';
}

function parseWebTab(value: string | null): string {
  return value === 'tracking' ? 'tracking' : 'configure';
}

function ChatLivePreview({
  accent,
  greeting,
  brandName,
  side,
  open,
  onToggle,
}: {
  accent: string;
  greeting: string;
  brandName: string;
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
}) {
  const corner = side === 'left' ? 'left-4 bottom-4 items-start' : 'right-4 bottom-4 items-end';
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Preview
      </div>
      <div className="relative h-[300px] bg-[linear-gradient(165deg,#e2e8f0_0%,#f8fafc_42%,#fff_100%)]">
        <div className={cn('absolute z-10 flex flex-col gap-2.5', corner)}>
          {open ? (
            <div className="w-[248px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div
                className="flex items-center gap-2 px-3 py-2.5 text-white"
                style={{ background: accent }}
              >
                <div className="size-7 rounded-full bg-white/25" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{brandName || 'Your team'}</div>
                  <div className="truncate text-[10px] text-white/80">Online</div>
                </div>
                <button type="button" className="text-sm leading-none" onClick={onToggle}>
                  ×
                </button>
              </div>
              <div className="space-y-2 p-3">
                <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
                  {greeting || "Got any questions? I'm happy to help."}
                </div>
                <div className="rounded-xl border px-3 py-2 text-[11px] text-slate-400">
                  Ask me anything…
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex size-12 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: accent }}
            aria-label="Toggle chat preview"
          >
            {open ? (
              <span className="text-xl">×</span>
            ) : (
              <MessageCircle className="size-5" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatSettingsPage() {
  useDocumentTitle('Settings · Chat');
  const { orgRef } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseChatSection(searchParams.get(CHAT_SECTION_PARAM));
  const generalTab = parseGeneralTab(
    section === 'general' ? searchParams.get(CHAT_TAB_PARAM) : null,
  );
  const webTab = parseWebTab(section === 'web' ? searchParams.get(CHAT_TAB_PARAM) : null);
  const [draft, setDraft] = useState<Required<InboxChatSettings>>(DEFAULT_INBOX_CHAT_SETTINGS);
  const [brandName, setBrandName] = useState('Your team');
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const setChatNav = (next: { section?: ChatSection; tab?: string }) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        const nextSection = next.section ?? parseChatSection(params.get(CHAT_SECTION_PARAM));
        if (nextSection === 'general') params.delete(CHAT_SECTION_PARAM);
        else params.set(CHAT_SECTION_PARAM, nextSection);

        const nextTab =
          next.tab ??
          (nextSection === 'web'
            ? parseWebTab(params.get(CHAT_TAB_PARAM))
            : parseGeneralTab(params.get(CHAT_TAB_PARAM)));
        if (nextTab === 'configure') params.delete(CHAT_TAB_PARAM);
        else params.set(CHAT_TAB_PARAM, nextTab);
        return params;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    void api<{ name?: string; settingsJson?: unknown }>('/organizations/current')
      .then((org) => {
        setDraft(parseInboxChatSettings(org.settingsJson));
        setBrandName(org.name || 'Your team');
      })
      .catch((e) => toastError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const patch = (partial: Partial<InboxChatSettings>) =>
    setDraft((prev) => ({ ...prev, ...partial }));

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const updated = await api<{ name?: string; settingsJson?: unknown }>(
        '/organizations/current',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settingsJson: {
              inbox: {
                chat: draft,
              },
            },
          }),
        },
      );
      setDraft(parseInboxChatSettings(updated.settingsJson));
      toastSuccess('Chat settings saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const accent = draft.accentColor || DEFAULT_INBOX_CHAT_SETTINGS.accentColor;

  return (
    <SettingsNavShell
      activeId="inbox"
      title="Chat"
      description="Accent, placement, and availability for the web chat widget — used by all chatflows."
      backTo={{ href: settingsInboxPath(orgRef || ''), label: 'Back to Inbox' }}
      actions={
        <>
          <Button asChild size="sm" variant="outline">
            <Link to={settingsInboxChatflowsPath(orgRef || '')}>Manage chatflows</Link>
          </Button>
          <Button size="sm" disabled={!canWrite || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">
        <Link to={settingsInboxPath(orgRef || '')} className="hover:underline">
          Inbox channels
        </Link>
        {' › '}
        Chat
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-36 lg:flex-col">
          {(
            [
              { id: 'general', label: 'General' },
              { id: 'web', label: 'Web Chat' },
              { id: 'mobile', label: 'Mobile SDK', disabled: true },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={'disabled' in item && item.disabled}
              className={cn(
                'rounded-xl px-3 py-2 text-left text-sm transition-colors',
                section === item.id
                  ? 'bg-primary/15 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/40',
                'disabled' in item && item.disabled && 'cursor-not-allowed opacity-50',
              )}
              onClick={() => {
                if (!('disabled' in item && item.disabled)) {
                  setChatNav({ section: item.id as ChatSection, tab: 'configure' });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {section === 'general' ? (
            <>
              <Tabs
                value={generalTab}
                onValueChange={(v) => setChatNav({ section: 'general', tab: v })}
              >
                <TabsList>
                  <TabsTrigger value="configure">Configure</TabsTrigger>
                  <TabsTrigger value="availability">Availability</TabsTrigger>
                </TabsList>
                <TabsContent value="configure" className="mt-4 space-y-4">
                  <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                    <div>
                      <h3 className="text-sm font-semibold">Appearance</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Shared by every chatflow and Presence site.
                      </p>
                    </div>
                    <div>
                      <Label>Accent color</Label>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={cn(
                              'size-8 rounded-full border-2 transition-transform',
                              accent === c
                                ? 'scale-105 border-foreground'
                                : 'border-transparent hover:scale-105',
                            )}
                            style={{ background: c }}
                            onClick={() => patch({ accentColor: c })}
                            disabled={!canWrite}
                          />
                        ))}
                        <Input
                          className="h-9 w-28 font-mono text-xs"
                          value={draft.accentColor}
                          disabled={!canWrite}
                          onChange={(e) => patch({ accentColor: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="max-w-xs">
                      <Label>Font</Label>
                      <Combobox
                        className="mt-1"
                        value={draft.fontFamily}
                        disabled={!canWrite}
                        onChange={(v) => patch({ fontFamily: v })}
                        options={[
                          { value: 'system-ui', label: 'System-UI', description: 'Default' },
                          { value: 'Inter', label: 'Inter' },
                          { value: 'Georgia', label: 'Georgia' },
                        ]}
                      />
                    </div>
                  </section>
                  <section className="flex items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <div className="text-sm font-medium">Attachments</div>
                      <p className="text-xs text-muted-foreground">
                        Allow visitors to attach files (wired in a later release).
                      </p>
                    </div>
                    <Switch
                      checked={draft.allowAttachments}
                      disabled={!canWrite}
                      onCheckedChange={(v) => patch({ allowAttachments: v })}
                    />
                  </section>
                  <section className="flex items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <div className="text-sm font-medium">Screen capture</div>
                      <p className="text-xs text-muted-foreground">
                        Let visitors capture a screenshot (coming soon).
                      </p>
                    </div>
                    <Switch
                      checked={draft.allowScreenCapture}
                      disabled={!canWrite}
                      onCheckedChange={(v) => patch({ allowScreenCapture: v })}
                    />
                  </section>
                </TabsContent>
                <TabsContent value="availability" className="mt-4 space-y-4">
                  <section className="space-y-3 rounded-xl border p-4">
                    <h3 className="text-sm font-semibold">Channel availability</h3>
                    <div className="grid gap-2">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => patch({ availabilityMode: 'user_availability' })}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-left transition-colors',
                          draft.availabilityMode === 'user_availability'
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/40',
                        )}
                      >
                        <div className="text-sm font-medium">Based on user availability</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Coming soon — treats chat as available for now.
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() =>
                          patch({
                            availabilityMode: draft.alwaysOpen ? 'always' : 'operating_hours',
                          })
                        }
                        className={cn(
                          'rounded-xl border px-3 py-3 text-left transition-colors',
                          draft.availabilityMode === 'operating_hours' ||
                            draft.availabilityMode === 'always'
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/40',
                        )}
                      >
                        <div className="text-sm font-medium">Based on chat operating hours</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Timezone: {draft.timezone}
                        </p>
                      </button>
                    </div>
                    <label className="flex items-center gap-2.5 text-sm">
                      <Checkbox
                        checked={draft.alwaysOpen}
                        disabled={
                          !canWrite ||
                          (draft.availabilityMode !== 'operating_hours' &&
                            draft.availabilityMode !== 'always')
                        }
                        onCheckedChange={(checked) =>
                          patch({
                            alwaysOpen: checked === true,
                            availabilityMode: checked === true ? 'always' : 'operating_hours',
                          })
                        }
                      />
                      <span>Chat is available 24/7</span>
                    </label>
                    {!draft.alwaysOpen &&
                    (draft.availabilityMode === 'operating_hours' ||
                      draft.availabilityMode === 'always') ? (
                      <div className="flex flex-wrap gap-3">
                        <div>
                          <Label>Start</Label>
                          <div className="mt-1">
                            <TimePicker
                              value={draft.hoursStart || undefined}
                              disabled={!canWrite}
                              onChange={(v) => patch({ hoursStart: v || '00:00' })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>End</Label>
                          <div className="mt-1">
                            <TimePicker
                              value={draft.hoursEnd || undefined}
                              disabled={!canWrite}
                              onChange={(v) => patch({ hoursEnd: v || '23:59' })}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>
                  <section className="space-y-3 rounded-xl border p-4">
                    <h3 className="text-sm font-semibold">Availability behavior</h3>
                    <div>
                      <Label>Typical reply time</Label>
                      <Input
                        className="mt-1 h-9"
                        value={draft.availableReplyTime}
                        disabled={!canWrite}
                        onChange={(e) => patch({ availableReplyTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>After hours message</Label>
                      <Textarea
                        className="mt-1"
                        rows={3}
                        value={draft.afterHoursMessage}
                        disabled={!canWrite}
                        onChange={(e) => patch({ afterHoursMessage: e.target.value })}
                      />
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </>
          ) : null}

          {section === 'web' ? (
            <Tabs value={webTab} onValueChange={(v) => setChatNav({ section: 'web', tab: v })}>
              <TabsList>
                <TabsTrigger value="configure">Configure</TabsTrigger>
                <TabsTrigger value="tracking">Tracking code</TabsTrigger>
              </TabsList>
              <TabsContent value="configure" className="mt-4 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="space-y-3">
                    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Placement</h3>
                          <p className="text-xs text-muted-foreground">
                            Side of the screen for the floating launcher (
                            {placementSideToPosition(draft.placementSide).replace(/-/g, ' ')}).
                          </p>
                        </div>
                        <div className="inline-flex rounded-xl border bg-muted/30 p-0.5">
                          {(['left', 'right'] as const).map((side) => (
                            <button
                              key={side}
                              type="button"
                              disabled={!canWrite}
                              onClick={() => patch({ placementSide: side })}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                                draft.placementSide === side
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {side}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                    <section className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
                      <div>
                        <div className="text-sm font-medium">Allow visitors to drag</div>
                        <p className="text-xs text-muted-foreground">
                          Let people reposition the launcher on the page.
                        </p>
                      </div>
                      <Switch
                        checked={draft.allowDrag}
                        disabled={!canWrite}
                        onCheckedChange={(v) => patch({ allowDrag: v })}
                      />
                    </section>
                    <p className="text-[11px] text-muted-foreground">
                      These settings apply to Presence sites and embed snippets. Chatflows only
                      personalize greeting, brand, and targeting.
                    </p>
                  </div>
                  <ChatLivePreview
                    accent={accent}
                    greeting="Got any questions? I'm happy to help."
                    brandName={brandName}
                    side={draft.placementSide}
                    open={previewOpen}
                    onToggle={() => setPreviewOpen((v) => !v)}
                  />
                </div>
              </TabsContent>
              <TabsContent
                value="tracking"
                className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground"
              >
                Presence sites inject the widget automatically when a chatflow is assigned. For
                external sites, copy the embed snippet from a chatflow.
              </TabsContent>
            </Tabs>
          ) : null}

        </div>
      </div>
    </SettingsNavShell>
  );
}
