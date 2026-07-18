import { describe, expect, it } from 'vitest';
import { sanitizeThemePackageCss } from './presence-theme-package.service';

describe('sanitizeThemePackageCss', () => {
  it('strips remote @import and dangerous constructs', () => {
    const input = `
@import url("https://evil.example/x.css");
.hero { color: expression(alert(1)); behavior: url(x); }
a { background: url(javascript:alert(1)); }
.b { background: url(https://cdn.example/a.png); }
.c { background: url(assets/logo.png); }
`;
    const out = sanitizeThemePackageCss(input);
    expect(out).toContain('blocked @import');
    expect(out).toContain('blocked expression');
    expect(out).toContain('blocked behavior');
    expect(out).toContain('blocked:');
    expect(out).toContain('blocked remote');
    expect(out).toContain('url(assets/logo.png)');
  });
});
