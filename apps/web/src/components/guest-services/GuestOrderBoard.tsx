import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, formatCurrency, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

export type GsOrder = {
  id: string;
  status: string;
  total: number | string;
  currency: string;
  placedAt: string;
  customerNote?: string | null;
  items: Array<{
    nameSnapshot: string;
    quantity: number;
    modifiersSnapshotJson?: Array<{ name: string; priceDelta: number }> | null;
  }>;
  serviceLocation?: { label: string; locationType: string };
  tableSession?: { id: string; status: string; guestCount?: number | null } | null;
};

const SERVICE_PING =
  /water|napkin|tissue|cutlery|spoon|fork|waiter|bill|cleaning|towel|pillow/i;
const QUESTION_PING =
  /recommend|birthday|manager|complaint|assistance|talk|staff|help|question/i;

function minutesAgo(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Single primary CTA — status-driven kitchen flow. */
function nextAction(status: string): { label: string; status: string } | null {
  if (status === 'placed') return { label: 'Accept → Preparing', status: 'preparing' };
  if (status === 'accepted') return { label: 'Start preparing', status: 'preparing' };
  if (status === 'preparing') return { label: 'Mark ready', status: 'ready' };
  if (status === 'ready' || status === 'out_for_delivery') {
    return { label: 'Delivered to table', status: 'served' };
  }
  return null;
}

function laneOf(status: string): 'new' | 'progress' | 'ready' {
  if (status === 'placed') return 'new';
  if (status === 'ready' || status === 'out_for_delivery') return 'ready';
  return 'progress';
}

function progressIdx(status: string): number {
  if (status === 'placed') return 0;
  if (status === 'accepted') return 1;
  if (status === 'preparing') return 2;
  if (status === 'ready' || status === 'out_for_delivery') return 3;
  if (status === 'served' || status === 'completed') return 4;
  return 1;
}

export function GuestOrderBoard({
  assetId,
  orders,
  onChanged,
}: {
  assetId: string;
  orders: GsOrder[];
  onChanged: () => Promise<void>;
}) {
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.guestServicesWrite);
  const [pings, setPings] = useState<{
    waiterRequests: Array<{ id: string; title: string; serviceLocation?: { label: string } }>;
    billSessions: Array<{ id: string; serviceLocation?: { label: string } }>;
    feedbackCount: number;
  } | null>(null);

  const loadPings = useCallback(async () => {
    try {
      const res = await api<NonNullable<typeof pings>>(
        `/guest-services/assets/${assetId}/companion-pings`,
      );
      setPings(res);
    } catch {
      /* board still works without pings */
    }
  }, [assetId]);

  useEffect(() => {
    void loadPings();
    const t = window.setInterval(() => {
      void onChanged();
      void loadPings();
    }, 10_000);
    return () => window.clearInterval(t);
  }, [onChanged, assetId, loadPings]);

  const lanes = useMemo(() => {
    const newL: GsOrder[] = [];
    const progress: GsOrder[] = [];
    const ready: GsOrder[] = [];
    for (const o of orders) {
      const lane = laneOf(o.status);
      if (lane === 'new') newL.push(o);
      else if (lane === 'ready') ready.push(o);
      else progress.push(o);
    }
    return { newL, progress, ready };
  }, [orders]);

  const pingGroups = useMemo(() => {
    const service: Array<{
      id: string;
      label: string;
      kind: 'bill' | 'request';
      sessionId?: string;
    }> = [];
    const questions: Array<{ id: string; label: string; kind: 'request' }> = [];
    for (const s of pings?.billSessions || []) {
      service.push({
        id: `bill-${s.id}`,
        label: `Bill · ${s.serviceLocation?.label || 'table'}`,
        kind: 'bill',
        sessionId: s.id,
      });
    }
    for (const r of pings?.waiterRequests || []) {
      const title = r.title || 'Assistance';
      const label = `${title} · ${r.serviceLocation?.label || 'location'}`;
      if (SERVICE_PING.test(title) && !QUESTION_PING.test(title)) {
        service.push({ id: r.id, label, kind: 'request' });
      } else {
        questions.push({ id: r.id, label, kind: 'request' });
      }
    }
    return { service, questions };
  }, [pings]);

  async function clearPing(p: {
    id: string;
    kind: 'bill' | 'request';
    sessionId?: string;
    label: string;
  }) {
    try {
      if (p.kind === 'bill' && p.sessionId) {
        await api(`/guest-services/sessions/${p.sessionId}/acknowledge-bill`, {
          method: 'POST',
          body: '{}',
        });
        toastSuccess('Bill ping cleared');
      } else {
        await api(`/guest-services/requests/${p.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'done' }),
        });
        toastSuccess('Request done');
      }
      await loadPings();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not clear');
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/guest-services/orders/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      toastSuccess(
        status === 'preparing'
          ? 'Preparing'
          : status === 'ready'
            ? 'Ready'
            : status === 'served'
              ? 'Delivered to table'
              : `Order ${status}`,
      );
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function Ticket({ o }: { o: GsOrder }) {
    const mins = minutesAgo(o.placedAt);
    const urgent = o.status === 'placed' && mins >= 5;
    const next = nextAction(o.status);
    const step = progressIdx(o.status);
    const guests = o.tableSession?.guestCount;
    return (
      <article
        className={`rounded-2xl border border-border p-3 shadow-sm ${
          urgent ? 'border-l-4 border-l-amber-600 bg-amber-50' : 'bg-card'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-bold tracking-tight">
              {o.serviceLocation?.label || 'Location'}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{mins} min</span>
              <span className="font-bold tabular-nums text-foreground">
                {formatCurrency(Number(o.total), o.currency)}
              </span>
              {guests != null ? (
                <span>
                  {guests} guest{guests === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2 flex gap-0.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-sm ${
                i <= step ? 'bg-foreground' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {o.status === 'placed'
            ? 'Incoming'
            : o.status === 'preparing' || o.status === 'accepted'
              ? 'Cooking'
              : o.status === 'ready'
                ? 'Ready'
                : o.status}
        </p>

        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {o.items.map((it, idx) => (
            <li key={idx}>
              <span className="font-semibold">
                {it.quantity}× {it.nameSnapshot}
              </span>
              {(it.modifiersSnapshotJson || []).map((m, mi) => (
                <div key={mi} className="pl-3 text-[11px] text-muted-foreground">
                  {m.name}
                </div>
              ))}
            </li>
          ))}
        </ul>
        {o.customerNote ? (
          <p className="mt-2 text-[11px] italic text-muted-foreground">“{o.customerNote}”</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canWrite && next ? (
            <Button
              size="sm"
              className="min-w-[8rem]"
              onClick={() => void setStatus(o.id, next.status)}
            >
              {next.label}
            </Button>
          ) : null}
          {canWrite && o.status === 'placed' ? (
            <button
              type="button"
              className="text-xs font-semibold text-destructive underline"
              onClick={() => void setStatus(o.id, 'rejected')}
            >
              Reject
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  function Column({
    title,
    hint,
    items,
    tone,
  }: {
    title: string;
    hint: string;
    items: GsOrder[];
    tone: string;
  }) {
    return (
      <section className="min-w-[260px] flex-1">
        <div className={`mb-2 rounded-xl px-3 py-2 text-white ${tone}`}>
          <div className="text-sm font-bold uppercase tracking-[0.12em]">
            {title} · {items.length}
          </div>
          <div className="text-[11px] opacity-85">{hint}</div>
        </div>
        <div className="space-y-2">
          {items.map((o) => (
            <Ticket key={o.id} o={o} />
          ))}
          {!items.length ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void onChanged();
            void loadPings();
          }}
        >
          Refresh
        </Button>
      </div>

      {pings &&
      (pingGroups.service.length ||
        pingGroups.questions.length ||
        pings.feedbackCount > 0) ? (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Service
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pingGroups.service.map((p) =>
                  canWrite ? (
                    <button
                      key={p.id}
                      type="button"
                      title="Mark done / clear"
                      onClick={() => void clearPing(p)}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold transition hover:border-foreground hover:bg-background"
                    >
                      {p.label} · Done
                    </button>
                  ) : (
                    <span
                      key={p.id}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold"
                    >
                      {p.label}
                    </span>
                  ),
                )}
                {!pingGroups.service.length ? (
                  <span className="text-xs text-muted-foreground">Quiet</span>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Questions
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pingGroups.questions.map((p) =>
                  canWrite ? (
                    <button
                      key={p.id}
                      type="button"
                      title="Mark done / clear"
                      onClick={() => void clearPing(p)}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold transition hover:border-foreground hover:bg-background"
                    >
                      {p.label} · Done
                    </button>
                  ) : (
                    <span
                      key={p.id}
                      className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold"
                    >
                      {p.label}
                    </span>
                  ),
                )}
                {pings.feedbackCount > 0 ? (
                  <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold">
                    {pings.feedbackCount} feedback today
                  </span>
                ) : null}
                {!pingGroups.questions.length && !pings.feedbackCount ? (
                  <span className="text-xs text-muted-foreground">Quiet</span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        <Column
          title="Incoming"
          hint="New QR orders"
          items={lanes.newL}
          tone="bg-slate-700"
        />
        <Column
          title="Cooking"
          hint="On the pass"
          items={lanes.progress}
          tone="bg-orange-700"
        />
        <Column
          title="Ready"
          hint="Serve the table"
          items={lanes.ready}
          tone="bg-teal-800"
        />
      </div>
    </div>
  );
}
