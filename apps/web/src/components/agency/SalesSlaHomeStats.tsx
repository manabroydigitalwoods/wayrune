import { AlertCircle, Clock, FileText, Inbox, MessageCircleWarning, Target } from 'lucide-react';
import { StatCard } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { inboxAgingFilterLabel } from '../../lib/inboxAgingLabel';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import {
  formatHoursCompact,
  formatHoursTargetCue,
  formatMinutesTargetCue,
  formatFitClaimProtocolCue,
  salesSlaMedianTone,
  type FitClaimProtocolCue,
} from './salesSlaFormat';

export type SalesSlaStats = {
  followUpsOverdue?: number;
  medianFirstTouchHours30d?: number | null;
  medianLeadToQuoteHours30d?: number | null;
  firstTouchSampleSize30d?: number;
  leadToQuoteSampleSize30d?: number;
  /** Real (non-demo) FIT median — aligned with claim gate. */
  medianFitBuildMinutes30d?: number | null;
  fitBuildSampleSize30d?: number;
  fitBuildDemoSampleSize30d?: number;
  fitClaimProtocol?: FitClaimProtocolCue | null;
  firstTouchTargetHours?: number | null;
  leadToQuoteTargetHours?: number | null;
  fitBuildTargetMinutes?: number | null;
  conversionRate?: number | null;
  inboxUnreadThreads?: number;
  inboxAgingUnreadThreads?: number;
  inboxAgingHours?: number;
};

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function formatMinutesCompact(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
}

/** Compact sales response / quote-turnaround + inbox unread strip (from GET /dashboard/sales). */
export function SalesSlaHomeStats({ data }: { data: SalesSlaStats }) {
  const { navigate } = useOrgNavigate();
  const overdue = data.followUpsOverdue ?? 0;
  const unread = data.inboxUnreadThreads ?? 0;
  const aging = data.inboxAgingUnreadThreads ?? 0;
  const agingHours = data.inboxAgingHours ?? 4;
  const agingFilterLabel = inboxAgingFilterLabel(agingHours);
  const firstTouchCue = formatHoursTargetCue(data.firstTouchTargetHours);
  const leadToQuoteCue = formatHoursTargetCue(data.leadToQuoteTargetHours);
  const fitBuildCue = formatMinutesTargetCue(data.fitBuildTargetMinutes);
  const fitClaimCue = formatFitClaimProtocolCue(data.fitClaimProtocol);
  const fitCardCue = [fitClaimCue, fitBuildCue].filter(Boolean).join(' · ') || null;
  const fitMedian =
    data.fitClaimProtocol?.medianMinutes ?? data.medianFitBuildMinutes30d;
  const fitSample =
    data.fitClaimProtocol?.sampleSize ?? data.fitBuildSampleSize30d ?? 0;
  const fitDemoSample =
    data.fitClaimProtocol?.demoSampleSize ?? data.fitBuildDemoSampleSize30d ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Sales response</h2>
          <p className="text-xs text-muted-foreground">
            Follow-ups and turnaround (30d). FIT build = workspace open → first send.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <StatCard
            label="Lead follow-ups overdue"
            value={overdue}
            hint="Stamp a follow-up task to clear"
            tone={overdue ? 'danger' : 'success'}
            icon={AlertCircle}
            onClick={() => navigate(`${AGENCY_ROUTES.leads}?followUp=overdue`)}
          />
          <StatCard
            label="Median first touch"
            value={formatHoursCompact(data.medianFirstTouchHours30d)}
            hint={firstTouchCue ?? undefined}
            tone={salesSlaMedianTone(
              data.medianFirstTouchHours30d,
              data.firstTouchTargetHours,
            )}
            icon={Clock}
            onClick={() => navigate(AGENCY_ROUTES.leads)}
          />
          <StatCard
            label="Median lead → quote"
            value={formatHoursCompact(data.medianLeadToQuoteHours30d)}
            hint={leadToQuoteCue ?? undefined}
            tone={salesSlaMedianTone(
              data.medianLeadToQuoteHours30d,
              data.leadToQuoteTargetHours,
            )}
            icon={FileText}
            onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
          />
          <StatCard
            label="Median FIT build (real)"
            value={formatMinutesCompact(fitMedian)}
            hint={fitCardCue ?? undefined}
            tone={
              data.fitClaimProtocol?.publicClaimAllowed
                ? 'success'
                : salesSlaMedianTone(
                    fitMedian,
                    data.fitBuildTargetMinutes ??
                      data.fitClaimProtocol?.targetMinutes ??
                      3,
                  )
            }
            icon={FileText}
            onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
          />
          <StatCard
            label="Win rate"
            value={pct(data.conversionRate)}
            hint="Closed-won share"
            tone="success"
            icon={Target}
            onClick={() => navigate(`${AGENCY_ROUTES.leads}?stage=won`)}
          />
        </div>
        {(data.firstTouchSampleSize30d != null ||
          data.leadToQuoteSampleSize30d != null ||
          data.fitBuildSampleSize30d != null ||
          data.fitClaimProtocol != null) && (
          <p className="text-[11px] text-muted-foreground">
            Samples · first touch {data.firstTouchSampleSize30d ?? 0} · quoted{' '}
            {data.leadToQuoteSampleSize30d ?? 0} · FIT real {fitSample}
            {fitDemoSample > 0 ? ` (${fitDemoSample} demo excluded)` : ''}
            {fitClaimCue ? ` · ${fitClaimCue}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Inbox response</h2>
          <p className="text-xs text-muted-foreground">
            Unread threads · aging = no reply for {agingHours}h+.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Unread threads"
            value={unread}
            hint="Open inbox filter"
            tone={unread ? 'warn' : 'success'}
            icon={Inbox}
            onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1`)}
          />
          <StatCard
            label={agingFilterLabel}
            value={aging}
            hint="Needs a reply now"
            tone={aging ? 'danger' : 'success'}
            icon={MessageCircleWarning}
            onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1&aging=1`)}
          />
        </div>
      </div>
    </div>
  );
}
