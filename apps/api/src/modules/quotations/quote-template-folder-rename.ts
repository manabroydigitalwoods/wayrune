import { normalizeTemplateFolder } from './quote-template-content';

/**
 * Remap a template folder when renaming/moving a path prefix.
 * - Matches exact `fromPrefix` or children (`fromPrefix/...`)
 * - `toPrefix` empty/null clears the matched prefix (child remainder kept at root)
 * - Non-matching folders returned unchanged (normalized)
 */
export function remapTemplateFolderPrefix(
  folder: string | null | undefined,
  fromPrefix: string | null | undefined,
  toPrefix: string | null | undefined,
): string | undefined {
  const from = normalizeTemplateFolder(fromPrefix);
  const current = normalizeTemplateFolder(folder);
  if (!from) return current;
  if (!current) return undefined;

  const fl = current.toLowerCase();
  const froml = from.toLowerCase();
  let rest: string | undefined;
  if (fl === froml) {
    rest = '';
  } else if (fl.startsWith(`${froml}/`)) {
    rest = current.slice(from.length + 1);
  } else {
    return current;
  }

  const to = normalizeTemplateFolder(toPrefix);
  if (!to) {
    return rest ? normalizeTemplateFolder(rest) : undefined;
  }
  return rest ? normalizeTemplateFolder(`${to}/${rest}`) : to;
}

/** True when folder equals or sits under fromPrefix. */
export function templateFolderMatchesPrefix(
  folder: string | null | undefined,
  fromPrefix: string | null | undefined,
): boolean {
  const from = normalizeTemplateFolder(fromPrefix);
  const current = normalizeTemplateFolder(folder);
  if (!from || !current) return false;
  const fl = current.toLowerCase();
  const froml = from.toLowerCase();
  return fl === froml || fl.startsWith(`${froml}/`);
}
