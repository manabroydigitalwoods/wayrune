import { useCallback, useEffect, useState } from 'react';
import { DoorOpen, LogIn, LogOut, Users } from 'lucide-react';
import { Button, Card, CardContent, Skeleton, StatusBadge, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type FrontDeskRow = {
  id: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  roomUnit?: { name?: string } | null;
  [key: string]: unknown;
};

type FrontDeskResponse = {
  arrivals?: FrontDeskRow[];
  departures?: FrontDeskRow[];
  inHouse?: FrontDeskRow[];
  date?: string;
  [key: string]: unknown;
};

function rowLabel(row: FrontDeskRow) {
  const parts = [
    row.guestName || 'Guest',
    row.roomUnit?.name ? `Room ${row.roomUnit.name}` : null,
    row.checkIn ? new Date(row.checkIn).toLocaleDateString() : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function RowList({
  rows,
  emptyLabel,
  onNoShow,
}: {
  rows: FrontDeskRow[];
  emptyLabel: string;
  onNoShow?: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
        >
          <span className="min-w-0 flex-1">{rowLabel(row)}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {row.status ? <StatusBadge value={row.status} showIcon={false} /> : null}
            {onNoShow ? (
              <Button size="sm" variant="outline" onClick={() => onNoShow(row.id)}>
                No-show
              </Button>
            ) : null}
          </div>
        </li>
      ))}
      {!rows.length ? <li className="text-sm text-muted-foreground">{emptyLabel}</li> : null}
    </ul>
  );
}

export function StayFrontDeskPanel({ assetId }: { assetId: string }) {
  const [data, setData] = useState<FrontDeskResponse | null>(null);
  const { hasAny } = usePermissions();
  const canNoShow = hasAny(CAP.reservationCancel);

  const load = useCallback(async () => {
    try {
      const res = await api<FrontDeskResponse>(`/commerce/assets/${assetId}/front-desk`);
      setData(res);
    } catch (e) {
      reportError(e, 'Could not load front desk');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markNoShow(id: string) {
    try {
      await api(`/commerce/stay-reservations/${id}/no-show`, { method: 'POST' });
      toastSuccess('Marked no-show');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark no-show');
    }
  }

  if (!data) {
    return (
      <div className="space-y-2" role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const hasKnownShape = Array.isArray(data.arrivals) || Array.isArray(data.departures) || Array.isArray(data.inHouse);

  if (!hasKnownShape) {
    return (
      <Card>
        <CardContent className="pt-4">
          <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <LogIn className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Arrivals today</h3>
          </div>
          <RowList
            rows={data.arrivals || []}
            emptyLabel="No arrivals today."
            onNoShow={canNoShow ? (id) => void markNoShow(id) : undefined}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <LogOut className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Departures today</h3>
          </div>
          <RowList rows={data.departures || []} emptyLabel="No departures today." />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">In-house</h3>
          </div>
          <RowList rows={data.inHouse || []} emptyLabel="No guests in-house." />
        </CardContent>
      </Card>
      {!data.arrivals?.length && !data.departures?.length && !data.inHouse?.length ? (
        <div className="lg:col-span-3 flex items-center gap-2 text-sm text-muted-foreground">
          <DoorOpen className="size-4" />
          Front desk is quiet — no arrivals, departures, or in-house guests today.
        </div>
      ) : null}
    </div>
  );
}
