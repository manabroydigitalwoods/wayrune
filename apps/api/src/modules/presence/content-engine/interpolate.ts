/** Escape HTML entities for safe interpolation into public HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function flattenVars(
  vars: Record<string, unknown>,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(vars)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value == null) {
      out[path] = '';
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      flattenVars(value as Record<string, unknown>, path, out);
      continue;
    }
    out[path] = String(value);
  }
  return out;
}

/**
 * Replace `{{ path.to.value }}` tokens in a template string.
 * Unknown keys resolve to empty string. Output is HTML-escaped by default.
 */
export function interpolate(
  template: string,
  vars: Record<string, unknown>,
  opts?: { escape?: boolean },
): string {
  const flat = flattenVars(vars);
  const shouldEscape = opts?.escape !== false;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
    const raw = flat[path] ?? '';
    return shouldEscape ? escapeHtml(raw) : raw;
  });
}

/** Deep-walk props and interpolate string leaves (skip dataSource / frame / style objects). */
export function interpolateProps(
  props: Record<string, unknown>,
  vars: Record<string, unknown>,
): Record<string, unknown> {
  const skip = new Set([
    'dataSource',
    'liveFrom',
    'frame',
    'style',
    'items',
    'rules',
    'ab',
    'schedule',
  ]);
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return interpolate(value, vars);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        next[k] = skip.has(k) ? v : walk(v);
      }
      return next;
    }
    return value;
  };
  return walk(props) as Record<string, unknown>;
}
