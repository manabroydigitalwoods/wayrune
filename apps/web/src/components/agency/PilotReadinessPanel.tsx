import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button, Skeleton, StatusBadge, toastError, toastSuccess } from '@wayrune/ui';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { usePermissions } from '../../lib/permissions';

type PilotItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  track: string;
};

type PilotTrack = {
  items: PilotItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
};

type PilotStatus =
  | 'not_ready'
  | 'quote_ready'
  | 'operate_ready'
  | 'proxy_tested'
  | 'named_pilot_active'
  | 'pilot_evidence_complete';

type PilotReadiness = {
  status: PilotStatus;
  quote: PilotTrack;
  operate: PilotTrack;
  evidence: PilotTrack;
  demoOperatePackActive: boolean;
  operateReadyFromDemoOnly: boolean;
  settings: {
    mode: 'none' | 'proxy' | 'named';
    evidenceComplete: boolean;
    startedAt?: string;
    replayPrivacyConfirmed?: boolean;
  };
  marketProvenAuto: false;
};

type ClaimGatesResponse = {
  pilotReadiness?: PilotReadiness;
};

const STATUS_LABEL: Record<PilotStatus, string> = {
  not_ready: 'Not ready',
  quote_ready: 'Quote-ready',
  operate_ready: 'Operate-ready',
  proxy_tested: 'Proxy-tested',
  named_pilot_active: 'Named pilot active',
  pilot_evidence_complete: 'Pilot evidence complete',
};

function posthogConfigured(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

function withClientEvidence(pr: PilotReadiness): PilotReadiness {
  const posthog = posthogConfigured();
  const evidenceItems = pr.evidence.items.map((item) => {
    if (item.key === 'posthog_hint') return { ...item, done: posthog };
    return item;
  });
  const doneCount = evidenceItems.filter((i) => i.done).length;
  const total = evidenceItems.length;
  return {
    ...pr,
    evidence: {
      items: evidenceItems,
      doneCount,
      total,
      complete: total > 0 && doneCount === total,
      scorePercent: total ? Math.round((doneCount / total) * 100) : 0,
    },
  };
}

function TrackBlock({
  title,
  track,
  note,
  navigate,
}: {
  title: string;
  track: PilotTrack;
  note?: string;
  navigate: (href: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {track.scorePercent}% · {track.doneCount}/{track.total}
          {track.complete ? ' · ready' : ''}
        </span>
      </div>
      {note ? <p className="text-[11px] text-amber-800 dark:text-amber-200">{note}</p> : null}
      <ul className="space-y-1.5">
        {track.items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40"
              onClick={() => navigate(item.href)}
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={
                    item.done
                      ? 'font-medium text-muted-foreground line-through'
                      : 'font-medium'
                  }
                >
                  {item.label}
                </span>
                {!item.done ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Settings → About: Pilot Day-0 readiness (never auto Market-proven). */
export function PilotReadinessPanel({
  compact = false,
}: {
  compact?: boolean;
} = {}) {
  const { navigate } = useOrgNavigate();
  const { has } = usePermissions();
  const canWrite = has('org.settings.write');
  const [data, setData] = useState<PilotReadiness | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await api<ClaimGatesResponse>('/dashboard/claim-gates');
      if (!res.pilotReadiness) {
        setData(null);
        setError('Pilot readiness unavailable');
        return;
      }
      setData(withClientEvidence(res.pilotReadiness));
      setError('');
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Could not load pilot readiness');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function patchPilotProgram(
    next: Partial<PilotReadiness['settings']>,
  ) {
    if (!canWrite || !data) return;
    setSaving(true);
    try {
      await api('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify({
          settingsJson: {
            pilotProgram: {
              ...data.settings,
              ...next,
              startedAt:
                next.mode && next.mode !== 'none'
                  ? data.settings.startedAt || new Date().toISOString()
                  : data.settings.startedAt,
            },
          },
        }),
      });
      toastSuccess('Pilot program updated');
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <section className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Pilot Day-0 unavailable ({error}).
      </section>
    );
  }

  if (!data) {
    return (
      <section
        className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-8 w-full" />
      </section>
    );
  }

  if (compact) {
    return (
      <section
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
        data-testid="pilot-readiness-strip"
      >
        <span className="font-medium">Pilot Day-0</span>
        <StatusBadge value="draft" label={STATUS_LABEL[data.status]} />
        {data.settings.mode === 'proxy' ? (
          <span className="text-[11px] text-amber-800 dark:text-amber-200">
            Internal proxy — not market proof
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => navigate('/settings?section=about')}
        >
          Open Day-0
        </Button>
      </section>
    );
  }

  const operateNote = data.operateReadyFromDemoOnly
    ? 'Demo operate pack alone does not unlock Operate-ready for pilot — Replace demo or import real suppliers.'
    : data.demoOperatePackActive
      ? 'Demo operate pack active — Replace before live customer docs.'
      : undefined;

  return (
    <section
      className="space-y-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
      data-testid="pilot-readiness-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Pilot Day-0 readiness</h2>
        <StatusBadge value="draft" label={STATUS_LABEL[data.status]} />
        <span className="text-[11px] text-muted-foreground">
          Market-proven is never set here — evidence pack flip only
        </span>
      </div>

      {data.settings.mode === 'proxy' ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <strong>Internal proxy evidence — not customer or market proof.</strong> Does
          not activate FIT Proven or Market-proven.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Recruit and run via the{' '}
        <Link to="/docs" className="text-primary hover:underline">
          ops pack
        </Link>{' '}
        (docs). FIT public claim stays Testing — see Marketing claim gates below. Demo
        timings never count.
      </p>

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={data.settings.mode === 'none' ? 'default' : 'outline'}
            disabled={saving}
            onClick={() =>
              void patchPilotProgram({ mode: 'none', evidenceComplete: false })
            }
          >
            Clear mode
          </Button>
          <Button
            type="button"
            size="sm"
            variant={data.settings.mode === 'proxy' ? 'default' : 'outline'}
            disabled={saving}
            onClick={() => void patchPilotProgram({ mode: 'proxy' })}
          >
            Proxy active
          </Button>
          <Button
            type="button"
            size="sm"
            variant={data.settings.mode === 'named' ? 'default' : 'outline'}
            disabled={saving}
            onClick={() => void patchPilotProgram({ mode: 'named' })}
          >
            Named pilot active
          </Button>
          <Button
            type="button"
            size="sm"
            variant={data.settings.evidenceComplete ? 'default' : 'outline'}
            disabled={saving || data.settings.mode === 'none'}
            onClick={() =>
              void patchPilotProgram({
                evidenceComplete: !data.settings.evidenceComplete,
              })
            }
          >
            {data.settings.evidenceComplete
              ? 'Evidence marked complete'
              : 'Mark evidence complete'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              data.settings.replayPrivacyConfirmed ? 'default' : 'outline'
            }
            disabled={saving}
            onClick={() =>
              void patchPilotProgram({
                replayPrivacyConfirmed: !data.settings.replayPrivacyConfirmed,
              })
            }
          >
            {data.settings.replayPrivacyConfirmed
              ? 'Replay privacy confirmed'
              : 'Confirm replay privacy'}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <TrackBlock title="Quote-ready" track={data.quote} navigate={navigate} />
        <TrackBlock
          title="Operate-ready"
          track={data.operate}
          note={operateNote}
          navigate={navigate}
        />
        <TrackBlock
          title="Evidence-ready"
          track={data.evidence}
          navigate={navigate}
        />
      </div>
    </section>
  );
}
