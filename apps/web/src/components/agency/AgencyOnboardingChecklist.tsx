import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, PackagePlus, Rocket, X } from 'lucide-react';
import {
  Button,
  StorageKeys,
  toastError,
  toastSuccess,
  usePersistentState,
} from '@wayrune/ui';
import { api } from '../../api';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { reportError } from '../../lib/errors';
import {
  agencyFitPackWalkthroughPath,
  formatAgencyFitPackToast,
  installAgencyFitPack,
} from '../../lib/agencyFitPack';

type OnboardingItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  track?: string;
};

type TrackStatus = {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
};

type OnboardingStatus = {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
  quoteReady?: TrackStatus;
  operateReady?: TrackStatus;
};

type Props = {
  /**
   * When true and Operate-ready is complete, show a compact readiness strip
   * (not the full track list) until the user dismisses.
   */
  hideWhenComplete?: boolean;
};

function TrackList({
  title,
  track,
  navigate,
}: {
  title: string;
  track: TrackStatus;
  navigate: (href: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-[length:var(--control-text-sm)] text-muted-foreground tabular-nums">
          {track.scorePercent}% · {track.doneCount}/{track.total}
          {track.complete ? ' · ready' : ''}
        </span>
      </div>
      <ul className="space-y-1.5">
        {track.items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40"
              onClick={() => navigate(item.href)}
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
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
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgencyOnboardingChecklist({ hideWhenComplete = true }: Props) {
  const { navigate } = useOrgNavigate();
  const [dismissed, setDismissed] = usePersistentState(
    StorageKeys.onboarding.checklistDismissed,
    false,
  );
  const [data, setData] = useState<OnboardingStatus | null>(null);
  const [installingPack, setInstallingPack] = useState(false);

  async function load() {
    try {
      const status = await api<OnboardingStatus>('/organizations/onboarding-status');
      setData(status);
    } catch (e) {
      reportError(e, 'Could not load onboarding checklist');
    }
  }

  useEffect(() => {
    if (dismissed) return;
    void load();
  }, [dismissed]);

  async function installFitPack() {
    setInstallingPack(true);
    try {
      const res = await installAgencyFitPack();
      toastSuccess(formatAgencyFitPackToast(res));
      await load();
      const path = agencyFitPackWalkthroughPath(res);
      if (path) {
        navigate(path);
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not install sample pack');
    } finally {
      setInstallingPack(false);
    }
  }

  async function openDemoTrip() {
    setInstallingPack(true);
    try {
      const res = await installAgencyFitPack();
      const path = agencyFitPackWalkthroughPath(res);
      if (!path) {
        toastError('Demo trip not available yet — install the sample FIT pack first');
        return;
      }
      toastSuccess(
        res.demoTrip?.title
          ? `Opening “${res.demoTrip.title}”`
          : 'Opening demo trip',
      );
      navigate(path);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not open demo trip');
    } finally {
      setInstallingPack(false);
    }
  }

  if (dismissed) return null;
  if (!data) return null;

  const operateComplete = data.operateReady?.complete ?? data.complete;
  const quote = data.quoteReady;
  const operate = data.operateReady;

  // When Operate-ready is complete, keep a compact readiness strip (scores + honesty)
  // until dismiss — full track lists hide so mature orgs are not nagged.
  if (hideWhenComplete && operateComplete) {
    return (
      <div
        className="mb-6 rounded-xl border border-border/60 bg-card/40 p-4"
        data-testid="agency-onboarding-checklist"
        data-onboarding-complete="true"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Rocket className="mt-0.5 size-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Agency readiness</h2>
              <p
                className="text-xs text-muted-foreground"
                data-testid="onboarding-score-line"
              >
                Quote-ready{' '}
                <span data-testid="onboarding-quote-ready-score">
                  {quote?.scorePercent ?? data.scorePercent}%
                </span>{' '}
                · Operate-ready{' '}
                <span data-testid="onboarding-operate-ready-score">
                  {operate?.scorePercent ?? 0}%
                </span>
                {operate?.complete ? ' · ready' : ''}
              </p>
              <p
                className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground"
                data-testid="onboarding-demo-vs-real-cue"
              >
                Demo Operate-ready can go green on labeled [Demo] suppliers. After
                Replace demo, import real suppliers and rates — that is not the same
                as real-agency Operate-ready.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={installingPack}
              data-testid="onboarding-open-demo-trip"
              onClick={() => void openDemoTrip()}
            >
              {installingPack ? 'Opening…' : 'Open demo trip'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Dismiss checklist"
              onClick={() => setDismissed(true)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const next =
    operate?.items.find((i) => !i.done) ||
    quote?.items.find((i) => !i.done) ||
    data.items.find((i) => !i.done);
  const needsTemplates = (quote?.items || data.items).some(
    (i) => i.key === 'quote_template' && !i.done,
  );

  return (
    <div
      className="mb-6 rounded-xl border border-border/60 bg-card/40 p-4"
      data-testid="agency-onboarding-checklist"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Rocket className="mt-0.5 size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Get your agency ready</h2>
            <p
              className="text-xs text-muted-foreground"
              data-testid="onboarding-score-line"
            >
              Quote-ready{' '}
              <span data-testid="onboarding-quote-ready-score">
                {quote?.scorePercent ?? data.scorePercent}%
              </span>{' '}
              · Operate-ready{' '}
              <span data-testid="onboarding-operate-ready-score">
                {operate?.scorePercent ?? 0}%
              </span>
            </p>
            <p
              className="mt-1 text-[length:var(--control-text-sm)] text-muted-foreground"
              data-testid="onboarding-demo-vs-real-cue"
            >
              Demo Operate-ready can go green on labeled [Demo] suppliers. After
              Replace demo, import real suppliers and rates — that is not the same
              as real-agency Operate-ready.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Dismiss checklist"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </div>

      {needsTemplates ? (
        <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Jump-start Quote-ready with priced Darjeeling and Goa templates. For
            Operate-ready (enquiry→voucher), also install operate demo suppliers or
            import real suppliers + rates — FIT pack alone is not enough for Ops.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={installingPack}
              data-testid="onboarding-install-fit-pack"
              onClick={() => void installFitPack()}
            >
              <PackagePlus className="size-4" />
              {installingPack ? 'Installing…' : 'Install sample FIT pack'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={installingPack}
            data-testid="onboarding-open-demo-trip"
            onClick={() => void openDemoTrip()}
          >
            {installingPack ? 'Opening…' : 'Open demo trip'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Idempotent — opens Darjeeling classic FIT — demo on Quotations.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {quote ? (
          <TrackList title="Quote-ready" track={quote} navigate={navigate} />
        ) : null}
        {operate ? (
          <TrackList title="Operate-ready" track={operate} navigate={navigate} />
        ) : (
          <ul className="space-y-2">
            {data.items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                  onClick={() => navigate(item.href)}
                >
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {next ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => navigate(next.href)}>
            Continue: {next.label}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Operate-ready —{' '}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => navigate('/work/quotations')}
          >
            open quotations
          </button>
          .
        </p>
      )}
    </div>
  );
}
