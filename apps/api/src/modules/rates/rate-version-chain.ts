/** Shared plan / order / label for rate tip version chains (hotel, transfer, activity). */

export type RateVersionRef = {
  id: string;
  versionNumber: number;
  supersedesId: string | null;
  isActive: boolean;
};

export type RateNewVersionPlan = {
  versionNumber: number;
  supersedesId: string;
  previousVersionNumber: number;
};

/** Next tip after superseding an active (or any) source rate. */
export function planRateNewVersion(source: {
  id: string;
  versionNumber: number;
}): RateNewVersionPlan {
  const prev = Math.max(1, Math.floor(source.versionNumber) || 1);
  return {
    versionNumber: prev + 1,
    supersedesId: source.id,
    previousVersionNumber: prev,
  };
}

/**
 * Walk supersedesId chain oldest → newest.
 * `byId` must include every ancestor; missing links stop the walk.
 */
export function orderRateVersionChain<T extends RateVersionRef>(
  tip: T,
  byId: Map<string, T>,
): T[] {
  const seen = new Set<string>();
  const oldestFirst: T[] = [];
  let cur: T | undefined = tip;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    oldestFirst.unshift(cur);
    if (!cur.supersedesId) break;
    cur = byId.get(cur.supersedesId);
  }
  return oldestFirst;
}

export function rateVersionLabel(versionNumber: number): string {
  const n = Math.max(1, Math.floor(versionNumber) || 1);
  return `v${n}`;
}
