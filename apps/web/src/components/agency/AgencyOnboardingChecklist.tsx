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
};

type OnboardingStatus = {
  items: OnboardingItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
};

type Props = {
  /** When true, hide the panel after dismiss or when complete. */
  hideWhenComplete?: boolean;
};

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

  if (dismissed) return null;
  if (!data) return null;
  if (hideWhenComplete && data.complete) return null;

  const next = data.items.find((i) => !i.done);
  const needsTemplates = data.items.some(
    (i) => i.key === 'quote_template' && !i.done,
  );

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

  return (
    <div className="mb-6 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Rocket className="mt-0.5 size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Get your agency ready</h2>
            <p className="text-xs text-muted-foreground">
              Setup health {data.scorePercent}% · {data.doneCount}/{data.total} complete
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

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${data.scorePercent}%` }}
        />
      </div>

      {needsTemplates ? (
        <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Jump-start with priced Darjeeling and Goa templates plus{' '}
            <span className="font-medium text-foreground">
              Darjeeling classic FIT — demo
            </span>{' '}
            (draft quote, sample guest, hotel + transfer lines).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={installingPack}
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
            onClick={() => void openDemoTrip()}
          >
            {installingPack ? 'Opening…' : 'Open demo trip'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Idempotent — opens Darjeeling classic FIT — demo on Quotations.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {data.items.map((item) => (
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
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {next ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => navigate(next.href)}>
            Continue: {next.label}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          All set —{' '}
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
