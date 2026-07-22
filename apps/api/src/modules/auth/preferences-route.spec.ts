import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONTROLLER = readFileSync(resolve(process.cwd(), 'src/modules/auth/auth.controller.ts'), 'utf8');
const SERVICE = readFileSync(resolve(process.cwd(), 'src/modules/auth/auth.service.ts'), 'utf8');

describe('auth preferences route', () => {
  it('exposes a patch route for per-user preferences', () => {
    expect(CONTROLLER).toContain("@Patch('me/preferences')");
    expect(CONTROLLER).toContain('UpdateUserPreferencesSchema.parse');
  });

  it('persists user preferences json on the user record', () => {
    expect(SERVICE).toContain('preferencesJson');
    expect(SERVICE).toContain('updatePreferences');
    expect(CONTROLLER).toContain("@wayrune/contracts'");
    expect(CONTROLLER).not.toContain("@wayrune/contracts/src");
  });
});
