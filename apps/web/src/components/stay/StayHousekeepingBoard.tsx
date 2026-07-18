import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type RoomUnit = {
  id: string;
  name: string;
  floor?: string | null;
  status: string;
  roomProduct: { id: string; name: string };
};

type HousekeepingTask = {
  id: string;
  status: string;
  priority: string;
  roomUnit?: { id: string; name: string } | null;
  assignedUserId?: string | null;
  dueAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  inspectedAt?: string | null;
  createdAt?: string;
};

function fmtStamp(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

const STATUSES = [
  { id: 'vacant_clean', label: 'Clean' },
  { id: 'vacant_dirty', label: 'Dirty' },
  { id: 'occupied', label: 'Occupied' },
  { id: 'ooo', label: 'OOO' },
] as const;

export function StayHousekeepingBoard({ assetId }: { assetId: string }) {
  const [units, setUnits] = useState<RoomUnit[]>([]);
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [creatingTaskFor, setCreatingTaskFor] = useState<string | null>(null);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.partnerInventoryWrite);
  const canOps = hasAny(CAP.opsWrite);

  const load = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([
        api<RoomUnit[]>(`/stay/assets/${assetId}/units`),
        api<HousekeepingTask[]>(`/commerce/assets/${assetId}/housekeeping-tasks`),
      ]);
      setUnits(u);
      setTasks(t);
    } catch (e) {
      reportError(e, 'Could not load units');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (filter ? units.filter((u) => u.status === filter) : units),
    [units, filter],
  );

  const byStatus = useMemo(() => {
    const map: Record<string, RoomUnit[]> = {
      vacant_clean: [],
      vacant_dirty: [],
      occupied: [],
      ooo: [],
    };
    for (const u of units) {
      (map[u.status] || (map[u.status] = [])).push(u);
    }
    return map;
  }, [units]);

  async function setStatus(id: string, status: string) {
    try {
      await api(`/stay/units/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toastSuccess('Unit status updated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update status');
    }
  }

  async function createTask(roomUnitId: string) {
    setCreatingTaskFor(roomUnitId);
    try {
      await api('/commerce/housekeeping-tasks', {
        method: 'POST',
        body: JSON.stringify({ assetId, roomUnitId, priority: 'normal' }),
      });
      toastSuccess('Housekeeping task created');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create task');
    } finally {
      setCreatingTaskFor(null);
    }
  }

  async function setTaskStatus(taskId: string, status: string) {
    try {
      await api(`/commerce/housekeeping-tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toastSuccess(
        status === 'inspected'
          ? 'Task marked inspected'
          : status === 'ready'
            ? 'Task marked ready'
            : 'Task updated',
      );
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update task');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={filter === '' ? 'default' : 'outline'}
          onClick={() => setFilter('')}
        >
          All ({units.length})
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant={filter === s.id ? 'default' : 'outline'}
            onClick={() => setFilter(s.id)}
          >
            {s.label} ({byStatus[s.id]?.length || 0})
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(filter
          ? STATUSES.filter((s) => s.id === filter)
          : STATUSES
        ).map((col) => (
          <Card key={col.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <strong className="text-sm">{col.label}</strong>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {(filter ? filtered : byStatus[col.id] || []).length}
                </span>
              </div>
              <ul className="space-y-2">
                {(filter ? filtered : byStatus[col.id] || []).map((u) => (
                  <li
                    key={u.id}
                    className="rounded-lg border border-border/60 px-2.5 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {u.name}
                      {u.floor ? ` · Fl ${u.floor}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.roomProduct.name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {canOps && u.status === 'vacant_dirty' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-[10px]"
                          disabled={creatingTaskFor === u.id}
                          onClick={() => void createTask(u.id)}
                        >
                          {creatingTaskFor === u.id ? 'Creating…' : 'Create task'}
                        </Button>
                      ) : null}
                      {canWrite
                        ? STATUSES.filter((s) => s.id !== u.status).map((s) => (
                            <Button
                              key={s.id}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => void setStatus(u.id, s.id)}
                            >
                              {s.label}
                            </Button>
                          ))
                        : null}
                    </div>
                  </li>
                ))}
                {(filter ? filtered : byStatus[col.id] || []).length === 0 ? (
                  <li className="text-xs text-muted-foreground">None</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add room units under Rooms & inventory to use the housekeeping board.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-5">
          <strong className="text-sm">Housekeeping tasks</strong>
          {tasks.length ? (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const due = fmtStamp(t.dueAt);
                const started = fmtStamp(t.startedAt);
                const completed = fmtStamp(t.completedAt);
                const inspected = fmtStamp(t.inspectedAt);
                const canInspect =
                  t.status !== 'ready' && t.status !== 'inspected' && t.status !== 'blocked';
                return (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {t.roomUnit?.name ? `Unit ${t.roomUnit.name}` : 'Unit'}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        <StatusBadge value={t.status} showIcon={false} />
                        <StatusBadge value={t.priority} showIcon={false} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t.assignedUserId ? `Assigned: ${t.assignedUserId}` : 'Unassigned'}
                        {due ? ` · Due ${due}` : ''}
                      </div>
                      {started || completed || inspected ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {started ? `Started ${started}` : ''}
                          {inspected ? `${started ? ' · ' : ''}Inspected ${inspected}` : ''}
                          {completed ? `${started || inspected ? ' · ' : ''}Completed ${completed}` : ''}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {canOps && canInspect ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setTaskStatus(t.id, 'inspected')}
                        >
                          Inspect
                        </Button>
                      ) : null}
                      {canOps && t.status === 'inspected' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setTaskStatus(t.id, 'ready')}
                        >
                          Mark ready
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No housekeeping tasks yet. Create one from a dirty unit above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
