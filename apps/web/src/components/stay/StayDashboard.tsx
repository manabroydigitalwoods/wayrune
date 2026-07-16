import { useCallback, useEffect, useState } from 'react';
import { BedDouble, CalendarCheck2, LogIn, LogOut, Inbox, Ban } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  DatePicker,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../../api';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';

type DayCloseResult = {
  id: string;
  businessDate: string;
  postedRoomCharges: number;
  noShowsMarked: number;
  unpaidDeparturesJson?: Array<{ id: string; guestName: string; outstanding?: number }> | null;
  unresolvedArrivalsJson?: Array<{ id: string; guestName: string; status: string }> | null;
  summaryJson?: {
    inHouseCount?: number;
    postedRoomCharges?: number;
    noShowsMarked?: number;
    unresolvedArrivalsCount?: number;
    unpaidDeparturesCount?: number;
  } | null;
};

function isoDate(d: Date) {
  return formatDateInput(d);
}

type DashboardData = {
  occupancyTonight: { occupied: number; capacity: number; percent: number };
  arrivalsNext7d: number;
  departuresNext7d: number;
  pendingInbound: number;
  stopSellCount: number;
  bookingsBySource: {
    agency_inbound: number;
    manual: number;
    walk_in: number;
  };
  occupancyTrend: Array<{ date: string; percent: number }>;
};

export function StayDashboard({ assetId }: { assetId: string | null }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [closingDay, setClosingDay] = useState(false);
  const [businessDate, setBusinessDate] = useState(isoDate(new Date()));
  const [dayCloses, setDayCloses] = useState<DayCloseResult[]>([]);
  const [lastClose, setLastClose] = useState<DayCloseResult | null>(null);

  const load = useCallback(async () => {
    try {
      const q = assetId ? `?assetId=${encodeURIComponent(assetId)}` : '';
      const d = await api<DashboardData>(`/stay/dashboard${q}`);
      setData(d);
      if (assetId) {
        const closes = await api<DayCloseResult[]>(`/stay/assets/${assetId}/day-closes`).catch(
          () => [],
        );
        setDayCloses(closes);
      } else {
        setDayCloses([]);
      }
    } catch (e) {
      reportError(e, 'Could not load dashboard');
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function closeDay() {
    if (!assetId) {
      toastError('Select a property first');
      return;
    }
    setClosingDay(true);
    try {
      const result = await api<DayCloseResult>(`/stay/assets/${assetId}/day-close`, {
        method: 'POST',
        body: JSON.stringify({ businessDate }),
      });
      setLastClose(result);
      const s = result.summaryJson;
      toastSuccess(
        `Day closed · ${s?.postedRoomCharges ?? result.postedRoomCharges ?? 0} room charge(s), ${s?.noShowsMarked ?? result.noShowsMarked ?? 0} no-show(s), ${s?.unpaidDeparturesCount ?? 0} unpaid departure(s), ${s?.unresolvedArrivalsCount ?? 0} unresolved arrival(s)`,
      );
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not close the day');
    } finally {
      setClosingDay(false);
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading today’s ops…</p>;
  }

  const occ = data.occupancyTonight;
  const emptyStock = occ.capacity === 0;
  const sourceTotal =
    data.bookingsBySource.agency_inbound +
    data.bookingsBySource.manual +
    data.bookingsBySource.walk_in;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-end gap-2">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Business date</span>
          <DatePicker
            value={parseDateInput(businessDate)}
            onChange={(d) => setBusinessDate(formatDateInput(d) || isoDate(new Date()))}
            className="w-auto"
          />
        </div>
        <Can anyOf={CAP.partnerInventoryWrite}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!assetId || closingDay}
            onClick={() => void closeDay()}
          >
            <CalendarCheck2 className="size-4" />
            {closingDay ? 'Closing day…' : 'Close day'}
          </Button>
        </Can>
      </div>

      {lastClose ? (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <strong>Last close — {String(lastClose.businessDate).slice(0, 10)}</strong>
            <p className="text-muted-foreground">
              Unpaid departures:{' '}
              {lastClose.summaryJson?.unpaidDeparturesCount ??
                (Array.isArray(lastClose.unpaidDeparturesJson)
                  ? lastClose.unpaidDeparturesJson.length
                  : 0)}
              {' · '}
              Unresolved arrivals:{' '}
              {lastClose.summaryJson?.unresolvedArrivalsCount ??
                (Array.isArray(lastClose.unresolvedArrivalsJson)
                  ? lastClose.unresolvedArrivalsJson.length
                  : 0)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-border/60">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tonight
            </p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">
                {occ.percent}%
              </span>
              <span className="mb-1.5 text-sm text-muted-foreground">
                occupancy · {occ.occupied}/{occ.capacity} rooms
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/80 transition-all"
                style={{ width: `${Math.min(100, occ.percent)}%` }}
              />
            </div>
            {emptyStock ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No room stock yet — open <strong>Rooms & inventory</strong> to add products,
                units, and allotments (or refresh after seed).
              </p>
            ) : null}
            {data.occupancyTrend.length ? (
              <div className="mt-5 flex h-16 items-end gap-1.5">
                {data.occupancyTrend.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 rounded-sm bg-foreground/15"
                    style={{ height: `${Math.max(8, d.percent)}%` }}
                    title={`${d.date}: ${d.percent}%`}
                  />
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">Last 7 nights</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={LogIn} label="Arrivals (7d)" value={data.arrivalsNext7d} />
            <StatTile icon={LogOut} label="Departures (7d)" value={data.departuresNext7d} />
            <StatTile icon={Inbox} label="Pending inbound" value={data.pendingInbound} />
            <StatTile icon={Ban} label="Stop-sell products" value={data.stopSellCount} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <BedDouble className="size-4 text-muted-foreground" />
            <strong className="text-sm">Bookings by source (30d)</strong>
          </div>
          {sourceTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No stays recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {(
                [
                  ['agency_inbound', 'Agency inbound'],
                  ['manual', 'Manual'],
                  ['walk_in', 'Walk-in'],
                ] as const
              ).map(([key, label]) => {
                const n = data.bookingsBySource[key];
                const pct = sourceTotal ? Math.round((n / sourceTotal) * 100) : 0;
                return (
                  <li key={key} className="flex items-center gap-3 text-sm">
                    <StatusBadge value={key} showIcon={false} />
                    <span className="min-w-[7rem] text-muted-foreground">{label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {dayCloses.length ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <strong className="text-sm">Recent day closes</strong>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {dayCloses.map((c) => (
                <li key={c.id}>
                  {String(c.businessDate).slice(0, 10)} · {c.postedRoomCharges} room charge(s) ·{' '}
                  {c.noShowsMarked} no-show(s)
                  {c.summaryJson?.unpaidDeparturesCount != null
                    ? ` · ${c.summaryJson.unpaidDeparturesCount} unpaid`
                    : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LogIn;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
