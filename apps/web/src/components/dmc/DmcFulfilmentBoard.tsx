import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  StatusBadge,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type SrItem = {
  id: string;
  status: string;
  productRef?: string | null;
  quantity: number | string;
  agreedAmount?: number | string | null;
  currency: string;
  selected: boolean;
};

type ServiceRequest = {
  id: string;
  title: string;
  serviceType: string;
  status: string;
  agreedAmount?: number | string | null;
  quotedAmount?: number | string | null;
  currency?: string;
  supplier?: { id: string; name: string } | null;
  trip?: { id: string; tripNumber: string; title: string } | null;
  items?: SrItem[];
};

type Settlement = {
  id: string;
  amount: number | string;
  commissionAmount?: number | string;
  currency: string;
  status: string;
  counterpartyOrgId: string;
  counterpartyOrg?: { id: string; name: string; kind: string } | null;
  serviceRequest?: { id: string; title: string; status: string } | null;
};

/**
 * Thin DMC ops surface: multi-SR fulfilment to local suppliers + settlement rollup.
 * Reuses Agency commerce APIs — no parallel trip model.
 */
export function DmcFulfilmentBoard() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const load = useCallback(async () => {
    try {
      const [srs, settles] = await Promise.all([
        api<ServiceRequest[]>('/commerce/service-requests?side=buyer'),
        api<Settlement[]>('/commerce/settlements'),
      ]);
      setRequests(srs);
      setSettlements(settles);
    } catch (e) {
      reportError(e, 'Could not load DMC fulfilment');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setSrStatus(id: string, status: string) {
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

  const openSettled = settlements
    .filter((s) => s.status === 'open')
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Local supplier fulfilment</h3>
              <p className="text-xs text-muted-foreground">
                Multi-service requests to hotels, transport, and activities — confirm items
                offline.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
          {requests.length ? (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="space-y-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{r.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {r.serviceType}
                        {r.supplier ? ` · ${r.supplier.name}` : ''}
                        {r.trip ? ` · ${r.trip.tripNumber}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={r.status} />
                      {r.status === 'sent' || r.status === 'held' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setSrStatus(r.id, 'confirmed')}
                        >
                          Confirm SR
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {r.items?.length ? (
                    <ul className="space-y-1 border-t border-border/60 pt-2">
                      {r.items.map((it) => (
                        <li
                          key={it.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span>
                            {it.productRef || 'Line'} · qty {Number(it.quantity)}
                            {it.agreedAmount != null
                              ? ` · ${formatCurrency(Number(it.agreedAmount), it.currency)}`
                              : ''}
                            {it.selected ? ' · selected' : ''}
                          </span>
                          <StatusBadge value={it.status} showIcon={false} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No line items yet.</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No buyer service requests. Create trips and book local suppliers to fulfil packages.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h3 className="text-sm font-semibold">Partner settlements</h3>
            <p className="text-xs text-muted-foreground">
              Payables to network counterparts. Open total:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(openSettled, { maximumFractionDigits: 0 })}
              </span>
            </p>
          </div>
          {settlements.length ? (
            <ul className="space-y-2">
              {settlements.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {s.counterpartyOrg?.name || s.counterpartyOrgId}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {s.serviceRequest?.title || 'Settlement'}
                      {s.commissionAmount
                        ? ` · commission ${formatCurrency(Number(s.commissionAmount), s.currency)}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">
                      {formatCurrency(Number(s.amount), s.currency)}
                    </span>
                    <StatusBadge value={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No settlements yet. Record them under Network → Rates & settlements.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
