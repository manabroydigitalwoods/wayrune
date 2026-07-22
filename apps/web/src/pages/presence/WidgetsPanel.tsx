import { useEffect, useMemo, useState } from 'react';
import { Copy, MessageCircle, Plus, Trash2 } from 'lucide-react';
import {
  PRESENCE_WIDGET_POSITIONS,
  normalizePresencePathList,
  normalizePresenceWidgetPosition,
  type PresenceWidgetPosition,
} from '@wayrune/contracts';
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Switch,
  Textarea,
  cn,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';

export type PresenceChatWidgetRow = {
  id: string;
  key: string;
  name: string;
  publicKey: string;
  enabled: boolean;
  brandName?: string | null;
  primaryColor?: string | null;
  whatsappNumber?: string | null;
  defaultGreeting?: string | null;
  position?: string | null;
  includePathsJson?: unknown;
  excludePathsJson?: unknown;
};

function slugifyKey(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'widget'
  );
}

function pathsToText(value: unknown) {
  return normalizePresencePathList(value).join('\n');
}

function WidgetPreview({
  brandName,
  primaryColor,
  greeting,
  position,
  previewOpen,
  onToggle,
}: {
  brandName: string;
  primaryColor: string;
  greeting: string;
  position: PresenceWidgetPosition;
  previewOpen: boolean;
  onToggle: () => void;
}) {
  const color = primaryColor.trim() || '#0f766e';
  const corner =
    position === 'bottom-left'
      ? 'left-3 bottom-3 items-start'
      : position === 'top-right'
        ? 'right-3 top-3 items-end flex-col-reverse'
        : position === 'top-left'
          ? 'left-3 top-3 items-start flex-col-reverse'
          : 'right-3 bottom-3 items-end';

  return (
    <div className="overflow-hidden rounded-lg border bg-[#f1f5f9]">
      <div className="flex items-center justify-between border-b bg-white/80 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Live preview
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onToggle}>
          {previewOpen ? 'Show button' : 'Open chat'}
        </Button>
      </div>
      <div className="relative h-[220px] bg-[linear-gradient(180deg,#e2e8f0_0%,#f8fafc_40%,#fff_100%)]">
        <div className="absolute left-4 top-4 right-16 space-y-2 opacity-50">
          <div className="h-2.5 w-24 rounded bg-slate-300/80" />
          <div className="h-2 w-40 rounded bg-slate-200" />
          <div className="h-2 w-32 rounded bg-slate-200" />
        </div>
        <div className={cn('absolute z-10 flex flex-col gap-2', corner)}>
          {previewOpen ? (
            <div className="w-[200px] rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/5">
              <div className="text-xs font-semibold" style={{ color }}>
                {brandName.trim() || 'Your brand'}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                {greeting.trim() || 'Need help planning your trip?'}
              </p>
              <div className="mt-2 space-y-1.5">
                <div className="rounded-md border px-2 py-1.5 text-[10px] text-slate-500">Chat</div>
                <div className="rounded-md border px-2 py-1.5 text-[10px] text-slate-500">
                  Travel enquiry
                </div>
                <div className="rounded-md border px-2 py-1.5 text-[10px] text-slate-500">
                  Request callback
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            aria-label="Preview chat button"
            onClick={onToggle}
            className="inline-flex size-12 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: color }}
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
  );
}

export function WidgetsPanel({
  organizationId,
  canWrite,
}: {
  organizationId: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<PresenceChatWidgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PresenceChatWidgetRow | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0f766e');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [defaultGreeting, setDefaultGreeting] = useState('Need help planning your trip?');
  const [publicKey, setPublicKey] = useState('');
  const [regeneratePublicKey, setRegeneratePublicKey] = useState(false);
  const [position, setPosition] = useState<PresenceWidgetPosition>('bottom-right');
  const [includePaths, setIncludePaths] = useState('');
  const [excludePaths, setExcludePaths] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api<PresenceChatWidgetRow[]>('/presence/chat-widgets');
      setRows(list || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load widgets');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('Homepage chat');
    setKey('homepage-chat');
    setEnabled(true);
    setBrandName('');
    setPrimaryColor('#0f766e');
    setWhatsappNumber('');
    setDefaultGreeting('Need help planning your trip?');
    setPublicKey('');
    setRegeneratePublicKey(false);
    setPosition('bottom-right');
    setIncludePaths('');
    setExcludePaths('');
    setPreviewOpen(false);
    setEditorOpen(true);
  };

  const openEdit = (row: PresenceChatWidgetRow) => {
    setEditing(row);
    setName(row.name);
    setKey(row.key);
    setEnabled(row.enabled);
    setBrandName(row.brandName || '');
    setPrimaryColor(row.primaryColor || '#0f766e');
    setWhatsappNumber(row.whatsappNumber || '');
    setDefaultGreeting(row.defaultGreeting || 'Need help planning your trip?');
    setPublicKey(row.publicKey);
    setRegeneratePublicKey(false);
    setPosition(normalizePresenceWidgetPosition(row.position));
    setIncludePaths(pathsToText(row.includePathsJson));
    setExcludePaths(pathsToText(row.excludePathsJson));
    setPreviewOpen(false);
    setEditorOpen(true);
  };

  const embedSnippet = useMemo(() => {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const keyValue = publicKey || editing?.publicKey || 'YOUR_PUBLIC_KEY';
    const widgetAttr = editing?.id ? ` data-widget="${editing.id}"` : '';
    return `<script src="${origin}/widget.js" data-org="${organizationId}" data-key="${keyValue}" data-api="${apiBase}"${widgetAttr} data-source="embed" data-position="${position}"></script>`;
  }, [organizationId, publicKey, editing, position]);

  const save = async () => {
    if (!canWrite) return;
    const nextKey = (editing ? key : slugifyKey(key || name)).trim();
    if (!name.trim() || !nextKey) {
      toastError('Name and key are required');
      return;
    }
    setSaving(true);
    try {
      await api('/presence/chat-widgets', {
        method: 'PUT',
        body: JSON.stringify({
          key: nextKey,
          name: name.trim(),
          enabled,
          brandName: brandName.trim() || null,
          primaryColor: primaryColor.trim() || null,
          whatsappNumber: whatsappNumber.trim() || null,
          defaultGreeting: defaultGreeting.trim() || null,
          publicKey: publicKey.trim() || null,
          regeneratePublicKey: regeneratePublicKey || undefined,
          position,
          includePaths: includePaths
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          excludePaths: excludePaths
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      toastSuccess(editing ? 'Widget updated' : 'Widget created');
      setEditorOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save widget');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: PresenceChatWidgetRow) => {
    if (!canWrite) return;
    if (!window.confirm(`Delete widget “${row.name}”? Sites using it will stop showing chat.`)) {
      return;
    }
    try {
      await api(`/presence/chat-widgets/${row.id}`, { method: 'DELETE' });
      toastSuccess('Widget deleted');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete widget');
    }
  };

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      toastSuccess('Embed snippet copied');
    } catch {
      toastError('Could not copy');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Create chat widgets with branding, corner position, and page include/exclude rules. Assign
          a widget to each website under Website settings.
        </p>
        {canWrite ? (
          <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            New widget
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <MessageCircle className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No chat widgets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one, then assign it under Website settings → Chat widget.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  <StatusBadge
                    value={row.enabled ? 'enabled' : 'disabled'}
                    label={row.enabled ? 'Enabled' : 'Disabled'}
                    tone={row.enabled ? 'success' : 'neutral'}
                    showIcon={false}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">{row.key}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {normalizePresenceWidgetPosition(row.position).replace(/-/g, ' ')}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {row.publicKey}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                  Edit
                </Button>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void remove(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{editing ? 'Edit chat widget' : 'New chat widget'}</DialogTitle>
            <DialogDescription>
              Preview the floating button, set position and page paths, then assign this widget in
              Website settings.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <WidgetPreview
              brandName={brandName}
              primaryColor={primaryColor}
              greeting={defaultGreeting}
              position={position}
              previewOpen={previewOpen}
              onToggle={() => setPreviewOpen((v) => !v)}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name</Label>
                <Input
                  className="mt-1 h-9"
                  value={name}
                  disabled={!canWrite || saving}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editing) setKey(slugifyKey(e.target.value));
                  }}
                />
              </div>
              <div>
                <Label>Key</Label>
                <Input
                  className="mt-1 h-9 font-mono text-xs"
                  value={key}
                  disabled={!canWrite || saving || Boolean(editing)}
                  onChange={(e) => setKey(slugifyKey(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <p className="text-[11px] text-muted-foreground">Off = not injected on sites</p>
                </div>
                <Switch
                  checked={enabled}
                  disabled={!canWrite || saving}
                  onCheckedChange={setEnabled}
                />
              </div>
              <div>
                <Label>Brand name</Label>
                <Input
                  className="mt-1 h-9"
                  value={brandName}
                  disabled={!canWrite || saving}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Uses org name when empty"
                />
              </div>
              <div>
                <Label>Primary color</Label>
                <Input
                  className="mt-1 h-9"
                  value={primaryColor}
                  disabled={!canWrite || saving}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
              <div>
                <Label>WhatsApp number</Label>
                <Input
                  className="mt-1 h-9"
                  value={whatsappNumber}
                  disabled={!canWrite || saving}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="9198…"
                />
              </div>
              <div>
                <Label>Greeting</Label>
                <Input
                  className="mt-1 h-9"
                  value={defaultGreeting}
                  disabled={!canWrite || saving}
                  onChange={(e) => setDefaultGreeting(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Floating position</Label>
                <Combobox
                  className="mt-1"
                  value={position}
                  disabled={!canWrite || saving}
                  onChange={(value) => setPosition(normalizePresenceWidgetPosition(value))}
                  options={PRESENCE_WIDGET_POSITIONS.map((pos) => ({
                    value: pos,
                    label: pos
                      .split('-')
                      .map((part) => part[0]!.toUpperCase() + part.slice(1))
                      .join(' '),
                  }))}
                />
              </div>
              <div>
                <Label>Include paths</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  One per line. Empty = all pages. Wildcards: /trips/* , /blog/**
                </p>
                <Textarea
                  rows={4}
                  className="mt-1 font-mono text-xs"
                  value={includePaths}
                  disabled={!canWrite || saving}
                  onChange={(e) => setIncludePaths(e.target.value)}
                  placeholder={'/contact\n/trips/**'}
                />
              </div>
              <div>
                <Label>Exclude paths</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Wins over include. Example: /trips/private/**
                </p>
                <Textarea
                  rows={4}
                  className="mt-1 font-mono text-xs"
                  value={excludePaths}
                  disabled={!canWrite || saving}
                  onChange={(e) => setExcludePaths(e.target.value)}
                  placeholder="/preview/**"
                />
              </div>
              {editing ? (
                <div className="sm:col-span-2">
                  <Label>Public key</Label>
                  <div className="mt-1 flex gap-2">
                    <Input className="h-9 font-mono text-xs" value={publicKey} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canWrite || saving}
                      onClick={() => setRegeneratePublicKey(true)}
                    >
                      {regeneratePublicKey ? 'Will regenerate' : 'Regenerate'}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <Label>Embed snippet</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  For non-Presence sites. Presence sites use Website settings assignment.
                </p>
                <pre className="mt-1 max-h-24 overflow-auto rounded-md border bg-muted/40 p-2 text-[10px] leading-relaxed">
                  {embedSnippet}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={() => void copyEmbed()}
                >
                  <Copy className="size-3.5" />
                  Copy embed
                </Button>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canWrite || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
