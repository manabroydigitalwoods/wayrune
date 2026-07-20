import { AlertCircle, Inbox, MessageCircleWarning } from 'lucide-react';
import { StatusBadge } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { useSalesCrmSla } from '../../hooks/useSalesCrmSla';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { inboxAgingFilterLabel } from '../../lib/inboxAgingLabel';

/** Compact SLA cues on Leads and Inbox — same metrics as dashboard sales strip. */
export function SalesCrmSlaStrip({
  enabled = true,
  highlight,
}: {
  enabled?: boolean;
  /** Emphasize one metric on the current page. */
  highlight?: 'followUps' | 'inboxUnread' | 'inboxAging';
}) {
  const { navigate } = useOrgNavigate();
  const { data, loading } = useSalesCrmSla(enabled);

  if (!enabled || loading || !data) return null;

  const overdue = data.followUpsOverdue ?? 0;
  const unread = data.inboxUnreadThreads ?? 0;
  const aging = data.inboxAgingUnreadThreads ?? 0;
  const agingHours = data.inboxAgingHours ?? 4;
  if (!overdue && !unread && !aging) return null;

  const agingLabel = inboxAgingFilterLabel(agingHours);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Response SLA
      </span>
      {overdue > 0 ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs hover:bg-background"
          onClick={() => navigate(`${AGENCY_ROUTES.leads}?followUp=overdue`)}
        >
          <StatusBadge
            value="follow_up_overdue"
            label={`${overdue} follow-up${overdue === 1 ? '' : 's'} overdue`}
            tone={highlight === 'followUps' ? 'danger' : 'warn'}
            showIcon
          />
          <AlertCircle className="size-3.5 text-warning" aria-hidden />
        </button>
      ) : null}
      {unread > 0 ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs hover:bg-background"
          onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1`)}
        >
          <StatusBadge
            value="inbox_unread"
            label={`${unread} unread`}
            tone={highlight === 'inboxUnread' ? 'warn' : 'info'}
            showIcon
          />
          <Inbox className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      ) : null}
      {aging > 0 ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs hover:bg-background"
          onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1&aging=1`)}
        >
          <StatusBadge
            value="inbox_aging"
            label={`${aging} ${agingLabel.toLowerCase()}`}
            tone={highlight === 'inboxAging' ? 'danger' : 'warn'}
            showIcon
          />
          <MessageCircleWarning className="size-3.5 text-warning" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
