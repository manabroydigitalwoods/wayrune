import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageSquare,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, EmptyState, StatusBadge, formatDateTime } from '@travel/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type TimelineEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: string;
  metadataJson?: Record<string, unknown> | null;
  actor?: { id: string; fullName?: string | null; email?: string | null } | null;
};

function humanizeStatus(value: unknown) {
  if (typeof value !== 'string' || !value) return '—';
  return value.replace(/_/g, ' ');
}

function eventIcon(action: string) {
  if (action.includes('status')) return RefreshCw;
  if (action.includes('payment') || action.includes('invoice')) return Wallet;
  if (action.includes('booking')) return ClipboardList;
  if (action.includes('quote') || action.includes('quotation')) return FileText;
  if (action.includes('feedback')) return MessageSquare;
  return CheckCircle2;
}

function eventTitle(event: TimelineEvent) {
  const who = event.actor?.fullName || event.actor?.email || 'Someone';
  const meta = event.metadataJson || {};
  switch (event.action) {
    case 'trip.status_change': {
      const from = humanizeStatus(meta.fromStatus);
      const to = humanizeStatus(meta.toStatus ?? meta.status);
      if (meta.fromStatus) return `${who} changed status ${from} → ${to}`;
      return `${who} set status to ${to}`;
    }
    case 'trip.create':
      return `${who} created this trip`;
    case 'trip.feedback':
      return `${who} recorded feedback (score ${meta.score ?? '—'})`;
    case 'booking.create':
      return `${who} added booking${meta.title ? `: ${meta.title}` : ''}`;
    case 'booking.update':
      return `${who} updated a booking${meta.status ? ` → ${humanizeStatus(meta.status)}` : ''}`;
    case 'payment.create':
      return `${who} scheduled a ${humanizeStatus(meta.direction) || ''} payment`.replace(/\s+/g, ' ').trim();
    case 'payment.paid':
      return `${who} marked a payment as paid`;
    case 'payment.unmark':
      return `${who} unmarked a payment`;
    case 'payment.cancel':
      return `${who} cancelled a payment`;
    case 'payment.update':
      return `${who} updated a payment`;
    case 'supplier_invoice.create':
      return `${who} added a supplier invoice`;
    case 'supplier_invoice.update':
      return `${who} updated a supplier invoice`;
    case 'quotation.create':
      return `${who} created a quotation`;
    case 'quotation_version.create':
    case 'quotation.version_create':
      return `${who} saved a quote version`;
    case 'quotation.accept':
    case 'quotation_version.accept':
    case 'quote.accept':
      return `${who} accepted a quote`;
    case 'quotation.send':
    case 'quotation_version.send':
    case 'quote.send':
      return `${who} sent a quote`;
    case 'quote.request_approval':
      return `${who} requested quote approval`;
    case 'quote.approve':
      return `${who} approved a quote`;
    default:
      return `${who} · ${event.action.replace(/[._]/g, ' ')}`;
  }
}

function eventDetail(event: TimelineEvent) {
  const meta = event.metadataJson || {};
  if (event.action === 'trip.status_change' && meta.reason === 'readiness_complete') {
    return 'Triggered by readiness checklist';
  }
  if (event.action === 'trip.status_change' && meta.reason === 'quote_accepted') {
    return 'Triggered by quote acceptance';
  }
  if (event.action === 'trip.feedback' && typeof meta.note === 'string' && meta.note) {
    return meta.note;
  }
  if (typeof meta.label === 'string') return meta.label;
  if (typeof meta.invoiceNumber === 'string') return meta.invoiceNumber;
  return null;
}

export function TripTimeline({ tripId }: { tripId: string }) {
  const [items, setItems] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: TimelineEvent[] }>(`/trips/${tripId}/timeline`);
      setItems(res.items || []);
    } catch (e) {
      reportError(e, 'Could not load timeline');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="No trip events yet"
        description="Status changes, quote accepts, bookings, and payments will appear here."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/60">
          {items.map((event) => {
            const Icon = eventIcon(event.action);
            const detail = eventDetail(event);
            const meta = event.metadataJson || {};
            return (
              <li key={event.id} className="flex gap-3 px-4 py-3.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{eventTitle(event)}</div>
                  {detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time dateTime={event.createdAt}>
                      {formatDateTime(event.createdAt)}
                    </time>
                    {event.action === 'trip.status_change' ? (
                      <StatusBadge
                        value={String(meta.toStatus ?? meta.status ?? '')}
                        showIcon={false}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
