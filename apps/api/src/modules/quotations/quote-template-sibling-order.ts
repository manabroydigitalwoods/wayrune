/** Org-level package sibling order under each folder (no Prisma position column). */

import { normalizeTemplateFolder } from './quote-template-content';
import { remapTemplateFolderPrefix } from './quote-template-folder-rename';

/** Max folder keys kept in `settingsJson.packageSiblingOrder`. */
export const PACKAGE_SIBLING_ORDER_MAX_FOLDERS = 200;
/** Max template ids per folder list. */
export const PACKAGE_SIBLING_ORDER_MAX_IDS = 100;

/** folder key → ordered template ids. `""` = library root / unfiled. */
export type PackageSiblingOrder = Record<string, string[]>;

export function siblingOrderFolderKey(
  folder: string | null | undefined,
): string {
  return normalizeTemplateFolder(folder) || '';
}

/** Read `settingsJson.packageSiblingOrder`. */
export function parsePackageSiblingOrder(
  settingsJson: unknown,
): PackageSiblingOrder {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const raw = root.packageSiblingOrder;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PackageSiblingOrder = {};
  for (const [rawKey, rawIds] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(rawIds)) continue;
    const key = siblingOrderFolderKey(rawKey === '' ? '' : rawKey);
    // Only accept exact root key or normalized folder paths.
    if (rawKey !== '' && !normalizeTemplateFolder(rawKey)) continue;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of rawIds) {
      if (typeof id !== 'string') continue;
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      ids.push(trimmed);
      if (ids.length >= PACKAGE_SIBLING_ORDER_MAX_IDS) break;
    }
    if (!ids.length) continue;
    out[key] = ids;
    if (Object.keys(out).length >= PACKAGE_SIBLING_ORDER_MAX_FOLDERS) break;
  }
  return out;
}

/** Write sibling order back into settingsJson (preserves other keys). */
export function withPackageSiblingOrder(
  settingsJson: unknown,
  order: PackageSiblingOrder,
): Record<string, unknown> {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? { ...(settingsJson as Record<string, unknown>) }
      : {};
  const cleaned = parsePackageSiblingOrder({ packageSiblingOrder: order });
  if (Object.keys(cleaned).length) root.packageSiblingOrder = cleaned;
  else delete root.packageSiblingOrder;
  return root;
}

/**
 * Sort template ids in a folder: saved order first, then remaining by name.
 */
export function sortTemplateIdsBySiblingOrder(opts: {
  folder: string | null | undefined;
  items: Array<{ id: string; name: string }>;
  orderMap: PackageSiblingOrder;
}): string[] {
  const key = siblingOrderFolderKey(opts.folder);
  const saved = opts.orderMap[key] || [];
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const remaining = new Set(opts.items.map((i) => i.id));
  const out: string[] = [];
  for (const id of saved) {
    if (!remaining.has(id)) continue;
    out.push(id);
    remaining.delete(id);
  }
  const rest = [...remaining].sort((a, b) => {
    const an = byId.get(a)?.name || '';
    const bn = byId.get(b)?.name || '';
    return an.localeCompare(bn);
  });
  return [...out, ...rest];
}

/** Persist a new order for one folder (unknown ids dropped; missing folder ids appended). */
export function applySiblingReorder(opts: {
  folder: string | null | undefined;
  orderedIds: string[];
  idsInFolder: string[];
  previous: PackageSiblingOrder;
}): PackageSiblingOrder {
  const key = siblingOrderFolderKey(opts.folder);
  const allowed = new Set(opts.idsInFolder);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of opts.orderedIds) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || !allowed.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= PACKAGE_SIBLING_ORDER_MAX_IDS) break;
  }
  for (const id of opts.idsInFolder) {
    if (seen.has(id)) continue;
    next.push(id);
    if (next.length >= PACKAGE_SIBLING_ORDER_MAX_IDS) break;
  }
  const out: PackageSiblingOrder = { ...opts.previous };
  if (next.length) out[key] = next;
  else delete out[key];
  return out;
}

/** Drop a template id from every folder list (after move / delete). */
export function removeTemplateIdFromSiblingOrder(
  order: PackageSiblingOrder,
  templateId: string,
): PackageSiblingOrder {
  const id = String(templateId || '').trim();
  if (!id) return { ...order };
  const out: PackageSiblingOrder = {};
  for (const [key, ids] of Object.entries(order)) {
    const next = ids.filter((x) => x !== id);
    if (next.length) out[key] = next;
  }
  return out;
}

/** Clear exact folder key + descendant keys (cascade delete / thin cleanup). */
export function clearSiblingOrderPrefix(
  order: PackageSiblingOrder,
  folder: string | null | undefined,
): PackageSiblingOrder {
  const n = normalizeTemplateFolder(folder);
  if (!n) {
    const out = { ...order };
    delete out[''];
    return out;
  }
  const key = n.toLowerCase();
  const out: PackageSiblingOrder = {};
  for (const [k, ids] of Object.entries(order)) {
    const kl = k.toLowerCase();
    if (kl === key || kl.startsWith(`${key}/`)) continue;
    out[k] = ids;
  }
  return out;
}

/** Remap folder keys when renaming/moving a folder prefix (mirrors folder index). */
export function remapPackageSiblingOrder(
  order: PackageSiblingOrder,
  fromPrefix: string | null | undefined,
  toPrefix: string | null | undefined,
): PackageSiblingOrder {
  const from = normalizeTemplateFolder(fromPrefix);
  if (!from) return { ...order };
  const out: PackageSiblingOrder = {};
  const seen = new Set<string>();
  for (const [k, ids] of Object.entries(order)) {
    const nextKeyRaw = remapTemplateFolderPrefix(k || undefined, from, toPrefix);
    const nextKey = siblingOrderFolderKey(nextKeyRaw);
    // Root key "" only when remap cleared the path entirely.
    if (k && !normalizeTemplateFolder(k) && k !== '') continue;
    if (seen.has(nextKey.toLowerCase())) {
      // Merge ids if two keys collide after remap.
      const prev = out[nextKey] || [];
      const merged = [...prev];
      const have = new Set(prev);
      for (const id of ids) {
        if (have.has(id)) continue;
        have.add(id);
        merged.push(id);
      }
      out[nextKey] = merged.slice(0, PACKAGE_SIBLING_ORDER_MAX_IDS);
      continue;
    }
    seen.add(nextKey.toLowerCase());
    out[nextKey] = ids;
  }
  return out;
}
