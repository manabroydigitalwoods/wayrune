/** Org-level package folder index — keeps empty folder nodes visible in nav. */

import { normalizeTemplateFolder } from './quote-template-content';
import { remapTemplateFolderPrefix } from './quote-template-folder-rename';

export const PACKAGE_FOLDER_INDEX_MAX = 200;

/** Read `settingsJson.packageFolderIndex` as normalized unique paths. */
export function parsePackageFolderIndex(settingsJson: unknown): string[] {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const raw = root.packageFolderIndex;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const n = normalizeTemplateFolder(entry);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= PACKAGE_FOLDER_INDEX_MAX) break;
  }
  return out;
}

/** Union of index paths + template folders (case-insensitive unique, stable order). */
export function mergePackageFolderSources(
  index: string[],
  templateFolders: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const n = normalizeTemplateFolder(raw);
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  for (const f of index) push(f);
  for (const f of templateFolders) push(f);
  return out;
}

/** Insert a folder path into the index (idempotent). */
export function addPackageFolderToIndex(
  index: string[],
  folder: string | null | undefined,
): string[] {
  const n = normalizeTemplateFolder(folder);
  if (!n) return [...index];
  const key = n.toLowerCase();
  if (index.some((f) => f.toLowerCase() === key)) return [...index];
  if (index.length >= PACKAGE_FOLDER_INDEX_MAX) return [...index];
  return [...index, n];
}

/** Remove a folder path from the index (exact match only; does not touch templates). */
export function removePackageFolderFromIndex(
  index: string[],
  folder: string | null | undefined,
): string[] {
  const n = normalizeTemplateFolder(folder);
  if (!n) return [...index];
  const key = n.toLowerCase();
  return index.filter((f) => f.toLowerCase() !== key);
}

/** Remap index paths when renaming/moving a folder prefix (mirrors template remap). */
export function remapPackageFolderIndex(
  index: string[],
  fromPrefix: string | null | undefined,
  toPrefix: string | null | undefined,
): string[] {
  const from = normalizeTemplateFolder(fromPrefix);
  if (!from) return [...index];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const folder of index) {
    const next = remapTemplateFolderPrefix(folder, from, toPrefix);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

/** Write index back into settingsJson (preserves other keys). */
export function withPackageFolderIndex(
  settingsJson: unknown,
  index: string[],
): Record<string, unknown> {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? { ...(settingsJson as Record<string, unknown>) }
      : {};
  const cleaned = parsePackageFolderIndex({ packageFolderIndex: index });
  if (cleaned.length) root.packageFolderIndex = cleaned;
  else delete root.packageFolderIndex;
  return root;
}
