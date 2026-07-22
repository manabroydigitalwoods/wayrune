import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { Building2, ClipboardList, Mail, MoreHorizontal, Phone, Plane, Plus, Pencil, Route } from 'lucide-react';
import {
  Button,
  Combobox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmailInput,
  FormGrid,
  Input,
  NumberField,
  PageSkeleton,
  PhoneInput,
  PriceField,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  formatDateTime,
  toastError,
  toastSuccess,
  usePageChrome,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CareHistoryPanel } from '../components/care/CareHistoryPanel';
import { QUEUE_MENU_ITEM_CLASS } from '../components/queue';
import {
  DETAIL_CRM_GRID,
  DETAIL_CRM_STACK,
  DetailActionStrip,
  DetailMobileSection,
  DetailPageShell,
  DetailPanel,
} from '../components/detail';
import { CAP, TRAVEL_REQUEST_PERMISSIONS } from '../lib/capabilities';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { inquiryStatusLabel, tripStatusLabel } from '../lib/agencyStatusLabels';
import { usePermissions } from '../lib/permissions';
import { type PartyDetail, B2B_PARTY_TYPES } from '../lib/partyTypes';
import { partyAgentMarkupCue } from '../lib/partyAgentMarkupCue';
import { partyMarkupPercentOverride } from '../lib/orgMarkup';
import { partyCreditLimitCue } from '../lib/partyCreditLimit';
import { paymentTermsDueCue } from '../lib/paymentTerms';
import { useTravelRequestLauncher } from '../lib/travelRequestLauncher';
import { AGENCY_ROUTES } from '../lib/agencyRoutes';
import { reportError } from '../lib/errors';

type PartyCreditStatus = {
  limited: boolean;
  creditLimit: number | null;
  outstanding: number;
  exposure: number;
  headroom: number | null;
  overLimit: boolean;
  overBy: number;
  currency: string;
};

type PartyJourney = {
  acquisition: { key: string; name: string } | null;
  firstChannel: string | null;
  interactions: Array<{
    id: string;
    channel: string;
    acquisitionSourceKey?: string | null;
    outcome: string;
    summary?: string | null;
    occurredAt: string;
  }>;
};

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAYMENT_TERMS_PRESETS = [
  { value: 'Net 7', label: 'Net 7' },
  { value: 'Net 15', label: 'Net 15' },
  { value: 'Net 30', label: 'Net 30' },
  { value: 'Net 45', label: 'Net 45' },
  { value: 'Pay on confirm', label: 'On confirm' },
  { value: 'COD', label: 'COD' },
  { value: 'Due in 7 days', label: 'Due in 7' },
  { value: 'Before travel', label: 'Before travel' },
  { value: 'On arrival', label: 'On arrival' },
] as const;

function journeyOutcomeLabel(outcome: string) {
  switch (outcome) {
    case 'created_travel_request':
      return 'Travel request';
    case 'attached_existing':
      return 'Attached';
    case 'follow_up':
      return 'Follow-up';
    case 'spam':
      return 'Spam';
    case 'no_interest':
      return 'No interest';
    case 'pending':
      return 'Pending';
    default:
      return humanizeKey(outcome);
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-x-2 gap-y-0.5 text-[length:var(--control-text-sm)]">
      <dt className="pt-0.5 uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
  );
}

function PartyAboutPanel({
  detail,
  agentMarkupCue,
  creditTermsCue,
  creditLimitCue,
  creditStatus,
  contactForm,
  setContactForm,
  addressForm,
  setAddressForm,
  addingContact,
  addingAddress,
  onAddContact,
  onAddAddress,
  canWrite,
  showHeader = true,
}: {
  detail: PartyDetail;
  agentMarkupCue: string | null;
  creditTermsCue: string | null;
  creditLimitCue: string | null;
  creditStatus: PartyCreditStatus | null;
  contactForm: { fullName: string; email: string; phone: string };
  setContactForm: React.Dispatch<
    React.SetStateAction<{ fullName: string; email: string; phone: string }>
  >;
  addressForm: { line1: string; city: string };
  setAddressForm: React.Dispatch<React.SetStateAction<{ line1: string; city: string }>>;
  addingContact: boolean;
  addingAddress: boolean;
  onAddContact: () => void;
  onAddAddress: (e: FormEvent) => void;
  canWrite: boolean;
  showHeader?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">
          About this customer
        </h2>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge value={detail.type} />
        {detail.businessType ? (
          <StatusBadge value={detail.businessType} showIcon={false} />
        ) : null}
      </div>

      {agentMarkupCue ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[length:var(--control-text-sm)] text-amber-950 dark:text-amber-100">
          {agentMarkupCue}
        </p>
      ) : null}

      {creditTermsCue || creditLimitCue || detail.creditLimit ? (
        <p
          className={`rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] ${
            creditStatus?.overLimit
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border/60 bg-muted/20 text-muted-foreground'
          }`}
        >
          {[creditLimitCue, creditTermsCue].filter(Boolean).join(' · ') || 'No payment terms set'}
          {detail.creditLimit != null &&
          Number(detail.creditLimit) > 0 &&
          !creditLimitCue
            ? ` · Credit limit ₹${Math.round(Number(detail.creditLimit)).toLocaleString('en-IN')}`
            : ''}
        </p>
      ) : null}

      <dl className="space-y-2">
        <FieldRow label="Email">{detail.email || '—'}</FieldRow>
        <FieldRow label="Phone">{detail.phone || '—'}</FieldRow>
        <FieldRow label="Terms">{detail.paymentTerms || '—'}</FieldRow>
        <FieldRow label="Updated">{formatDateTime(detail.updatedAt)}</FieldRow>
      </dl>

      <section className="space-y-2 border-t border-border/50 pt-3">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Contacts
        </h3>
        {(detail.contacts || []).length ? (
          <ul className="space-y-1.5">
            {detail.contacts!.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] glass-row"
              >
                <div className="font-medium">{c.fullName}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  {c.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" />
                      {c.email}
                    </span>
                  ) : null}
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" />
                      {c.phone}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            No additional contacts.
          </p>
        )}
        {canWrite ? (
          <Can anyOf={CAP.partyWrite}>
            <div className="space-y-2">
              <FormGrid>
                <FormField label="Name">
                  <Input
                    inputSize="sm"
                    value={contactForm.fullName}
                    onChange={(e) => setContactForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Contact name"
                  />
                </FormField>
                <FormField label="Phone">
                  <PhoneInput
                    size="sm"
                    value={contactForm.phone}
                    onChange={(phone) => setContactForm((f) => ({ ...f, phone }))}
                  />
                </FormField>
              </FormGrid>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={addingContact}
                onClick={() => void onAddContact()}
              >
                {addingContact ? 'Adding…' : 'Add contact'}
              </Button>
            </div>
          </Can>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-border/50 pt-3">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Addresses
        </h3>
        {(detail.addresses || []).length ? (
          <ul className="space-y-1.5">
            {detail.addresses!.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] glass-row"
              >
                <div className="font-medium">{a.label}</div>
                <div className="text-muted-foreground">
                  {a.line1}
                  {a.city ? ` · ${a.city}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            No addresses yet.
          </p>
        )}
        {canWrite ? (
          <Can anyOf={CAP.partyWrite}>
            <form className="space-y-2" onSubmit={onAddAddress}>
              <FormGrid>
                <FormField label="Line 1">
                  <Input
                    inputSize="sm"
                    value={addressForm.line1}
                    onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))}
                    placeholder="Street address"
                  />
                </FormField>
                <FormField label="City">
                  <Input
                    inputSize="sm"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </FormField>
              </FormGrid>
              <Button type="submit" size="sm" variant="secondary" disabled={addingAddress}>
                {addingAddress ? 'Adding…' : 'Add address'}
              </Button>
            </form>
          </Can>
        ) : null}
      </section>
    </div>
  );
}

function PartyJourneyPanel({
  detail,
  journey,
  canCare,
  showHeader = true,
}: {
  detail: PartyDetail;
  journey: PartyJourney | null;
  canCare: boolean;
  showHeader?: boolean;
}) {
  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="flex items-center gap-2">
          <Route className="size-3.5 text-muted-foreground" />
          <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">Journey</h2>
        </div>
      ) : null}

      {journey ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-[length:var(--control-text-sm)]">
            <span className="rounded-md border px-2 py-1 glass-row">
              Found via{' '}
              <span className="font-medium">
                {journey.acquisition?.name ||
                  (journey.acquisition?.key ? humanizeKey(journey.acquisition.key) : 'Unknown')}
              </span>
            </span>
            {journey.firstChannel ? (
              <span className="rounded-md border px-2 py-1 glass-row">
                First channel{' '}
                <span className="font-medium">{humanizeKey(journey.firstChannel)}</span>
              </span>
            ) : null}
            <span className="rounded-md border px-2 py-1 glass-row">
              {(detail.inquiries || []).length} inquir
              {(detail.inquiries || []).length === 1 ? 'y' : 'ies'}
            </span>
            <span className="rounded-md border px-2 py-1 glass-row">
              {(detail.trips || []).length} trip{(detail.trips || []).length === 1 ? '' : 's'}
            </span>
          </div>
          {journey.interactions.length ? (
            <ol className="space-y-2 border-l border-border/70 pl-3">
              {journey.interactions.slice(-8).map((touch) => (
                <li key={touch.id} className="relative text-[length:var(--control-text-sm)]">
                  <span className="absolute -left-[0.97rem] top-1.5 size-1.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{humanizeKey(touch.channel)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {journeyOutcomeLabel(touch.outcome)}
                      </span>
                      {touch.summary ? (
                        <span className="text-muted-foreground"> — {touch.summary}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(touch.occurredAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
              No interactions yet — the next customer call will start this timeline.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
          Journey timeline unavailable.
        </p>
      )}

      {canCare ? (
        <section className="space-y-2 border-t border-border/50 pt-3">
          <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
            Care & partner history
          </h3>
          <CareHistoryPanel
            key={detail.id}
            initialPartyId={detail.id}
            initialPhone={detail.phone || undefined}
            initialName={detail.displayName}
          />
        </section>
      ) : null}
    </div>
  );
}

function PartyAssociationsPanel({
  detail,
  canCreateTravelRequest,
  onNewCall,
  showHeader = true,
}: {
  detail: PartyDetail;
  canCreateTravelRequest: boolean;
  onNewCall: () => void;
  showHeader?: boolean;
}) {
  const inquiryCount = detail.inquiries?.length ?? 0;
  const tripCount = detail.trips?.length ?? 0;
  const contactCount = detail.contacts?.length ?? 0;

  return (
    <div className="space-y-4">
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">Related</h2>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Inquiries', value: inquiryCount },
          { label: 'Trips', value: tripCount },
          { label: 'Contacts', value: contactCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border px-2 py-1.5 text-center glass-row"
          >
            <div className="text-xs text-muted-foreground">
              {stat.label}
            </div>
            <div className="text-[length:var(--control-text)] font-semibold tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
            Inquiries
          </h3>
          {canCreateTravelRequest ? (
            <Button type="button" size="xs" variant="ghost" onClick={onNewCall}>
              <Plus className="size-3" />
              New call
            </Button>
          ) : null}
        </div>
        {(detail.inquiries || []).length ? (
          <ul className="space-y-1.5">
            {detail.inquiries!.map((inq) => (
              <li key={inq.id}>
                <Link
                  to={`/inquiries/${inq.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] transition-colors glass-row hover:border-primary/25"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium tabular-nums">{inq.inquiryNumber}</span>
                    <span className="ml-1.5 text-muted-foreground">
                      {formatDateTime(inq.updatedAt)}
                    </span>
                  </span>
                  <StatusBadge value={inq.status} label={inquiryStatusLabel(inq.status)} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            No inquiries yet — start with a customer call.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Trips
        </h3>
        {(detail.trips || []).length ? (
          <ul className="space-y-1.5">
            {detail.trips!.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/trips/${t.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] transition-colors glass-row hover:border-primary/25"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium tabular-nums">{t.tripNumber}</span>
                    <span className="text-muted-foreground"> · {t.title}</span>
                  </span>
                  <StatusBadge value={t.status} label={tripStatusLabel(t.status)} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
            No trips linked yet.
          </p>
        )}
      </section>
    </div>
  );
}

export function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { navigate } = useOrgNavigate();
  const { has, hasAny, all } = usePermissions();
  const canWrite = hasAny(CAP.partyWrite);
  const canCare = has('ops.read');
  const canCreateTravelRequest = all(TRAVEL_REQUEST_PERMISSIONS);
  const openTravelRequest = useTravelRequestLauncher();

  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [creditStatus, setCreditStatus] = useState<PartyCreditStatus | null>(null);
  const [journey, setJourney] = useState<PartyJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    businessType: '',
    paymentTerms: '',
    creditLimit: '',
    markupPercent: '',
  });
  const [saving, setSaving] = useState(false);
  const [contactForm, setContactForm] = useState({ fullName: '', email: '', phone: '' });
  const [addressForm, setAddressForm] = useState({ line1: '', city: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [assocOpen, setAssocOpen] = useState(true);

  useDocumentTitle(detail?.displayName || 'Customer');

  usePageChrome({
    title: detail?.displayName ?? 'Customer',
    titleMeta: detail
      ? [detail.email, detail.phone].filter(Boolean).join(' · ') || undefined
      : undefined,
    icon: Building2,
    breadcrumbs: detail
      ? [
          { label: 'Customers', onClick: () => navigate(AGENCY_ROUTES.businessCustomers) },
          { label: detail.displayName },
        ]
      : [{ label: 'Customers', onClick: () => navigate(AGENCY_ROUTES.businessCustomers) }],
  });

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [res, journeyRes, creditRes] = await Promise.all([
        api<PartyDetail>(`/parties/${id}`),
        api<PartyJourney>(`/parties/${id}/journey`).catch(() => null),
        api<PartyCreditStatus>(`/parties/${id}/credit-status`).catch(() => null),
      ]);
      setDetail(res);
      setCreditStatus(creditRes);
      setJourney(journeyRes);
      setEditForm({
        displayName: res.displayName,
        email: res.email || '',
        phone: res.phone || '',
        businessType: res.businessType || '',
        paymentTerms: res.paymentTerms || '',
        creditLimit:
          res.creditLimit != null && Number(res.creditLimit) > 0
            ? String(Number(res.creditLimit))
            : '',
        markupPercent: (() => {
          const override = partyMarkupPercentOverride(res);
          return override != null ? String(override) : '';
        })(),
      });
    } catch (e) {
      reportError(e, 'Could not load customer');
      setDetail(null);
      setJourney(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function saveProfile() {
    if (!id || !editForm.displayName.trim()) {
      toastError('Name is required');
      return;
    }
    setSaving(true);
    try {
      await api(`/parties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: editForm.displayName.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          businessType: editForm.businessType.trim() || null,
          paymentTerms: editForm.paymentTerms.trim() || null,
          creditLimit: editForm.creditLimit.trim()
            ? Number(editForm.creditLimit)
            : null,
          markupPercent: editForm.markupPercent.trim()
            ? Number(editForm.markupPercent)
            : null,
        }),
      });
      toastSuccess('Profile updated');
      setEditOpen(false);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function addContact() {
    if (!id || !contactForm.fullName.trim()) {
      toastError('Contact name is required');
      return;
    }
    setAddingContact(true);
    try {
      await api(`/parties/${id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: contactForm.fullName.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
        }),
      });
      toastSuccess('Contact added');
      setContactForm({ fullName: '', email: '', phone: '' });
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add contact');
    } finally {
      setAddingContact(false);
    }
  }

  async function addAddress(e: FormEvent) {
    e.preventDefault();
    if (!id || !addressForm.line1.trim()) {
      toastError('Address is required');
      return;
    }
    setAddingAddress(true);
    try {
      await api(`/parties/${id}/addresses`, {
        method: 'POST',
        body: JSON.stringify({
          label: 'Primary',
          line1: addressForm.line1.trim(),
          city: addressForm.city.trim() || null,
        }),
      });
      toastSuccess('Address added');
      setAddressForm({ line1: '', city: '' });
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not add address');
    } finally {
      setAddingAddress(false);
    }
  }

  if (loading) {
    return <PageSkeleton variant="detail" />;
  }

  if (!detail) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
        <Button variant="outline" onClick={() => navigate(AGENCY_ROUTES.businessCustomers)}>
          Back to customers
        </Button>
      </div>
    );
  }

  const agentMarkupCue = partyAgentMarkupCue(detail);
  const creditTermsCue = paymentTermsDueCue(detail.paymentTerms);
  const creditLimitCue = creditStatus
    ? partyCreditLimitCue(creditStatus, creditStatus.currency)
    : null;

  const openNewCall = () =>
    openTravelRequest({ partyId: detail.id, partyLabel: detail.displayName });

  const aboutProps = {
    detail,
    agentMarkupCue,
    creditTermsCue,
    creditLimitCue,
    creditStatus,
    contactForm,
    setContactForm,
    addressForm,
    setAddressForm,
    addingContact,
    addingAddress,
    onAddContact: () => void addContact(),
    onAddAddress: (e: FormEvent) => void addAddress(e),
    canWrite,
  };

  return (
    <DetailPageShell>
      <DetailActionStrip>
        {canCreateTravelRequest ? (
          <Button size="sm" onClick={openNewCall}>
            <Plus className="size-[0.875em]" />
            New customer call
          </Button>
        ) : null}
        <Can anyOf={CAP.partyWrite}>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-[0.875em]" />
            Edit profile
          </Button>
        </Can>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-[var(--control-h-sm)]"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-[0.875em]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-1">
            {canCreateTravelRequest ? (
              <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={openNewCall}>
                <ClipboardList />
                Start travel request
              </DropdownMenuItem>
            ) : null}
            {(detail.inquiries || [])[0]?.id ? (
              <DropdownMenuItem
                className={QUEUE_MENU_ITEM_CLASS}
                onClick={() => navigate(`/inquiries/${detail.inquiries![0].id}`)}
              >
                <ClipboardList />
                Latest inquiry
              </DropdownMenuItem>
            ) : null}
            {(detail.trips || [])[0]?.id ? (
              <DropdownMenuItem
                className={QUEUE_MENU_ITEM_CLASS}
                onClick={() => navigate(`/trips/${detail.trips![0].id}`)}
              >
                <Plane />
                Latest trip
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </DetailActionStrip>

      <div className={DETAIL_CRM_GRID}>
        <DetailPanel className="max-h-full self-start overflow-y-auto">
          <PartyAboutPanel {...aboutProps} />
        </DetailPanel>
        <DetailPanel className="min-h-0 overflow-y-auto">
          <PartyJourneyPanel detail={detail} journey={journey} canCare={canCare} />
        </DetailPanel>
        <DetailPanel className="max-h-full self-start overflow-y-auto">
          <PartyAssociationsPanel
            detail={detail}
            canCreateTravelRequest={canCreateTravelRequest}
            onNewCall={openNewCall}
          />
        </DetailPanel>
      </div>

      <div className={DETAIL_CRM_STACK}>
        <DetailMobileSection title="About this customer" open={aboutOpen} onOpenChange={setAboutOpen}>
          <PartyAboutPanel {...aboutProps} showHeader={false} />
        </DetailMobileSection>
        <DetailPanel className="min-h-[50vh] overflow-y-auto">
          <PartyJourneyPanel detail={detail} journey={journey} canCare={canCare} />
        </DetailPanel>
        <DetailMobileSection title="Related" open={assocOpen} onOpenChange={setAssocOpen}>
          <PartyAssociationsPanel
            detail={detail}
            canCreateTravelRequest={canCreateTravelRequest}
            onNewCall={openNewCall}
            showHeader={false}
          />
        </DetailMobileSection>
      </div>

      <RecordSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit profile"
        description="Quick updates to name and contact info."
        submitLabel="Save"
        submitting={saving}
        onSubmit={() => void saveProfile()}
      >
        <FormGrid>
          <FormField label="Name" required>
            <Input
              inputSize="sm"
              value={editForm.displayName}
              disabled={!canWrite}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </FormField>
          <FormField label="Email">
            <EmailInput
              inputSize="sm"
              value={editForm.email}
              disabled={!canWrite}
              onChange={(email) => setEditForm((f) => ({ ...f, email }))}
            />
          </FormField>
          <FormField label="Phone">
            <PhoneInput
              size="sm"
              value={editForm.phone}
              disabled={!canWrite}
              onChange={(phone) => setEditForm((f) => ({ ...f, phone }))}
            />
          </FormField>
          <FormField label="B2B type">
            <Combobox
              size="sm"
              value={editForm.businessType}
              disabled={!canWrite}
              onChange={(businessType) => setEditForm((f) => ({ ...f, businessType }))}
              options={[...B2B_PARTY_TYPES]}
            />
          </FormField>
          <FormField
            label="Payment terms"
            description="Net N terms auto-stamp customer receivable due dates on trips."
          >
            <Input
              inputSize="sm"
              value={editForm.paymentTerms}
              disabled={!canWrite}
              onChange={(e) => setEditForm((f) => ({ ...f, paymentTerms: e.target.value }))}
              placeholder="Net 30"
            />
          </FormField>
          <FormField label="Quick terms">
            <SuggestionChips
              aria-label="Payment terms presets"
              options={[...PAYMENT_TERMS_PRESETS]}
              value={
                PAYMENT_TERMS_PRESETS.some((o) => o.value === editForm.paymentTerms)
                  ? editForm.paymentTerms
                  : ''
              }
              onChange={(paymentTerms) => setEditForm((f) => ({ ...f, paymentTerms }))}
            />
          </FormField>
          <FormField label="Credit limit">
            <PriceField
              size="sm"
              currency={creditStatus?.currency || 'INR'}
              value={editForm.creditLimit}
              disabled={!canWrite}
              onChange={(creditLimit) => setEditForm((f) => ({ ...f, creditLimit }))}
              placeholder="Optional"
            />
          </FormField>
          <FormField
            label="Markup override %"
            description="Optional. Overrides org default / agent markup on Match and Apply default for this client. Clear to use org settings."
          >
            <NumberField
              inputSize="sm"
              min={0}
              max={500}
              integer={false}
              value={editForm.markupPercent}
              disabled={!canWrite}
              onChange={(markupPercent) => setEditForm((f) => ({ ...f, markupPercent }))}
              placeholder="Use org default"
            />
          </FormField>
        </FormGrid>
      </RecordSheet>
    </DetailPageShell>
  );
}
