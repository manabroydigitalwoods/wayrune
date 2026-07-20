/** Slash-path folder helpers for package templates (`Hill stations/Darjeeling`). */

export const TEMPLATE_FOLDER_MAX_LEN = 80;

/** Trim segments, collapse `//`, join with `/`, cap length. */
export function normalizeTemplateFolderLabel(
  raw: string | null | undefined,
): string | undefined {
  if (raw == null) return undefined;
  const segments = String(raw)
    .split('/')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (!segments.length) return undefined;
  let out = '';
  for (const seg of segments) {
    const next = out ? `${out}/${seg}` : seg;
    if (next.length > TEMPLATE_FOLDER_MAX_LEN) break;
    out = next;
  }
  return out || undefined;
}

export function folderPathSegments(folder: string | null | undefined): string[] {
  const normalized = normalizeTemplateFolderLabel(folder);
  return normalized ? normalized.split('/') : [];
}

/** Path prefix through `depth` segments (1-based). */
export function folderPathPrefix(
  folder: string | null | undefined,
  depth: number,
): string | undefined {
  const segs = folderPathSegments(folder);
  if (depth < 1 || segs.length < depth) return undefined;
  return segs.slice(0, depth).join('/');
}

/**
 * Match folder filter: empty → all; path prefix (exact or ancestor);
 * free-text without `/` also allows substring (typed filter).
 */
export function templateMatchesFolderFilter(
  folder: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  const qRaw = (filter || '').trim();
  if (!qRaw) return true;
  const f = (folder || '').trim();
  if (!f) return false;
  const q = qRaw.toLowerCase();
  const fl = f.toLowerCase();
  if (fl === q || fl.startsWith(`${q}/`)) return true;
  if (!q.includes('/')) return fl.includes(q);
  return false;
}

export type FolderNavBreadcrumb = { label: string; path: string };

export type FolderNavState = {
  filter: string;
  breadcrumbs: FolderNavBreadcrumb[];
  /** Next-level paths under the current filter (or roots when empty). */
  children: string[];
};

/**
 * Remap folder when renaming a path prefix (mirrors API).
 * Empty `toPrefix` clears the matched prefix.
 */
export function remapTemplateFolderPrefixUi(
  folder: string | null | undefined,
  fromPrefix: string | null | undefined,
  toPrefix: string | null | undefined,
): string | undefined {
  const from = normalizeTemplateFolderLabel(fromPrefix);
  const current = normalizeTemplateFolderLabel(folder);
  if (!from) return current;
  if (!current) return undefined;
  const fl = current.toLowerCase();
  const froml = from.toLowerCase();
  let rest: string | undefined;
  if (fl === froml) rest = '';
  else if (fl.startsWith(`${froml}/`)) rest = current.slice(from.length + 1);
  else return current;
  const to = normalizeTemplateFolderLabel(toPrefix);
  if (!to) return rest ? normalizeTemplateFolderLabel(rest) : undefined;
  return rest ? normalizeTemplateFolderLabel(`${to}/${rest}`) : to;
}

/**
 * Breadcrumb + child path chips from unique full folder paths.
 * Filter is a path prefix; children are one segment deeper.
 */
export function buildFolderNav(
  folders: Array<string | null | undefined>,
  filter: string | null | undefined,
): FolderNavState {
  const q = normalizeTemplateFolderLabel(filter) || '';
  const all: string[] = [];
  const seen = new Set<string>();
  for (const raw of folders) {
    const n = normalizeTemplateFolderLabel(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(n);
  }

  const breadcrumbs: FolderNavBreadcrumb[] = folderPathSegments(q).map((label, i, segs) => ({
    label,
    path: segs.slice(0, i + 1).join('/'),
  }));

  const childMap = new Map<string, string>();
  const qLower = q.toLowerCase();
  const qDepth = folderPathSegments(q).length;

  for (const folder of all) {
    const segs = folderPathSegments(folder);
    if (!q) {
      if (segs[0]) childMap.set(segs[0].toLowerCase(), segs[0]);
      continue;
    }
    const fl = folder.toLowerCase();
    if (fl !== qLower && !fl.startsWith(`${qLower}/`)) continue;
    if (segs.length > qDepth) {
      const path = segs.slice(0, qDepth + 1).join('/');
      childMap.set(path.toLowerCase(), path);
    }
  }

  return { filter: q, breadcrumbs, children: [...childMap.values()] };
}

/** True when any template folder equals or sits under `folder`. */
export function templatesUnderFolder(
  folders: Array<string | null | undefined>,
  folder: string | null | undefined,
): boolean {
  const q = normalizeTemplateFolderLabel(folder);
  if (!q) return false;
  const ql = q.toLowerCase();
  return folders.some((raw) => {
    const f = normalizeTemplateFolderLabel(raw);
    if (!f) return false;
    const fl = f.toLowerCase();
    return fl === ql || fl.startsWith(`${ql}/`);
  });
}
