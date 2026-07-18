import { useMemo, useState } from 'react';
import {
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
    default:
      return `${humanizeActivityType(a.type)} · ${who}`;
  }
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

function ActivityBodyView({ body }: { body: string }) {
  if (/<[a-z][\s\S]*>/i.test(body)) {
    return (
      <RichTextContent
        html={body}
        className="text-sm text-foreground/85 prose-p:my-1 prose-p:text-sm prose-li:text-sm"
      />
    );
  }
  return <p className="whitespace-pre-wrap text-sm text-foreground/85">{body}</p>;
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
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

type LeadActivityTimelineProps = {
  leadId: string;
  activities: LeadActivity[];
  onLogNote: () => void;
  onLogEmail: () => void;
  onLogCall: () => void;
  onActivityUpdated?: () => Promise<void> | void;
  className?: string;
};

export function LeadActivityTimeline({
  leadId,
  activities,
  onLogNote,
  onLogEmail,
  onLogCall,
  onActivityUpdated,
  className,
}: LeadActivityTimelineProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  /** id → true means expanded; default is collapsed */
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.leadWrite);

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

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex flex-col gap-2.5 border-b border-white/40 pb-3 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={filter === f.key ? 'default' : 'ghost'}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Input
            className="ml-auto h-8 w-full max-w-[14rem] sm:w-[14rem]"
            placeholder="Search activity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
          <Can anyOf={CAP.leadWrite}>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="secondary" className="h-7" onClick={onLogNote}>
                <NotebookPen className="size-3.5" />
                Create Note
              </Button>
              <Button type="button" size="sm" variant="secondary" className="h-7" onClick={onLogEmail}>
                <Mail className="size-3.5" />
                Create Email
              </Button>
              <Button type="button" size="sm" variant="secondary" className="h-7" onClick={onLogCall}>
                <Phone className="size-3.5" />
                Create Call
              </Button>
            </div>
          </Can>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={activities.length === 0 ? 'No activity yet' : 'No matching activity'}
            description={
              activities.length === 0
                ? 'Log a note, email, or call to start the timeline.'
                : 'Try another filter or clear your search.'
            }
            action={
              activities.length === 0 && canWrite ? (
                <Button type="button" onClick={onLogNote}>
                  <NotebookPen className="size-4" />
                  Create Note
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="sticky top-0 z-10 mb-2 bg-transparent py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {group.label}
                </div>
                <ol className="relative ml-2.5 space-y-0 border-l border-primary/20">
                  {group.items.map((a) => {
                    const Icon = activityIcon(a.type);
                    const expanded = isExpanded(a.id);
                    const editing = editingId === a.id;
                    const editable = isInlineEditable(a.type) && canWrite;
                    const docs = (a.documents ?? []).filter(
                      (d) => !d.mimeType.startsWith('image/') || !a.body.includes(d.id),
                    );
                    const preview = stripHtml(a.body) || humanizeActivityType(a.type);
                    return (
                      <li key={a.id} className="relative pb-3 pl-5 last:pb-0">
                        <span className="absolute -left-[11px] top-1.5 flex size-5 items-center justify-center rounded-full border border-primary/25 bg-card text-primary shadow-sm">
                          <Icon className="size-3" />
                        </span>
                        <div className="overflow-hidden rounded-xl border transition-colors hover:border-primary/20 glass-row">
                          <div className="flex w-full items-start gap-1 px-2.5 py-2">
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 text-muted-foreground"
                              onClick={() => toggleCard(a.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? 'Collapse' : 'Expand'}
                            >
                              {expanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => toggleCard(a.id)}
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium">{activityTitle(a)}</span>
                                <time
                                  className="shrink-0 text-xs text-muted-foreground"
                                  dateTime={a.createdAt}
                                  title={formatDateTime(a.createdAt)}
                                >
                                  {formatDateTime(a.createdAt)}
                                </time>
                              </div>
                              {!expanded ? (
                                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                  {preview}
                                </p>
                              ) : null}
                            </button>
                            {editable && !editing ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label="Edit"
                                title="Edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEdit(a);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                          {expanded ? (
                            <div className="space-y-2 border-t border-white/40 px-2.5 py-2 pl-8 dark:border-white/10">
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
                                      'w-full rounded-lg text-left transition-colors',
                                      editable && 'cursor-text hover:bg-primary/[0.03]',
                                    )}
                                    onClick={() => {
                                      if (editable) startEdit(a);
                                    }}
                                    title={editable ? 'Click to edit' : undefined}
                                  >
                                    <ActivityBodyView body={a.body} />
                                  </button>
                                  {docs.length > 0 ? (
                                    <ul className="flex flex-wrap gap-1.5">
                                      {docs.map((doc) => (
                                        <li key={doc.id}>
                                          <a
                                            href={doc.contentUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-primary glass-row hover:underline"
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
          </div>
        )}
      </div>
    </div>
  );
}
