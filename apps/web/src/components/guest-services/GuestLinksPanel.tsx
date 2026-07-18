import { Fragment, useEffect, useState } from 'react';
import {
  ChevronDown,
  Copy,
  ExternalLink,
  FileDown,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Combobox,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';
import { downloadAllLocationQrPdf, downloadLocationQrPdf } from './guestQrPdf';

export type GsLocation = {
  id: string;
  label: string;
  locationType: string;
  publicToken: string;
  publicPath: string;
  status: string;
  ordersToday: number;
  salesToday?: number;
  lastScannedAt?: string | null;
  lastActivityAt?: string | null;
  openSession?: {
    id: string;
    status: string;
    guestCount: number;
  } | null;
};

const LOCATION_TYPES = [
  { value: 'RESTAURANT_TABLE', label: 'Restaurant table' },
  { value: 'HOTEL_ROOM', label: 'Hotel room' },
  { value: 'HOMESTAY_ROOM', label: 'Homestay room' },
  { value: 'FARMSTAY_UNIT', label: 'Farmstay unit' },
  { value: 'DINING_ZONE', label: 'Dining zone' },
  { value: 'EVENT_AREA', label: 'Event area' },
];

function relativeActivity(iso?: string | null): string {
  if (!iso) return 'No activity yet';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleString();
}

function LocationActionsMenu({
  l,
  isRestaurant,
  open,
  onToggleQr,
  onCopy,
  onOpenLink,
  onPdf,
  onReset,
  onOpenTable,
}: {
  l: GsLocation;
  isRestaurant: boolean;
  open: boolean;
  onToggleQr: () => void;
  onCopy: () => void;
  onOpenLink: () => void;
  onPdf: () => void;
  onReset: () => void;
  onOpenTable: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.guestServicesWrite);
  const canOpenTable =
    isRestaurant &&
    (l.locationType === 'RESTAURANT_TABLE' || l.locationType === 'DINING_ZONE') &&
    !open;

  return (
    <div className="relative inline-flex items-center gap-1">
      <Button type="button" size="sm" variant="outline" onClick={onToggleQr}>
        <QrCode className="mr-1 h-3.5 w-3.5" />
        QR
      </Button>
      {canWrite && canOpenTable ? (
        <Button type="button" size="sm" onClick={onOpenTable}>
          Open table
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
      >
        <MoreHorizontal className="h-4 w-4" />
        <ChevronDown className="ml-0.5 h-3 w-3" />
      </Button>
      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 border border-border bg-background py-1 text-left shadow-lg">
            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              QR
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onToggleQr();
              }}
            >
              <QrCode className="h-3.5 w-3.5" /> View QR
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onPdf();
              }}
            >
              <FileDown className="h-3.5 w-3.5" /> Download / Print
            </button>
            <p className="mt-1 border-t border-border px-3 py-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Link
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onCopy();
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onOpenLink();
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </button>
            {canWrite && canOpenTable ? (
              <>
                <p className="mt-1 border-t border-border px-3 py-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Session
                </p>
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-sm font-semibold hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenTable();
                  }}
                >
                  Open table
                </button>
              </>
            ) : null}
            {canWrite ? (
              <>
                <p className="mt-1 border-t border-border px-3 py-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  More
                </p>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-900 hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onReset();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reset QR
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function GuestLinksPanel({
  assetId,
  isRestaurant,
  locations,
  sessions,
  businessName,
  onChanged,
}: {
  assetId: string;
  isRestaurant: boolean;
  locations: GsLocation[];
  sessions: Array<{
    id: string;
    serviceLocation: { id: string; label: string };
    guestCount: number;
  }>;
  businessName: string;
  onChanged: () => Promise<void>;
}) {
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.guestServicesWrite);
  const [label, setLabel] = useState('');
  const [locType, setLocType] = useState(
    isRestaurant ? 'RESTAURANT_TABLE' : 'HOTEL_ROOM',
  );
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const next: Record<string, string> = {};
      for (const l of locations) {
        const url = `${window.location.origin}${l.publicPath}`;
        next[l.id] = await QRCode.toDataURL(url, {
          width: 180,
          margin: 1,
          color: { dark: '#1a120c', light: '#faf6ef' },
        });
      }
      if (!cancelled) setQrPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [locations]);

  async function addLocation() {
    if (!label.trim()) {
      toastError('Label required');
      return;
    }
    try {
      await api('/guest-services/locations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          locationType: locType,
          label: label.trim(),
        }),
      });
      toastSuccess('Location added');
      setLabel('');
      setAdding(false);
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function regenerate(id: string) {
    try {
      await api(`/guest-services/locations/${id}/regenerate-token`, {
        method: 'POST',
      });
      toastSuccess('Link regenerated — reprint QR');
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Regenerate failed');
    }
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toastSuccess('Guest link copied');
  }

  async function openSession(serviceLocationId: string) {
    try {
      await api('/guest-services/sessions/open', {
        method: 'POST',
        body: JSON.stringify({ serviceLocationId, guestCount: 2 }),
      });
      toastSuccess('Table open for ordering');
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not open session');
    }
  }

  async function requestBill(sessionId: string) {
    try {
      await api(`/guest-services/sessions/${sessionId}/request-bill`, {
        method: 'POST',
      });
      toastSuccess('Bill requested');
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Bill request failed');
    }
  }

  async function downloadCheck(sessionId: string) {
    try {
      const res = await api<{ downloadUrl?: string; documentId: string }>(
        `/guest-services/sessions/${sessionId}/guest-check`,
        { method: 'POST' },
      );
      if (res.downloadUrl) window.open(res.downloadUrl, '_blank');
      else toastSuccess(`Guest check created`);
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Check failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
          {locations.length ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void downloadAllLocationQrPdf(businessName, locations).catch((e) =>
                  toastError(e instanceof Error ? e.message : 'PDF failed'),
                )
              }
            >
              <FileDown className="mr-1 h-3.5 w-3.5" /> Print all
            </Button>
          ) : null}
          {canWrite ? (
            <Button type="button" size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" /> Add location
            </Button>
          ) : null}
      </div>

      {isRestaurant && sessions.length ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Open covers
            </span>
            {sessions.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1"
              >
                <span className="font-semibold">{s.serviceLocation.label}</span>
                <span className="text-xs text-muted-foreground">{s.guestCount} pax</span>
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      className="text-xs font-bold underline"
                      onClick={() => void requestBill(s.id)}
                    >
                      Bill
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold underline"
                      onClick={() => void downloadCheck(s.id)}
                    >
                      PDF
                    </button>
                  </>
                ) : null}
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {adding ? (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-2 p-4">
            <FormField label="Label" className="mb-0 min-w-[140px] flex-1">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={isRestaurant ? 'Table 1' : 'Room 101'}
              />
            </FormField>
            <FormField label="Type" className="mb-0 min-w-[160px]">
              <Combobox
                options={LOCATION_TYPES}
                value={locType}
                onChange={setLocType}
                placeholder="Type"
              />
            </FormField>
            <Button type="button" size="sm" onClick={() => void addLocation()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Location</th>
              <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Today</th>
              <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Activity</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {locations.map((l) => {
              const open = Boolean(l.openSession);
              const expanded = expandedId === l.id;
              const guests = l.openSession?.guestCount;
              return (
                <Fragment key={l.id}>
                  <tr className="bg-background">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setExpandedId(expanded ? null : l.id)}
                      >
                        <div className="font-semibold">{l.label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {l.locationType.replace(/_/g, ' ').toLowerCase()}
                        </div>
                      </button>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {open ? (
                          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground">
                            Open
                          </span>
                        ) : (
                          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                            Free
                          </span>
                        )}
                        {guests != null ? (
                          <span className="text-xs font-semibold">{guests} guests</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm font-bold tabular-nums">
                        {formatCurrency(l.salesToday || 0, 'INR')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {l.ordersToday} order{l.ordersToday === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                      <div className="text-xs font-semibold text-foreground">
                        Last activity
                      </div>
                      <div className="text-[11px]">{relativeActivity(l.lastActivityAt)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge value={l.status} showIcon={false} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <LocationActionsMenu
                        l={l}
                        isRestaurant={isRestaurant}
                        open={open}
                        onToggleQr={() => setExpandedId(expanded ? null : l.id)}
                        onCopy={() => void copyPath(l.publicPath)}
                        onOpenLink={() => window.open(l.publicPath, '_blank')}
                        onPdf={() =>
                          void downloadLocationQrPdf({
                            businessName,
                            label: l.label,
                            publicPath: l.publicPath,
                          }).catch((e) =>
                            toastError(e instanceof Error ? e.message : 'PDF failed'),
                          )
                        }
                        onReset={() => void regenerate(l.id)}
                        onOpenTable={() => void openSession(l.id)}
                      />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-3 py-4">
                        <div className="flex flex-wrap items-center gap-4">
                          {qrPreviews[l.id] ? (
                            <img
                              src={qrPreviews[l.id]}
                              alt={`QR ${l.label}`}
                              className="h-28 w-28 rounded-md border border-border bg-card p-1"
                            />
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
                              <QrCode className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">{l.label}</p>
                            <p className="mt-1 break-all">
                              {window.location.origin}
                              {l.publicPath}
                            </p>
                            <p className="mt-2">
                              Guests scan this QR to open Guest Companion for this location.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!locations.length ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No locations yet — add a table or room to create a guest link.
          </p>
        ) : null}
        </div>
      </Card>
    </div>
  );
}
