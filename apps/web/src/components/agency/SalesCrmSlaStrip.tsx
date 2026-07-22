import { cn, Skeleton, StatusBadge } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { useSalesCrmSla } from '../../hooks/useSalesCrmSla';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { inboxAgingFilterLabel } from '../../lib/inboxAgingLabel';

/** Compact SLA cues on Leads and Inbox — same metrics as dashboard sales strip. */
export function SalesCrmSlaStrip({
  enabled = true,
  highlight,
  className,
}: {
  enabled?: boolean;
  /** Emphasize one metric on the current page. */
  highlight?: 'followUps' | 'inboxUnread' | 'inboxAging';
  className?: string;
}) {
  const { navigate } = useOrgNavigate();
  const { data, loading } = useSalesCrmSla(enabled);

  if (!enabled) return null;

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn('flex flex-wrap items-center gap-1.5', className)}
      >
        <span className="sr-only">Loading</span>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-6 w-28 rounded-md" />
      </div>
    );
  }

  if (!data) return null;

  const overdue = data.followUpsOverdue ?? 0;
  const unread = data.inboxUnreadThreads ?? 0;
  const aging = data.inboxAgingUnreadThreads ?? 0;
  const agingHours = data.inboxAgingHours ?? 4;
  if (!overdue && !unread && !aging) return null;

  const agingLabel = inboxAgingFilterLabel(agingHours);

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        SLA
      </span>
      {overdue > 0 ? (
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs hover:bg-destructive/15"
          onClick={() => navigate(`${AGENCY_ROUTES.leads}?followUp=overdue`)}
        >
          <StatusBadge
            value="follow_up_overdue"
            label={`${overdue} overdue`}
            tone={highlight === 'followUps' ? 'danger' : 'warn'}
            showIcon
          />
        </button>
      ) : null}
      {unread > 0 ? (
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 text-xs hover:bg-background"
          onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1`)}
        >
          <StatusBadge
            value="inbox_unread"
            label={`${unread} unread`}
            tone={highlight === 'inboxUnread' ? 'warn' : 'info'}
            showIcon
          />
        </button>
      ) : null}
      {aging > 0 ? (
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 text-xs hover:bg-background"
          onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1&aging=1`)}
        >
          <StatusBadge
            value="inbox_aging"
            label={`${aging} ${agingLabel.toLowerCase()}`}
            tone={highlight === 'inboxAging' ? 'danger' : 'warn'}
            showIcon
          />
        </button>
      ) : null}
    </div>
  );
}
