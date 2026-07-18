/**
 * Scope theme package CSS for Presence public HTML / builder embedding.
 * Prevents document-global selectors from escaping their host.
 */

export function rewriteCssGlobalsToScope(css: string): string {
  return css
    .replace(/:root\b/g, ':scope')
    .replace(/(^|[,{\s])html(?=[\s,{>:#[.+~]|$)/g, '$1:scope')
    .replace(/(^|[,{\s])body(?=[\s,{>:#[.+~]|$)/g, '$1:scope');
}

export function scopePresenceCss(css: string, hostSelector: string): string {
  const trimmed = css.trim();
  if (!trimmed) return '';
  return `/* presence:scoped → ${hostSelector} */\n@scope (${hostSelector}) {\n${rewriteCssGlobalsToScope(trimmed)}\n}\n`;
}
