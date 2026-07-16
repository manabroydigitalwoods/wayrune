import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  StatusBadge,
  toastError,
  toastSuccess,
  formatCurrency,
} from '@travel/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type ServiceRequest = {
  id: string;
  title: string;
  serviceType: string;
  status: string;
  quotedAmount?: number | string | null;
  agreedAmount?: number | string | null;
  currency?: string;
};

export function ServiceRequestsPanel() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api<ServiceRequest[]>('/commerce/service-requests?side=all');
      setRows(data);
    } catch (e) {
      reportError(e, 'Could not load service requests');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    try {
      await api(`/commerce/service-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toastSuccess(`Marked ${status}`);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Service requests</h3>
            <p className="text-xs text-muted-foreground">
              Shared commerce spine across agency and partner bookings.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
              >
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.serviceType}
                    {r.quotedAmount != null
                      ? ` · quoted ${formatCurrency(r.quotedAmount, { maximumFractionDigits: 0 })}`
                      : ''}
                    {r.agreedAmount != null
                      ? ` · agreed ${formatCurrency(r.agreedAmount, { maximumFractionDigits: 0 })}`
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge value={r.status} />
                  {r.status === 'sent' || r.status === 'held' ? (
                    <Button size="sm" variant="secondary" onClick={() => void setStatus(r.id, 'confirmed')}>
                      Confirm
                    </Button>
                  ) : null}
                  {r.status !== 'cancelled' && r.status !== 'confirmed' ? (
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'cancelled')}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No service requests yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
