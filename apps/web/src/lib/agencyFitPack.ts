import { api } from '../api';

export const AGENCY_FIT_PACK_ID = 'fit_templates_v1' as const;

export type AgencyFitPackDemoTrip = {
  tripId: string;
  tripNumber?: string;
  title?: string;
  includes?: string[];
  created?: boolean;
};

export type AgencyFitPackInstallResult = {
  installed?: boolean;
  created?: { templates?: string[]; trips?: string[] };
  skipped?: { templates?: string[]; trips?: string[] };
  walkthroughHref?: string;
  tripId?: string;
  demoTrip?: AgencyFitPackDemoTrip | null;
};

/** Build a short success toast from pack install response. */
export function formatAgencyFitPackToast(res: AgencyFitPackInstallResult): string {
  const createdTemplates = res.created?.templates?.length ?? 0;
  const createdTrips = res.created?.trips?.length ?? 0;
  const skippedTemplates = res.skipped?.templates?.length ?? 0;
  const skippedTrips = res.skipped?.trips?.length ?? 0;
  const demoTitle = res.demoTrip?.title?.trim() || '';
  const parts: string[] = [];
  if (createdTemplates > 0) {
    parts.push(
      `${createdTemplates} template${createdTemplates === 1 ? '' : 's'}`,
    );
  }
  if (createdTrips > 0) {
    parts.push(
      demoTitle
        ? `demo trip “${demoTitle}”`
        : `${createdTrips} demo trip${createdTrips === 1 ? '' : 's'}`,
    );
  }
  if (parts.length) {
    const skip =
      skippedTemplates > 0
        ? ` · ${skippedTemplates} template(s) already present`
        : '';
    const open = demoTitle || res.tripId ? ' · Open demo trip' : '';
    return `Installed ${parts.join(' + ')}${skip}${open}`;
  }
  if (skippedTemplates || skippedTrips) {
    if (demoTitle) {
      return `Sample FIT pack already installed · Open “${demoTitle}”`;
    }
    return 'Sample FIT pack already installed';
  }
  return 'No pack items installed';
}

/** One-line include cue for onboarding / About. */
export function formatAgencyFitPackDemoIncludes(
  demo: AgencyFitPackDemoTrip | null | undefined,
): string | null {
  const includes = Array.isArray(demo?.includes)
    ? demo!.includes!.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (!includes.length) return null;
  return includes.join(' · ');
}

export async function installAgencyFitPack(): Promise<AgencyFitPackInstallResult> {
  return api<AgencyFitPackInstallResult>(
    `/organizations/starter-packs/${AGENCY_FIT_PACK_ID}/install`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

/** Prefer API walkthroughHref; else trip quotations tab when tripId present. */
export function agencyFitPackWalkthroughPath(
  res: AgencyFitPackInstallResult,
): string | null {
  const href = res.walkthroughHref?.trim();
  if (href) return href;
  const tripId = res.demoTrip?.tripId?.trim() || res.tripId?.trim();
  if (tripId) return `/trips/${tripId}?tab=quotations`;
  return null;
}

/** Show Install on Trips empty state when the org has no FIT packages yet. */
export function tripsEmptyShowInstallPack(opts: {
  opsMode?: boolean;
  financeMode?: boolean;
  templateCount: number;
  templatesLoading?: boolean;
}): boolean {
  if (opts.opsMode || opts.financeMode) return false;
  if (opts.templatesLoading) return false;
  return opts.templateCount <= 0;
}
