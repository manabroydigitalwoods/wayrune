import type { QuotationItem, QuoteTemplateContent } from '@wayrune/contracts';
import { checklistToText } from './quote-template-content';

export type QuoteTemplateDiffSummary = {
  addedTitles: string[];
  removedTitles: string[];
  changedTitles: string[];
  metaChanges: string[];
  /** Compact one-liner for History, or null when identical. */
  summary: string | null;
};

function lineTitle(item: QuotationItem): string {
  const desc = (item.description || '').trim();
  if (desc) return desc.length > 48 ? `${desc.slice(0, 45)}…` : desc;
  const kind = item.rateKind || item.serviceType || 'line';
  return kind;
}

/** Stable-ish key across reminted template copies (ids never match). */
export function templateLineDiffKey(item: QuotationItem): string {
  const kind = (item.rateKind || item.serviceType || '').trim().toLowerCase();
  const desc = (item.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${kind}::${desc}`;
}

function lineFingerprint(item: QuotationItem): string {
  const qty = item.quantity ?? 0;
  const cost = item.unitCost ?? null;
  const sell = item.unitSell ?? null;
  const tax = item.taxPercent ?? 0;
  const unit = item.pricingUnit ?? '';
  return `${qty}|${cost}|${sell}|${tax}|${unit}`;
}

function checklistNorm(value: unknown): string {
  return (checklistToText(value) || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function itineraryDayCount(content: QuoteTemplateContent): number {
  const days = content.itinerary?.days;
  return Array.isArray(days) ? days.length : 0;
}

/**
 * Compare a prior template version against the active tip.
 * Lines matched by type+description (multiset); commercial fields detect change.
 */
export function diffQuoteTemplateContent(
  prior: QuoteTemplateContent,
  active: QuoteTemplateContent,
): QuoteTemplateDiffSummary {
  const priorItems = prior.items ?? [];
  const activeItems = active.items ?? [];

  const activeByKey = new Map<string, QuotationItem[]>();
  for (const item of activeItems) {
    const key = templateLineDiffKey(item);
    const bucket = activeByKey.get(key) ?? [];
    bucket.push(item);
    activeByKey.set(key, bucket);
  }

  const addedTitles: string[] = [];
  const removedTitles: string[] = [];
  const changedTitles: string[] = [];
  const matchedActive = new Set<QuotationItem>();

  for (const item of priorItems) {
    const key = templateLineDiffKey(item);
    const bucket = activeByKey.get(key) ?? [];
    const matchIdx = bucket.findIndex((a) => !matchedActive.has(a));
    if (matchIdx < 0) {
      removedTitles.push(lineTitle(item));
      continue;
    }
    const match = bucket[matchIdx]!;
    matchedActive.add(match);
    if (lineFingerprint(item) !== lineFingerprint(match)) {
      changedTitles.push(lineTitle(item));
    }
  }

  for (const item of activeItems) {
    if (!matchedActive.has(item)) {
      addedTitles.push(lineTitle(item));
    }
  }

  const metaChanges: string[] = [];
  const priorDest = (prior.destinationHint || '').trim();
  const activeDest = (active.destinationHint || '').trim();
  if (priorDest !== activeDest) metaChanges.push('destination');

  if ((prior.currency || '').toUpperCase() !== (active.currency || '').toUpperCase()) {
    metaChanges.push('currency');
  }
  if (checklistNorm(prior.inclusions) !== checklistNorm(active.inclusions)) {
    metaChanges.push('inclusions');
  }
  if (checklistNorm(prior.exclusions) !== checklistNorm(active.exclusions)) {
    metaChanges.push('exclusions');
  }
  if ((prior.terms || '').trim() !== (active.terms || '').trim()) {
    metaChanges.push('terms');
  }
  const priorTags = [...(prior.tags || [])]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
  const activeTags = [...(active.tags || [])]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
  if (priorTags !== activeTags) metaChanges.push('tags');
  const priorFolder = (prior.folder || '').trim().toLowerCase();
  const activeFolder = (active.folder || '').trim().toLowerCase();
  if (priorFolder !== activeFolder) metaChanges.push('folder');
  const priorDays = itineraryDayCount(prior);
  const activeDays = itineraryDayCount(active);
  if (priorDays !== activeDays) {
    metaChanges.push(
      priorDays === 0 || activeDays === 0
        ? 'story days'
        : `story days (${priorDays}→${activeDays})`,
    );
  }

  const summary = formatQuoteTemplateDiffSummary({
    addedTitles,
    removedTitles,
    changedTitles,
    metaChanges,
  });

  return {
    addedTitles,
    removedTitles,
    changedTitles,
    metaChanges,
    summary,
  };
}

export function formatQuoteTemplateDiffSummary(opts: {
  addedTitles: string[];
  removedTitles: string[];
  changedTitles: string[];
  metaChanges: string[];
}): string | null {
  const bits: string[] = [];
  const added = opts.addedTitles.length;
  const removed = opts.removedTitles.length;
  const changed = opts.changedTitles.length;
  if (added || removed || changed) {
    const parts: string[] = [];
    if (added) parts.push(`+${added}`);
    if (removed) parts.push(`−${removed}`);
    if (changed) parts.push(`~${changed}`);
    bits.push(`${parts.join(' / ')} line${added + removed + changed === 1 ? '' : 's'}`);
  }
  if (opts.metaChanges.length) {
    bits.push(`meta: ${opts.metaChanges.join(', ')}`);
  }
  return bits.length ? bits.join(' · ') : null;
}
