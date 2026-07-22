import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  parseTripProposalSeed,
  proposalSeedPublicSummary,
  type InquiryProposalSeed,
} from '@wayrune/contracts';
import { Button } from '@wayrune/ui';

const DISMISS_KEY = 'wayrune.proposalSeedBanner.dismissed';

function dismissedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markDismissed(tripId: string) {
  const next = dismissedSet();
  next.add(tripId);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
}

type Props = {
  tripId: string;
  settingsJson?: unknown;
  inquiry?: { id: string; inquiryNumber?: string } | null;
  onRetrySetup?: () => void;
  retrying?: boolean;
};

export function ProposalSeedBanner({
  tripId,
  settingsJson,
  inquiry,
  onRetrySetup,
  retrying,
}: Props) {
  const seed = useMemo(
    () => parseTripProposalSeed(settingsJson) as InquiryProposalSeed | null,
    [settingsJson],
  );
  const [dismissed, setDismissed] = useState(() => dismissedSet().has(tripId));

  if (!seed || dismissed) return null;

  const summary = proposalSeedPublicSummary(seed);
  const needsReview = summary.assumptionsRequiringConfirmation;
  const failed = summary.failedSteps;
  const inqLabel = inquiry?.inquiryNumber || seed.sourceInquiryId;

  return (
    <div
      className="mb-3 rounded-md border border-border/80 bg-muted/40 px-3 py-2.5 text-[length:var(--control-text-sm)]"
      data-testid="proposal-seed-banner"
    >
      {summary.status === 'partial' && failed.length > 0 ? (
        <>
          <p className="font-medium">Proposal workspace created</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {seed.steps.itinerary === 'completed' || seed.steps.itinerary === 'skipped' ? (
              <li>
                {seed.steps.itinerary === 'skipped'
                  ? 'Itinerary dates pending'
                  : 'Itinerary seeded successfully'}
              </li>
            ) : null}
            {failed.includes('quotation') ? (
              <li>Quotation setup could not be completed</li>
            ) : null}
            {failed.includes('itinerary') ? (
              <li>Itinerary setup could not be completed</li>
            ) : null}
            {failed.includes('assumptions') ? (
              <li>Assumptions could not be stored</li>
            ) : null}
          </ul>
          {onRetrySetup ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={retrying} onClick={onRetrySetup}>
                {retrying ? 'Retrying…' : 'Retry setup'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="font-medium">Started from {inqLabel}</p>
          <p className="mt-1 text-muted-foreground">
            {summary.itineraryDaysCreated > 0
              ? `${summary.itineraryDaysCreated} itinerary day${summary.itineraryDaysCreated === 1 ? '' : 's'} created · traveller details copied`
              : 'Proposal workspace ready · itinerary dates pending'}
            {needsReview > 0
              ? ` · ${needsReview} assumption${needsReview === 1 ? '' : 's'} need review`
              : null}
          </p>
          {seed.dateConflict ? (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              Travel nights and end date disagreed — nights were used. Review dates.
            </p>
          ) : null}
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {needsReview > 0 ? (
          <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium">
            {needsReview} assumption{needsReview === 1 ? '' : 's'} unresolved
          </span>
        ) : null}
        {inquiry?.id ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/inquiries/${inquiry.id}`}>Open inquiry</Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            markDismissed(tripId);
            setDismissed(true);
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
