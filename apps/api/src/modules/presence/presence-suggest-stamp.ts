import type { PresenceSuggestMeta } from '@wayrune/contracts';

export type SuggestMeta = PresenceSuggestMeta;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqStrings(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (!v || !v.trim()) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Merge suggest blobs: later sources win scalar fields; arrays are unioned. */
export function mergeSuggestMeta(...parts: Array<SuggestMeta | null | undefined>): SuggestMeta {
  const merged: SuggestMeta = {};
  let priority: number | undefined;
  for (const part of parts) {
    if (!part) continue;
    merged.orgKinds = uniqStrings([...(merged.orgKinds || []), ...(part.orgKinds || [])]);
    merged.pageRoles = uniqStrings([...(merged.pageRoles || []), ...(part.pageRoles || [])]);
    merged.siteKinds = uniqStrings([...(merged.siteKinds || []), ...(part.siteKinds || [])]);
    merged.useCases = uniqStrings([...(merged.useCases || []), ...(part.useCases || [])]);
    merged.moods = uniqStrings([...(merged.moods || []), ...(part.moods || [])]);
    merged.keywords = uniqStrings([...(merged.keywords || []), ...(part.keywords || [])]);
    merged.bestFor = uniqStrings([...(merged.bestFor || []), ...(part.bestFor || [])]);
    if (typeof part.priority === 'number') priority = part.priority;
  }
  if (priority != null) merged.priority = priority;
  // Drop empty arrays
  for (const key of Object.keys(merged) as Array<keyof SuggestMeta>) {
    const val = merged[key];
    if (Array.isArray(val) && val.length === 0) delete merged[key];
  }
  return merged;
}

export function suggestFromJson(value: unknown): SuggestMeta | null {
  const row = asRecord(value);
  if (!Object.keys(row).length) return null;
  return row as SuggestMeta;
}

/**
 * Site-level suggest stamped on create.
 * Merge order: starter → theme → org/siteKind baseline → overrides.
 */
export function buildSiteSuggest(input: {
  orgKind?: string | null;
  siteKind?: string | null;
  themeSuggest?: SuggestMeta | null;
  starterSuggest?: SuggestMeta | null;
  overrides?: SuggestMeta | null;
}): SuggestMeta {
  const baseline: SuggestMeta = {
    ...(input.orgKind ? { orgKinds: [input.orgKind] } : {}),
    ...(input.siteKind ? { siteKinds: [input.siteKind] } : {}),
  };
  const merged = mergeSuggestMeta(
    input.starterSuggest,
    input.themeSuggest,
    baseline,
    input.overrides,
  );
  if (merged.priority == null) merged.priority = 50;
  return merged;
}

/** Path → pageRoles for page.suggestJson. */
export function pageRolesFromPath(path: string): string[] {
  const p = (path || '/').trim() || '/';
  if (p === '/') return ['home'];
  if (p.startsWith('/contact')) return ['contact'];
  if (p.startsWith('/destinations') || p.startsWith('/destination')) return ['destinations'];
  if (p.startsWith('/tours') || p.startsWith('/trips') || p.startsWith('/packages')) {
    return ['tours'];
  }
  if (p.startsWith('/about') || p.startsWith('/how')) return ['about'];
  if (p.startsWith('/rooms') || p.startsWith('/stay')) return ['rooms'];
  return ['content'];
}

export function buildPageSuggest(input: {
  path: string;
  templateSuggest?: SuggestMeta | null;
  overrides?: SuggestMeta | null;
}): SuggestMeta {
  return mergeSuggestMeta(
    { pageRoles: pageRolesFromPath(input.path), priority: 40 },
    input.templateSuggest,
    input.overrides,
  );
}

/** Score a catalog item's suggest against org/site context (higher = better). */
export function scoreSuggestMatch(
  suggest: SuggestMeta | null | undefined,
  ctx: { orgKind?: string | null; siteKind?: string | null; themeKey?: string | null },
): number {
  if (!suggest) return 0;
  let score = typeof suggest.priority === 'number' ? suggest.priority : 0;
  if (ctx.orgKind && suggest.orgKinds?.includes(ctx.orgKind)) score += 40;
  if (ctx.siteKind && suggest.siteKinds?.includes(ctx.siteKind)) score += 25;
  if (ctx.themeKey && suggest.bestFor?.includes(ctx.themeKey)) score += 15;
  return score;
}

export type ModuleVariation = {
  key: string;
  name?: string;
  isDefault?: boolean;
  defaultPropsJson?: Record<string, unknown>;
};

export function asModuleVariations(value: unknown): ModuleVariation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ModuleVariation =>
      Boolean(row && typeof row === 'object' && typeof (row as ModuleVariation).key === 'string'),
  );
}

export function defaultVariation(variants: ModuleVariation[]): ModuleVariation | null {
  if (!variants.length) return null;
  return variants.find((v) => v.isDefault) || variants[0] || null;
}

export function mergeVariationProps(
  base: Record<string, unknown> | null | undefined,
  variation: ModuleVariation | null,
): Record<string, unknown> {
  const merged = { ...(base || {}) };
  if (variation?.defaultPropsJson) Object.assign(merged, variation.defaultPropsJson);
  if (variation?.key) merged.variant = variation.key;
  return merged;
}
