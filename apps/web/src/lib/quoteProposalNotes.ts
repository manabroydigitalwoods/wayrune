import type { QuoteServiceType } from '@wayrune/contracts';

export const COMMON_INCLUSION_CHIPS = [
  'Accommodation',
  'Breakfast',
  'All meals as mentioned',
  'Airport / road transfers',
  'Sightseeing as per itinerary',
  'English-speaking guide',
  'Monument / park entry fees',
  'Assistance on arrival',
] as const;

export const COMMON_EXCLUSION_CHIPS = [
  'Flights',
  'Visas',
  'Travel insurance',
  'Personal expenses',
  'Tips and gratuities',
  'Meals not mentioned',
  'Anything not listed in inclusions',
] as const;

export const COMMON_TERMS_CHIPS = [
  'Pay 50% to confirm',
  'Balance due 15 days before travel',
  'Rates subject to availability',
  'Cancellation as per supplier policy',
] as const;

export type QuoteNoteServiceLine = {
  serviceType?: QuoteServiceType | string;
  description?: string;
  unitSell?: number | null;
};

/** Split proposal note text into trimmed non-empty lines. */
export function splitProposalNoteLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function joinProposalNoteLines(lines: string[]): string {
  return lines.map((l) => l.trim()).filter(Boolean).join('\n');
}

function normalizeKey(line: string): string {
  return line.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Toggle a chip line in/out of the note text. */
export function toggleProposalNoteLine(text: string, line: string): string {
  const target = line.trim();
  if (!target) return text;
  const key = normalizeKey(target);
  const existing = splitProposalNoteLines(text);
  const has = existing.some((l) => normalizeKey(l) === key);
  const next = has
    ? existing.filter((l) => normalizeKey(l) !== key)
    : [...existing, target];
  return joinProposalNoteLines(next);
}

export function proposalNoteHasLine(text: string, line: string): boolean {
  const key = normalizeKey(line);
  return splitProposalNoteLines(text).some((l) => normalizeKey(l) === key);
}

/** Merge suggested lines into existing text without duplicates. */
export function mergeProposalNoteLines(text: string, additions: string[]): string {
  const existing = splitProposalNoteLines(text);
  const keys = new Set(existing.map(normalizeKey));
  const next = [...existing];
  for (const add of additions) {
    const trimmed = add.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (keys.has(key)) continue;
    keys.add(key);
    next.push(trimmed);
  }
  return joinProposalNoteLines(next);
}

export function suggestInclusionsFromServices(
  lines: QuoteNoteServiceLine[],
): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const t = String(line.serviceType || '').toLowerCase();
    if (t === 'hotel') out.add('Accommodation');
    if (t === 'transfer') out.add('Airport / road transfers');
    if (t === 'meal') out.add('Meals as mentioned');
    if (t === 'activity') out.add('Sightseeing as per itinerary');
    if (t === 'guide') out.add('English-speaking guide');
    if (t === 'flight') out.add('Flights as mentioned');
    if (t === 'train') out.add('Train tickets as mentioned');
    if (t === 'visa') out.add('Visa assistance');
    if (t === 'insurance') out.add('Travel insurance');
    if (line.unitSell === 0) {
      // Intentionally included / free on the quote
      const desc = (line.description || '').trim();
      if (desc) out.add(desc.replace(/^Day\s+\d+:\s*/i, ''));
    }
  }
  return [...out];
}

export function suggestExclusionsFromServices(
  lines: QuoteNoteServiceLine[],
): string[] {
  const types = new Set(
    lines.map((l) => String(l.serviceType || '').toLowerCase()).filter(Boolean),
  );
  const out: string[] = [];
  if (!types.has('flight')) out.push('Flights');
  if (!types.has('visa')) out.push('Visas');
  if (!types.has('insurance')) out.push('Travel insurance');
  out.push('Personal expenses');
  out.push('Tips and gratuities');
  if (!types.has('meal')) out.push('Meals not mentioned');
  out.push('Anything not listed in inclusions');
  return out;
}

export function suggestTermsDefaults(): string[] {
  return ['Pay 50% to confirm', 'Rates subject to availability'];
}

export function suggestProposalNotesFromServices(lines: QuoteNoteServiceLine[]): {
  inclusions: string[];
  exclusions: string[];
  terms: string[];
} {
  return {
    inclusions: suggestInclusionsFromServices(lines),
    exclusions: suggestExclusionsFromServices(lines),
    terms: suggestTermsDefaults(),
  };
}
