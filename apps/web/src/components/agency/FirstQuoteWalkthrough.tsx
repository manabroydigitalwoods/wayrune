import { ListOrdered, PackagePlus, X } from 'lucide-react';
import {
  Button,
  StorageKeys,
  localStorageKit,
  usePersistentState,
} from '@wayrune/ui';

type Props = {
  canWrite: boolean;
  hasTemplates: boolean;
  installingPack?: boolean;
  onUseTemplate: () => void;
  onInstallPack?: () => void;
  onImportItinerary: () => void;
  onAddService: () => void;
  /** Hide after lines exist (parent controls). */
  forceHide?: boolean;
};

/**
 * Dismissible first-quote coach on an empty Quotations tab.
 * Prefers Use template (or Install pack when none) as the speed path.
 */
export function FirstQuoteWalkthrough({
  canWrite,
  hasTemplates,
  installingPack = false,
  onUseTemplate,
  onInstallPack,
  onImportItinerary,
  onAddService,
  forceHide = false,
}: Props) {
  const [dismissed, setDismissed] = usePersistentState(
    StorageKeys.onboarding.firstQuoteWalkthroughDismissed,
    false,
  );

  if (forceHide || dismissed || !canWrite) return null;

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ListOrdered className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Your first quote in three steps</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasTemplates
                ? 'Fastest: New trip → pick a package + travel start. Or here: Use template · check buy/sell · Send. Darjeeling / Goa packages drop in priced lines.'
                : '1. Install sample FIT pack · 2. Set travel start · Use template · 3. Check buy/sell · Send. Adds Darjeeling and Goa packages without leaving this trip.'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Dismiss first-quote walkthrough"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {hasTemplates ? (
          <Button size="sm" onClick={onUseTemplate}>
            Use template
          </Button>
        ) : onInstallPack ? (
          <Button size="sm" disabled={installingPack} onClick={onInstallPack}>
            <PackagePlus className="size-4" />
            {installingPack ? 'Installing…' : 'Install sample FIT pack'}
          </Button>
        ) : (
          <Button size="sm" onClick={onImportItinerary}>
            Import itinerary
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onImportItinerary}>
          Import itinerary
        </Button>
        <Button size="sm" variant="secondary" onClick={onAddService}>
          Add service
        </Button>
      </div>
    </div>
  );
}

/** Mark the walkthrough done after the guest creates their first lines. */
export function dismissFirstQuoteWalkthrough() {
  localStorageKit.setJson(
    StorageKeys.onboarding.firstQuoteWalkthroughDismissed,
    true,
    { version: 1 },
  );
}
