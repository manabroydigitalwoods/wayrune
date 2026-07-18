import type { Prisma } from '@prisma/client';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type PresenceThemeLike = {
  id: string;
  key: string;
  name: string;
  tokensJson: unknown;
  tokensSchemaJson?: unknown;
  schemaJson?: unknown;
  layoutJson?: unknown;
  regionsJson?: unknown;
  previewAssetsJson?: unknown;
  parentThemeId?: string | null;
  packageFormat?: string | null;
  packageRootKey?: string | null;
  manifestJson?: unknown;
  isSystem?: boolean;
};

export type EffectivePresenceTheme = {
  id: string;
  key: string;
  name: string;
  parentThemeId: string | null;
  parentKey: string | null;
  packageFormat: string;
  packageRootKey: string | null;
  manifestJson: Record<string, unknown>;
  tokensJson: Record<string, unknown>;
  tokensSchemaJson: Record<string, unknown>;
  schemaJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  regionsJson: Record<string, unknown>;
  previewAssetsJson: Record<string, unknown>;
  /** Themes walked parent → child for debugging / UI. */
  cascadeKeys: string[];
};

function shallowMergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...override };
}

/**
 * Resolve WordPress-style parent → child theme cascade (single parent level in v1;
 * walks chain defensively with cycle guard).
 */
export function resolveEffectiveTheme(
  theme: PresenceThemeLike,
  loadParent: (id: string) => PresenceThemeLike | null | undefined,
): EffectivePresenceTheme {
  const chain: PresenceThemeLike[] = [];
  const seen = new Set<string>();
  let current: PresenceThemeLike | null | undefined = theme;
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.unshift(current);
    const parentId = current.parentThemeId;
    if (!parentId) break;
    current = loadParent(parentId);
  }

  let tokensJson: Record<string, unknown> = {};
  let tokensSchemaJson: Record<string, unknown> = {};
  let schemaJson: Record<string, unknown> = {};
  let layoutJson: Record<string, unknown> = {};
  let regionsJson: Record<string, unknown> = {};
  let previewAssetsJson: Record<string, unknown> = {};
  let packageFormat = 'legacy_json';
  let packageRootKey: string | null = null;
  let manifestJson: Record<string, unknown> = {};

  for (const row of chain) {
    tokensJson = shallowMergeRecords(tokensJson, asRecord(row.tokensJson));
    tokensSchemaJson = shallowMergeRecords(tokensSchemaJson, asRecord(row.tokensSchemaJson));
    schemaJson = shallowMergeRecords(schemaJson, asRecord(row.schemaJson));
    layoutJson = shallowMergeRecords(layoutJson, asRecord(row.layoutJson));
    regionsJson = shallowMergeRecords(regionsJson, asRecord(row.regionsJson));
    previewAssetsJson = shallowMergeRecords(previewAssetsJson, asRecord(row.previewAssetsJson));
    if (row.packageFormat) packageFormat = row.packageFormat;
    if (row.packageRootKey) packageRootKey = row.packageRootKey;
    manifestJson = shallowMergeRecords(manifestJson, asRecord(row.manifestJson));
  }

  const leaf = chain[chain.length - 1] || theme;
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;

  return {
    id: leaf.id,
    key: leaf.key,
    name: leaf.name,
    parentThemeId: leaf.parentThemeId ?? null,
    parentKey: parent?.key ?? null,
    packageFormat,
    packageRootKey,
    manifestJson,
    tokensJson,
    tokensSchemaJson,
    schemaJson,
    layoutJson,
    regionsJson,
    previewAssetsJson,
    cascadeKeys: chain.map((t) => t.key),
  };
}

export function effectiveTokensAsJson(
  effective: EffectivePresenceTheme,
): Prisma.InputJsonValue {
  return effective.tokensJson as Prisma.InputJsonValue;
}
