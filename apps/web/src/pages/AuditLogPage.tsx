import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { EmptyState, PageHeader } from '@wayrune/ui';
import { api } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditRow[]>('/access/audit')
      .then(setAudit)
      .catch(() => setAudit([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        icon={ScrollText}
        title="Audit log"
        subtitle="Membership, role, and access changes across your agency."
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : audit.length === 0 ? (
        <EmptyState
          title="No activity"
          description="Role and membership changes will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {audit.map((row) => {
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
    </div>
  );
}
