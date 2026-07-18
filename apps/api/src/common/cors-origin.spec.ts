import { describe, expect, it } from 'vitest';
import type { AppEnv } from '@wayrune/config';
import { isAllowedCorsOrigin } from './cors-origin';

const env = {
  webOrigin: 'http://localhost:5173',
  siteBaseDomain: 'codepoetry.localhost',
} as AppEnv;

describe('isAllowedCorsOrigin', () => {
  it('allows WEB_ORIGIN and Presence site hosts', () => {
    expect(isAllowedCorsOrigin(undefined, env)).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5173', env)).toBe(true);
    expect(isAllowedCorsOrigin('http://10001.codepoetry.localhost:5173', env)).toBe(true);
    expect(isAllowedCorsOrigin('http://slug.10001.codepoetry.localhost:5173', env)).toBe(true);
  });

  it('rejects unrelated origins', () => {
    expect(isAllowedCorsOrigin('http://evil.example.com', env)).toBe(false);
    expect(isAllowedCorsOrigin('http://localhost:3000', env)).toBe(false);
  });
});
