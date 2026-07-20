import { Link } from 'react-router-dom';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';
import { formatFitDogfoodWorkspaceCue } from '../../lib/fitDogfoodCue';
import type { FitClaimProgressInput } from '../../lib/fitDogfoodCue';

type FitDogfoodTimingCueProps = {
  protocol?: FitClaimProgressInput | null;
  /** Quiet when publicClaimAllowed and user may not need the nudge. */
  hideWhenGateClear?: boolean;
};

/** Workspace cue: this send feeds FIT timing · gate progress · About. */
export function FitDogfoodTimingCue({
  protocol,
  hideWhenGateClear = false,
}: FitDogfoodTimingCueProps) {
  if (hideWhenGateClear && protocol?.publicClaimAllowed) return null;
  const text = formatFitDogfoodWorkspaceCue(protocol);
  const aboutHref = `${AGENCY_ROUTES.settings}?section=about`;

  return (
    <p className="text-[11px] text-muted-foreground">
      {text}
      {' · '}
      <Link to={aboutHref} className="text-primary hover:underline">
        About
      </Link>
    </p>
  );
}
