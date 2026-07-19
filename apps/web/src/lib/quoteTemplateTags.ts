/** Parse / filter helpers for package template tags. */

export function parseTemplateTagsCsv(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const cleaned = part.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out;
}

export function formatTemplateTagsCsv(tags: string[] | null | undefined): string {
  return (tags || []).join(', ');
}

/** Case-insensitive substring match against any tag (empty filter → match all). */
export function templateMatchesTagFilter(
  tags: string[] | null | undefined,
  filter: string | null | undefined,
): boolean {
  const q = (filter || '').trim().toLowerCase();
  if (!q) return true;
  return (tags || []).some((t) => t.toLowerCase().includes(q));
}
