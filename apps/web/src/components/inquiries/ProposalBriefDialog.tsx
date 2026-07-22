import {
  buildProposalAssumptions,
  computeInquiryProposalReadiness,
  resolveTripDayCount,
  type InquiryProposalReadiness,
} from '@wayrune/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatCurrency,
  formatDate,
  humanizeFieldKeys,
} from '@wayrune/ui';
import { originRefFromInquiry, placeRefsFromJson } from '../../lib/placeRefs';

export type ProposalBriefInquiry = {
  inquiryNumber: string;
  travelType?: string | null;
  destinationsJson?: unknown;
  stopsJson?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  nights?: number | null;
  adults?: number;
  children?: number;
  infants?: number;
  budgetAmount?: number | string | null;
  budgetCurrency?: string | null;
  hotelCategory?: string | null;
  meals?: string | null;
  transportPref?: string | null;
  flightsRequired?: boolean | null;
  roomRequirements?: string | null;
  /** @deprecated Prefer originJson */
  origin?: string | null;
  /** @deprecated Prefer originJson */
  originPlaceId?: string | null;
  originJson?: unknown;
  proposalReadiness?: InquiryProposalReadiness;
};

const TRAVEL_TYPE_LABELS: Record<string, string> = {
  leisure: 'Leisure',
  honeymoon: 'Honeymoon',
  business: 'Business',
  family: 'Family',
};

function budgetNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: ProposalBriefInquiry;
  loading?: boolean;
  onEditRequirements: () => void;
  onConfirm: () => void;
};

export function ProposalBriefDialog({
  open,
  onOpenChange,
  inquiry,
  loading,
  onEditRequirements,
  onConfirm,
}: Props) {
  const destinations = [
    ...placeRefsFromJson(inquiry.destinationsJson),
    ...placeRefsFromJson(inquiry.stopsJson),
  ];
  const destLabel =
    destinations
      .map((d) => d.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ') || 'Destination TBD';

  const readiness =
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
      budgetAmount: budgetNum(inquiry.budgetAmount),
      hotelCategory: inquiry.hotelCategory,
      meals: inquiry.meals,
      transportPref: inquiry.transportPref,
      flightsRequired: inquiry.flightsRequired,
      roomRequirements: inquiry.roomRequirements,
      origin: originRefFromInquiry(inquiry),
    });

  const dayResolve = resolveTripDayCount({
    startDate: inquiry.startDate,
    endDate: inquiry.endDate,
    nights: inquiry.nights,
  });

  const assumptions = buildProposalAssumptions({
    adults: inquiry.adults,
    hotelCategory: inquiry.hotelCategory,
    meals: inquiry.meals,
    transportPref: inquiry.transportPref,
    flightsRequired: inquiry.flightsRequired,
    roomRequirements: inquiry.roomRequirements,
  }).filter((a) => a.requiresConfirmation);

  const paxParts = [
    inquiry.adults ? `${inquiry.adults} adult${inquiry.adults === 1 ? '' : 's'}` : null,
    inquiry.children
      ? `${inquiry.children} child${inquiry.children === 1 ? '' : 'ren'}`
      : null,
  ].filter(Boolean);

  const dateLabel =
    inquiry.startDate && inquiry.endDate
      ? `${formatDate(inquiry.startDate)} – ${formatDate(inquiry.endDate)}`
      : inquiry.startDate
        ? formatDate(inquiry.startDate)
        : null;

  const budget = budgetNum(inquiry.budgetAmount);
  const travelLabel = inquiry.travelType
    ? TRAVEL_TYPE_LABELS[inquiry.travelType] || inquiry.travelType
    : null;

  const willCreate: string[] = [];
  if (readiness.itinerarySeedable && dayResolve) {
    willCreate.push(
      `${dayResolve.dayCount}-day itinerary draft${dayResolve.dateConflict ? ' (date conflict flagged)' : ''}`,
    );
  } else {
    willCreate.push('Proposal workspace (itinerary dates pending)');
  }
  willCreate.push('Draft quotation workspace');
  willCreate.push('Traveller and budget context');

  const sendGaps = [
    ...readiness.quotationReadiness.pricingSensitive,
    ...readiness.quotationReadiness.missingPreferences,
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Proposal brief</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 text-[length:var(--control-text-sm)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Trip
            </p>
            <p className="mt-1 font-medium">
              {[destLabel, dateLabel, paxParts.join(', '), travelLabel]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Customer target
            </p>
            <p className="mt-1 font-medium">
              {budget != null
                ? formatCurrency(budget, {
                    currency: inquiry.budgetCurrency || 'INR',
                    maximumFractionDigits: 0,
                  })
                : 'Not set'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Will be created
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {willCreate.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {assumptions.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assumptions requiring review
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {assumptions.map((a) => (
                  <li key={a.key}>
                    {humanizeFieldKeys([a.key])}: {a.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {sendGaps.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Needed before sending a final quote
              </p>
              <p className="mt-1 text-muted-foreground">{humanizeFieldKeys(sendGaps)}</p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEditRequirements();
            }}
          >
            Edit requirements
          </Button>
          <Button
            type="button"
            data-testid="build-proposal-confirm"
            disabled={loading || !readiness.draftable}
            onClick={onConfirm}
          >
            {loading ? 'Working…' : 'Build proposal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
