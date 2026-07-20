import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import { Building2, Mail, Phone, Plus, Pencil, Route } from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Combobox,
  EmailInput,
  FormGrid,
  Input,
  PageHeader,
  PhoneInput,
  RecordSheet,
  SimpleFormField as FormField,
  StatusBadge,
  SuggestionChips,
  formatDateTime,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { CareHistoryPanel } from '../components/care/CareHistoryPanel';
import { DisclosureSection } from '../components/agency/DisclosureSection';
import { CAP, TRAVEL_REQUEST_PERMISSIONS } from '../lib/capabilities';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { inquiryStatusLabel, tripStatusLabel } from '../lib/agencyStatusLabels';
import { usePermissions } from '../lib/permissions';
import { type PartyDetail, B2B_PARTY_TYPES } from '../lib/partyTypes';
import { partyAgentMarkupCue } from '../lib/partyAgentMarkupCue';
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

export function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { navigate, toOrgPath } = useOrgNavigate();
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
  });
  const [saving, setSaving] = useState(false);
  const [contactForm, setContactForm] = useState({ fullName: '', email: '', phone: '' });
  const [addressForm, setAddressForm] = useState({ line1: '', city: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);

  useDocumentTitle(detail?.displayName || 'Customer');

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
    return <p className="p-6 text-sm text-muted-foreground">Loading customer…</p>;
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

  const tripCount = detail.trips?.length ?? 0;
  const inquiryCount = detail.inquiries?.length ?? 0;
  const contactCount = detail.contacts?.length ?? 0;
  const agentMarkupCue = partyAgentMarkupCue(detail);
  const creditTermsCue = paymentTermsDueCue(detail.paymentTerms);
  const creditLimitCue = creditStatus
    ? partyCreditLimitCue(creditStatus, creditStatus.currency)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Breadcrumbs
        items={[
          { label: 'Customers', onClick: () => navigate(AGENCY_ROUTES.businessCustomers) },
          { label: detail.displayName },
        ]}
      />

      <PageHeader
        icon={Building2}
        title={detail.displayName}
        subtitle={[detail.email, detail.phone].filter(Boolean).join(' · ') || 'No contact details yet'}
        actions={
          <div className="flex flex-wrap gap-2">
            {canCreateTravelRequest ? (
              <Button
                onClick={() =>
                  openTravelRequest({ partyId: detail.id, partyLabel: detail.displayName })
                }
              >
                <Plus className="size-4" />
                New customer call
              </Button>
            ) : null}
            <Can anyOf={CAP.partyWrite}>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit profile
              </Button>
            </Can>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={detail.type} />
        {detail.businessType ? (
          <StatusBadge value={detail.businessType} showIcon={false} />
        ) : null}
      </div>

      {agentMarkupCue ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          {agentMarkupCue}
        </p>
      ) : null}

      {creditTermsCue || creditLimitCue || detail.creditLimit ? (
        <p
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            creditStatus?.overLimit
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border/60 bg-muted/20 text-muted-foreground'
          }`}
        >
          {[creditLimitCue, creditTermsCue].filter(Boolean).join(' · ') ||
            'No payment terms set'}
          {detail.creditLimit != null &&
          Number(detail.creditLimit) > 0 &&
          !creditLimitCue
            ? ` · Credit limit ₹${Math.round(Number(detail.creditLimit)).toLocaleString('en-IN')}`
            : ''}
        </p>
      ) : null}

      {journey ? (
        <section className="space-y-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Journey</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-background px-2.5 py-1.5">
              Found via{' '}
              <span className="font-medium">
                {journey.acquisition?.name ||
                  (journey.acquisition?.key ? humanizeKey(journey.acquisition.key) : 'Unknown')}
              </span>
            </span>
            {journey.firstChannel ? (
              <span className="rounded-lg bg-background px-2.5 py-1.5">
                First channel{' '}
                <span className="font-medium">{humanizeKey(journey.firstChannel)}</span>
              </span>
            ) : null}
            <span className="rounded-lg bg-background px-2.5 py-1.5">
              {(detail.inquiries || []).length} inquir{(detail.inquiries || []).length === 1 ? 'y' : 'ies'}
            </span>
            <span className="rounded-lg bg-background px-2.5 py-1.5">
              {(detail.trips || []).length} trip{(detail.trips || []).length === 1 ? '' : 's'}
            </span>
          </div>
          {journey.interactions.length ? (
            <ol className="space-y-2 border-l border-border/70 pl-3">
              {journey.interactions.slice(-6).map((touch) => (
                <li key={touch.id} className="relative text-sm">
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
            <p className="text-sm text-muted-foreground">
              No interactions yet — the next customer call will start this timeline.
            </p>
          )}
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Inquiries" value={String(inquiryCount)} />
        <StatCard label="Trips" value={String(tripCount)} />
        <StatCard label="Contacts" value={String(contactCount)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Inquiries</h2>
            {canCreateTravelRequest ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  openTravelRequest({ partyId: detail.id, partyLabel: detail.displayName })
                }
              >
                <Plus className="size-4" />
                New call
              </Button>
            ) : null}
          </div>
          {(detail.inquiries || []).length ? (
            <ul className="space-y-2">
              {detail.inquiries!.map((inq) => (
                <li key={inq.id}>
                  <Link
                    to={`/inquiries/${inq.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm transition-colors hover:border-primary/30"
                  >
                    <span>
                      <span className="font-medium tabular-nums">{inq.inquiryNumber}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDateTime(inq.updatedAt)}
                      </span>
                    </span>
                    <StatusBadge value={inq.status} label={inquiryStatusLabel(inq.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No inquiries yet — start with a customer call.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Trips</h2>
          {(detail.trips || []).length ? (
            <ul className="space-y-2">
              {detail.trips!.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/trips/${t.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm transition-colors hover:border-primary/30"
                  >
                    <span className="min-w-0">
                      <span className="font-medium tabular-nums">{t.tripNumber}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.title}</span>
                    </span>
                    <StatusBadge value={t.status} label={tripStatusLabel(t.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No trips linked yet.</p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Contacts</h2>
          {(detail.contacts || []).length ? (
            <ul className="space-y-2">
              {detail.contacts!.map((c) => (
                <li key={c.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <div className="font-medium">{c.fullName}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">No additional contacts.</p>
          )}
          <Can anyOf={CAP.partyWrite}>
            <FormGrid>
              <FormField label="Name">
                <Input
                  value={contactForm.fullName}
                  onChange={(e) => setContactForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Contact name"
                />
              </FormField>
              <FormField label="Phone">
                <PhoneInput
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
              onClick={() => void addContact()}
            >
              {addingContact ? 'Adding…' : 'Add contact'}
            </Button>
          </Can>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Addresses</h2>
          {(detail.addresses || []).length ? (
            <ul className="space-y-2">
              {detail.addresses!.map((a) => (
                <li key={a.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <div className="font-medium">{a.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.line1}
                    {a.city ? ` · ${a.city}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No addresses yet.</p>
          )}
          <Can anyOf={CAP.partyWrite}>
            <form className="space-y-3" onSubmit={(e) => void addAddress(e)}>
              <FormGrid>
                <FormField label="Line 1">
                  <Input
                    value={addressForm.line1}
                    onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))}
                    placeholder="Street address"
                  />
                </FormField>
                <FormField label="City">
                  <Input
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
        </section>
      </div>

      {canCare ? (
        <DisclosureSection
          title="Care & partner history"
          description="Stays, meals, incidents, and ratings linked to this customer."
          level="secondary"
        >
          <CareHistoryPanel
            key={detail.id}
            initialPartyId={detail.id}
            initialPhone={detail.phone || undefined}
            initialName={detail.displayName}
          />
        </DisclosureSection>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Updated {formatDateTime(detail.updatedAt)}
        {' · '}
        <Link to={toOrgPath(AGENCY_ROUTES.businessCustomers)} className="text-primary hover:underline">
          Back to customers
        </Link>
      </p>

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
              value={editForm.displayName}
              disabled={!canWrite}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </FormField>
          <FormField label="Email">
            <EmailInput
              value={editForm.email}
              disabled={!canWrite}
              onChange={(email) => setEditForm((f) => ({ ...f, email }))}
            />
          </FormField>
          <FormField label="Phone">
            <PhoneInput
              value={editForm.phone}
              disabled={!canWrite}
              onChange={(phone) => setEditForm((f) => ({ ...f, phone }))}
            />
          </FormField>
          <FormField label="B2B type">
            <Combobox
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
              value={editForm.paymentTerms}
              disabled={!canWrite}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, paymentTerms: e.target.value }))
              }
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
              onChange={(paymentTerms) =>
                setEditForm((f) => ({ ...f, paymentTerms }))
              }
            />
          </FormField>
          <FormField label="Credit limit (₹)">
            <Input
              type="number"
              min={0}
              value={editForm.creditLimit}
              disabled={!canWrite}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, creditLimit: e.target.value }))
              }
              placeholder="Optional"
            />
          </FormField>
        </FormGrid>
      </RecordSheet>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
