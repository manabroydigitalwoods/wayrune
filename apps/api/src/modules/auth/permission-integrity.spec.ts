import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  PERMISSIONS,
  PERMISSION_DEFS,
  PERMISSION_IMPLIES,
  PERMISSION_SET,
  ORG_KINDS,
  ROLE_ALLOWED_ORG_KINDS,
  ROLE_PERMISSION_MAP,
  PARTNER_ROLE_PERMISSION_MAP,
  PLATFORM_ROLE_PERMISSION_MAP,
  permissionAllowedForOrgKind,
  roleAllowedForOrgKind,
  type PermissionKey,
} from '@travel/rbac';

/**
 * RBAC Integrity 1.0 — CI permission-integrity suite (backend).
 *
 * Belt-and-suspenders on top of the now-typed `@RequirePermissions` decorators:
 * statically scans every controller for guard metadata and cross-checks it, the
 * role maps, and the implication map against the single `PERMISSIONS` list in
 * `@travel/rbac`. Runs with the normal `vitest` unit pass (no DB/Nest boot).
 */

const MODULES_DIR = resolve(process.cwd(), 'src/modules');

function listControllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listControllerFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
}

type GuardRef = {
  file: string;
  decorator: 'RequirePermissions' | 'RequireAllPermissions' | 'RequirePermissionPolicy';
  /** raw permission strings in the call (in declaration order) */
  perms: string[];
  /** for policy guards only */
  anyOf?: string[];
  allOf?: string[];
};

function literals(source: string): string[] {
  return Array.from(source.matchAll(/['"]([^'"]+)['"]/g)).map((m) => m[1]);
}

function collectGuards(): GuardRef[] {
  const refs: GuardRef[] = [];
  for (const file of listControllerFiles(MODULES_DIR)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(MODULES_DIR.length + 1);

    for (const m of src.matchAll(/@RequirePermissions\(([^)]*)\)/g)) {
      refs.push({ file: rel, decorator: 'RequirePermissions', perms: literals(m[1]) });
    }
    for (const m of src.matchAll(/@RequireAllPermissions\(([^)]*)\)/g)) {
      refs.push({ file: rel, decorator: 'RequireAllPermissions', perms: literals(m[1]) });
    }
    for (const m of src.matchAll(/@RequirePermissionPolicy\(([\s\S]*?)\}\s*\)/g)) {
      const body = m[1];
      const anyOf = literals((body.match(/anyOf\s*:\s*\[([^\]]*)\]/) ?? [, ''])[1] ?? '');
      const allOf = literals((body.match(/allOf\s*:\s*\[([^\]]*)\]/) ?? [, ''])[1] ?? '');
      refs.push({
        file: rel,
        decorator: 'RequirePermissionPolicy',
        perms: [...anyOf, ...allOf],
        anyOf,
        allOf,
      });
    }
  }
  return refs;
}

const GUARDS = collectGuards();
const ALL_ROLE_MAPS = {
  ...ROLE_PERMISSION_MAP,
  ...Object.fromEntries(
    Object.entries(PARTNER_ROLE_PERMISSION_MAP).map(([k, v]) => [`partner:${k}`, v]),
  ),
  ...Object.fromEntries(
    Object.entries(PLATFORM_ROLE_PERMISSION_MAP).map(([k, v]) => [`platform:${k}`, v]),
  ),
};

function isKnown(perm: string): perm is PermissionKey {
  return (PERMISSION_SET as ReadonlySet<string>).has(perm);
}

describe('permission integrity: controller guards', () => {
  it('scans at least one controller with guards (sanity)', () => {
    expect(MODULES_DIR).toContain('modules');
    expect(GUARDS.length).toBeGreaterThan(0);
  });

  it('every guard references only real permission keys (no phantom perms)', () => {
    const bad: string[] = [];
    for (const g of GUARDS) {
      for (const p of g.perms) {
        if (!isKnown(p)) bad.push(`${g.file} @${g.decorator} -> "${p}"`);
      }
    }
    expect(bad, `unknown permission(s) in guards: ${bad.join(', ')}`).toEqual([]);
  });

  it('no guard lists the same permission twice (exact duplicate)', () => {
    const dupes: string[] = [];
    for (const g of GUARDS) {
      const seen = new Set<string>();
      for (const p of g.perms) {
        if (seen.has(p)) dupes.push(`${g.file} @${g.decorator} -> "${p}"`);
        seen.add(p);
      }
    }
    expect(dupes, `duplicate permission(s): ${dupes.join(', ')}`).toEqual([]);
  });

  it('no policy lists a permission in both anyOf and allOf (contradiction)', () => {
    const conflicts: string[] = [];
    for (const g of GUARDS) {
      if (g.decorator !== 'RequirePermissionPolicy') continue;
      const any = new Set(g.anyOf ?? []);
      for (const p of g.allOf ?? []) {
        if (any.has(p)) conflicts.push(`${g.file} -> "${p}"`);
      }
    }
    expect(conflicts, `contradictory policy perm(s): ${conflicts.join(', ')}`).toEqual([]);
  });
});

describe('permission integrity: role maps', () => {
  it('every role map references only real permission keys', () => {
    const bad: string[] = [];
    for (const [role, perms] of Object.entries(ALL_ROLE_MAPS)) {
      for (const p of perms) {
        if (!isKnown(p)) bad.push(`${role} -> "${p}"`);
      }
    }
    expect(bad, `unknown permission(s) in roles: ${bad.join(', ')}`).toEqual([]);
  });

  it('no permission is orphaned (must be granted to a role or used by a guard)', () => {
    const inAnyRole = new Set<string>();
    for (const perms of Object.values(ALL_ROLE_MAPS)) for (const p of perms) inAnyRole.add(p);
    const usedByGuard = new Set<string>();
    for (const g of GUARDS) for (const p of g.perms) usedByGuard.add(p);

    // Informational: perms declared but assigned to no role.
    const unassigned = PERMISSIONS.filter((p) => !inAnyRole.has(p));
    if (unassigned.length) {
      // eslint-disable-next-line no-console
      console.warn(`[rbac] permissions assigned to no role: ${unassigned.join(', ')}`);
    }

    const orphaned = PERMISSIONS.filter((p) => !inAnyRole.has(p) && !usedByGuard.has(p));
    expect(orphaned, `orphaned permission(s): ${orphaned.join(', ')}`).toEqual([]);
  });
});

describe('permission integrity: registry metadata (P1)', () => {
  const VALID_KINDS = new Set<string>(ORG_KINDS);

  it('every permission has exactly one registry definition', () => {
    const keys = PERMISSION_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...PERMISSION_SET].every((k) => keys.includes(k))).toBe(true);
  });

  it('every definition declares valid, non-empty org kinds and metadata', () => {
    const bad: string[] = [];
    for (const d of PERMISSION_DEFS) {
      if (!d.group || !d.description) bad.push(`${d.key}: missing group/description`);
      if (!d.allowedOrgKinds.length) bad.push(`${d.key}: no allowedOrgKinds`);
      for (const k of d.allowedOrgKinds) if (!VALID_KINDS.has(k)) bad.push(`${d.key}: bad kind ${k}`);
      if (d.replacement && !(PERMISSION_SET as ReadonlySet<string>).has(d.replacement)) {
        bad.push(`${d.key}: bad replacement ${d.replacement}`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('role availability metadata references only valid org kinds', () => {
    const bad: string[] = [];
    for (const [role, kinds] of Object.entries(ROLE_ALLOWED_ORG_KINDS)) {
      for (const k of kinds) if (!VALID_KINDS.has(k)) bad.push(`${role}: bad kind ${k}`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('permission integrity: org-kind consistency (P1-7)', () => {
  it('every partner role only grants perms valid for at least one of its org kinds', () => {
    const bad: string[] = [];
    for (const [role, perms] of Object.entries(PARTNER_ROLE_PERMISSION_MAP)) {
      const kinds = ROLE_ALLOWED_ORG_KINDS[role] ?? ORG_KINDS;
      for (const p of perms) {
        const okForSomeKind = kinds.some((k) => permissionAllowedForOrgKind(p, k));
        if (!okForSomeKind) bad.push(`partner:${role} -> "${p}" invalid for kinds ${kinds.join('/')}`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a hotel token surface never includes agency CRM perms', () => {
    expect(permissionAllowedForOrgKind('lead.read', 'hotel')).toBe(false);
    expect(permissionAllowedForOrgKind('quote.write', 'hotel')).toBe(false);
    // and stay perms are unavailable in an agency
    expect(permissionAllowedForOrgKind('menu.write', 'travel_agency')).toBe(false);
  });

  it('food-only roles are unavailable in stay orgs and vice-versa', () => {
    expect(roleAllowedForOrgKind('waiter', 'hotel')).toBe(false);
    expect(roleAllowedForOrgKind('front_desk', 'restaurant')).toBe(false);
  });
});

describe('permission integrity: implication map', () => {
  const impl = PERMISSION_IMPLIES as Record<string, readonly string[]>;

  it('keys and implied values are all real permission keys', () => {
    const bad: string[] = [];
    for (const [key, implied] of Object.entries(impl)) {
      if (!isKnown(key)) bad.push(`key "${key}"`);
      for (const v of implied) if (!isKnown(v)) bad.push(`${key} -> "${v}"`);
    }
    expect(bad, `unknown implication perm(s): ${bad.join(', ')}`).toEqual([]);
  });

  it('has no cycles', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const cycles: string[] = [];
    const visit = (node: string, path: string[]) => {
      if (done.has(node)) return;
      if (visiting.has(node)) {
        cycles.push([...path, node].join(' -> '));
        return;
      }
      visiting.add(node);
      for (const next of impl[node] ?? []) visit(next, [...path, node]);
      visiting.delete(node);
      done.add(node);
    };
    for (const key of Object.keys(impl)) visit(key, []);
    expect(cycles, `implication cycle(s): ${cycles.join('; ')}`).toEqual([]);
  });

  it('a broad grant satisfies each implied (narrower) permission', async () => {
    const { hasPermission } = await import('@travel/rbac');
    for (const [broad, narrows] of Object.entries(impl)) {
      for (const narrow of narrows) {
        expect(hasPermission([broad], narrow), `${broad} should imply ${narrow}`).toBe(true);
      }
    }
  });
});
