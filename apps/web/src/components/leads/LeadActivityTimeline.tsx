import { useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Mail,
  MessageSquare,
  NotebookPen,
  Paperclip,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  humanizeActivityType,
  Input,
  RichTextContent,
  RichTextEditor,
  isEmptyRichHtml,
  stripHtml,
  toastError,
  toastSuccess,
  cn,
  formatMonthYear,
  formatDateTime,
} from '@wayrune/ui';
import { api, apiUpload } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

export type ActivityDocument = {
  id: string;
  name: string;
  mimeType: string;
  contentUrl: string;
  sizeBytes?: number;
};

export type LeadActivity = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  createdBy?: string | null;
  actor?: { id: string; fullName?: string | null; email?: string | null } | null;
  documents?: ActivityDocument[];
};

export type LeadActivityContext = {
  sourceName?: string | null;
  followUpAt?: string | null;
  channel?: string | null;
};

type FilterKey = 'all' | 'note' | 'email' | 'call' | 'system';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'note', label: 'Notes' },
  { key: 'email', label: 'Emails' },
  { key: 'call', label: 'Calls' },
  { key: 'system', label: 'System' },
];

function activityIcon(type: string) {
  switch (type) {
    case 'call':
      return Phone;
    case 'email':
      return Mail;
    case 'note':
      return NotebookPen;
    case 'status_change':
      return RefreshCw;
    default:
      return MessageSquare;
  }
}

function activityTitle(a: LeadActivity) {
  const who = a.actor?.fullName || 'Someone';
  switch (a.type) {
    case 'note':
      return `Note by ${who}`;
    case 'email':
      return `Logged email by ${who}`;
    case 'call':
      return `Logged call by ${who}`;
    case 'status_change':
      return `Stage change by ${who}`;
    case 'system':
      if (/^lead created/i.test(a.body.trim())) {
        return `Lead created · ${who}`;
      }
      return `${humanizeActivityType(a.type)} · ${who}`;
    default:
      return `${humanizeActivityType(a.type)} · ${who}`;
  }
}

function enrichLeadCreatedBody(a: LeadActivity, ctx?: LeadActivityContext) {
  if (a.type !== 'system' || !/^lead created/i.test(a.body.trim().split('\n')[0] ?? '')) {
    return a.body;
  }

  const who = a.actor?.fullName?.trim();
  const lines = [who ? `Lead created manually by ${who}` : 'Lead created'];
  const meta: string[] = [];
  if (ctx?.sourceName?.trim()) {
    meta.push(`Source: ${ctx.sourceName.trim()}`);
  }
  if (ctx?.followUpAt) {
    meta.push(`Follow-up: ${formatDateTime(ctx.followUpAt)}`);
  }
  if (meta.length) {
    lines.push(meta.join(' · '));
  }
  return lines.join('\n\n');
}

function matchesFilter(type: string, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'system') return type === 'system' || type === 'status_change';
  return type === filter;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(iso: string) {
  return formatMonthYear(iso);
}

function isInlineEditable(type: string) {
  return type === 'note' || type === 'email';
}

function isSalesActivity(type: string) {
  return type === 'note' || type === 'email' || type === 'call';
}

function ActivityBodyView({ body }: { body: string }) {
  if (/<[a-z][\s\S]*>/i.test(body)) {
    return (
      <RichTextContent
        html={body}
        className="text-[length:var(--control-text-sm)] text-foreground/85 prose-p:my-1 prose-p:text-[length:var(--control-text-sm)] prose-li:text-[length:var(--control-text-sm)]"
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap text-[length:var(--control-text-sm)] text-foreground/85">
      {body}
    </p>
  );
}

function InlineActivityEditor({
  leadId,
  activity,
  onCancel,
  onSaved,
}: {
  leadId: string;
  activity: LeadActivity;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [body, setBody] = useState(activity.body || '');
  const [saving, setSaving] = useState(false);

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      return await apiUpload<{ id: string; contentUrl: string }>(
        `/files/upload?entityType=activity&entityId=${encodeURIComponent(activity.id)}`,
        fd,
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Image upload failed');
      throw e;
    }
  }

  async function save() {
    if (isEmptyRichHtml(body)) {
      toastError('Add some content before saving');
      return;
    }
    setSaving(true);
    try {
      await api(`/leads/${leadId}/activities/${activity.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
      toastSuccess(activity.type === 'email' ? 'Email updated' : 'Note updated');
      await onSaved();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <RichTextEditor
        key={`edit-${activity.id}`}
        value={body}
        onChange={setBody}
        compact
        placeholder={activity.type === 'email' ? 'Edit email details…' : 'Edit note…'}
        onUploadImage={uploadImage}
        disabled={saving}
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

type LeadActivityTimelineProps = {
  leadId: string;
  activities: LeadActivity[];
  activityContext?: LeadActivityContext;
  onLogNote: () => void;
  onLogEmail: () => void;
  onLogCall: () => void;
  onCreateTask?: () => void;
  onActivityUpdated?: () => Promise<void> | void;
  className?: string;
};

export function LeadActivityTimeline({
  leadId,
  activities,
  activityContext,
  onLogNote,
  onLogEmail,
  onLogCall,
  onCreateTask,
  onActivityUpdated,
  className,
}: LeadActivityTimelineProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.leadWrite);
  const canTaskWrite = hasAny(CAP.taskWrite);
  const hasSales = activities.some((a) => isSalesActivity(a.type));
  const showSearchField = searchOpen || query.trim().length > 0 || activities.length >= 4;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((a) => {
      if (!matchesFilter(a.type, filter)) return false;
      if (!q) return true;
      return stripHtml(a.body).toLowerCase().includes(q);
    });
  }, [activities, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, LeadActivity[]>();
    for (const a of filtered) {
      const key = monthKey(a.createdAt);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: monthLabel(items[0]!.createdAt),
      items,
    }));
  }, [filtered]);

  const allExpanded =
    filtered.length > 0 && filtered.every((a) => expandedIds[a.id] === true);

  function isExpanded(id: string) {
    return expandedIds[id] === true || editingId === id;
  }

  function toggleCard(id: string) {
    if (editingId === id) return;
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function collapseAll() {
    setExpandedIds({});
    setEditingId(null);
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    for (const a of filtered) next[a.id] = true;
    setExpandedIds(next);
  }

  function startEdit(a: LeadActivity) {
    setEditingId(a.id);
    setExpandedIds((prev) => ({ ...prev, [a.id]: true }));
  }

  const quickActions =
    canWrite || (canTaskWrite && onCreateTask) ? (
      <div className="flex flex-wrap gap-1">
        {canWrite ? (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={onLogNote}>
              <NotebookPen className="size-[0.875em]" />
              Add note
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onLogEmail}>
              <Mail className="size-[0.875em]" />
              Log email
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onLogCall}>
              <Phone className="size-[0.875em]" />
              Log call
            </Button>
          </>
        ) : null}
        {canTaskWrite && onCreateTask ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCreateTask}>
            <CheckSquare className="size-[0.875em]" />
            Create task
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex flex-col gap-2 border-b border-white/40 pb-2.5 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="flex h-[var(--control-h-sm)] items-center rounded-md border border-border/60 p-0.5 glass-strong"
            role="group"
            aria-label="Activity filter"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex h-full items-center rounded-sm px-[var(--control-px-sm)] text-[length:var(--control-text-sm)] font-medium transition-colors',
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {showSearchField ? (
              <div className="relative">
                <Input
                  className="h-[var(--control-h-sm)] w-[11rem] pr-8 text-[length:var(--control-text-sm)]"
                  placeholder="Search activity…"
                  value={query}
                  autoFocus={searchOpen && !query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    if (!query.trim()) setSearchOpen(false);
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setSearchOpen(false);
                    }}
                  >
                    <X className="size-[0.875em]" />
                  </button>
                ) : null}
              </div>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-[var(--control-h-sm)]"
                aria-label="Search activity"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="size-[0.875em]" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {filtered.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-[var(--control-px-sm)]"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          ) : null}
          <Can anyOf={[...CAP.leadWrite, ...CAP.taskWrite]}>
            <div className="ml-auto">{quickActions}</div>
          </Can>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-2.5">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={
              activities.length === 0
                ? 'No customer activity yet'
                : 'No matching activity'
            }
            description={
              activities.length === 0
                ? 'Log the first call, email, or note.'
                : 'Try another filter or clear your search.'
            }
            action={
              activities.length === 0 && canWrite ? (
                <Button type="button" size="sm" onClick={onLogCall}>
                  <Phone className="size-[0.875em]" />
                  Log call
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-[var(--gap-page)]">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="mb-2 px-0.5 text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                <ol className="relative ml-1.5 space-y-0 border-l border-primary/20">
                  {group.items.map((a) => {
                    const Icon = activityIcon(a.type);
                    const expanded = isExpanded(a.id);
                    const editing = editingId === a.id;
                    const editable = isInlineEditable(a.type) && canWrite;
                    const docs = (a.documents ?? []).filter(
                      (d) => !d.mimeType.startsWith('image/') || !a.body.includes(d.id),
                    );
                    const displayBody = enrichLeadCreatedBody(a, activityContext);
                    const preview = stripHtml(displayBody) || humanizeActivityType(a.type);
                    return (
                      <li key={a.id} className="relative pb-2.5 pl-4 last:pb-0">
                        <span className="absolute -left-2 top-1.5 flex size-4 items-center justify-center rounded-full border border-primary/25 bg-card text-primary shadow-sm">
                          <Icon className="size-2.5" />
                        </span>
                        <div className="overflow-hidden rounded-lg border transition-colors hover:border-primary/20 glass-row">
                          <div className="relative">
                            <button
                              type="button"
                              className={cn(
                                'flex w-full items-start gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-muted/25',
                                editable && !editing && 'pr-9',
                              )}
                              onClick={() => toggleCard(a.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Collapse activity' : 'Expand activity'}
                            >
                              <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>
                                {expanded ? (
                                  <ChevronDown className="size-[0.875em]" />
                                ) : (
                                  <ChevronRight className="size-[0.875em]" />
                                )}
                              </span>
                              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-x-2">
                                <span className="truncate text-[length:var(--control-text-sm)] font-medium">
                                  {activityTitle(a)}
                                </span>
                                <time
                                  className="shrink-0 text-[length:var(--control-text-sm)] text-muted-foreground"
                                  dateTime={a.createdAt}
                                  title={formatDateTime(a.createdAt)}
                                >
                                  {formatDateTime(a.createdAt)}
                                </time>
                              </span>
                            </button>
                            {!expanded ? (
                              <button
                                type="button"
                                className={cn(
                                  'w-full px-2 pb-1.5 pl-7 text-left transition-colors hover:bg-muted/25',
                                  editable && !editing && 'pr-9',
                                )}
                                onClick={() => toggleCard(a.id)}
                                tabIndex={-1}
                                aria-hidden
                              >
                                <span className="line-clamp-3 break-words text-[length:var(--control-text-sm)] leading-snug text-muted-foreground">
                                  {preview}
                                </span>
                              </button>
                            ) : null}
                            {editable && !editing ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="absolute right-1 top-1 size-6 shrink-0"
                                aria-label="Edit"
                                title="Edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(a);
                                }}
                              >
                                <Pencil className="size-3" />
                              </Button>
                            ) : null}
                          </div>
                          {expanded ? (
                            <div className="space-y-2 border-t border-border/60 px-2 py-1.5">
                              {editing ? (
                                <InlineActivityEditor
                                  leadId={leadId}
                                  activity={a}
                                  onCancel={() => setEditingId(null)}
                                  onSaved={async () => {
                                    setEditingId(null);
                                    await onActivityUpdated?.();
                                  }}
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={cn(
                                      'w-full rounded-md text-left transition-colors',
                                      editable && 'cursor-text hover:bg-primary/[0.03]',
                                    )}
                                    onClick={() => {
                                      if (editable) startEdit(a);
                                    }}
                                    title={editable ? 'Click to edit' : undefined}
                                  >
                                    <ActivityBodyView body={displayBody} />
                                  </button>
                                  {docs.length > 0 ? (
                                    <ul className="flex flex-wrap gap-1.5">
                                      {docs.map((doc) => (
                                        <li key={doc.id}>
                                          <a
                                            href={doc.contentUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[length:var(--control-text-sm)] text-primary glass-row hover:underline"
                                          >
                                            <Paperclip className="size-3" />
                                            {doc.name}
                                          </a>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}

            {!hasSales && filter === 'all' && !query.trim() && canWrite ? (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center glass">
                <p className="text-[length:var(--control-text-sm)] font-medium text-foreground">
                  No customer activity yet
                </p>
                <p className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground">
                  Log the first call, email, or note.
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                  <Button type="button" size="sm" onClick={onLogCall}>
                    <Phone className="size-[0.875em]" />
                    Log call
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
