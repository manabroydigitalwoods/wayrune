import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, Wrench } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  formatCurrency,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';

type TripChange = { id: string; changeType: string; summary: string; status: string };
type Incident = { id: string; title: string; category: string; severity: string; status: string };
type Reconciliation = {
  quoted: number;
  agreed: number;
  booked: number;
  delivered: number;
  invoiced: number;
  paid: number;
  drifts: string[];
  currency: string;
};

const CHANGE_TYPES = [
  { value: 'hotel_replacement', label: 'Hotel replacement' },
  { value: 'date_shift', label: 'Date shift' },
  { value: 'traveller_count', label: 'Traveller count' },
  { value: 'other', label: 'Other' },
];

const INCIDENT_CATEGORIES = [
  { value: 'room_unavailable', label: 'Room unavailable' },
  { value: 'meal_issue', label: 'Meal issue' },
  { value: 'other', label: 'Other' },
];

function labelFor(options: typeof CHANGE_TYPES, value: string) {
  return options.find((o) => o.value === value)?.label || value;
}

export function TripClosurePanel({
  tripId,
  tripStatus,
  onChanged,
}: {
  tripId: string;
  tripStatus: string;
  onChanged?: () => void;
}) {
  const [changes, setChanges] = useState<TripChange[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [changeType, setChangeType] = useState('other');
  const [summary, setSummary] = useState('');
  const [incidentTitle, setIncidentTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [closing, setClosing] = useState(false);
  const { has, hasAny } = usePermissions();
  const canIncidents = has('ops.read') || has('incident.manage');
  const canTripWrite = hasAny(CAP.tripWrite);
  const canIncidentWrite = hasAny(CAP.incidentWrite);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        api<TripChange[]>(`/commerce/trip-changes?tripId=${tripId}`),
        api<Reconciliation>(`/commerce/trips/${tripId}/reconciliation`).catch(() => null),
      ]);
      setChanges(c);
      setRecon(r);
      if (canIncidents) {
        const i = await api<Incident[]>(`/commerce/incidents?tripId=${tripId}`).catch(
          () => [] as Incident[],
        );
        setIncidents(i);
      } else {
        setIncidents([]);
      }
    } catch (e) {
      reportError(e, 'Could not load trip closure data');
    }
  }, [tripId, canIncidents]);

  useEffect(() => {
    void load();
  }, [load]);

  async function after(promise: Promise<unknown>, successMsg: string, failMsg: string) {
    try {
      await promise;
      toastSuccess(successMsg);
      await load();
      onChanged?.();
    } catch (e) {
      toastError(e instanceof Error ? e.message : failMsg);
    }
  }

  async function createChange() {
    if (!summary.trim()) return toastError('Describe the change');
    await after(
      api('/commerce/trip-changes', {
        method: 'POST',
        body: JSON.stringify({ tripId, changeType, summary: summary.trim() }),
      }),
      'Change case logged',
      'Could not log change',
    );
    setSummary('');
  }

  async function setChangeStatus(id: string, status: 'applied' | 'rejected') {
    await after(
      api(`/commerce/trip-changes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      `Change ${status}`,
      'Could not update change',
    );
  }

  async function createIncident() {
    if (!incidentTitle.trim()) return toastError('Enter an incident title');
    await after(
      api('/commerce/incidents', {
        method: 'POST',
        body: JSON.stringify({ tripId, title: incidentTitle.trim(), category, severity: 'medium' }),
      }),
      'Incident reported',
      'Could not report incident',
    );
    setIncidentTitle('');
  }

  async function resolveIncident(id: string) {
    await after(
      api(`/commerce/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      }),
      'Incident resolved',
      'Could not resolve incident',
    );
  }

  async function closeTrip() {
    setClosing(true);
    await after(
      api(`/commerce/trips/${tripId}/close`, {
        method: 'POST',
        body: JSON.stringify({
          suppliersSettled: true,
          feedbackRequested: true,
          closeReason: 'completed',
        }),
      }),
      'Trip closed',
      'Could not close trip',
    );
    setClosing(false);
  }

  const canClose =
    canTripWrite && (tripStatus === 'completed' || tripStatus === 'in_progress');

  return (
    <div className="space-y-4">
      {recon ? (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <h3 className="text-sm font-semibold">Commerce reconciliation</h3>
            <p className="text-xs text-muted-foreground">
              Quoted / agreed / booked / invoiced / paid — drifts require explicit handling.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span>Quoted {formatCurrency(recon.quoted, { maximumFractionDigits: 0 })}</span>
              <span>Agreed {formatCurrency(recon.agreed, { maximumFractionDigits: 0 })}</span>
              <span>Booked {formatCurrency(recon.booked, { maximumFractionDigits: 0 })}</span>
              <span>Invoiced {formatCurrency(recon.invoiced, { maximumFractionDigits: 0 })}</span>
              <span>Paid {formatCurrency(recon.paid, { maximumFractionDigits: 0 })}</span>
            </div>
            {recon.drifts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {recon.drifts.map((d) => (
                  <StatusBadge key={d} value={d} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No material drifts detected.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <div className={canIncidents ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Change cases</h3>
            </div>
            {canTripWrite ? (
              <>
                <FormField label="Change type">
                  <SuggestionChips
                    aria-label="Change type"
                    allowDeselect={false}
                    options={CHANGE_TYPES}
                    value={changeType}
                    onChange={setChangeType}
                  />
                </FormField>
                <FormField label="Summary">
                  <Input
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="What changed and why"
                  />
                </FormField>
                <Button type="button" size="sm" onClick={() => void createChange()}>
                  Log change
                </Button>
              </>
            ) : null}
            <ul className="space-y-2">
              {changes.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      {labelFor(CHANGE_TYPES, c.changeType)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge value={c.status} showIcon={false} />
                    {canTripWrite && c.status !== 'applied' && c.status !== 'rejected' ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => void setChangeStatus(c.id, 'applied')}>
                          Apply
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void setChangeStatus(c.id, 'rejected')}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
              {!changes.length ? <li className="text-sm text-muted-foreground">No change cases yet.</li> : null}
            </ul>
          </CardContent>
        </Card>

        {canIncidents ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Incidents</h3>
            </div>
            {canIncidentWrite ? (
              <>
                <FormField label="Category">
                  <SuggestionChips
                    aria-label="Incident category"
                    allowDeselect={false}
                    options={INCIDENT_CATEGORIES}
                    value={category}
                    onChange={setCategory}
                  />
                </FormField>
                <FormField label="Title">
                  <Input
                    value={incidentTitle}
                    onChange={(e) => setIncidentTitle(e.target.value)}
                    placeholder="What happened"
                  />
                </FormField>
                <Button type="button" size="sm" onClick={() => void createIncident()}>
                  Report incident
                </Button>
              </>
            ) : null}
            <ul className="space-y-2">
              {incidents.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {labelFor(INCIDENT_CATEGORIES, i.category)} · {i.severity}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge value={i.status} showIcon={false} />
                    {canIncidentWrite && i.status !== 'resolved' && i.status !== 'closed' ? (
                      <Button size="sm" variant="secondary" onClick={() => void resolveIncident(i.id)}>
                        Resolve
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!incidents.length ? <li className="text-sm text-muted-foreground">No incidents reported.</li> : null}
            </ul>
          </CardContent>
        </Card>
        ) : null}
      </div>

      {canClose ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div>
              <h3 className="text-sm font-semibold">Close trip</h3>
              <p className="text-xs text-muted-foreground">
                Marks suppliers settled and requests traveller feedback.
              </p>
            </div>
            <Button type="button" onClick={() => void closeTrip()} disabled={closing}>
              <CheckCircle2 className="size-4" />
              {closing ? 'Closing…' : 'Close trip'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
