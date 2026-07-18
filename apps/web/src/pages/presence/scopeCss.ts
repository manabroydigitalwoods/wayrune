/**
 * Scope theme/package CSS so it cannot leak into the ERP shell (or vice versa).
 * Public Presence HTML is a separate document — isolation there is automatic.
 * The builder embeds theme CSS in the same document as the app, so we rewrite
 * :root/html/body onto a host and wrap with @scope.
 */

const HOST_DEFAULT = '.presence-live';

/** Rewrite document-global selectors onto :scope (used inside @scope). */
export function rewriteCssGlobalsToScope(css: string): string {
  return css
    .replace(/:root\b/g, ':scope')
    // Standalone html / body type selectors (not class substrings like .nobody)
    .replace(/(^|[,{\s])html(?=[\s,{>:#[.+~]|$)/g, '$1:scope')
    .replace(/(^|[,{\s])body(?=[\s,{>:#[.+~]|$)/g, '$1:scope');
}

/**
 * Wrap CSS so rules only apply under `hostSelector`.
 * Uses CSS @scope (supported in modern Chromium/Safari/Firefox).
 */
export function scopePresenceCss(css: string, hostSelector: string = HOST_DEFAULT): string {
  const trimmed = css.trim();
  if (!trimmed) return '';
  const body = rewriteCssGlobalsToScope(trimmed);
  return `/* presence:scoped → ${hostSelector} */\n@scope (${hostSelector}) {\n${body}\n}\n`;
}

/** True when CSS looks like it could affect the whole document if left unscoped. */
export function cssLooksDocumentGlobal(css: string): boolean {
  return /:root\b|(^|[,{\s])(html|body)(?=[\s,{>:#[.+~]|$)/m.test(css);
}
