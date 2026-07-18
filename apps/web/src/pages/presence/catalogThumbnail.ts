/**
 * Resolve theme/component card thumbnail URLs for the authenticated app.
 *
 * Sources (in priority order when reading model fields):
 * - https://… secure external link
 * - package file hosted as /api/v1/files/:id/content (cookie auth)
 * - legacy /api/v1/presence/public/media/:id → rewritten to files content
 */
export function resolveCatalogThumbnailUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;

    if (/^https:\/\//i.test(value)) return value;
    if (/^http:\/\//i.test(value)) continue; // insecure — ignore

    const mediaMatch = value.match(/\/presence\/public\/media\/([^/?#]+)/i);
    if (mediaMatch?.[1]) {
      return `/api/v1/files/${encodeURIComponent(mediaMatch[1])}/content`;
    }

    const filesMatch = value.match(/\/files\/([^/?#]+)\/content/i);
    if (filesMatch?.[1]) {
      return `/api/v1/files/${encodeURIComponent(filesMatch[1])}/content`;
    }

    if (value.startsWith('/api/v1/')) return value;
    if (value.startsWith('/')) return value;
  }
  return null;
}
