import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Package, CircleSlash } from 'lucide-react';
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
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  toastError,
  toastSuccess,
  toastWarning,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateTime,
} from '@wayrune/ui';
import { api } from '../../api';
import { Can } from '../Can';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import { formatDateInput, parseDateInput } from '../../lib/dateInput';
import {
  formatPaymentTermsDueDate,
  paymentTermsDueCue,
} from '../../lib/paymentTerms';
import { partyCreditLimitCue } from '../../lib/partyCreditLimit';
import {
  copyTripPaymentLink,
  markTripPaymentLinkSent,
  sendTripPaymentLinkWhatsapp,
  toastForPaymentLinkWhatsapp,
} from '../../lib/paymentLinkActions';
import {
  formatOrgTaxDisplaySplitLinesUi,
  formatOrgTaxIdentityLinesUi,
  orgTaxDisplaySplitCueUi,
  orgTaxTotalsLabelUi,
  type OrgTaxIdentityUi,
} from '../../lib/orgTaxIdentity';

type Payment = {
  id: string;
  direction: string;
  label: string;
  amount: string | number;
  amountPaid?: string | number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  status: string;
  notes?: string | null;
  supplierInvoiceId?: string | null;
  bookingComponentId?: string | null;
  supplierInvoice?: { id: string; invoiceNumber: string } | null;
  bookingComponent?: { id: string; title: string } | null;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
  dueAt?: string | null;
  status: string;
  notes?: string | null;
  supplierId: string;
  bookingComponentId?: string | null;
  supplier?: { id: string; name: string };
  bookingComponent?: { id: string; title: string } | null;
};

type Booking = {
  id: string;
  title: string;
  type: string;
  supplierId?: string | null;
  costAmount?: string | number | null;
  currency?: string;
  supplier?: { id: string; name: string } | null;
};

type Feedback = {
  id: string;
  score: number;
  note?: string | null;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor?: { fullName?: string; email?: string } | null;
  metadataJson?: Record<string, unknown> | null;
};

type FinanceSummary = {
  orgCurrency: string;
  quote: {
    versionNumber: number;
    sellTotal: number;
    costTotal: number;
    taxTotal?: number;
    marginAmount: number;
    marginPercent: number;
    currency: string;
    taxIdentity?: OrgTaxIdentityUi | null;
  } | null;
  costCompare?: {
    estimatedCost: number | null;
    actualBookingCost: number;
    invoicedCost: number;
    actualCost: number;
    variance: number | null;
    currency: string;
    otherCurrencyBookingCount?: number;
  };
  summary: {
    customerDue: number;
    customerPaid: number;
    supplierDue: number;
    supplierPaid: number;
    overdueCount: number;
  };
  payments: Payment[];
  invoices: Invoice[];
  bookings: Booking[];
  feedback: Feedback[];
  latestFeedback: Feedback | null;
  audit: AuditRow[];
  otherCurrencyPayments: Payment[];
  partyCredit?: {
    limited: boolean;
    creditLimit: number | null;
    outstanding: number;
    exposure: number;
    headroom: number | null;
    overLimit: boolean;
    overBy: number;
    currency?: string;
  } | null;
};

type Supplier = { id: string; name: string };

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'partial', label: 'Partial' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'AED', label: 'AED' },
];

function emptyPaymentForm(
  orgCurrency: string,
  direction: 'customer' | 'supplier' = 'customer',
  partyPaymentTerms?: string | null,
) {
  const dueAt =
    direction === 'customer'
      ? formatPaymentTermsDueDate(partyPaymentTerms) || ''
      : '';
  return {
    direction,
    label: '',
    amount: '',
    currency: orgCurrency,
    dueAt,
    method: '',
    reference: '',
    notes: '',
    supplierInvoiceId: '',
    bookingComponentId: '',
  };
}

export function FinancePanel({
  tripId,
  tripStatus,
  orgCurrency: orgCurrencyProp,
  partyPaymentTerms,
  partyCreditLimit,
  onChanged,
}: {
  tripId: string;
  tripStatus?: string;
  orgCurrency?: string;
  partyPaymentTerms?: string | null;
  partyCreditLimit?: number | null;
  onChanged: () => Promise<void> | void;
}) {
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.tripWrite);
  const canOverrideCreditLimit = hasAny(CAP.creditLimitOverride);
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerFilter, setCustomerFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState(() =>
    emptyPaymentForm(orgCurrencyProp || 'INR', 'customer', partyPaymentTerms),
  );
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [chaseBusyId, setChaseBusyId] = useState<string | null>(null);
  const [markSentPaymentId, setMarkSentPaymentId] = useState<string | null>(null);
  const [markingSentId, setMarkingSentId] = useState<string | null>(null);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    amount: '',
    currency: orgCurrencyProp || 'INR',
    dueAt: '',
    notes: '',
    bookingComponentId: '',
    createPaymentSchedule: true,
  });
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [feedbackScore, setFeedbackScore] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const orgCurrency = data?.orgCurrency || orgCurrencyProp || 'INR';
  const showFeedbackProminent =
    tripStatus === 'completed' || tripStatus === 'in_progress';

  const load = useCallback(async () => {
    try {
      const summary = await api<FinanceSummary>(`/trips/${tripId}/finance-summary`);
      setData(summary);
      if (summary.latestFeedback) {
        setFeedbackScore(String(summary.latestFeedback.score));
        setFeedbackNote(summary.latestFeedback.note || '');
      }
    } catch (e) {
      reportError(e, 'Could not load finance');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api<{ items?: Supplier[] } | Supplier[]>(`/suppliers`)
      .then((res) => {
        const items = Array.isArray(res) ? res : res.items || [];
        setSuppliers(items);
      })
      .catch(() => setSuppliers([]));
  }, []);

  const customerPayments = useMemo(() => {
    const list = (data?.payments || []).filter((p) => p.direction === 'customer');
    if (customerFilter === 'all') return list;
    return list.filter((p) => p.status === customerFilter);
  }, [data?.payments, customerFilter]);

  const supplierPayments = useMemo(() => {
    const list = (data?.payments || []).filter((p) => p.direction === 'supplier');
    if (supplierFilter === 'all') return list;
    return list.filter((p) => p.status === supplierFilter);
  }, [data?.payments, supplierFilter]);

  function openNewPayment(direction: 'customer' | 'supplier') {
    setEditingPaymentId(null);
    setPaymentForm(
      emptyPaymentForm(orgCurrency, direction, partyPaymentTerms),
    );
    setPaymentOpen(true);
  }

  const partyTermsCue = paymentTermsDueCue(partyPaymentTerms);
  const partyCreditCue =
    data?.partyCredit != null
      ? partyCreditLimitCue(data.partyCredit, orgCurrency)
      : null;

  function openEditPayment(p: Payment) {
    setEditingPaymentId(p.id);
    setPaymentForm({
      direction: p.direction as 'customer' | 'supplier',
      label: p.label,
      amount: String(Number(p.amount)),
      currency: p.currency || orgCurrency,
      dueAt: p.dueAt ? p.dueAt.slice(0, 10) : '',
      method: p.method || '',
      reference: p.reference || '',
      notes: p.notes || '',
      supplierInvoiceId: p.supplierInvoiceId || '',
      bookingComponentId: p.bookingComponentId || '',
    });
    setPaymentOpen(true);
  }

  async function savePayment() {
    const amount = Number(paymentForm.amount);
    if (!paymentForm.label.trim() || !Number.isFinite(amount) || amount <= 0) {
      toastError('Enter a label and positive amount');
      return;
    }
    setPaymentSubmitting(true);
    try {
      const body = {
        direction: paymentForm.direction,
        label: paymentForm.label.trim(),
        amount,
        currency: paymentForm.currency || orgCurrency,
        dueAt: paymentForm.dueAt || null,
        method: paymentForm.method || null,
        reference: paymentForm.reference.trim() || null,
        notes: paymentForm.notes.trim() || null,
        supplierInvoiceId: paymentForm.supplierInvoiceId || null,
        bookingComponentId: paymentForm.bookingComponentId || null,
      };
      if (editingPaymentId) {
        await api(`/trips/${tripId}/payments/${editingPaymentId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toastSuccess('Payment updated');
      } else {
        await api(`/trips/${tripId}/payments`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        toastSuccess('Payment scheduled');
      }
      setPaymentOpen(false);
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save payment');
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function markPaid(id: string) {
    try {
      await api(`/trips/${tripId}/payments/${id}/paid`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastSuccess('Marked paid');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update payment');
    }
  }

  async function copyPaymentLink(id: string) {
    setChaseBusyId(id);
    try {
      const res = await copyTripPaymentLink(tripId, id);
      toastSuccess(
        res.reused ? 'Payment link copied (existing link)' : 'Payment link copied',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create payment link');
    } finally {
      setChaseBusyId(null);
    }
  }

  async function sendPaymentLinkWhatsapp(id: string) {
    setChaseBusyId(id);
    try {
      const res = await sendTripPaymentLinkWhatsapp(tripId, id);
      const outcome = toastForPaymentLinkWhatsapp(res);
      if (!outcome.ok) {
        toastError(outcome.message);
        return;
      }
      if (outcome.openUrl) {
        window.open(outcome.openUrl, '_blank', 'noopener,noreferrer');
      }
      if (outcome.needsMarkSent) {
        setMarkSentPaymentId(id);
        toastWarning(outcome.message);
      } else {
        setMarkSentPaymentId(null);
        toastSuccess(outcome.message);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send payment link');
    } finally {
      setChaseBusyId(null);
    }
  }

  async function markPaymentLinkSent(id: string) {
    setMarkingSentId(id);
    try {
      await markTripPaymentLinkSent(tripId, id);
      toastSuccess('Payment link marked as sent');
      setMarkSentPaymentId(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not mark payment link sent');
    } finally {
      setMarkingSentId(null);
    }
  }

  async function unmarkPaid(id: string) {
    try {
      await api(`/trips/${tripId}/payments/${id}/unmark-paid`, { method: 'POST' });
      toastSuccess('Payment unmarked');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not unmark payment');
    }
  }

  async function cancelPayment(id: string) {
    try {
      await api(`/trips/${tripId}/payments/${id}/cancel`, { method: 'POST' });
      toastSuccess('Payment cancelled');
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not cancel payment');
    }
  }

  async function saveInvoice() {
    const amount = Number(invoiceForm.amount);
    if (!invoiceForm.supplierId || !invoiceForm.invoiceNumber.trim() || !(amount > 0)) {
      toastError('Supplier, invoice number and amount are required');
      return;
    }
    setInvoiceSubmitting(true);
    try {
      await api(`/trips/${tripId}/supplier-invoices`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: invoiceForm.supplierId,
          invoiceNumber: invoiceForm.invoiceNumber.trim(),
          amount,
          currency: invoiceForm.currency || orgCurrency,
          dueAt: invoiceForm.dueAt || null,
          notes: invoiceForm.notes.trim() || null,
          bookingComponentId: invoiceForm.bookingComponentId || null,
          createPaymentSchedule: invoiceForm.createPaymentSchedule,
        }),
      });
      toastSuccess('Supplier invoice added');
      setInvoiceOpen(false);
      setInvoiceForm({
        supplierId: '',
        invoiceNumber: '',
        amount: '',
        currency: orgCurrency,
        dueAt: '',
        notes: '',
        bookingComponentId: '',
        createPaymentSchedule: true,
      });
      await load();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save invoice');
    } finally {
      setInvoiceSubmitting(false);
    }
  }

  async function submitFeedback() {
    const score = Number(feedbackScore);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      toastError('Score must be 0–10');
      return;
    }
    setFeedbackSubmitting(true);
    try {
      await api(`/trips/${tripId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ score, note: feedbackNote.trim() || undefined }),
      });
      toastSuccess('Feedback saved');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save feedback');
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  function renderPaymentRow(p: Payment) {
    const due = p.dueAt ? formatDate(p.dueAt) : null;
    const outstanding = Math.max(0, Number(p.amount) - Number(p.amountPaid || 0));
    return (
      <li
        key={p.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm glass-row"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.label}</span>
            <StatusBadge value={p.status} showIcon />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatCurrency(p.amount, p.currency)}
            {Number(p.amountPaid) > 0 ? ` · paid ${formatCurrency(p.amountPaid, p.currency)}` : ''}
            {outstanding > 0 && p.status !== 'cancelled'
              ? ` · due ${formatCurrency(outstanding, p.currency)}`
              : ''}
            {due ? ` · due ${due}` : ''}
            {p.method ? ` · ${p.method.replace(/_/g, ' ')}` : ''}
            {p.reference ? ` · ref ${p.reference}` : ''}
            {p.supplierInvoice ? ` · inv ${p.supplierInvoice.invoiceNumber}` : ''}
            {p.bookingComponent ? ` · ${p.bookingComponent.title}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canWrite ? (
          <>
          {p.status !== 'paid' && p.status !== 'cancelled' ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => openEditPayment(p)}>
                Edit
              </Button>
              {p.direction === 'customer' ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={chaseBusyId === p.id}
                    onClick={() => void copyPaymentLink(p.id)}
                  >
                    Copy payment link
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={chaseBusyId === p.id}
                    onClick={() => void sendPaymentLinkWhatsapp(p.id)}
                  >
                    Send on WhatsApp
                  </Button>
                  {markSentPaymentId === p.id ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={markingSentId === p.id}
                      onClick={() => void markPaymentLinkSent(p.id)}
                    >
                      {markingSentId === p.id ? 'Marking…' : 'Mark as sent'}
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => void markPaid(p.id)}>
                Mark paid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void cancelPayment(p.id)}>
                Cancel
              </Button>
            </>
          ) : null}
          {(p.status === 'paid' || p.status === 'partial') && (
            <Button size="sm" variant="secondary" onClick={() => void unmarkPaid(p.id)}>
              Unmark
            </Button>
          )}
          </>
          ) : null}
        </div>
      </li>
    );
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading finance…</p>;
  }

  const summary = data?.summary;
  const quote = data?.quote;
  const costCompare = data?.costCompare;
  const quoteTaxTotal = Number(quote?.taxTotal ?? 0);
  const quoteTaxIdentity = quote?.taxIdentity ?? null;
  const quoteTaxLabel = quoteTaxIdentity
    ? orgTaxTotalsLabelUi(quoteTaxIdentity)
    : 'Tax';
  const quoteTaxSplitLines = quoteTaxIdentity
    ? formatOrgTaxDisplaySplitLinesUi(quoteTaxIdentity, quoteTaxTotal, {
        formatAmount: (n) => formatCurrency(n, quote?.currency),
      })
    : [];
  const quoteTaxSplitCue = quoteTaxIdentity
    ? orgTaxDisplaySplitCueUi(quoteTaxIdentity, quoteTaxTotal)
    : null;
  const quoteTaxIdentityLines = quoteTaxIdentity
    ? formatOrgTaxIdentityLinesUi(quoteTaxIdentity)
    : [];
  const quoteSellExTax = quote
    ? Math.max(0, Number(quote.sellTotal) - quoteTaxTotal)
    : 0;

  return (
    <div className="space-y-4">
      {quote ? (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">
                Accepted quote v{quote.versionNumber}
              </div>
              <div className="text-lg font-semibold tabular-nums">
                Sell {formatCurrency(quote.sellTotal, quote.currency)}
              </div>
              {quoteTaxTotal > 0 ? (
                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span>Sell before tax</span>
                    <span>{formatCurrency(quoteSellExTax, quote.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span>{quoteTaxLabel}</span>
                    <span>{formatCurrency(quoteTaxTotal, quote.currency)}</span>
                  </div>
                  {quoteTaxSplitLines.map((line) => (
                    <div
                      key={line}
                      className="flex justify-between gap-2 tabular-nums"
                    >
                      <span>{line.split(' ')[0]}</span>
                      <span>{line.replace(/^\S+\s+/, '')}</span>
                    </div>
                  ))}
                  {quoteTaxSplitCue ? <p>{quoteTaxSplitCue}</p> : null}
                  {quoteTaxIdentityLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Estimated cost (quote)</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatCurrency(quote.costTotal, quote.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Actual cost (bookings / invoices)</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatCurrency(costCompare?.actualCost ?? 0, costCompare?.currency || quote.currency)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                Bookings {formatCurrency(costCompare?.actualBookingCost ?? 0, quote.currency)} ·
                Invoices {formatCurrency(costCompare?.invoicedCost ?? 0, quote.currency)}
                {(costCompare?.otherCurrencyBookingCount ?? 0) > 0
                  ? ` · ${costCompare?.otherCurrencyBookingCount} other-currency booking${(costCompare?.otherCurrencyBookingCount ?? 0) === 1 ? '' : 's'} excluded`
                  : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cost variance</div>
              <div
                className={
                  (costCompare?.variance ?? 0) > 0
                    ? 'text-lg font-semibold tabular-nums text-destructive'
                    : (costCompare?.variance ?? 0) < 0
                      ? 'text-lg font-semibold tabular-nums text-emerald-700'
                      : 'text-lg font-semibold tabular-nums'
                }
              >
                {costCompare?.variance == null
                  ? '—'
                  : `${costCompare.variance > 0 ? '+' : ''}${formatCurrency(costCompare.variance, quote.currency)}`}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Quote margin {formatCurrency(quote.marginAmount, quote.currency)} (
                {formatPercent(quote.marginPercent)})
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          No accepted quote yet — estimated vs actual cost appears after a quote is accepted.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Customer due</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary?.customerDue || 0, orgCurrency)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Customer paid</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary?.customerPaid || 0, orgCurrency)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Supplier due</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary?.supplierDue || 0, orgCurrency)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-muted-foreground">Supplier paid</div>
              {(summary?.overdueCount || 0) > 0 ? (
                <StatusBadge value="overdue" label={`${summary?.overdueCount} overdue`} />
              ) : null}
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(summary?.supplierPaid || 0, orgCurrency)}
            </div>
          </CardContent>
        </Card>
      </div>

      {(data?.otherCurrencyPayments?.length || 0) > 0 ? (
        <p className="text-xs text-muted-foreground">
          Some lines use other currencies and are excluded from {orgCurrency} totals (no FX in this
          release).
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">Customer receivables</strong>
            <Can anyOf={CAP.tripWrite}>
              <Button size="sm" onClick={() => openNewPayment('customer')}>
                Add receivable
              </Button>
            </Can>
          </div>
          {(partyTermsCue || partyCreditCue) ? (
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                data?.partyCredit?.overLimit
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border/60 bg-muted/30 text-muted-foreground'
              }`}
            >
              {[partyCreditCue, partyTermsCue].filter(Boolean).join(' · ')}
              {data?.partyCredit?.overLimit && !canOverrideCreditLimit
                ? ' · Manager override required to add receivables over limit.'
                : ''}
            </p>
          ) : null}
          <SuggestionChips
            aria-label="Customer payment filter"
            allowDeselect={false}
            options={STATUS_FILTERS}
            value={customerFilter}
            onChange={setCustomerFilter}
          />
          <ul className="space-y-2">
            {customerPayments.map(renderPaymentRow)}
            {!customerPayments.length ? (
              <p className="text-sm text-muted-foreground">No customer payment schedules.</p>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-sm">Supplier payables</strong>
              <p className="text-xs text-muted-foreground">
                Confirming a hotel booking in Operations creates an AUTO- invoice and scheduled
                payment here.
              </p>
            </div>
            <Can anyOf={CAP.tripWrite}>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setInvoiceOpen(true)}>
                  Add invoice
                </Button>
                <Button size="sm" onClick={() => openNewPayment('supplier')}>
                  Add payable
                </Button>
              </div>
            </Can>
          </div>
          <SuggestionChips
            aria-label="Supplier payment filter"
            allowDeselect={false}
            options={STATUS_FILTERS}
            value={supplierFilter}
            onChange={setSupplierFilter}
          />
          {(data?.invoices || []).length ? (
            <ul className="mb-3 space-y-2">
              {(data?.invoices || []).map((inv) => {
                const autoOnConfirm =
                  inv.invoiceNumber.startsWith('AUTO-') ||
                  Boolean(inv.notes?.toLowerCase().includes('auto payable on confirm'));
                return (
                <li
                  key={inv.id}
                  className="rounded-xl border px-3 py-2 text-sm glass-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {inv.invoiceNumber}
                      {inv.supplier ? ` · ${inv.supplier.name}` : ''}
                    </span>
                    <StatusBadge value={inv.status} />
                    {autoOnConfirm ? (
                      <StatusBadge
                        value="auto_confirm"
                        label="Auto on confirm"
                        showIcon={false}
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(inv.amount, inv.currency)}
                    {inv.dueAt
                      ? ` · due ${formatDate(inv.dueAt)}`
                      : ''}
                    {inv.bookingComponent ? ` · ${inv.bookingComponent.title}` : ''}
                  </div>
                </li>
                );
              })}
            </ul>
          ) : null}
          <ul className="space-y-2">
            {supplierPayments.map(renderPaymentRow)}
            {!supplierPayments.length ? (
              <p className="text-sm text-muted-foreground">No supplier payment schedules.</p>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Card className={showFeedbackProminent ? undefined : 'opacity-95'}>
        <CardContent className="space-y-3 p-5">
          <strong className="text-sm">
            Client feedback{showFeedbackProminent ? '' : ' (optional)'}
          </strong>
          <p className="text-xs text-muted-foreground">
            {showFeedbackProminent
              ? 'Capture NPS after travel (0–10).'
              : 'Available anytime; most useful once the trip is in progress or completed.'}
          </p>
          <FormGrid>
            <FormField label="Score">
              <Input
                className="w-full"
                type="number"
                min={0}
                max={10}
                value={feedbackScore}
                onChange={(e) => setFeedbackScore(e.target.value)}
                placeholder="0–10"
              />
            </FormField>
            <FormField label="Note">
              <Input
                className="w-full"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="What went well / improve…"
              />
            </FormField>
          </FormGrid>
          <Can anyOf={CAP.tripWrite}>
            <Button
              variant={showFeedbackProminent ? 'default' : 'secondary'}
              disabled={feedbackSubmitting}
              onClick={() => void submitFeedback()}
            >
              {feedbackSubmitting ? 'Saving…' : 'Save feedback'}
            </Button>
          </Can>
          {(data?.feedback || []).length ? (
            <ul className="space-y-1.5 border-t border-border/50 pt-3">
              {(data?.feedback || []).map((f) => (
                <li key={f.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Score {f.score}</span>
                  {f.note ? ` — ${f.note}` : ''} ·{' '}
                  {formatDateTime(f.createdAt)}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-5">
          <strong className="text-sm">Finance activity</strong>
          {(data?.audit || []).length ? (
            <ul className="space-y-1.5">
              {(data?.audit || []).map((a) => (
                <li key={a.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {a.action.replace(/[._]/g, ' ')}
                  </span>
                  {a.actor?.fullName ? ` · ${a.actor.fullName}` : ''} ·{' '}
                  {formatDateTime(a.createdAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No finance events yet.</p>
          )}
        </CardContent>
      </Card>

      <RecordSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title={editingPaymentId ? 'Edit payment' : 'Add payment'}
        description="Schedules and references for customer collections or supplier payables."
        submitLabel={editingPaymentId ? 'Save payment' : 'Add payment'}
        submitting={paymentSubmitting}
        onSubmit={savePayment}
      >
        <FormField label="Direction">
          <SuggestionChips
            aria-label="Payment direction"
            allowDeselect={false}
            options={[
              { value: 'customer', label: 'Customer receivable' },
              { value: 'supplier', label: 'Supplier payable' },
            ]}
            value={paymentForm.direction}
            onChange={(v) =>
              setPaymentForm((f) => ({ ...f, direction: v as 'customer' | 'supplier' }))
            }
          />
        </FormField>
        <FormField label="Label" required>
          <Input
            value={paymentForm.label}
            onChange={(e) => setPaymentForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Advance / Balance / Supplier deposit"
          />
        </FormField>
        <FormGrid>
          <FormField label="Amount" required>
            <PriceField
              value={paymentForm.amount}
              onChange={(amount) => setPaymentForm((f) => ({ ...f, amount }))}
              currency={paymentForm.currency}
            />
          </FormField>
          <FormField label="Currency">
            <SuggestionChips
              aria-label="Currency"
              allowDeselect={false}
              options={CURRENCY_OPTIONS}
              value={paymentForm.currency}
              onChange={(currency) => setPaymentForm((f) => ({ ...f, currency }))}
            />
          </FormField>
        </FormGrid>
        <FormGrid>
          <FormField label="Due date">
            <DatePicker
              value={parseDateInput(paymentForm.dueAt)}
              onChange={(d) =>
                setPaymentForm((f) => ({ ...f, dueAt: formatDateInput(d) }))
              }
              placeholder="Optional due date"
            />
          </FormField>
          <FormField label="Method">
            <SuggestionChips
              aria-label="Payment method"
              options={METHOD_OPTIONS}
              value={paymentForm.method}
              onChange={(method) => setPaymentForm((f) => ({ ...f, method }))}
            />
          </FormField>
        </FormGrid>
        <FormField label="Reference">
          <Input
            value={paymentForm.reference}
            onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="UTR / cheque / gateway id"
          />
        </FormField>
        {paymentForm.direction === 'supplier' ? (
          <FormGrid>
            <FormField label="Link invoice">
              <Combobox
                options={[
                  { value: '', label: 'None', icon: CircleSlash },
                  ...(data?.invoices || []).map((inv) => ({
                    value: inv.id,
                    label: inv.invoiceNumber,
                    icon: FileText,
                  })),
                ]}
                value={paymentForm.supplierInvoiceId}
                onChange={(supplierInvoiceId) =>
                  setPaymentForm((f) => ({ ...f, supplierInvoiceId }))
                }
                placeholder="None"
              />
            </FormField>
            <FormField label="Link booking">
              <Combobox
                options={[
                  { value: '', label: 'None', icon: CircleSlash },
                  ...(data?.bookings || []).map((b) => ({
                    value: b.id,
                    label: b.title,
                    icon: Package,
                  })),
                ]}
                value={paymentForm.bookingComponentId}
                onChange={(bookingComponentId) =>
                  setPaymentForm((f) => ({ ...f, bookingComponentId }))
                }
                placeholder="None"
              />
            </FormField>
          </FormGrid>
        ) : null}
        <FormField label="Notes">
          <Input
            value={paymentForm.notes}
            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Optional"
          />
        </FormField>
      </RecordSheet>

      <RecordSheet
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        title="Add supplier invoice"
        description="Track payables against suppliers and optional booking components."
        submitLabel="Add invoice"
        submitting={invoiceSubmitting}
        onSubmit={saveInvoice}
      >
        <FormField label="Supplier" required>
          <Combobox
            options={suppliers.map((s) => ({
              value: s.id,
              label: s.name,
              icon: Building2,
            }))}
            value={invoiceForm.supplierId}
            onChange={(supplierId) => setInvoiceForm((f) => ({ ...f, supplierId }))}
            placeholder="Select supplier…"
            searchable
            searchPlaceholder="Search supplier…"
          />
        </FormField>
        <FormField label="Invoice number" required>
          <Input
            value={invoiceForm.invoiceNumber}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
            placeholder="INV-1024"
          />
        </FormField>
        <FormGrid>
          <FormField label="Amount" required>
            <PriceField
              value={invoiceForm.amount}
              onChange={(amount) => setInvoiceForm((f) => ({ ...f, amount }))}
              currency={invoiceForm.currency}
            />
          </FormField>
          <FormField label="Currency">
            <SuggestionChips
              aria-label="Invoice currency"
              allowDeselect={false}
              options={CURRENCY_OPTIONS}
              value={invoiceForm.currency}
              onChange={(currency) => setInvoiceForm((f) => ({ ...f, currency }))}
            />
          </FormField>
        </FormGrid>
        <FormField label="Due date">
          <DatePicker
            value={parseDateInput(invoiceForm.dueAt)}
            onChange={(d) =>
              setInvoiceForm((f) => ({ ...f, dueAt: formatDateInput(d) }))
            }
            placeholder="Optional due date"
          />
        </FormField>
        <FormField label="Link booking">
          <Combobox
            options={[
              { value: '', label: 'None', icon: CircleSlash },
              ...(data?.bookings || []).map((b) => ({
                value: b.id,
                label: b.title,
                icon: Package,
              })),
            ]}
            value={invoiceForm.bookingComponentId}
            onChange={(bookingComponentId) =>
              setInvoiceForm((f) => ({ ...f, bookingComponentId }))
            }
            placeholder="None"
          />
        </FormField>
        <FormField label="Notes">
          <Input
            value={invoiceForm.notes}
            onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="invoice-create-schedule"
            checked={invoiceForm.createPaymentSchedule}
            onCheckedChange={(checked) =>
              setInvoiceForm((f) => ({
                ...f,
                createPaymentSchedule: checked === true,
              }))
            }
          />
          <label htmlFor="invoice-create-schedule" className="cursor-pointer text-sm">
            Also create supplier payment schedule
          </label>
        </div>
      </RecordSheet>
    </div>
  );
}
