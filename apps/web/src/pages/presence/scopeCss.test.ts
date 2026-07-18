import { describe, expect, it } from 'vitest';
import {
  cssLooksDocumentGlobal,
  rewriteCssGlobalsToScope,
  scopePresenceCss,
} from './scopeCss';

describe('scopePresenceCss', () => {
  it('rewrites :root and body onto :scope', () => {
    const out = rewriteCssGlobalsToScope(`:root { --primary: red; } body { color: blue; }`);
    expect(out).toContain(':scope { --primary: red; }');
    expect(out).toContain(':scope { color: blue; }');
    expect(out).not.toMatch(/:root/);
    expect(out).not.toMatch(/\bbody\b/);
  });

  it('wraps with @scope host', () => {
    const out = scopePresenceCss('a { color: red; }', '.presence-live');
    expect(out).toContain('@scope (.presence-live)');
    expect(out).toContain('a { color: red; }');
  });

  it('detects document-global CSS', () => {
    expect(cssLooksDocumentGlobal(':root { --x: 1 }')).toBe(true);
    expect(cssLooksDocumentGlobal('.presence-header { color: red }')).toBe(false);
  });
});
