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

export type FolderTreeNode = {
  path: string;
  label: string;
  children: FolderTreeNode[];
};

/** Drop target id for library root in the folder tree. */
export const FOLDER_TREE_ROOT_ID = '__folder_root__';

export function folderLeafLabel(path: string): string {
  const n = normalizeTemplateFolderLabel(path) || '';
  if (!n) return '';
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Nested folder tree from unique full paths (includes ancestor shelves). */
export function buildFolderTree(
  folders: Array<string | null | undefined>,
): FolderTreeNode[] {
  type Mutable = { path: string; label: string; children: Map<string, Mutable> };
  const root = new Map<string, Mutable>();

  const ensurePath = (full: string) => {
    const segs = folderPathSegments(full);
    let level = root;
    let prefix = '';
    for (const label of segs) {
      prefix = prefix ? `${prefix}/${label}` : label;
      const key = label.toLowerCase();
      let node = level.get(key);
      if (!node) {
        node = { path: prefix, label, children: new Map() };
        level.set(key, node);
      }
      level = node.children;
    }
  };

  for (const raw of folders) {
    const n = normalizeTemplateFolderLabel(raw);
    if (!n) continue;
    const segs = folderPathSegments(n);
    for (let depth = 1; depth <= segs.length; depth++) {
      ensurePath(segs.slice(0, depth).join('/'));
    }
  }

  const toNodes = (map: Map<string, Mutable>): FolderTreeNode[] =>
    [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((n) => ({
        path: n.path,
        label: n.label,
        children: toNodes(n.children),
      }));

  return toNodes(root);
}

/**
 * Drop folder `fromFolder` onto `dropOnFolder` (empty = root).
 * Moves the leaf segment under the target; rejects self/descendant drops.
 */
export function computeFolderDropRename(opts: {
  fromFolder: string;
  dropOnFolder: string | null | undefined;
}): { fromFolder: string; toFolder: string } | null {
  const from = normalizeTemplateFolderLabel(opts.fromFolder);
  if (!from) return null;
  const leaf = folderLeafLabel(from);
  if (!leaf) return null;

  const dropRaw =
    opts.dropOnFolder === FOLDER_TREE_ROOT_ID ? '' : opts.dropOnFolder;
  const dropOn = normalizeTemplateFolderLabel(dropRaw) || '';

  if (dropOn) {
    const fl = from.toLowerCase();
    const dl = dropOn.toLowerCase();
    if (fl === dl || dl.startsWith(`${fl}/`)) return null;
  }

  const toFolder = dropOn
    ? normalizeTemplateFolderLabel(`${dropOn}/${leaf}`)
    : leaf;
  if (!toFolder || toFolder.toLowerCase() === from.toLowerCase()) return null;
  return { fromFolder: from, toFolder };
}

export type PackageTreeTemplate = {
  id: string;
  name: string;
  folder?: string | null;
};

/** Templates whose folder equals `folder` exactly (empty = unfiled / root). */
export function templatesExactInFolder(
  templates: PackageTreeTemplate[],
  folder: string | null | undefined,
  siblingOrder?: Record<string, string[]>,
): PackageTreeTemplate[] {
  const q = normalizeTemplateFolderLabel(folder) || '';
  const ql = q.toLowerCase();
  const matched = templates.filter((t) => {
    const f = normalizeTemplateFolderLabel(t.folder) || '';
    return f.toLowerCase() === ql;
  });
  if (!siblingOrder) {
    return matched.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const key = q;
  const saved = siblingOrder[key] || [];
  const byId = new Map(matched.map((t) => [t.id, t]));
  const remaining = new Set(matched.map((t) => t.id));
  const out: PackageTreeTemplate[] = [];
  for (const id of saved) {
    const t = byId.get(id);
    if (!t || !remaining.has(id)) continue;
    out.push(t);
    remaining.delete(id);
  }
  const rest = [...remaining]
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...rest];
}

/** Move one template id up or down within its folder sibling list. */
export function moveSiblingId(opts: {
  orderedIds: string[];
  templateId: string;
  direction: 'up' | 'down';
}): string[] | null {
  const ids = [...opts.orderedIds];
  const i = ids.indexOf(opts.templateId);
  if (i < 0) return null;
  const j = opts.direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return null;
  const tmp = ids[i]!;
  ids[i] = ids[j]!;
  ids[j] = tmp;
  return ids;
}

/**
 * Drop a template onto a folder (empty = root).
 * Returns target folder path, or `null` for root, or `undefined` if no-op.
 */
export function computeTemplateDropFolder(opts: {
  currentFolder: string | null | undefined;
  dropOnFolder: string | null | undefined;
}): string | null | undefined {
  const dropRaw =
    opts.dropOnFolder === FOLDER_TREE_ROOT_ID ? '' : opts.dropOnFolder;
  const dropOn = normalizeTemplateFolderLabel(dropRaw) || null;
  const current = normalizeTemplateFolderLabel(opts.currentFolder) || null;
  if ((current || '') === (dropOn || '')) return undefined;
  return dropOn;
}
