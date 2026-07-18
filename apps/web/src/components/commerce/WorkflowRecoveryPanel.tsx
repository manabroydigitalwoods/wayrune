import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardContent, StatusBadge, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type WorkflowRecoveryItem = {
  id: string;
  workflowType: string;
  failedStep: string;
  lastError?: string | null;
  retryEligible: boolean;
  status: string;
  createdAt: string;
};

/** Independent OS Phase 1 — durable log of workflow steps needing retry/compensation. */
export function WorkflowRecoveryPanel() {
  const [rows, setRows] = useState<WorkflowRecoveryItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<WorkflowRecoveryItem[]>('/commerce/workflow-recovery');
      setRows(data);
    } catch (e) {
      reportError(e, 'Could not load recovery items');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(id: string) {
    setBusyId(id);
    try {
      await api(`/commerce/workflow-recovery/${id}/retry`, { method: 'POST' });
      toastSuccess('Retried and resolved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setBusyId(null);
    }
  }

  async function compensate(id: string) {
    setBusyId(id);
    try {
      await api(`/commerce/workflow-recovery/${id}/compensate`, { method: 'POST' });
      toastSuccess('Compensated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Compensation failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!rows.length) return null;

  return (
    <Card id="workflow-recovery">
      <CardContent className="space-y-3 p-5">
        <div>
          <h3 className="text-sm font-semibold">Workflow recovery</h3>
          <p className="text-xs text-muted-foreground">
            Steps that failed mid-execution — retry once fixed, or compensate to unwind holds.
          </p>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {r.workflowType} · {r.failedStep}
                </div>
                {r.lastError ? (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.lastError}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge value={r.status} showIcon={false} />
                {r.retryEligible ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => void retry(r.id)}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => void compensate(r.id)}
                >
                  Compensate
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
