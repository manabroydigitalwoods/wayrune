/** Status-aware trip workspace tab cues — pure helpers for TripWorkspacePage. */

export const TRIP_WORKSPACE_TABS = [
  'overview',
  'travellers',
  'itinerary',
  'quotations',
  'operations',
  'finance',
  'commerce',
  'timeline',
] as const;

export type TripWorkspaceTab = (typeof TRIP_WORKSPACE_TABS)[number];

export type TripControlFlagLike = {
  tab: string;
  severity: 'danger' | 'warn' | 'info';
};

const TAB_SET = new Set<string>(TRIP_WORKSPACE_TABS);

/** Where ops usually continue based on trip lifecycle status. */
export function recommendedTabForTripStatus(status: string): TripWorkspaceTab {
  switch (status) {
    case 'planning':
      return 'itinerary';
    case 'quoted':
    case 'awaiting_approval':
      return 'quotations';
    case 'confirmed':
    case 'booking_in_progress':
    case 'ready_to_travel':
    case 'in_progress':
      return 'operations';
    case 'completed':
      return 'finance';
    case 'cancelled':
      return 'overview';
    default:
      return 'overview';
  }
}

/** Count non-info control flags per workspace tab (for tab badges). */
export function tabAttentionCounts(
  flags: readonly TripControlFlagLike[],
): Partial<Record<TripWorkspaceTab, number>> {
  const counts: Partial<Record<TripWorkspaceTab, number>> = {};
  for (const flag of flags) {
    if (flag.severity === 'info') continue;
    if (!TAB_SET.has(flag.tab)) continue;
    const tab = flag.tab as TripWorkspaceTab;
    counts[tab] = (counts[tab] ?? 0) + 1;
  }
  return counts;
}

export function tabLabelWithCue(
  label: string,
  tab: TripWorkspaceTab,
  input: {
    activeTab: string;
    tripStatus: string;
    attention?: number;
  },
): string {
  if (input.attention && input.attention > 0) return label;
  if (
    input.activeTab === 'overview' &&
    recommendedTabForTripStatus(input.tripStatus) === tab
  ) {
    return `${label} · Next`;
  }
  return label;
}
