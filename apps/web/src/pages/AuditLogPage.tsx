import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScrollText, Search, X } from 'lucide-react';
import { EmptyState, Input, ListPageSkeleton, cn, usePageChrome } from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { parseAuditQueryState, patchAuditQueryParams } from '../lib/queue';
import { QUEUE_PAGE_SEARCH_CLASS, QueuePageChrome } from '../components/queue';

type AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  metadataJson?: {
    name?: string;
    roleName?: string;
    diff?: { added: string[]; removed: string[] };
  } | null;
};

const ACTION_LABEL: Record<string, string> = {
  'membership.role.assign': 'Assigned role',
  'membership.role.remove': 'Removed role',
  'membership.scope.set': 'Updated property access',
};

export function AuditLogPage() {
  useDocumentTitle('Audit log');
  usePageChrome({
    title: 'Audit log',
    subtitle: 'Membership, role, and access changes across your agency.',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseAuditQueryState(searchParams), [searchParams]);
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  function applyQuery(patch: Parameters<typeof patchAuditQueryParams>[1]) {
    setSearchParams(patchAuditQueryParams(searchParams, patch), { replace: true });
  }

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchDraft.trim();
      if ((query.q ?? '') === next) return;
      applyQuery({ q: next || undefined });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce draft only
  }, [searchDraft]);

  useEffect(() => {
    api<AuditRow[]>('/access/audit')
      .then(setAudit)
      .catch(() => setAudit([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredAudit = useMemo(() => {
    const q = query.q?.trim().toLowerCase();
    if (!q) return audit;
    return audit.filter((row) => {
      const meta = row.metadataJson ?? {};
      const haystack = [
        ACTION_LABEL[row.action] ?? row.action,
        meta.name,
        meta.roleName,
        ...(meta.diff?.added ?? []),
        ...(meta.diff?.removed ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [audit, query.q]);

  const queueToolbar = (
    <div className="relative min-w-[12rem] max-w-sm shrink-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[0.875em] -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder="Search audit log…"
        className={cn(QUEUE_PAGE_SEARCH_CLASS, searchDraft.trim() && 'pr-8')}
        aria-label="Search audit log"
      />
      {searchDraft.trim() ? (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
          onClick={() => {
            setSearchDraft('');
            applyQuery({ q: '' });
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  return (
    <QueuePageChrome toolbar={audit.length ? queueToolbar : undefined}>
      {loading ? (
        <ListPageSkeleton />
      ) : audit.length === 0 ? (
        <EmptyState
          title="No activity"
          description="Role and membership changes will appear here."
        />
      ) : filteredAudit.length === 0 ? (
        <EmptyState
          title="No matching activity"
          description="Try clearing search."
        />
      ) : (
        <ul className="space-y-2">
          {filteredAudit.map((row) => {
            const meta = row.metadataJson ?? {};
            const diff = meta.diff;
            return (
              <li key={row.id} className="rounded-xl border px-4 py-3 text-sm glass-well">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {ACTION_LABEL[row.action] ?? row.action}
                    {meta.name || meta.roleName ? (
                      <span className="text-muted-foreground"> · {meta.name ?? meta.roleName}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
                {diff && (diff.added.length || diff.removed.length) ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {diff.added.map((key) => (
                      <span
                        key={`a-${key}`}
                        className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-300"
                      >
                        +{key}
                      </span>
                    ))}
                    {diff.removed.map((key) => (
                      <span
                        key={`r-${key}`}
                        className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-600 dark:text-red-300"
                      >
                        −{key}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </QueuePageChrome>
  );
}
