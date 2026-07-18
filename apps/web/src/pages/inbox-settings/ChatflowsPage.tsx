import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  StatusBadge,
  Switch,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { SettingsNavShell } from '../../components/settings/SettingsNavShell';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import {
  settingsInboxChatPath,
  settingsInboxChatflowPath,
} from '../../lib/agencyRoutes';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

export type ChatflowRow = {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  publicKey: string;
  updatedAt?: string;
  createdAt?: string;
};

function slugifyKey(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'chatflow'
  );
}

export function ChatflowsPage() {
  useDocumentTitle('Settings · Chatflows');
  const { orgRef } = useOrgNavigate();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);
  const [rows, setRows] = useState<ChatflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on' | 'off'>('all');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatflowRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api<ChatflowRow[]>('/presence/chat-widgets');
      setRows(list || []);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load chatflows');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (statusFilter === 'on' && !r.enabled) return false;
        if (statusFilter === 'off' && r.enabled) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }, [rows, search, statusFilter]);

  const create = async () => {
    if (!canWrite) return;
    setCreating(true);
    try {
      const name = `New chatflow`;
      const key = `${slugifyKey(name)}-${Date.now().toString(36).slice(-4)}`;
      const created = await api<ChatflowRow>('/presence/chat-widgets', {
        method: 'PUT',
        body: JSON.stringify({
          key,
          name,
          enabled: false,
          priority: (rows[rows.length - 1]?.priority ?? 0) + 10,
          defaultGreeting: "Got any questions? I'm happy to help.",
          position: 'bottom-right',
          targetRules: { show: [], hide: [] },
        }),
      });
      toastSuccess('Chatflow created');
      window.location.assign(settingsInboxChatflowPath(orgRef || '', created.id));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (row: ChatflowRow, enabled: boolean) => {
    if (!canWrite) return;
    try {
      await api('/presence/chat-widgets', {
        method: 'PUT',
        body: JSON.stringify({
          key: row.key,
          name: row.name,
          enabled,
          priority: row.priority,
        }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled } : r)));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const remove = async () => {
    if (!canWrite || !deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/presence/chat-widgets/${deleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Chatflow deleted');
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <SettingsNavShell
      activeId="inbox"
      title="Chatflows"
      description="Each chatflow is a branded widget with targeting rules for your websites."
      backTo={{ href: settingsInboxChatPath(orgRef || ''), label: 'Back to Chat' }}
      actions={
        <Button size="sm" disabled={!canWrite || creating} onClick={() => void create()}>
          <Plus className="mr-1.5 size-3.5" />
          {creating ? 'Creating…' : 'Create chatflow'}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        <Link to={settingsInboxChatPath(orgRef || '')} className="hover:underline">
          Chat
        </Link>
        {' › '}
        Chatflows
      </p>

      <div className="flex gap-1 border-b">
        <button type="button" className="border-b-2 border-primary px-3 py-2 text-sm font-medium">
          Web Chat
        </button>
        <button
          type="button"
          disabled
          className="px-3 py-2 text-sm text-muted-foreground opacity-50"
        >
          Mobile Chat
        </button>
        <button
          type="button"
          disabled
          className="px-3 py-2 text-sm text-muted-foreground opacity-50"
        >
          Facebook Messenger
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search chatflows"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-xl border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'on' | 'off')}
        >
          <option value="all">All statuses</option>
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-sm font-medium">No chatflows yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one, then assign it to a Presence site under Website settings.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-16 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="w-24 px-3 py-2.5 font-medium">Type</th>
                <th className="w-28 px-3 py-2.5 font-medium">Modified</th>
                <th className="w-28 px-3 py-2.5 font-medium">Status</th>
                <th className="w-14 px-2 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row, index) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={settingsInboxChatflowPath(orgRef || '', row.id)}
                      className="font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {row.key}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">Live form</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.enabled}
                        disabled={!canWrite}
                        onCheckedChange={(v) => void toggle(row, v)}
                      />
                      <StatusBadge
                        value={row.enabled ? 'enabled' : 'disabled'}
                        label={row.enabled ? 'On' : 'Off'}
                        showIcon={false}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          aria-label={`Actions for ${row.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link to={settingsInboxChatflowPath(orgRef || '', row.id)}>
                            <Pencil className="mr-2 size-3.5" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        {canWrite ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsNavShell>

    <ConfirmDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      title="Delete chatflow?"
      description={
        deleteTarget
          ? `Permanently delete “${deleteTarget.name}”? Sites using it will stop showing chat.`
          : undefined
      }
      confirmLabel="Delete"
      destructive
      loading={deleting}
      onConfirm={() => void remove()}
    />
    </>
  );
}
