/** Shared catalog labels + suggest display for Presence themes/components. */

export const PRESENCE_CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  hero: 'Hero',
  layout: 'Layout',
  content: 'Content',
  media: 'Media',
  travel: 'Travel',
  social_proof: 'Social proof',
  conversion: 'Conversion',
  custom: 'Custom',
};

export const PRESENCE_CATEGORY_ORDER = [
  'navigation',
  'hero',
  'layout',
  'content',
  'media',
  'travel',
  'social_proof',
  'conversion',
  'custom',
] as const;

export type PresenceSuggestMeta = {
  orgKinds?: string[];
  pageRoles?: string[];
  siteKinds?: string[];
  useCases?: string[];
  moods?: string[];
  keywords?: string[];
  priority?: number;
  bestFor?: string[];
};

export type PresenceModuleVariation = {
  key: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  defaultPropsJson?: Record<string, unknown>;
  previewJson?: Record<string, unknown> | null;
  suggestJson?: PresenceSuggestMeta;
};

export function categoryLabel(category: string): string {
  return PRESENCE_CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
}

export function asSuggestMeta(value: unknown): PresenceSuggestMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PresenceSuggestMeta;
}

export function asModuleVariations(value: unknown): PresenceModuleVariation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is PresenceModuleVariation =>
      Boolean(row && typeof row === 'object' && typeof (row as PresenceModuleVariation).key === 'string'),
  );
}

export function defaultVariation(
  variants: PresenceModuleVariation[],
): PresenceModuleVariation | null {
  if (!variants.length) return null;
  return variants.find((v) => v.isDefault) || variants[0] || null;
}

export function mergeVariationProps(
  base: Record<string, unknown> | null | undefined,
  variation: PresenceModuleVariation | null,
): Record<string, unknown> {
  const merged = { ...(base || {}) };
  if (variation?.defaultPropsJson) Object.assign(merged, variation.defaultPropsJson);
  if (variation?.key) merged.variant = variation.key;
  return merged;
}

/** Compact chips for suggest meta (themes + components). */
export function suggestChipList(meta: PresenceSuggestMeta | null | undefined): string[] {
  if (!meta) return [];
  const chips: string[] = [];
  for (const mood of meta.moods || []) chips.push(mood);
  for (const kind of meta.orgKinds || []) chips.push(kind.replace(/_/g, ' '));
  for (const role of meta.pageRoles || []) chips.push(role);
  for (const site of meta.siteKinds || []) chips.push(site);
  for (const use of meta.useCases || []) chips.push(use);
  for (const best of meta.bestFor || []) chips.push(best.replace(/_/g, ' '));
  return [...new Set(chips)].slice(0, 8);
}

/** Score suggest meta against org/site/theme context (higher = better fit). */
export function scoreSuggestMatch(
  suggest: PresenceSuggestMeta | null | undefined,
  ctx: { orgKind?: string | null; siteKind?: string | null; themeKey?: string | null },
): number {
  if (!suggest) return 0;
  let score = typeof suggest.priority === 'number' ? suggest.priority : 0;
  if (ctx.orgKind && suggest.orgKinds?.includes(ctx.orgKind)) score += 40;
  if (ctx.siteKind && suggest.siteKinds?.includes(ctx.siteKind)) score += 25;
  if (ctx.themeKey && suggest.bestFor?.includes(ctx.themeKey)) score += 15;
  return score;
}
