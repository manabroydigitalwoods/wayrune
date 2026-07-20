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
type CancellationCase = {
  id: string;
  scope: string;
  reason?: string | null;
  approvalStatus: string;
  executionStatus: string;
  calculatedCharges?: string | number | null;
  expectedRefund?: string | number | null;
  currency: string;
  evaluationJson?: {
    creditNoteId?: string;
    creditNoteAmount?: number;
    creditNoteAllocatedToDocumentId?: string;
    creditNoteAllocatedAmount?: number;
    refundPaymentId?: string;
    refundSettledAmount?: number;
  } | null;
};
type CancellationRefundStatus = {
  cancellationCaseId: string;
  creditNoteId: string | null;
  refundDue: number;
  refundSettledAmount: number;
  canSettle: boolean;
  currency: string;
  razorpaySourcePaymentId?: string | null;
  canRefundViaRazorpay?: boolean;
  refundApprovalStatus?: 'none' | 'awaiting_approval' | 'approved';
  refundRequestReason?: string | null;
  refundRequestedAmount?: number | null;
  canRequestRefund?: boolean;
  canApproveRefund?: boolean;
};
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
  const [cancellations, setCancellations] = useState<CancellationCase[]>([]);
  const [refundByCaseId, setRefundByCaseId] = useState<
    Record<string, CancellationRefundStatus>
  >({});
  const [settlingRefundCaseId, setSettlingRefundCaseId] = useState<string | null>(
    null,
  );
  const [refundReasonByCaseId, setRefundReasonByCaseId] = useState<
    Record<string, string>
  >({});
  const [refundActionCaseId, setRefundActionCaseId] = useState<string | null>(
    null,
  );
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
  const canSettleRefund = hasAny(CAP.refundExecute);
  const canRequestRefund = hasAny(CAP.refundRequest);
  const canApproveRefund = hasAny(CAP.refundApprove);

  const loadRefundStatuses = useCallback(async (rows: CancellationCase[]) => {
    const applied = rows.filter(
      (row) =>
        row.executionStatus === 'applied' &&
        Boolean(row.evaluationJson?.creditNoteId),
    );
    if (!applied.length) {
      setRefundByCaseId({});
      return;
    }
    const entries = await Promise.all(
      applied.map(async (row) => {
        try {
          const status = await api<CancellationRefundStatus>(
            `/commerce/cancellations/${row.id}/refund-status`,
          );
          return [row.id, status] as const;
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, CancellationRefundStatus> = {};
    for (const entry of entries) {
      if (entry) next[entry[0]] = entry[1];
    }
    setRefundByCaseId(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, r, cancelRows] = await Promise.all([
        api<TripChange[]>(`/commerce/trip-changes?tripId=${tripId}`),
        api<Reconciliation>(`/commerce/trips/${tripId}/reconciliation`).catch(() => null),
        api<CancellationCase[]>(`/commerce/trips/${tripId}/cancellations`).catch(
          () => [] as CancellationCase[],
        ),
      ]);
      setChanges(c);
      setRecon(r);
      setCancellations(Array.isArray(cancelRows) ? cancelRows : []);
      await loadRefundStatuses(Array.isArray(cancelRows) ? cancelRows : []);
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
  }, [tripId, canIncidents, loadRefundStatuses]);

  async function settleRefund(
    caseId: string,
    mode: 'manual' | 'razorpay' | 'mock_razorpay' = 'manual',
    amount?: number,
  ) {
    setSettlingRefundCaseId(caseId);
    try {
      await api(`/commerce/cancellations/${caseId}/settle-refund`, {
        method: 'POST',
        body: JSON.stringify({
          mode,
          ...(amount != null && amount > 0 ? { amount } : {}),
        }),
      });
      toastSuccess(
        mode === 'razorpay'
          ? 'Refund submitted to Razorpay'
          : mode === 'mock_razorpay'
            ? 'Mock Razorpay refund recorded'
            : 'Refund marked settled',
      );
      await load();
      onChanged?.();
    } catch (e) {
      toastError(reportError(e, 'Could not settle refund'));
    } finally {
      setSettlingRefundCaseId(null);
    }
  }

  async function requestRefund(caseId: string) {
    const reason = (refundReasonByCaseId[caseId] || '').trim();
    if (!reason) {
      toastError('Enter a refund reason');
      return;
    }
    setRefundActionCaseId(caseId);
    try {
      await api(`/commerce/cancellations/${caseId}/request-refund`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toastSuccess('Refund requested — awaiting approval');
      setRefundReasonByCaseId((prev) => {
        const next = { ...prev };
        delete next[caseId];
        return next;
      });
      await load();
      onChanged?.();
    } catch (e) {
      toastError(reportError(e, 'Could not request refund'));
    } finally {
      setRefundActionCaseId(null);
    }
  }

  async function approveRefund(caseId: string) {
    setRefundActionCaseId(caseId);
    try {
      await api(`/commerce/cancellations/${caseId}/approve-refund`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess('Refund approved — ready to settle');
      await load();
      onChanged?.();
    } catch (e) {
      toastError(reportError(e, 'Could not approve refund'));
    } finally {
      setRefundActionCaseId(null);
    }
  }

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

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Cancellation cases</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Policy fees and refunds from Ops Cancel. Credit notes auto-allocate to trip
            receivables when one exists. Request → Approve → Mark refund settled (or
            Razorpay) when cash is paid out.
          </p>
          <ul className="space-y-2">
            {cancellations.map((row) => {
              const fee = Number(row.calculatedCharges ?? 0);
              const refund = Number(row.expectedRefund ?? 0);
              const creditNoteId = row.evaluationJson?.creditNoteId;
              const allocated =
                row.evaluationJson?.creditNoteAllocatedToDocumentId &&
                (row.evaluationJson?.creditNoteAllocatedAmount ?? 0) > 0;
              const refundStatus = refundByCaseId[row.id];
              const refundDue = refundStatus?.refundDue ?? 0;
              const refundSettled = refundStatus?.refundSettledAmount ?? 0;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm glass-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {row.reason?.trim() || `Cancellation · ${row.scope}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Fee {formatCurrency(fee, { currency: row.currency, maximumFractionDigits: 0 })}
                      {refund > 0
                        ? ` · refund ${formatCurrency(refund, {
                            currency: row.currency,
                            maximumFractionDigits: 0,
                          })}`
                        : ''}
                      {creditNoteId
                        ? allocated
                          ? ` · credit note allocated (${formatCurrency(
                              row.evaluationJson?.creditNoteAllocatedAmount ?? 0,
                              { currency: row.currency, maximumFractionDigits: 0 },
                            )})`
                          : ' · credit note drafted'
                        : ''}
                      {refundDue > 0
                        ? ` · refund due ${formatCurrency(refundDue, {
                            currency: row.currency,
                            maximumFractionDigits: 0,
                          })}`
                        : refundSettled > 0
                          ? ` · refund settled (${formatCurrency(refundSettled, {
                              currency: row.currency,
                              maximumFractionDigits: 0,
                            })})`
                          : ''}
                      {refundStatus?.refundApprovalStatus === 'awaiting_approval'
                        ? ' · awaiting refund approval'
                        : refundStatus?.refundApprovalStatus === 'approved'
                          ? ' · refund approved'
                          : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <StatusBadge value={row.approvalStatus} showIcon={false} />
                    <StatusBadge value={row.executionStatus} showIcon={false} />
                    {canRequestRefund && refundStatus?.canRequestRefund ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Input
                          className="h-8 w-40 text-xs"
                          placeholder="Refund reason…"
                          value={refundReasonByCaseId[row.id] || ''}
                          onChange={(e) =>
                            setRefundReasonByCaseId((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={refundActionCaseId === row.id}
                          onClick={() => void requestRefund(row.id)}
                        >
                          {refundActionCaseId === row.id
                            ? 'Requesting…'
                            : 'Request refund'}
                        </Button>
                      </div>
                    ) : null}
                    {canApproveRefund && refundStatus?.canApproveRefund ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={refundActionCaseId === row.id}
                        onClick={() => void approveRefund(row.id)}
                      >
                        {refundActionCaseId === row.id
                          ? 'Approving…'
                          : 'Approve refund'}
                      </Button>
                    ) : null}
                    {canSettleRefund && refundStatus?.canSettle ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={settlingRefundCaseId === row.id}
                          onClick={() => void settleRefund(row.id, 'manual')}
                        >
                          {settlingRefundCaseId === row.id
                            ? 'Settling…'
                            : 'Mark refund settled'}
                        </Button>
                        {refundStatus.canRefundViaRazorpay ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={settlingRefundCaseId === row.id}
                            onClick={() => void settleRefund(row.id, 'razorpay')}
                          >
                            Refund via Razorpay
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {!cancellations.length ? (
              <li className="text-sm text-muted-foreground">No cancellation cases yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

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
