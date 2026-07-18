import { useMemo } from 'react';
import { Button, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { usePermissions } from '../../lib/permissions';

export type KitchenMealReservation = {
  id: string;
  guestName: string;
  guestCount: number;
  serviceAt: string;
  status: string;
  preparationStatus: string;
  mealPackage?: { name: string } | null;
  dietaryJson?: Record<string, number> | null;
};

function minsUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function nextPrep(status: string): { label: string; value: string } | null {
  if (status === 'pending') return { label: 'Start prep', value: 'prepping' };
  if (status === 'prepping' || status === 'prep_started') {
    return { label: 'Ready for service', value: 'ready' };
  }
  if (status === 'ready') return { label: 'Mark served', value: 'served' };
  return null;
}

function lane(prep: string): 'upcoming' | 'fire' | 'pass' {
  if (prep === 'ready') return 'pass';
  if (prep === 'prepping' || prep === 'prep_started') return 'fire';
  return 'upcoming';
}

export function MealKitchenBoard({
  kitchen,
  onChanged,
}: {
  kitchen: KitchenMealReservation[];
  onChanged: () => Promise<void>;
}) {
  const { hasAny } = usePermissions();
  const canOpsWrite = hasAny([...CAP.opsWrite]);
  const lanes = useMemo(() => {
    const upcoming: KitchenMealReservation[] = [];
    const fire: KitchenMealReservation[] = [];
    const pass: KitchenMealReservation[] = [];
    for (const r of kitchen) {
      const l = lane(r.preparationStatus);
      if (l === 'pass') pass.push(r);
      else if (l === 'fire') fire.push(r);
      else upcoming.push(r);
    }
    const byService = (a: KitchenMealReservation, b: KitchenMealReservation) =>
      new Date(a.serviceAt).getTime() - new Date(b.serviceAt).getTime();
    upcoming.sort(byService);
    fire.sort(byService);
    pass.sort(byService);
    return { upcoming, fire, pass };
  }, [kitchen]);

  async function setPrep(id: string, preparationStatus: string) {
    try {
      await api(`/restaurant/reservations/${id}/preparation`, {
        method: 'POST',
        body: JSON.stringify({ preparationStatus }),
      });
      toastSuccess(`Prep → ${preparationStatus}`);
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function seatServe(id: string, action: 'seat' | 'serve') {
    try {
      await api(`/restaurant/reservations/${id}/${action}`, { method: 'POST' });
      toastSuccess(action === 'seat' ? 'Seated' : 'Served');
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function Ticket({ r }: { r: KitchenMealReservation }) {
    const mins = minsUntil(r.serviceAt);
    const soon = mins <= 45 && mins >= -30;
    const overdue = mins < 0 && r.preparationStatus !== 'served';
    const next = nextPrep(r.preparationStatus);
    const dietary = r.dietaryJson
      ? Object.entries(r.dietaryJson)
          .map(([k, v]) => `${k}:${v}`)
          .join(' · ')
      : null;

    return (
      <article
        className={`rounded-2xl border-l-4 p-3 shadow-sm ${
          overdue
            ? 'border-l-rose-600 bg-rose-50'
            : soon
              ? 'border-l-sky-600 bg-sky-50'
              : 'border-l-slate-400 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold leading-tight text-slate-900">
              {r.guestName}
            </div>
            <div className="text-sm text-slate-600">
              {r.guestCount} covers · {r.mealPackage?.name || 'Package'}
            </div>
          </div>
          <div
            className={`rounded-lg px-2 py-1 text-center font-mono text-sm font-bold ${
              overdue
                ? 'bg-rose-600 text-white'
                : soon
                  ? 'bg-sky-700 text-white'
                  : 'bg-slate-200 text-slate-800'
            }`}
          >
            {mins >= 0 ? `T-${mins}m` : `+${Math.abs(mins)}m`}
          </div>
        </div>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Service {new Date(r.serviceAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          <span className="uppercase tracking-wide">{r.preparationStatus}</span>
        </p>
        {dietary ? (
          <p className="mt-1 rounded-md bg-amber-100/80 px-2 py-1 text-[11px] font-medium text-amber-950">
            Dietary {dietary}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1">
          {canOpsWrite && next ? (
            <Button size="sm" onClick={() => void setPrep(r.id, next.value)}>
              {next.label}
            </Button>
          ) : null}
          {canOpsWrite ? (
          <Button size="sm" variant="outline" onClick={() => void seatServe(r.id, 'seat')}>
            Seat
          </Button>
          ) : null}
          {canOpsWrite ? (
          <Button size="sm" variant="outline" onClick={() => void seatServe(r.id, 'serve')}>
            Serve
          </Button>
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
    items: KitchenMealReservation[];
    tone: string;
  }) {
    return (
      <section className="min-w-[280px] flex-1">
        <div className={`mb-2 rounded-xl px-3 py-2 text-white ${tone}`}>
          <div className="text-sm font-bold uppercase tracking-[0.12em]">
            {title} · {items.length}
          </div>
          <div className="text-[11px] opacity-85">{hint}</div>
        </div>
        <div className="space-y-2">
          {items.map((r) => (
            <Ticket key={r.id} r={r} />
          ))}
          {!items.length ? (
            <p className="text-xs text-muted-foreground">No group meals here</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-2">
        <Column
          title="Upcoming"
          hint="Service-time timeline"
          items={lanes.upcoming}
          tone="bg-slate-700"
        />
        <Column
          title="On the fire"
          hint="Actively prepping"
          items={lanes.fire}
          tone="bg-orange-700"
        />
        <Column
          title="Pass"
          hint="Ready to seat / serve"
          items={lanes.pass}
          tone="bg-teal-800"
        />
      </div>
      {!kitchen.length ? (
        <p className="text-sm text-muted-foreground">Nothing on the board for today.</p>
      ) : null}
    </div>
  );
}
