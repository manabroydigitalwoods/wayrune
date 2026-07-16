import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Contact, FileText, MessageSquare, Plane } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, formatDateTime } from '@travel/ui';
import { inquiryStatusLabel, tripStatusLabel } from '../../lib/agencyStatusLabels';

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

type TimelineEvent = {
  id: string;
  at: string;
  kind: 'conversation' | 'inquiry' | 'trip';
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
  return FileText;
}

export function AgencyStoryTimeline({
  inquiryNumber,
  statusHistory = [],
  trips = [],
  leadActivities = [],
  leadHref,
}: AgencyStoryTimelineProps) {
  const events = useMemo(() => {
    const out: TimelineEvent[] = [];

    for (const activity of leadActivities) {
      out.push({
        id: `activity-${activity.id}`,
        at: activity.createdAt,
        kind: 'conversation',
        title: activity.type === 'note' ? 'Conversation note' : activity.type.replace(/_/g, ' '),
        detail: activity.body,
        href: leadHref,
      });
    }

    for (const item of statusHistory) {
      out.push({
        id: `status-${item.id}`,
        at: item.createdAt,
        kind: 'inquiry',
        title: `Inquiry ${inquiryStatusLabel(item.status)}`,
        detail: item.note || undefined,
      });
    }

    for (const trip of trips) {
      out.push({
        id: `trip-${trip.id}`,
        at: trip.createdAt || trip.updatedAt || new Date(0).toISOString(),
        kind: 'trip',
        title: `Trip ${trip.tripNumber} · ${tripStatusLabel(trip.status)}`,
        detail: trip.title,
        href: `/trips/${trip.id}`,
      });
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [inquiryNumber, leadActivities, leadHref, statusHistory, trips]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Contact className="size-4 text-primary" />
          Story timeline
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Conversation, inquiry status, and trip milestones in one view.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timeline events yet.</p>
        ) : (
          <ol className="space-y-4">
            {events.map((event) => {
              const Icon = eventIcon(event.kind);
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {event.href ? (
                        <Link to={event.href} className="text-sm font-medium text-primary hover:underline">
                          {event.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-foreground">{event.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.at)}
                      </span>
                    </div>
                    {event.detail ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {event.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
