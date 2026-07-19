import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Combobox,
  DatePicker,
  FormGrid,
  Input,
  PriceField,
  SimpleFormField as FormField,
  StatusBadge,
  TimePicker,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import {
  formatDateInput,
  parseDateInput,
  patchDateTimeLocal,
  splitDateTimeLocal,
} from '../../lib/dateInput';
import { CareHistoryPanel } from '../care/CareHistoryPanel';
import { PartnerInventoryPanel } from '../partner/PartnerInventoryPanel';
import type { DriverTabId } from './DriverPortalLayout';

type FleetUnit = {
  id: string;
  name: string;
  plateNumber?: string | null;
  seats?: number | null;
  isActive?: boolean;
};

type DriverJob = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  pickupLocation?: string | null;
  dropLocation?: string | null;
  startAt: string;
  endAt: string;
  status: string;
  rateAmount?: number | string | null;
  amountPaid?: number | string | null;
  currency: string;
  notes?: string | null;
  completionNote?: string | null;
  fleetUnitId?: string | null;
  bookingComponentId?: string | null;
  bookingComponent?: {
    id: string;
    title: string;
    trip?: { tripNumber: string; title: string } | null;
  } | null;
  fleetUnit?: {
    id: string;
    name: string;
    plateNumber?: string | null;
  } | null;
};

function fleetUnitLabel(u: FleetUnit): string {
  return [u.name, u.plateNumber].filter(Boolean).join(' · ');
}

function toIso(local: string) {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DriverOpsPanel({
  assetId,
  orgKind,
  tab,
}: {
  assetId: string;
  orgKind?: string | null;
  tab: DriverTabId;
}) {
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [todayJobs, setTodayJobs] = useState<DriverJob[]>([]);
  const [selectedId, setSelectedId] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [pickup, setPickup] = useState('');
  const [drop, setDrop] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [rateAmount, setRateAmount] = useState('');
  const [fleetUnitId, setFleetUnitId] = useState('');
  const [fleetUnits, setFleetUnits] = useState<FleetUnit[]>([]);
  const [assignNow, setAssignNow] = useState(true);
  const [completionNote, setCompletionNote] = useState('');
  const [payAmount, setPayAmount] = useState('');

  const { hasAny } = usePermissions();
  const canCreateJob = hasAny([...CAP.reservationCreate]);
  const canOpsWrite = hasAny([...CAP.opsWrite]);
  const canFinance = hasAny([...CAP.partnerFinanceWrite]);

  const load = useCallback(async () => {
    try {
      const day = todayIsoDate();
      const [all, today, units] = await Promise.all([
        api<DriverJob[]>(`/driver/assets/${assetId}/jobs`),
        api<DriverJob[]>(`/driver/assets/${assetId}/jobs?day=${day}`),
        api<FleetUnit[]>(`/inventory/assets/${assetId}/fleet`).catch(() => []),
      ]);
      setJobs(all);
      setTodayJobs(today);
      setFleetUnits(
        (Array.isArray(units) ? units : []).filter((u) => u.isActive !== false),
      );
      if (!selectedId && (today[0] || all[0])) {
        setSelectedId((today[0] || all[0]).id);
      }
    } catch (e) {
      reportError(e, 'Could not load driver jobs');
    }
  }, [assetId, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) || null,
    [jobs, selectedId],
  );

  async function createJob() {
    try {
      await api('/driver/jobs', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          guestName,
          guestPhone: guestPhone || undefined,
          pickupLocation: pickup || undefined,
          dropLocation: drop || undefined,
          startAt: toIso(startAt),
          endAt: toIso(endAt),
          rateAmount: rateAmount ? Number(rateAmount) : undefined,
          fleetUnitId: fleetUnitId || undefined,
          assignImmediately: assignNow,
        }),
      });
      toastSuccess(assignNow ? 'Job assigned' : 'Job offered');
      setGuestName('');
      setPickup('');
      setDrop('');
      setFleetUnitId('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function postJob(
    id: string,
    action: 'accept' | 'start' | 'complete' | 'cancel',
  ) {
    try {
      await api(`/driver/jobs/${id}/${action}`, {
        method: 'POST',
        body:
          action === 'complete'
            ? JSON.stringify({ completionNote: completionNote || undefined })
            : undefined,
      });
      toastSuccess(
        action === 'accept'
          ? 'Accepted'
          : action === 'start'
            ? 'En route'
            : action === 'complete'
              ? 'Completed'
              : 'Cancelled',
      );
      setCompletionNote('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function issueInvoice() {
    if (!selectedId) return;
    try {
      await api(`/driver/jobs/${selectedId}/invoice`, { method: 'POST' });
      toastSuccess('Invoice issued');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Invoice failed');
    }
  }

  async function recordPay() {
    if (!selectedId) return;
    try {
      await api(`/driver/jobs/${selectedId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmount),
          method: 'cash',
        }),
      });
      toastSuccess('Payment recorded');
      setPayAmount('');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Payment failed');
    }
  }

  function JobActions({ job }: { job: DriverJob }) {
    return (
      <div className="flex flex-wrap gap-2">
        {canOpsWrite && job.status === 'offered' ? (
          <Button
            size="sm"
            className="min-h-11 min-w-[5.5rem] sm:min-h-0"
            onClick={() => void postJob(job.id, 'accept')}
          >
            Accept
          </Button>
        ) : null}
        {canOpsWrite && job.status === 'assigned' ? (
          <Button
            size="sm"
            className="min-h-11 min-w-[5.5rem] sm:min-h-0"
            onClick={() => void postJob(job.id, 'start')}
          >
            Start
          </Button>
        ) : null}
        {canOpsWrite && job.status === 'en_route' ? (
          <Button
            size="sm"
            className="min-h-11 min-w-[5.5rem] sm:min-h-0"
            onClick={() => {
              setSelectedId(job.id);
              void postJob(job.id, 'complete');
            }}
          >
            Complete
          </Button>
        ) : null}
        {canOpsWrite && ['offered', 'assigned', 'en_route'].includes(job.status) ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-0"
            onClick={() => void postJob(job.id, 'cancel')}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    );
  }

  function JobCard({ job }: { job: DriverJob }) {
    return (
      <div className="space-y-2 rounded-xl border border-border/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setSelectedId(job.id)}
          >
            <div className="text-base font-medium">{job.guestName}</div>
            {job.bookingComponentId || job.bookingComponent ? (
              <div className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Agency duty
                {job.bookingComponent?.trip?.tripNumber
                  ? ` · ${job.bookingComponent.trip.tripNumber}`
                  : ''}
                {job.bookingComponent?.title
                  ? ` · ${job.bookingComponent.title}`
                  : ''}
              </div>
            ) : null}
            <div className="mt-0.5 text-sm text-muted-foreground">
              {job.pickupLocation || 'Pickup TBD'}
              {job.dropLocation ? ` → ${job.dropLocation}` : ''}
            </div>
            {job.fleetUnit ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {[job.fleetUnit.name, job.fleetUnit.plateNumber]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-muted-foreground">
              {new Date(job.startAt).toLocaleString()} →{' '}
              {new Date(job.endAt).toLocaleTimeString()}
            </div>
          </button>
          <StatusBadge value={job.status} />
        </div>
        <JobActions job={job} />
      </div>
    );
  }

  if (tab === 'calendar') {
    return (
      <PartnerInventoryPanel assetId={assetId} assetKind="driver" orgKind={orgKind} />
    );
  }

  if (tab === 'care') {
    return <CareHistoryPanel compact />;
  }

  if (tab === 'pay') {
    const rate = selected ? Number(selected.rateAmount || 0) : 0;
    const paid = selected ? Number(selected.amountPaid || 0) : 0;
    return (
      <div className="mx-auto grid max-w-lg gap-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Select job</h3>
            <Combobox
              options={jobs.map((j) => ({
                value: j.id,
                label: `${j.guestName} — ${j.status}`,
              }))}
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Select job"
            />
            {selected ? (
              <div className="space-y-1 text-sm">
                <div>
                  Rate: {formatCurrency(rate, selected.currency)}
                </div>
                <div>Paid: {formatCurrency(paid, selected.currency)}</div>
                <div className="font-medium">
                  Outstanding: {formatCurrency(Math.max(0, rate - paid), selected.currency)}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Record payment</h3>
            <PriceField value={payAmount} onChange={setPayAmount} />
            <div className="flex flex-col gap-2 sm:flex-row">
              {canFinance ? (
              <Button
                type="button"
                className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                onClick={() => void recordPay()}
              >
                Record payment
              </Button>
              ) : null}
              {canFinance ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                onClick={() => void issueInvoice()}
              >
                Issue invoice
              </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tab === 'today') {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <p className="text-sm text-muted-foreground">
          Today’s duties — accept, start, complete from your phone.
        </p>
        {todayJobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {!todayJobs.length ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              No jobs for today. Create one under Jobs.
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  // jobs
  return (
    <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-2">
      {canCreateJob ? (
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-medium">New job</h3>
          <FormGrid>
            <FormField label="Guest / booker">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </FormField>
            <FormField label="Phone">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                inputMode="tel"
              />
            </FormField>
            <FormField label="Pickup">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
              />
            </FormField>
            <FormField label="Drop">
              <Input
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
                value={drop}
                onChange={(e) => setDrop(e.target.value)}
              />
            </FormField>
            <FormField label="Start date">
              <DatePicker
                value={parseDateInput(splitDateTimeLocal(startAt).date)}
                onChange={(d) =>
                  setStartAt((v) =>
                    patchDateTimeLocal(v, { date: formatDateInput(d) }),
                  )
                }
              />
            </FormField>
            <FormField label="Start time">
              <TimePicker
                value={splitDateTimeLocal(startAt).time || undefined}
                onChange={(time) =>
                  setStartAt((v) =>
                    patchDateTimeLocal(v, { time: time || '00:00' }),
                  )
                }
              />
            </FormField>
            <FormField label="End date">
              <DatePicker
                value={parseDateInput(splitDateTimeLocal(endAt).date)}
                onChange={(d) =>
                  setEndAt((v) =>
                    patchDateTimeLocal(v, { date: formatDateInput(d) }),
                  )
                }
              />
            </FormField>
            <FormField label="End time">
              <TimePicker
                value={splitDateTimeLocal(endAt).time || undefined}
                onChange={(time) =>
                  setEndAt((v) =>
                    patchDateTimeLocal(v, { time: time || '00:00' }),
                  )
                }
              />
            </FormField>
            <FormField label="Rate">
              <PriceField value={rateAmount} onChange={setRateAmount} />
            </FormField>
            {fleetUnits.length ? (
              <FormField
                label="Fleet unit"
                description="Optional plate for this duty. Conflicts block assign."
              >
                <Combobox
                  options={[
                    { value: '', label: 'No unit' },
                    ...fleetUnits.map((u) => ({
                      value: u.id,
                      label: fleetUnitLabel(u),
                      description:
                        u.seats != null ? `${u.seats} seats` : undefined,
                    })),
                  ]}
                  value={fleetUnitId}
                  onChange={setFleetUnitId}
                  placeholder="No unit"
                  searchable
                  searchPlaceholder="Search vehicle…"
                />
              </FormField>
            ) : null}
          </FormGrid>
          <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
            <Checkbox
              id="driver-assign-now"
              checked={assignNow}
              onCheckedChange={(checked) => setAssignNow(checked === true)}
            />
            <label htmlFor="driver-assign-now" className="cursor-pointer text-sm">
              Assign immediately (book calendar)
            </label>
          </div>
          <Button
            type="button"
            className="min-h-11 w-full sm:min-h-0 sm:w-auto"
            onClick={() => void createJob()}
          >
            Create job
          </Button>
        </CardContent>
      </Card>
      ) : null}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">All jobs</h3>
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {!jobs.length ? (
          <p className="text-sm text-muted-foreground">No jobs yet.</p>
        ) : null}
        {selected?.status === 'en_route' ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <FormField label="Completion note">
                <Input
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  placeholder="Guest dropped · toll paid"
                />
              </FormField>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
