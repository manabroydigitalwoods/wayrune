/** Pure helpers for package template History / Restore / Diff UI. */

export type TemplateVersionDiffVsActive = {
  summary: string | null;
  addedTitles?: string[];
  removedTitles?: string[];
  changedTitles?: string[];
  metaChanges?: string[];
};

export type TemplateVersionListItem = {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  createdAt: string;
  lineCount?: number;
  destinationHint?: string | null;
  diffVsActive?: TemplateVersionDiffVsActive;
};

export function templateHistoryHasPriors(items: TemplateVersionListItem[]): boolean {
  return items.some((v) => v.status !== 'active');
}

export function formatTemplateVersionWhen(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Prefer showing History when the active tip is past v1 (chain likely has priors). */
export function showTemplateHistoryCue(versionNumber: number | null | undefined): boolean {
  return (versionNumber ?? 1) > 1;
}

/** Prior (superseded) versions can be Use'd on a trip without Restore. */
export function canUseTemplateHistoryVersion(status: string): boolean {
  return status === 'superseded';
}

/** Short cue under History: Use applies that version's content; Restore makes it current. */
export function templateHistoryPriorActionsCue(): string {
  return 'Use applies this version to the trip — Restore makes it the current tip';
}

/** Whether History should offer a Diff expand for this prior. */
export function showTemplateHistoryDiffCue(
  item: Pick<TemplateVersionListItem, 'status' | 'diffVsActive'> | null | undefined,
): boolean {
  if (!item || item.status === 'active') return false;
  return item.diffVsActive != null;
}

/** Compact Diff body lines for History expand. */
export function formatTemplateHistoryDiffLines(
  diff: TemplateVersionDiffVsActive | null | undefined,
): string[] {
  if (!diff) return [];
  if (!diff.summary) return ['No changes vs current'];
  const lines: string[] = [diff.summary];
  const pushTitles = (label: string, titles?: string[]) => {
    if (!titles?.length) return;
    lines.push(`${label}: ${titles.join(', ')}`);
  };
  pushTitles('Added in current', diff.addedTitles);
  pushTitles('Only in this version', diff.removedTitles);
  pushTitles('Changed', diff.changedTitles);
  if (diff.metaChanges?.length) {
    lines.push(`Meta: ${diff.metaChanges.join(', ')}`);
  }
  return lines;
}
