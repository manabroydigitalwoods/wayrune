import { AlertCircle, Clock, FileText, Inbox, MessageCircleWarning, Target } from 'lucide-react';
import { StatCard } from '@wayrune/ui';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
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
  medianFitBuildMinutes30d?: number | null;
  fitBuildSampleSize30d?: number;
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

function medianValue(display: string, cue: string | null) {
  if (!cue) return display;
  return (
    <span className="block">
      <span>{display}</span>
      <span className="mt-1 block text-xs font-normal text-muted-foreground">{cue}</span>
    </span>
  );
}

/** Compact sales response / quote-turnaround + inbox unread strip (from GET /dashboard/sales). */
export function SalesSlaHomeStats({ data }: { data: SalesSlaStats }) {
  const { navigate } = useOrgNavigate();
  const overdue = data.followUpsOverdue ?? 0;
  const unread = data.inboxUnreadThreads ?? 0;
  const aging = data.inboxAgingUnreadThreads ?? 0;
  const agingHours = data.inboxAgingHours ?? 4;
  const firstTouchCue = formatHoursTargetCue(data.firstTouchTargetHours);
  const leadToQuoteCue = formatHoursTargetCue(data.leadToQuoteTargetHours);
  const fitBuildCue = formatMinutesTargetCue(data.fitBuildTargetMinutes);
  const fitClaimCue = formatFitClaimProtocolCue(data.fitClaimProtocol);
  const fitCardCue = [fitClaimCue, fitBuildCue].filter(Boolean).join(' · ') || null;

  return (
    <div className="mb-4 space-y-4">
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Sales response</h2>
          <p className="text-xs text-muted-foreground">
            Lead follow-ups and turnaround (last 30 days). Creating a lead follow-up task stamps the
            lead due date. FIT build is workspace open → first successful send. Public “under 3
            minutes” stays testing until real sample size and median clear the claim gate (demo
            seed does not count). Optional internal targets live in Settings → General.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Lead follow-ups overdue"
            value={overdue}
            tone={overdue ? 'danger' : 'success'}
            icon={AlertCircle}
            onClick={() => navigate(`${AGENCY_ROUTES.leads}?followUp=overdue`)}
          />
          <StatCard
            label="Median first touch"
            value={medianValue(
              formatHoursCompact(data.medianFirstTouchHours30d),
              firstTouchCue,
            )}
            tone={salesSlaMedianTone(
              data.medianFirstTouchHours30d,
              data.firstTouchTargetHours,
            )}
            icon={Clock}
            onClick={() => navigate(AGENCY_ROUTES.leads)}
          />
          <StatCard
            label="Median lead → quote"
            value={medianValue(
              formatHoursCompact(data.medianLeadToQuoteHours30d),
              leadToQuoteCue,
            )}
            tone={salesSlaMedianTone(
              data.medianLeadToQuoteHours30d,
              data.leadToQuoteTargetHours,
            )}
            icon={FileText}
            onClick={() => navigate(AGENCY_ROUTES.workQuotations)}
          />
          <StatCard
            label="Median FIT build"
            value={medianValue(
              formatMinutesCompact(data.medianFitBuildMinutes30d),
              fitCardCue,
            )}
            tone={
              data.fitClaimProtocol?.publicClaimAllowed
                ? 'success'
                : salesSlaMedianTone(
                    data.medianFitBuildMinutes30d,
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
            tone="success"
            icon={Target}
            onClick={() => navigate(`${AGENCY_ROUTES.leads}?stage=won`)}
          />
        </div>
        {(data.firstTouchSampleSize30d != null ||
          data.leadToQuoteSampleSize30d != null ||
          data.fitBuildSampleSize30d != null) && (
          <p className="text-[11px] text-muted-foreground">
            Samples · first touch {data.firstTouchSampleSize30d ?? 0} · quoted{' '}
            {data.leadToQuoteSampleSize30d ?? 0} · FIT build {data.fitBuildSampleSize30d ?? 0}
            {fitClaimCue ? ` · ${fitClaimCue}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Inbox response</h2>
          <p className="text-xs text-muted-foreground">
            Open unread threads · aging = no reply for {agingHours}h+.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Unread threads"
            value={unread}
            tone={unread ? 'warn' : 'success'}
            icon={Inbox}
            onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1`)}
          />
          <StatCard
            label={`Aging unread (${agingHours}h+)`}
            value={aging}
            tone={aging ? 'danger' : 'success'}
            icon={MessageCircleWarning}
            onClick={() => navigate(`${AGENCY_ROUTES.inbox}?unread=1&aging=1`)}
          />
        </div>
      </div>
    </div>
  );
}
