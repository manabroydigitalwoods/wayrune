import { describe, expect, it } from 'vitest';
import { CAP } from './capabilities';
// Shared browser-safe source of truth for permission keys (aliased to source in
// vitest.config.ts, so the test needs no build step).
import { PERMISSIONS } from '@travel/rbac';

const VALID = new Set<string>(PERMISSIONS);

describe('capabilities registry', () => {
  it('maps every capability to at least one permission', () => {
    for (const [key, perms] of Object.entries(CAP)) {
      expect(perms.length, `${key} lists no permissions`).toBeGreaterThan(0);
    }
  });

  it('references only real permission keys (guards against typos/drift)', () => {
    const bad: string[] = [];
    for (const [key, perms] of Object.entries(CAP)) {
      for (const perm of perms) {
        if (!VALID.has(perm)) bad.push(`${key} -> "${perm}"`);
      }
    }
    expect(bad, `unknown permission(s): ${bad.join(', ')}`).toEqual([]);
  });
});
