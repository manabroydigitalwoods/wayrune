import { templateMatchesFolderFilter } from './quoteTemplateFolder';
import { templateMatchesTagFilter } from './quoteTemplateTags';

export type PickerTemplateContent = {
  destinationHint?: string | null;
  items?: unknown[];
  tags?: string[];
  folder?: string | null;
};

export type PickerTemplateRow = {
  id: string;
  name: string;
  content?: PickerTemplateContent | null;
};

/** Filter package templates by optional folder + tag (empty = match all). */
export function filterTemplatesByFolderAndTag<T extends PickerTemplateRow>(
  rows: T[],
  opts: { folder?: string | null; tag?: string | null },
): T[] {
  return rows.filter((row) => {
    const tags = Array.isArray(row.content?.tags) ? row.content.tags : [];
    const folder = String(row.content?.folder || '').trim() || undefined;
    return (
      templateMatchesFolderFilter(folder, opts.folder) &&
      templateMatchesTagFilter(tags, opts.tag)
    );
  });
}

/** Combobox description bits: folder · tags · destination · N lines. */
export function formatPackagePickerDescription(content: PickerTemplateContent | null | undefined): string {
  const lineCount = Array.isArray(content?.items) ? content.items.length : 0;
  const hint = String(content?.destinationHint || '').trim();
  const folder = String(content?.folder || '').trim();
  const tags = Array.isArray(content?.tags) ? content.tags.filter(Boolean) : [];
  return [
    folder || null,
    tags.length ? tags.join(', ') : null,
    hint || null,
    lineCount ? `${lineCount} line${lineCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * When the selected template is filtered out, clear selection.
 * Returns the next templateId (same or '').
 */
export function clearTemplateIdIfFilteredOut(
  templateId: string,
  visibleIds: Iterable<string>,
): string {
  if (!templateId) return '';
  const set = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  return set.has(templateId) ? templateId : '';
}

/** Folder + tags for chip UI from one package's content. */
export function pickerMetaChips(
  content: PickerTemplateContent | null | undefined,
): { folder?: string; tags: string[] } {
  const folder = String(content?.folder || '').trim() || undefined;
  const tags = Array.isArray(content?.tags)
    ? content.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return { ...(folder ? { folder } : {}), tags };
}

/**
 * Unique folders + tags across templates for New-trip quick-filter chips.
 * Folders first (stable order of first appearance), then tags; capped.
 */
export function collectUniquePickerMetaChips(
  rows: PickerTemplateRow[],
  opts?: { maxFolders?: number; maxTags?: number },
): { folders: string[]; tags: string[] } {
  const maxFolders = opts?.maxFolders ?? 8;
  const maxTags = opts?.maxTags ?? 12;
  const folders: string[] = [];
  const tags: string[] = [];
  const seenFolder = new Set<string>();
  const seenTag = new Set<string>();
  for (const row of rows) {
    const meta = pickerMetaChips(row.content);
    if (meta.folder) {
      const key = meta.folder.toLowerCase();
      if (!seenFolder.has(key) && folders.length < maxFolders) {
        seenFolder.add(key);
        folders.push(meta.folder);
      }
    }
    for (const tag of meta.tags) {
      const key = tag.toLowerCase();
      if (!seenTag.has(key) && tags.length < maxTags) {
        seenTag.add(key);
        tags.push(tag);
      }
    }
  }
  return { folders, tags };
}
