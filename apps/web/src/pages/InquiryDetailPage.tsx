import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Contact, Pencil, Plane } from 'lucide-react';
import {
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  PageHeader,
  StatusBadge,
  humanizeFieldKeys,
  formatCurrency,
  formatDate,
  formatDateTime,
  toastError,
  toastSuccess,
} from '@travel/ui';
import { api } from '../api';
import { CAP } from '../lib/capabilities';
import { inquiryStatusLabel, tripStatusLabel } from '../lib/agencyStatusLabels';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { leadOutcomeMessage, type LeadOutcome } from '../lib/lead-outcome';
import { placeRefsFromJson } from '../lib/placeRefs';
import { InquiryEditSheet } from '../components/inquiries/InquiryEditSheet';
import { InquiryStatusMenu } from '../components/inquiries/InquiryStatusMenu';
import { RequirementSummaryCards } from '../components/inquiries/RequirementSummaryCards';
import { DisclosureSection } from '../components/agency/DisclosureSection';
import { AgencyStoryTimeline } from '../components/agency/AgencyStoryTimeline';

type InquiryDetail = {
  id: string;
  inquiryNumber: string;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  origin?: string | null;
  destinationsJson?: unknown;
  missingFieldsJson?: string[] | null;
  adults?: number;
  children?: number;
  infants?: number;
  budgetAmount?: number | string | null;
  budgetCurrency?: string | null;
  hotelCategory?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  party?: { id?: string; displayName?: string; email?: string | null } | null;
  lead?: { id: string; title?: string } | null;
  trips?: Array<{ id: string; tripNumber: string; title: string; status: string; createdAt?: string; updatedAt?: string }>;
  statusHistory?: Array<{ id: string; status: string; note?: string | null; createdAt: string }>;
  updatedAt: string;
};

type LeadActivity = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
};

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  honeymoon: 'Honeymoon',
  business: 'Business',
  family: 'Family',
};

const DOMESTIC_LABELS: Record<string, string> = {
  domestic: 'Domestic',
  international: 'International',
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function InquiryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  const [error, setError] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const { hasAny, has } = usePermissions();
  const canConvert = hasAny(CAP.inquiryConvertTrip);
  const canWrite = has('inquiry.write');
  useDocumentTitle(inquiry ? `Inquiry · ${inquiry.inquiryNumber}` : 'Inquiry');

  async function load() {
    if (!id) return;
    try {
      const res = await api<InquiryDetail>(`/inquiries/${id}`);
      setInquiry(res);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    const leadId = inquiry?.lead?.id;
    if (!leadId) {
      setLeadActivities([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const lead = await api<{ activities?: LeadActivity[] }>(`/leads/${leadId}`);
        if (!cancelled) setLeadActivities(lead.activities || []);
      } catch {
        if (!cancelled) setLeadActivities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiry?.lead?.id]);

  async function convert() {
    if (!id) return;
    setConverting(true);
    try {
      const trip = await api<{ id: string; leadOutcome?: LeadOutcome }>(
        `/inquiries/${id}/convert-to-trip`,
        { method: 'POST' },
      );
      toastSuccess(leadOutcomeMessage(trip.leadOutcome, 'Trip created'));
      setConvertOpen(false);
      navigate(`/trips/${trip.id}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not convert');
    } finally {
      setConverting(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!inquiry) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const missing = inquiry.missingFieldsJson || [];
  const canEdit = canWrite && inquiry.status !== 'converted';
  const destinations =
    placeRefsFromJson(inquiry.destinationsJson)
      .map((p) => p.name)
      .join(', ') || '—';
  const captured = [
    inquiry.party?.displayName ? `Customer — ${inquiry.party.displayName}` : null,
    destinations !== '—' ? `Destination — ${destinations}` : null,
    inquiry.adults
      ? `${inquiry.adults} adults${inquiry.children ? `, ${inquiry.children} children` : ''}`
      : null,
    inquiry.budgetAmount != null
      ? `Budget — ${formatCurrency(inquiry.budgetAmount, {
          currency: inquiry.budgetCurrency || 'INR',
          maximumFractionDigits: 0,
        })}`
      : null,
    inquiry.hotelCategory ? `Stay — ${inquiry.hotelCategory}` : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Inquiries', onClick: () => navigate('/inquiries') },
          { label: inquiry.inquiryNumber },
        ]}
      />
      <PageHeader
        icon={Contact}
        title={inquiry.inquiryNumber}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{inquiry.party?.displayName || 'Walk-in / no client'}</span>
            {destinations !== '—' ? (
              <>
                <span className="text-border">·</span>
                <span>{destinations}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={inquiry.status}
              label={inquiryStatusLabel(inquiry.status)}
              size="md"
              showIcon
            />
            {canWrite ? (
              <InquiryStatusMenu inquiry={inquiry} onChanged={setInquiry} />
            ) : null}
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                {missing.length ? 'Complete requirements' : 'Edit'}
              </Button>
            ) : null}
            {canConvert && inquiry.status !== 'converted' ? (
              <Button onClick={() => setConvertOpen(true)}>
                <Plane className="size-4" />
                Convert to trip
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4">
        <RequirementSummaryCards captured={captured} missing={missing} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-3 p-5">
            <strong className="text-sm">About</strong>
            <dl className="space-y-2.5">
              <DetailRow label="Client">
                {inquiry.party?.id ? (
                  <Link
                    className="text-primary hover:underline"
                    to={`/parties/${inquiry.party.id}`}
                  >
                    {inquiry.party.displayName}
                  </Link>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Trip type">
                {(inquiry.travelType && TRAVEL_TYPE_LABELS[inquiry.travelType]) ||
                  inquiry.travelType ||
                  '—'}{' '}
                ·{' '}
                {(inquiry.domesticOrIntl && DOMESTIC_LABELS[inquiry.domesticOrIntl]) ||
                  inquiry.domesticOrIntl ||
                  '—'}
              </DetailRow>
              <DetailRow label="Destinations">{destinations}</DetailRow>
              <DetailRow label="Dates">
                {inquiry.startDate || inquiry.endDate
                  ? `${inquiry.startDate ? formatDate(inquiry.startDate) : '—'} → ${
                      inquiry.endDate ? formatDate(inquiry.endDate) : '—'
                    }`
                  : '—'}
              </DetailRow>
              <DetailRow label="Travellers">
                {inquiry.adults ?? 0} adults
                {inquiry.children ? ` · ${inquiry.children} children` : ''}
                {inquiry.infants ? ` · ${inquiry.infants} infants` : ''}
              </DetailRow>
              <DetailRow label="Budget">
                {inquiry.budgetAmount != null
                  ? formatCurrency(inquiry.budgetAmount, {
                      currency: inquiry.budgetCurrency || 'INR',
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </DetailRow>
              <DetailRow label="Hotel">{inquiry.hotelCategory || '—'}</DetailRow>
              <DisclosureSection title="CRM links & metadata" level="secondary">
                <dl className="space-y-2.5">
                  <DetailRow label="Lead">
                    {inquiry.lead?.id ? (
                      <Link className="text-primary hover:underline" to={`/leads/${inquiry.lead.id}`}>
                        {inquiry.lead.title || 'Open lead'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </DetailRow>
                  <DetailRow label="Origin">{inquiry.origin || '—'}</DetailRow>
                  <DetailRow label="Updated">{formatDateTime(inquiry.updatedAt)}</DetailRow>
                </dl>
              </DisclosureSection>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">Linked trips</strong>
              {canConvert && inquiry.status !== 'converted' ? (
                <Button size="sm" variant="secondary" onClick={() => setConvertOpen(true)}>
                  <Plane className="size-3.5" />
                  Convert
                </Button>
              ) : null}
            </div>
            {(inquiry.trips || []).length ? (
              <ul className="space-y-2">
                {inquiry.trips!.map((t) => (
                  <li key={t.id}>
                    <Link
                      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors glass-row hover:border-primary/25"
                      to={`/trips/${t.id}`}
                    >
                      <span>
                        <span className="font-medium tabular-nums">{t.tripNumber}</span>
                        <span className="text-muted-foreground"> · {t.title}</span>
                      </span>
                      <StatusBadge value={t.status} label={tripStatusLabel(t.status)} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No trips yet. Convert this inquiry to start planning.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <AgencyStoryTimeline
          inquiryNumber={inquiry.inquiryNumber}
          statusHistory={inquiry.statusHistory}
          trips={inquiry.trips}
          leadActivities={leadActivities}
          leadHref={inquiry.lead?.id ? `/leads/${inquiry.lead.id}` : undefined}
        />
      </div>

      <InquiryEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        inquiry={inquiry}
        onSaved={(updated) => setInquiry(updated as InquiryDetail)}
      />

      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to trip?"
        description="Creates a trip workspace and marks the linked lead Won when eligible."
        confirmLabel="Convert"
        loading={converting}
        onConfirm={convert}
      />
    </div>
  );
}
