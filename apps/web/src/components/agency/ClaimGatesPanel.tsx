import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@wayrune/ui';
import { api } from '../../api';
import { formatFitClaimProtocolCue } from './salesSlaFormat';
import {
  fitClaimRemainingSamples,
  formatFitClaimRemainingCue,
} from '../../lib/fitDogfoodCue';

type ClaimGatesResponse = {
  fitClaimProtocol: {
    targetMinutes: number;
    minSampleSize: number;
    sampleSize: number;
    medianMinutes: number | null;
    claimStatus: 'testing' | 'ready';
    publicClaimAllowed: boolean;
    demoSampleSize: number;
    demoClaimReady: boolean;
  };
  fitOpsChecklist: string[];
  registryStatus: 'testing';
  parityDogfoodKit?: {
    fitCaptureSteps: string[];
    pilotSmokeSteps: string[];
    operateThroughSteps?: string[];
    scaleReminder: string;
  };
};

/** Settings → About: live FIT claim gate progress (does not flip marketing registry). */
export function ClaimGatesPanel() {
  const [data, setData] = useState<ClaimGatesResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<ClaimGatesResponse>('/dashboard/claim-gates');
        if (!cancelled) {
          setData(res);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : 'Could not load claim gates');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Claim gate telemetry unavailable ({error}).
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Loading claim gates…
      </section>
    );
  }

  const fit = data.fitClaimProtocol;
  const cue = formatFitClaimProtocolCue(fit);
  const remainingCue = formatFitClaimRemainingCue(fit);
  const remaining = fitClaimRemainingSamples(fit);
  const samplePct = Math.min(100, Math.round((fit.sampleSize / fit.minSampleSize) * 100));

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Marketing claim gates</h2>
        <StatusBadge
          value={fit.publicClaimAllowed ? 'confirmed' : 'draft'}
          label={fit.publicClaimAllowed ? 'Gate clear' : 'Testing'}
        />
        <span className="text-[11px] text-muted-foreground">
          Registry stays Testing until product sign-off
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Live telemetry for honest public claims. Demo seed never counts toward marketing proof.{' '}
        <Link to="/docs#what-we-claim" className="text-primary hover:underline">
          Docs · what we claim
        </Link>
        .
      </p>

      <div className="rounded-lg border border-border/50 bg-background px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">FIT quote speed (&lt;{fit.targetMinutes}m)</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fit.sampleSize}/{fit.minSampleSize} real samples · median{' '}
            {fit.medianMinutes != null ? `${fit.medianMinutes.toFixed(1)}m` : '—'}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${samplePct}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {remainingCue ? <span>{remainingCue}</span> : null}
          {fit.demoSampleSize > 0 ? (
            <StatusBadge
              value="draft"
              label={`${fit.demoSampleSize} demo excluded`}
            />
          ) : null}
          {remaining === 0 && !fit.publicClaimAllowed ? (
            <span>Sample size met — median must stay ≤{fit.targetMinutes}m</span>
          ) : null}
        </div>
        {cue ? <p className="mt-2 text-xs text-muted-foreground">{cue}</p> : null}
      </div>

      {data.fitOpsChecklist.length ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {data.fitOpsChecklist.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}

      {data.parityDogfoodKit ? (
        <div className="space-y-3 border-t border-border/40 pt-3">
          <div>
            <h3 className="text-xs font-semibold text-foreground">FIT dogfood kit</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Run on a non-demo org. Open a trip Quotations tab → Match/package → Send. Each first
              send records timing.
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {data.parityDogfoodKit.fitCaptureSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">Pilot smoke</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {data.parityDogfoodKit.pilotSmokeSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
          {data.parityDogfoodKit.operateThroughSteps?.length ? (
            <div>
              <h3 className="text-xs font-semibold text-foreground">
                Operate-through dogfood
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Self-serve path from import to cancel — process kit only; not agency
                adoption proof.
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {data.parityDogfoodKit.operateThroughSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{data.parityDogfoodKit.scaleReminder}</p>
        </div>
      ) : null}
    </section>
  );
}
