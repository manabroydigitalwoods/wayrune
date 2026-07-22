import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOrgNavigate } from '../hooks/useOrgNavigate';
import {
  ClipboardList,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Plane,
  UserPlus,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EntityCombobox,
  PageSkeleton,
  RecordSheet,
  StatusBadge,
  formatCurrency,
  formatDate,
  formatDateTime,
  toastError,
  toastSuccess,
  usePageChrome,
} from '@wayrune/ui';
import { api } from '../api';
import { Can } from '../components/Can';
import { QUEUE_MENU_ITEM_CLASS } from '../components/queue';
import {
  DETAIL_CRM_GRID,
  DETAIL_CRM_STACK,
  DetailActionStrip,
  DetailMobileSection,
  DetailPageShell,
  DetailPanel,
} from '../components/detail';
import { CAP } from '../lib/capabilities';
import { inquiryStatusLabel, tripStatusLabel } from '../lib/agencyStatusLabels';
import {
  confirmedOpsTrips,
  pickActiveProposalTrip,
  pickPrimaryOpsTrip,
  proposalTrips,
} from '../lib/inquiryTripRoles';
import { usePermissions } from '../lib/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { leadOutcomeMessage, type LeadOutcome } from '../lib/lead-outcome';
import { originRefFromInquiry, placeName, placeRefsFromJson } from '../lib/placeRefs';
import { InquiryEditSheet } from '../components/inquiries/InquiryEditSheet';
import { InquiryStatusMenu } from '../components/inquiries/InquiryStatusMenu';
import { ProposalBriefDialog } from '../components/inquiries/ProposalBriefDialog';
import { ProposalReadinessPanel } from '../components/inquiries/ProposalReadinessPanel';
import { AgencyStoryTimeline } from '../components/agency/AgencyStoryTimeline';
import {
  computeInquiryProposalReadiness,
  type InquiryProposalReadiness,
} from '@wayrune/contracts';

type InquiryDetail = {
  id: string;
  inquiryNumber: string;
  status: string;
  travelType?: string | null;
  domesticOrIntl?: string | null;
  /** @deprecated Prefer originJson */
  origin?: string | null;
  /** @deprecated Prefer originJson */
  originPlaceId?: string | null;
  originJson?: unknown;
  destinationsJson?: unknown;
  stopsJson?: unknown;
  missingFieldsJson?: string[] | null;
  proposalReadiness?: InquiryProposalReadiness;
  adults?: number;
  children?: number;
  infants?: number;
  nights?: number | null;
  budgetAmount?: number | string | null;
  budgetCurrency?: string | null;
  hotelCategory?: string | null;
  meals?: string | null;
  transportPref?: string | null;
  flightsRequired?: boolean;
  roomRequirements?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  party?: { id?: string; displayName?: string; email?: string | null } | null;
  lead?: { id: string; title?: string } | null;
  trips?: Array<{
    id: string;
    tripNumber: string;
    title: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-x-2 gap-y-0.5 text-[length:var(--control-text-sm)]">
      <dt className="pt-0.5 uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{children}</dd>
    </div>
  );
}

function InquiryAboutPanel({
  inquiry,
  showHeader = true,
  canWrite,
  onCreateFromLead,
  onLinkExisting,
  onAddDuration,
  linking,
}: {
  inquiry: InquiryDetail;
  showHeader?: boolean;
  canWrite: boolean;
  onCreateFromLead: () => void;
  onLinkExisting: () => void;
  onAddDuration: () => void;
  linking: boolean;
}) {
  const destinations =
    placeRefsFromJson(inquiry.destinationsJson)
      .map((p) => p.name)
      .join(', ') || '—';
  const missingEnd = Boolean(inquiry.startDate && !inquiry.endDate);

  return (
    <div className="space-y-3">
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">
          About this inquiry
        </h2>
      ) : null}
      <dl className="space-y-2.5">
        <FieldRow label="Customer">
          {inquiry.party?.id ? (
            <Link className="text-primary hover:underline" to={`/parties/${inquiry.party.id}`}>
              {inquiry.party.displayName}
            </Link>
          ) : (
            <div className="space-y-1.5">
              <span className="text-muted-foreground">Not linked</span>
              {canWrite ? (
                <div className="flex flex-wrap gap-1">
                  {inquiry.lead?.id ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={linking}
                      onClick={onCreateFromLead}
                    >
                      <UserPlus className="size-3" />
                      Create from lead
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={linking}
                    onClick={onLinkExisting}
                  >
                    <Link2 className="size-3" />
                    Link existing
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </FieldRow>
        <FieldRow label="Type">
          {(inquiry.travelType && TRAVEL_TYPE_LABELS[inquiry.travelType]) ||
            inquiry.travelType ||
            '—'}{' '}
          ·{' '}
          {(inquiry.domesticOrIntl && DOMESTIC_LABELS[inquiry.domesticOrIntl]) ||
            inquiry.domesticOrIntl ||
            '—'}
        </FieldRow>
        <FieldRow label="Where">{destinations}</FieldRow>
        <FieldRow label="Origin">{placeName(originRefFromInquiry(inquiry)) || '—'}</FieldRow>
        <FieldRow label="Dates">
          {missingEnd ? (
            <div className="space-y-1">
              <span>
                {formatDate(inquiry.startDate!)} ·{' '}
                <span className="font-normal text-muted-foreground">End date not set</span>
              </span>
              {canWrite ? (
                <Button type="button" size="xs" variant="outline" onClick={onAddDuration}>
                  Add duration
                </Button>
              ) : null}
            </div>
          ) : inquiry.startDate || inquiry.endDate ? (
            `${inquiry.startDate ? formatDate(inquiry.startDate) : '—'} → ${
              inquiry.endDate ? formatDate(inquiry.endDate) : '—'
            }`
          ) : (
            '—'
          )}
        </FieldRow>
        <FieldRow label="Pax">
          {inquiry.adults ?? 0} adults
          {inquiry.children ? ` · ${inquiry.children} children` : ''}
          {inquiry.infants ? ` · ${inquiry.infants} infants` : ''}
        </FieldRow>
        <FieldRow label="Budget">
          {inquiry.budgetAmount != null
            ? formatCurrency(inquiry.budgetAmount, {
                currency: inquiry.budgetCurrency || 'INR',
                maximumFractionDigits: 0,
              })
            : '—'}
        </FieldRow>
        <FieldRow label="Hotel">{inquiry.hotelCategory || '—'}</FieldRow>
        <FieldRow label="Updated">{formatDateTime(inquiry.updatedAt)}</FieldRow>
      </dl>
    </div>
  );
}

function InquiryAssociationsPanel({
  inquiry,
  showHeader = true,
  canBuildProposal,
  onBuildProposal,
}: {
  inquiry: InquiryDetail;
  showHeader?: boolean;
  canBuildProposal: boolean;
  onBuildProposal: () => void;
}) {
  const proposals = proposalTrips(inquiry.trips);
  const opsTrips = confirmedOpsTrips(inquiry.trips);

  return (
    <div className="space-y-4">
      {showHeader ? (
        <h2 className="text-[length:var(--control-text)] font-semibold tracking-tight">Related</h2>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Proposals
        </h3>
        {proposals.length ? (
          <ul className="space-y-1.5">
            {proposals.map((t) => (
              <li key={t.id}>
                <Link
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] transition-colors glass-row hover:border-primary/25"
                  to={`/trips/${t.id}?tab=itinerary`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">Proposal {t.tripNumber}</span>
                    <span className="block truncate text-muted-foreground">{t.title}</span>
                  </span>
                  <StatusBadge value={t.status} label={tripStatusLabel(t.status)} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
              No proposal created
            </p>
            {canBuildProposal ? (
              <Button type="button" size="xs" variant="secondary" onClick={onBuildProposal}>
                <FileText className="size-3" />
                Build proposal
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Trips
        </h3>
        {opsTrips.length ? (
          <ul className="space-y-1.5">
            {opsTrips.map((t) => (
              <li key={t.id}>
                <Link
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] transition-colors glass-row hover:border-primary/25"
                  to={`/trips/${t.id}`}
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
            No confirmed trip yet
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Lead
        </h3>
        {inquiry.lead?.id ? (
          <Link
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] glass-row hover:border-primary/25"
            to={`/leads/${inquiry.lead.id}`}
          >
            <span className="truncate font-medium">{inquiry.lead.title || 'Open lead'}</span>
          </Link>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">No linked lead</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground">
          Customer
        </h3>
        {inquiry.party?.id ? (
          <Link
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[length:var(--control-text-sm)] glass-row hover:border-primary/25"
            to={`/parties/${inquiry.party.id}`}
          >
            <span className="truncate font-medium">{inquiry.party.displayName}</span>
          </Link>
        ) : (
          <p className="text-[length:var(--control-text-sm)] text-muted-foreground">Not linked</p>
        )}
      </section>
    </div>
  );
}

export function InquiryDetailPage() {
  const { id } = useParams();
  const { navigate } = useOrgNavigate();
  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);
  const [error, setError] = useState('');
  const [buildProposalOpen, setBuildProposalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkPartyOpen, setLinkPartyOpen] = useState(false);
  const [linkPartyId, setLinkPartyId] = useState('');
  const [linkPartyLabel, setLinkPartyLabel] = useState('');
  const [aboutOpen, setAboutOpen] = useState(true);
  const [assocOpen, setAssocOpen] = useState(true);
  const { hasAny, has } = usePermissions();
  const canConvert = hasAny(CAP.inquiryConvertTrip);
  const canWrite = has('inquiry.write');

  useDocumentTitle(inquiry ? `Inquiry · ${inquiry.inquiryNumber}` : 'Inquiry');

  const destinations =
    inquiry
      ? placeRefsFromJson(inquiry.destinationsJson)
          .map((p) => p.name)
          .join(', ') || ''
      : '';

  usePageChrome({
    title: inquiry?.inquiryNumber ?? 'Inquiry',
    titleMeta: inquiry
      ? [inquiry.party?.displayName || 'Walk-in', destinations || null].filter(Boolean).join(' · ') ||
        undefined
      : undefined,
    icon: ClipboardList,
    breadcrumbs: inquiry
      ? [
          { label: 'Inquiries', onClick: () => navigate('/inquiries') },
          { label: inquiry.inquiryNumber },
        ]
      : [{ label: 'Inquiries', onClick: () => navigate('/inquiries') }],
  });

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

  function openProposalWorkspace(tripId: string) {
    navigate(`/trips/${tripId}?tab=itinerary`);
  }

  /** Shared by header + Related — open existing proposal or confirm create. */
  function requestBuildProposal() {
    if (!inquiry) return;
    const active = pickActiveProposalTrip(inquiry.trips);
    if (active) {
      openProposalWorkspace(active.id);
      return;
    }
    setBuildProposalOpen(true);
  }

  async function confirmBuildProposal() {
    if (!id) return;
    setBuilding(true);
    try {
      const trip = await api<{
        id: string;
        leadOutcome?: LeadOutcome;
        created?: boolean;
        reusedExistingProposal?: boolean;
        seed?: { status?: string; failedSteps?: string[] };
      }>(`/inquiries/${id}/convert-to-trip`, { method: 'POST' });
      const partial =
        trip.seed?.status === 'partial' || (trip.seed?.failedSteps?.length ?? 0) > 0;
      toastSuccess(
        leadOutcomeMessage(
          trip.leadOutcome,
          partial
            ? 'Proposal workspace created — some setup needs retry'
            : trip.reusedExistingProposal
              ? 'Opened existing proposal workspace'
              : 'Proposal workspace created',
        ),
      );
      setBuildProposalOpen(false);
      openProposalWorkspace(trip.id);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not start proposal');
    } finally {
      setBuilding(false);
    }
  }

  async function attachParty(partyId: string, label?: string) {
    if (!id) return;
    setLinking(true);
    try {
      const updated = await api<InquiryDetail>(`/inquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ partyId }),
      });
      setInquiry(updated);
      toastSuccess(`Linked to ${label || updated.party?.displayName || 'customer'}`);
      setLinkPartyOpen(false);
      setLinkPartyId('');
      setLinkPartyLabel('');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not link customer');
    } finally {
      setLinking(false);
    }
  }

  async function createFromLead() {
    if (!inquiry?.lead?.id) return;
    setLinking(true);
    try {
      const res = await api<{
        party: { id: string; displayName: string };
        created: boolean;
        alreadyLinked: boolean;
      }>(`/leads/${inquiry.lead.id}/convert-to-client`, { method: 'POST' });
      await attachParty(res.party.id, res.party.displayName);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create customer from lead');
      setLinking(false);
    }
  }

  async function searchParties(q: string) {
    const res = await api<{
      items: Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>;
    }>(`/parties?pageSize=8&q=${encodeURIComponent(q.trim() || '')}`);
    return (res.items || []).map((p) => ({
      value: p.id,
      label: p.displayName,
      description: [p.email, p.phone].filter(Boolean).join(' · ') || undefined,
    }));
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!inquiry) return <PageSkeleton variant="detail" />;

  const missing = inquiry.missingFieldsJson || [];
  const canEdit = canWrite && inquiry.status !== 'converted';
  const coreReady = missing.length === 0;
  const proposalReadiness =
    inquiry.proposalReadiness ??
    computeInquiryProposalReadiness({
      destinations: placeRefsFromJson(inquiry.destinationsJson),
      stops: placeRefsFromJson(inquiry.stopsJson),
      adults: inquiry.adults,
      children: inquiry.children,
      travelType: inquiry.travelType,
      startDate: inquiry.startDate,
      endDate: inquiry.endDate,
      nights: inquiry.nights,
      budgetAmount:
        inquiry.budgetAmount == null || inquiry.budgetAmount === ''
          ? null
          : Number(inquiry.budgetAmount),
      hotelCategory: inquiry.hotelCategory,
      meals: inquiry.meals,
      transportPref: inquiry.transportPref,
      flightsRequired: inquiry.flightsRequired,
      roomRequirements: inquiry.roomRequirements,
      origin: originRefFromInquiry(inquiry),
    });
  const activeProposal = pickActiveProposalTrip(inquiry.trips);
  const primaryOpsTrip = pickPrimaryOpsTrip(inquiry.trips);

  const showCompletePrimary = canEdit && !coreReady && !proposalReadiness.draftable;
  const canBuildProposal =
    canConvert &&
    !activeProposal &&
    proposalReadiness.draftable &&
    (inquiry.status === 'qualified' || inquiry.status === 'open');
  const showBuildPrimary = canBuildProposal && inquiry.status === 'qualified';
  const showBuildOutline =
    canBuildProposal && inquiry.status === 'open' && canEdit;
  const showOpenProposal = Boolean(activeProposal);
  const showOpenTrip = !activeProposal && Boolean(primaryOpsTrip);

  const aboutProps = {
    inquiry,
    canWrite: canEdit,
    onCreateFromLead: () => void createFromLead(),
    onLinkExisting: () => {
      setLinkPartyId('');
      setLinkPartyLabel('');
      setLinkPartyOpen(true);
    },
    onAddDuration: () => setEditOpen(true),
    linking,
  };

  return (
    <DetailPageShell>
      <DetailActionStrip
        leading={
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge
                value={inquiry.status}
                label={inquiryStatusLabel(inquiry.status)}
                showIcon
              />
              {canWrite ? <InquiryStatusMenu inquiry={inquiry} onChanged={setInquiry} /> : null}
            </div>
            {inquiry.status === 'qualified' ? (
              <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
                Qualified means destination, travel start, travellers, and budget are known.
              </p>
            ) : null}
          </div>
        }
      >
        {showCompletePrimary ? (
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-[0.875em]" />
            Complete requirements
          </Button>
        ) : null}
        {showBuildPrimary ? (
          <Button size="sm" data-testid="build-proposal" onClick={requestBuildProposal}>
            <FileText className="size-[0.875em]" />
            Build proposal
          </Button>
        ) : null}
        {showBuildOutline ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="build-proposal"
            onClick={requestBuildProposal}
          >
            <FileText className="size-[0.875em]" />
            Build proposal
          </Button>
        ) : null}
        {showOpenProposal ? (
          <Button
            size="sm"
            onClick={() => openProposalWorkspace(activeProposal!.id)}
          >
            <FileText className="size-[0.875em]" />
            Open proposal
          </Button>
        ) : null}
        {showOpenTrip ? (
          <Button size="sm" onClick={() => navigate(`/trips/${primaryOpsTrip!.id}`)}>
            <Plane className="size-[0.875em]" />
            Open trip
          </Button>
        ) : null}
        <Can anyOf={CAP.inquiryWrite}>
          {canEdit ? (
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
                <DropdownMenuItem className={QUEUE_MENU_ITEM_CLASS} onClick={() => setEditOpen(true)}>
                  <Pencil />
                  {missing.length ? 'Complete requirements' : 'Edit inquiry'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </Can>
      </DetailActionStrip>

      <div className="shrink-0">
        <ProposalReadinessPanel
          readiness={proposalReadiness}
          commercialMissing={missing}
        />
      </div>

      <div className={DETAIL_CRM_GRID}>
        <DetailPanel className="max-h-full self-start overflow-y-auto">
          <InquiryAboutPanel {...aboutProps} />
        </DetailPanel>
        <DetailPanel className="min-h-0 overflow-y-auto">
          <AgencyStoryTimeline
            inquiryNumber={inquiry.inquiryNumber}
            statusHistory={inquiry.statusHistory}
            trips={inquiry.trips}
            leadActivities={leadActivities}
            leadHref={inquiry.lead?.id ? `/leads/${inquiry.lead.id}` : undefined}
          />
        </DetailPanel>
        <DetailPanel className="max-h-full self-start overflow-y-auto">
          <InquiryAssociationsPanel
            inquiry={inquiry}
            canBuildProposal={canBuildProposal}
            onBuildProposal={requestBuildProposal}
          />
        </DetailPanel>
      </div>

      <div className={DETAIL_CRM_STACK}>
        <DetailMobileSection title="About this inquiry" open={aboutOpen} onOpenChange={setAboutOpen}>
          <InquiryAboutPanel {...aboutProps} showHeader={false} />
        </DetailMobileSection>
        <DetailPanel className="min-h-[50vh] overflow-y-auto">
          <AgencyStoryTimeline
            inquiryNumber={inquiry.inquiryNumber}
            statusHistory={inquiry.statusHistory}
            trips={inquiry.trips}
            leadActivities={leadActivities}
            leadHref={inquiry.lead?.id ? `/leads/${inquiry.lead.id}` : undefined}
          />
        </DetailPanel>
        <DetailMobileSection title="Related" open={assocOpen} onOpenChange={setAssocOpen}>
          <InquiryAssociationsPanel
            inquiry={inquiry}
            canBuildProposal={canBuildProposal}
            onBuildProposal={requestBuildProposal}
            showHeader={false}
          />
        </DetailMobileSection>
      </div>

      <InquiryEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        inquiry={inquiry}
        onSaved={(updated) => setInquiry(updated as InquiryDetail)}
      />

      <RecordSheet
        open={linkPartyOpen}
        onOpenChange={setLinkPartyOpen}
        title="Link customer"
        description="Attach an existing customer to this inquiry."
        submitLabel="Link"
        submitting={linking}
        onSubmit={() => void attachParty(linkPartyId, linkPartyLabel)}
      >
        <EntityCombobox
          size="sm"
          value={linkPartyId}
          selectedLabel={linkPartyLabel}
          onChange={(partyId, option) => {
            setLinkPartyId(partyId);
            setLinkPartyLabel(option?.label || '');
          }}
          onSearch={searchParties}
          placeholder="Search customers…"
          emptyText="No customers match"
          clearable
        />
      </RecordSheet>

      <ProposalBriefDialog
        open={buildProposalOpen}
        onOpenChange={setBuildProposalOpen}
        inquiry={inquiry}
        loading={building}
        onEditRequirements={() => setEditOpen(true)}
        onConfirm={() => void confirmBuildProposal()}
      />
    </DetailPageShell>
  );
}
