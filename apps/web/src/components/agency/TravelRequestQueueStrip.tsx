import { ClipboardList, UserRound } from 'lucide-react';
import { StatusBadge } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { useInquiryQueueSummary } from '../../hooks/useInquiryQueueSummary';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import type { InquiriesPageVariant } from '../../lib/agencyPageVariants';

/** Queue attention strip on Planning / My requests / Sales inquiry lists. */
export function TravelRequestQueueStrip({
  enabled = true,
  variant,
}: {
  enabled?: boolean;
  variant: InquiriesPageVariant;
}) {
  const { navigate } = useOrgNavigate();
  const { data, loading } = useInquiryQueueSummary(enabled);

  if (!enabled || loading || !data) return null;

  const chips: Array<{
    key: string;
    label: string;
    tone: 'warn' | 'info' | 'danger';
    onClick: () => void;
    show: boolean;
  }> = [
    {
      key: 'planning-incomplete',
      label: `${data.planningIncomplete} incomplete in planning`,
      tone: 'warn',
      onClick: () =>
        navigate(`${AGENCY_ROUTES.workPlanning}?incomplete=1`),
      show: data.planningIncomplete > 0,
    },
    {
      key: 'planning-unassigned',
      label: `${data.planningUnassigned} unassigned in planning`,
      tone: 'info',
      onClick: () =>
        navigate(`${AGENCY_ROUTES.workPlanning}?unassigned=1`),
      show: data.planningUnassigned > 0,
    },
    {
      key: 'my-requests',
      label: `${data.myRequests} in my requests`,
      tone: 'info',
      onClick: () => navigate(AGENCY_ROUTES.workRequests),
      show: variant !== 'requests' && data.myRequests > 0,
    },
    {
      key: 'planning',
      label: `${data.planning} in planning`,
      tone: 'info',
      onClick: () => navigate(AGENCY_ROUTES.workPlanning),
      show: variant !== 'planning' && data.planning > 0,
    },
  ];

  const visible = chips.filter((c) => c.show);
  if (!visible.length) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Travel requests
      </span>
      {visible.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs hover:bg-background"
          onClick={chip.onClick}
        >
          <StatusBadge value={chip.key} label={chip.label} tone={chip.tone} showIcon />
          {chip.key.includes('unassigned') ? (
            <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
          ) : (
            <ClipboardList className="size-3.5 text-muted-foreground" aria-hidden />
          )}
        </button>
      ))}
    </div>
  );
}
