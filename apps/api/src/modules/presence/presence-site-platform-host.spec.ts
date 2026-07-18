import { describe, expect, it } from 'vitest';
import {
  buildSitePlatformHost,
  parseSitePlatformHost,
} from './presence-site-platform-host';

describe('presence-site-platform-host', () => {
  const base = 'codepoetry.app';

  it('builds primary and secondary platform hosts', () => {
    expect(buildSitePlatformHost(48715351, base, { isPrimary: true })).toBe(
      '48715351.codepoetry.app',
    );
    expect(
      buildSitePlatformHost(48715351, base, {
        isPrimary: false,
        platformSlug: 'k7m2p9xq',
      }),
    ).toBe('k7m2p9xq.48715351.codepoetry.app');
  });

  it('parses primary platform host', () => {
    expect(parseSitePlatformHost('48715351.codepoetry.app', base)).toEqual({
      kind: 'primary',
      publicCode: 48715351,
    });
  });

  it('parses non-primary platform host', () => {
    expect(parseSitePlatformHost('k7m2p9xq.48715351.codepoetry.app', base)).toEqual({
      kind: 'site',
      publicCode: 48715351,
      platformSlug: 'k7m2p9xq',
    });
  });

  it('ignores legacy slug-only hosts', () => {
    expect(parseSitePlatformHost('roytravels.codepoetry.app', base)).toBeNull();
  });
});
