import type { QuotationItem, QuoteTemplateContent } from '@wayrune/contracts';
import { checklistToText } from './quote-template-content';

export type QuoteTemplateDiffRow = {
  field: string;
  thisTip: string;
  current: string;
};

export type QuoteTemplateDiffSummary = {
  addedTitles: string[];
  removedTitles: string[];
  changedTitles: string[];
  metaChanges: string[];
  /** Side-by-side Field / This tip / Current (prior vs active). */
  rows: QuoteTemplateDiffRow[];
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

function displayScalar(value: unknown, empty = '—'): string {
  if (value == null) return empty;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : empty;
  }
  const t = String(value).trim();
  return t || empty;
}

function truncateDisplay(raw: string, max = 56): string {
  const t = raw.trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function commercialChangeRows(
  prior: QuotationItem,
  active: QuotationItem,
  title: string,
): QuoteTemplateDiffRow[] {
  const rows: QuoteTemplateDiffRow[] = [];
  const push = (
    suffix: string,
    thisVal: unknown,
    currentVal: unknown,
  ) => {
    const thisTip = displayScalar(thisVal);
    const current = displayScalar(currentVal);
    if (thisTip === current) return;
    rows.push({ field: `${title} · ${suffix}`, thisTip, current });
  };
  push('qty', prior.quantity ?? 0, active.quantity ?? 0);
  push('unit cost', prior.unitCost, active.unitCost);
  push('unit sell', prior.unitSell, active.unitSell);
  push('tax %', prior.taxPercent ?? 0, active.taxPercent ?? 0);
  push('unit', prior.pricingUnit || '—', active.pricingUnit || '—');
  return rows;
}

function metaChangeRows(
  prior: QuoteTemplateContent,
  active: QuoteTemplateContent,
  metaChanges: string[],
): QuoteTemplateDiffRow[] {
  const wanted = new Set(
    metaChanges.map((m) => m.replace(/\s*\(.*\)$/, '').trim().toLowerCase()),
  );
  const rows: QuoteTemplateDiffRow[] = [];
  if (wanted.has('destination')) {
    rows.push({
      field: 'Destination',
      thisTip: truncateDisplay(prior.destinationHint || ''),
      current: truncateDisplay(active.destinationHint || ''),
    });
  }
  if (wanted.has('currency')) {
    rows.push({
      field: 'Currency',
      thisTip: displayScalar((prior.currency || '').toUpperCase() || null),
      current: displayScalar((active.currency || '').toUpperCase() || null),
    });
  }
  if (wanted.has('folder')) {
    rows.push({
      field: 'Folder',
      thisTip: truncateDisplay(prior.folder || ''),
      current: truncateDisplay(active.folder || ''),
    });
  }
  if (wanted.has('tags')) {
    const fmt = (tags: string[] | undefined) =>
      tags?.length ? truncateDisplay(tags.join(', ')) : '—';
    rows.push({
      field: 'Tags',
      thisTip: fmt(prior.tags),
      current: fmt(active.tags),
    });
  }
  if (wanted.has('inclusions')) {
    rows.push({
      field: 'Inclusions',
      thisTip: truncateDisplay(checklistToText(prior.inclusions) || ''),
      current: truncateDisplay(checklistToText(active.inclusions) || ''),
    });
  }
  if (wanted.has('exclusions')) {
    rows.push({
      field: 'Exclusions',
      thisTip: truncateDisplay(checklistToText(prior.exclusions) || ''),
      current: truncateDisplay(checklistToText(active.exclusions) || ''),
    });
  }
  if (wanted.has('terms')) {
    rows.push({
      field: 'Terms',
      thisTip: truncateDisplay(prior.terms || ''),
      current: truncateDisplay(active.terms || ''),
    });
  }
  if (wanted.has('story days') || [...wanted].some((w) => w.startsWith('story days'))) {
    rows.push({
      field: 'Story days',
      thisTip: String(itineraryDayCount(prior)),
      current: String(itineraryDayCount(active)),
    });
  }
  return rows;
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
  const rows: QuoteTemplateDiffRow[] = [];
  const matchedActive = new Set<QuotationItem>();

  for (const item of priorItems) {
    const key = templateLineDiffKey(item);
    const bucket = activeByKey.get(key) ?? [];
    const matchIdx = bucket.findIndex((a) => !matchedActive.has(a));
    if (matchIdx < 0) {
      const title = lineTitle(item);
      removedTitles.push(title);
      rows.push({
        field: title,
        thisTip: 'in this version',
        current: '—',
      });
      continue;
    }
    const match = bucket[matchIdx]!;
    matchedActive.add(match);
    if (lineFingerprint(item) !== lineFingerprint(match)) {
      const title = lineTitle(item);
      changedTitles.push(title);
      rows.push(...commercialChangeRows(item, match, title));
    }
  }

  for (const item of activeItems) {
    if (!matchedActive.has(item)) {
      const title = lineTitle(item);
      addedTitles.push(title);
      rows.push({
        field: title,
        thisTip: '—',
        current: 'in current',
      });
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

  rows.push(...metaChangeRows(prior, active, metaChanges));

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
    rows,
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
