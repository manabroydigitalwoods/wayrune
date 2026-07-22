import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Contact, FileText, MessageSquare, Plane, Users } from 'lucide-react';
import {
  Button,
  RichTextContent,
  cn,
  formatDateTime,
  humanizeActivityType,
  stripHtml,
} from '@wayrune/ui';
import { inquiryStatusLabel, tripStatusLabel } from '../../lib/agencyStatusLabels';
import { isProposalTrip } from '../../lib/inquiryTripRoles';

function looksLikeHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value);
}

function TimelineDetailBody({ detail, expanded }: { detail: string; expanded: boolean }) {
  if (!expanded) {
    const preview = stripHtml(detail).trim();
    return (
      <p className="mt-1 line-clamp-3 break-words text-[length:var(--control-text-sm)] leading-snug text-muted-foreground">
        {preview || '—'}
      </p>
    );
  }
  if (looksLikeHtml(detail)) {
    return (
      <RichTextContent
        html={detail}
        className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground prose-p:my-1 prose-p:text-[length:var(--control-text-sm)] prose-li:text-[length:var(--control-text-sm)]"
      />
    );
  }
  return (
    <p className="mt-1 whitespace-pre-wrap text-[length:var(--control-text-sm)] text-muted-foreground">
      {detail}
    </p>
  );
}

type LeadActivity = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
};

type StatusHistoryItem = {
  id: string;
  status: string;
  note?: string | null;
  createdAt: string;
};

type TripRef = {
  id: string;
  tripNumber: string;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

type SourceChip = 'Lead' | 'Inquiry' | 'Proposal' | 'Trip' | 'Customer';

type TimelineEvent = {
  id: string;
  at: string;
  kind: 'conversation' | 'inquiry' | 'trip' | 'lead' | 'customer';
  source: SourceChip;
  title: string;
  detail?: string;
  href?: string;
};

type AgencyStoryTimelineProps = {
  inquiryNumber: string;
  statusHistory?: StatusHistoryItem[];
  trips?: TripRef[];
  leadActivities?: LeadActivity[];
  leadHref?: string;
};

function eventIcon(kind: TimelineEvent['kind']) {
  if (kind === 'conversation') return MessageSquare;
  if (kind === 'trip') return Plane;
  if (kind === 'lead' || kind === 'customer') return Users;
  return FileText;
}

function detailNeedsCollapse(detail: string | undefined) {
  if (!detail?.trim()) return false;
  const plain = stripHtml(detail).trim();
  if (plain.length > 160) return true;
  return plain.split(/\n/).filter(Boolean).length > 3;
}

function sentenceCase(label: string) {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

function leadActivityTitle(type: string, body: string): { title: string; source: SourceChip; kind: TimelineEvent['kind'] } {
  const plain = stripHtml(body);
  if (/converted to new client/i.test(plain) || /created customer/i.test(plain)) {
    const name = plain.replace(/^.*?:\s*/i, '').trim() || plain;
    return {
      title: `Customer created and linked: ${name.replace(/^Customer created and linked:\s*/i, '')}`,
      source: 'Customer',
      kind: 'customer',
    };
  }
  if (type === 'status_change') {
    return { title: 'Lead stage changed', source: 'Lead', kind: 'lead' };
  }
  if (type === 'note') {
    return { title: 'Conversation note', source: 'Lead', kind: 'conversation' };
  }
  return {
    title: sentenceCase(humanizeActivityType(type)),
    source: 'Lead',
    kind: type === 'system' ? 'lead' : 'conversation',
  };
}

export function AgencyStoryTimeline({
  inquiryNumber,
  statusHistory = [],
  trips = [],
  leadActivities = [],
  leadHref,
}: AgencyStoryTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const events = useMemo(() => {
    const out: TimelineEvent[] = [];

    for (const activity of leadActivities) {
      const mapped = leadActivityTitle(activity.type, activity.body || '');
      out.push({
        id: `activity-${activity.id}`,
        at: activity.createdAt,
        kind: mapped.kind,
        source: mapped.source,
        title: mapped.title,
        detail:
          mapped.kind === 'customer'
            ? undefined
            : activity.type === 'status_change'
              ? stripHtml(activity.body || '') || undefined
              : activity.body,
        href: leadHref,
      });
    }

    const historyChronological = [...statusHistory].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (let i = 0; i < historyChronological.length; i++) {
      const item = historyChronological[i]!;
      const prev = historyChronological[i - 1];
      const toLabel = inquiryStatusLabel(item.status) || item.status;
      const fromLabel = prev
        ? inquiryStatusLabel(prev.status) || prev.status
        : null;
      out.push({
        id: `status-${item.id}`,
        at: item.createdAt,
        kind: 'inquiry',
        source: 'Inquiry',
        title: 'Inquiry status changed',
        detail: fromLabel
          ? `${fromLabel} → ${toLabel}${item.note ? ` · ${item.note}` : ''}`
          : item.note || toLabel,
      });
    }

    for (const trip of trips) {
      const proposal = isProposalTrip(trip.status);
      out.push({
        id: `trip-${trip.id}`,
        at: trip.createdAt || trip.updatedAt || new Date(0).toISOString(),
        kind: 'trip',
        source: proposal ? 'Proposal' : 'Trip',
        title: proposal
          ? `Proposal ${trip.tripNumber}`
          : `Trip ${trip.tripNumber}`,
        detail: `${trip.title} · ${tripStatusLabel(trip.status) || trip.status}`,
        href: proposal ? `/trips/${trip.id}?tab=itinerary` : `/trips/${trip.id}`,
      });
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [inquiryNumber, leadActivities, leadHref, statusHistory, trips]);

  const collapsibleIds = useMemo(
    () => events.filter((e) => detailNeedsCollapse(e.detail)).map((e) => e.id),
    [events],
  );

  const allExpanded =
    collapsibleIds.length > 0 && collapsibleIds.every((id) => expandedIds[id] === true);

  function isExpanded(id: string) {
    return expandedIds[id] === true;
  }

  function toggle(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    for (const id of collapsibleIds) next[id] = true;
    setExpandedIds(next);
  }

  function collapseAll() {
    setExpandedIds({});
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[length:var(--control-text)] font-semibold tracking-tight">
            <Contact className="size-3.5 text-primary" />
            Inquiry activity
          </h2>
          <p className="mt-0.5 text-[length:var(--control-text-sm)] text-muted-foreground">
            Conversations, status changes, and proposal milestones.
          </p>
        </div>
        {collapsibleIds.length > 1 ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        ) : null}
      </div>

      {events.length === 0 ? (
        <p className="text-[length:var(--control-text-sm)] text-muted-foreground">
          No activity yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const Icon = eventIcon(event.kind);
            const canCollapse = detailNeedsCollapse(event.detail);
            const expanded = !canCollapse || isExpanded(event.id);
            return (
              <li key={event.id} className="rounded-lg border px-2.5 py-2 glass-row">
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="rounded border border-border/60 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {event.source}
                      </span>
                      {event.href ? (
                        <Link
                          to={event.href}
                          className="text-[length:var(--control-text-sm)] font-medium text-primary hover:underline"
                        >
                          {event.title}
                        </Link>
                      ) : (
                        <span className="text-[length:var(--control-text-sm)] font-medium text-foreground">
                          {event.title}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.at)}
                      </span>
                      {canCollapse ? (
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center gap-1 text-[length:var(--control-text-sm)] text-muted-foreground hover:text-foreground"
                          onClick={() => toggle(event.id)}
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Collapse' : 'Show more'}
                          <ChevronDown
                            className={cn(
                              'size-3.5 transition-transform',
                              expanded && 'rotate-180',
                            )}
                          />
                        </button>
                      ) : null}
                    </div>
                    {event.detail ? (
                      <TimelineDetailBody detail={event.detail} expanded={expanded} />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
