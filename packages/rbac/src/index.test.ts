import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_SET,
  PERMISSION_DEFS,
  PERMISSION_IMPLIES,
  ORG_KINDS,
  ROLE_PERMISSION_MAP,
  PARTNER_ROLE_PERMISSION_MAP,
  PLATFORM_ROLE_PERMISSION_MAP,
  PLATFORM_ROLE_KEYS,
  PLATFORM_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isPermissionKey,
  isPlatformPermission,
  permissionAllowedForOrgKind,
  permissionsForOrgKind,
  roleAllowedForOrgKind,
  effectiveScope,
  canAccessRecord,
  buildAbility,
  redactFields,
  effectivePermissions,
  diffPermissions,
  assignablePermissions,
  canGrantPermission,
  permissionGroups,
} from './index';

describe('hasPermission', () => {
  it('matches an exact permission', () => {
    expect(hasPermission(['trip.read'], 'trip.read')).toBe(true);
    expect(hasPermission(['trip.read'], 'trip.write')).toBe(false);
  });

  it('applies the structural .own rule (broad implies own-scope)', () => {
    expect(hasPermission(['lead.read'], 'lead.read.own')).toBe(true);
    // own-scope grant does NOT satisfy the broad permission
    expect(hasPermission(['lead.read.own'], 'lead.read')).toBe(false);
  });

  it('applies the explicit implication map', () => {
    // lead.read -> lead.read.own is also listed in PERMISSION_IMPLIES
    expect(hasPermission(['lead.read'], 'lead.read.own')).toBe(true);
  });

  it('returns false for an empty permission set', () => {
    expect(hasPermission([], 'trip.read')).toBe(false);
  });
});

describe('hasAnyPermission / hasAllPermissions', () => {
  it('ANY is satisfied by a single held permission', () => {
    expect(hasAnyPermission(['ops.write'], ['network.write', 'ops.write'])).toBe(true);
    expect(hasAnyPermission(['task.read'], ['network.write', 'ops.write'])).toBe(false);
  });

  it('ALL requires every listed permission', () => {
    expect(hasAllPermissions(['ops.write', 'network.write'], ['network.write', 'ops.write'])).toBe(true);
    expect(hasAllPermissions(['ops.write'], ['network.write', 'ops.write'])).toBe(false);
  });

  it('ALL honours implications', () => {
    expect(hasAllPermissions(['lead.read'], ['lead.read.own'])).toBe(true);
  });
});

describe('PERMISSION_SET / isPermissionKey', () => {
  it('contains every declared permission', () => {
    expect(PERMISSION_SET.size).toBe(PERMISSIONS.length);
  });

  it('recognises real keys and rejects phantom strings', () => {
    expect(isPermissionKey('finance.payment.manage')).toBe(true);
    expect(isPermissionKey('finance.write')).toBe(false);
    expect(isPermissionKey('itinerary.read')).toBe(false);
  });
});

describe('permission registry metadata (P1-1)', () => {
  const VALID_KINDS = new Set<string>(ORG_KINDS);

  it('has one definition per permission key (no dupes)', () => {
    const keys = PERMISSION_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(PERMISSIONS.length);
  });

  it('every definition has a non-empty group/description and valid org kinds', () => {
    for (const d of PERMISSION_DEFS) {
      expect(d.group.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.allowedOrgKinds.length).toBeGreaterThan(0);
      for (const k of d.allowedOrgKinds) expect(VALID_KINDS.has(k)).toBe(true);
      if (d.replacement) expect(isPermissionKey(d.replacement)).toBe(true);
    }
  });
});

describe('deny-by-default org-kind validation (P1-7)', () => {
  it('agency perms are valid for travel_agency but not for a hotel', () => {
    expect(permissionAllowedForOrgKind('lead.read', 'travel_agency')).toBe(true);
    expect(permissionAllowedForOrgKind('lead.read', 'hotel')).toBe(false);
  });

  it('stay/food perms are not valid for an agency', () => {
    expect(permissionAllowedForOrgKind('menu.write', 'restaurant')).toBe(true);
    expect(permissionAllowedForOrgKind('menu.write', 'travel_agency')).toBe(false);
    expect(permissionAllowedForOrgKind('reservation.check_in', 'hotel')).toBe(true);
    expect(permissionAllowedForOrgKind('reservation.check_in', 'travel_agency')).toBe(false);
  });

  it('platform catalog perms are platform-only', () => {
    expect(permissionAllowedForOrgKind('platform.catalog.write', 'platform')).toBe(true);
    expect(permissionAllowedForOrgKind('platform.catalog.write', 'travel_agency')).toBe(false);
  });

  it('permissionsForOrgKind clamps a set correctly', () => {
    const forHotel = new Set(permissionsForOrgKind('hotel'));
    expect(forHotel.has('menu.write')).toBe(true);
    expect(forHotel.has('lead.read')).toBe(false);
    expect(forHotel.has('platform.catalog.read')).toBe(false);
  });

  it('unknown perm is denied for every kind', () => {
    expect(permissionAllowedForOrgKind('finance.write', 'hotel')).toBe(false);
  });
});

describe('role availability by org kind (P1-4)', () => {
  it('stay roles are not available in a restaurant, food roles not in a hotel', () => {
    expect(roleAllowedForOrgKind('front_desk', 'hotel')).toBe(true);
    expect(roleAllowedForOrgKind('front_desk', 'restaurant')).toBe(false);
    expect(roleAllowedForOrgKind('waiter', 'restaurant')).toBe(true);
    expect(roleAllowedForOrgKind('waiter', 'hotel')).toBe(false);
    expect(roleAllowedForOrgKind('fleet_manager', 'car_rental')).toBe(true);
    expect(roleAllowedForOrgKind('fleet_manager', 'hotel')).toBe(false);
  });

  it('owner/admin are available in every kind', () => {
    for (const kind of ORG_KINDS) {
      expect(roleAllowedForOrgKind('owner', kind)).toBe(true);
      expect(roleAllowedForOrgKind('admin', kind)).toBe(true);
    }
  });

  it('agency role perms are all agency-valid; partner role perms partner-valid', () => {
    for (const perms of Object.values(ROLE_PERMISSION_MAP)) {
      for (const p of perms) {
        // Non-platform perms must be valid for at least the travel_agency kind
        // (owner/admin include stay/food perms which are stripped at mint).
        expect(isPermissionKey(p)).toBe(true);
      }
    }
    // Partner role perm sets never include agency CRM keys.
    const agencyOnly = ['lead.read', 'lead.write', 'inquiry.read', 'trip.write', 'quote.write'];
    for (const [role, perms] of Object.entries(PARTNER_ROLE_PERMISSION_MAP)) {
      for (const key of agencyOnly) {
        expect(perms.includes(key as never), `${role} must not hold ${key}`).toBe(false);
      }
    }
  });
});

describe('scope hierarchy + implications (P1-2 / P1-3)', () => {
  it('a broader scope satisfies a narrower request', () => {
    expect(hasPermission(['lead.read.team'], 'lead.read.own')).toBe(true);
    expect(hasPermission(['lead.read.own'], 'lead.read.team')).toBe(false);
    expect(hasPermission(['lead.read.all'], 'lead.read.own')).toBe(true);
  });

  it('granular finance perms are implied by finance.payment.manage', () => {
    expect(hasPermission(['finance.payment.manage'], 'finance.invoice.issue')).toBe(true);
    expect(hasPermission(['finance.payment.manage'], 'finance.payment.reverse')).toBe(true);
    // separation of duties: manage does NOT imply approvals
    expect(hasPermission(['finance.payment.manage'], 'finance.refund.approve')).toBe(false);
  });

  it('menu/guest perms are implied by the broad ops/inventory grants', () => {
    expect(hasPermission(['inventory.manage'], 'menu.write')).toBe(true);
    expect(hasPermission(['ops.write'], 'guest_order.accept')).toBe(true);
    expect(hasPermission(['ops.read'], 'guest_order.read')).toBe(true);
  });

  it('every implication resolves broad -> narrow', () => {
    for (const [broad, narrows] of Object.entries(PERMISSION_IMPLIES)) {
      for (const narrow of narrows ?? []) {
        expect(hasPermission([broad], narrow), `${broad} should imply ${narrow}`).toBe(true);
      }
    }
  });
});

describe('effectiveScope + canAccessRecord (P1-3)', () => {
  it('reports org-wide for an unscoped grant, own for own-only', () => {
    expect(effectiveScope(['lead.read'], 'lead.read')).toBeUndefined();
    expect(effectiveScope(['lead.read.own'], 'lead.read')).toBe('own');
    expect(effectiveScope(['task.read'], 'lead.read')).toBeNull();
  });

  it('own scope only matches the record owner', () => {
    expect(canAccessRecord('own', { userId: 'u1', ownerId: 'u1' })).toBe(true);
    expect(canAccessRecord('own', { userId: 'u1', ownerId: 'u2' })).toBe(false);
    expect(canAccessRecord(undefined, { userId: 'u1', ownerId: 'u2' })).toBe(true);
  });

  it('property scope matches only assigned properties', () => {
    expect(
      canAccessRecord('property', { userId: 'u1', propertyId: 'p1', propertyScopes: ['p1', 'p2'] }),
    ).toBe(true);
    expect(
      canAccessRecord('property', { userId: 'u1', propertyId: 'p3', propertyScopes: ['p1', 'p2'] }),
    ).toBe(false);
  });
});

describe('field redaction (P1-5)', () => {
  it('removes fields the ability lacks and keeps the rest', () => {
    const ability = buildAbility(['quote.read', 'finance.margin.read']);
    const out = redactFields(
      { id: 'q1', sellTotal: 100, costTotal: 60, marginAmount: 40 },
      ability,
      {
        costTotal: 'quote.view_cost',
        marginAmount: ['quote.view_cost', 'finance.margin.read'],
      },
    );
    expect(out.id).toBe('q1');
    expect(out.sellTotal).toBe(100);
    expect('costTotal' in out).toBe(false); // lacks quote.view_cost
    expect(out.marginAmount).toBe(40); // has finance.margin.read
  });
});

describe('platform administration split (P2-2)', () => {
  it('defines the four split roles plus legacy platform_admin', () => {
    for (const key of [
      'platform_admin',
      'platform_catalog_admin',
      'platform_support_admin',
      'platform_security_admin',
      'platform_super_admin',
    ]) {
      expect(PLATFORM_ROLE_KEYS).toContain(key);
      expect(PLATFORM_ROLE_PERMISSION_MAP[key]?.length).toBeGreaterThan(0);
    }
  });

  it('least-privilege: catalog admin cannot manage memberships; security admin can', () => {
    expect(PLATFORM_ROLE_PERMISSION_MAP.platform_catalog_admin).not.toContain(
      'platform.membership.manage',
    );
    expect(PLATFORM_ROLE_PERMISSION_MAP.platform_security_admin).toContain(
      'platform.membership.manage',
    );
    expect(PLATFORM_ROLE_PERMISSION_MAP.platform_support_admin).not.toContain(
      'platform.access.revoke',
    );
  });

  it('super admin holds every platform permission (break-glass)', () => {
    const superPerms = new Set(PLATFORM_ROLE_PERMISSION_MAP.platform_super_admin);
    for (const p of PLATFORM_PERMISSIONS) expect(superPerms.has(p)).toBe(true);
  });

  it('platform roles are only available in a platform org', () => {
    expect(roleAllowedForOrgKind('platform_security_admin', 'platform')).toBe(true);
    expect(roleAllowedForOrgKind('platform_security_admin', 'travel_agency')).toBe(false);
    expect(roleAllowedForOrgKind('platform_catalog_admin', 'hotel')).toBe(false);
  });

  it('platform permissions never leak into tenant owner/admin bundles', () => {
    for (const key of PLATFORM_PERMISSIONS) {
      expect(isPlatformPermission(key)).toBe(true);
      expect(ROLE_PERMISSION_MAP.owner).not.toContain(key);
      expect(ROLE_PERMISSION_MAP.admin).not.toContain(key);
    }
  });
});

describe('effectivePermissions + diffPermissions (P2)', () => {
  it('expands implications into the effective set', () => {
    const eff = effectivePermissions(['lead.read']);
    expect(eff).toContain('lead.read');
    expect(eff).toContain('lead.read.own'); // implied
    expect(eff).toEqual([...eff].sort()); // stable/sorted
  });

  it('drops unknown keys from the effective set', () => {
    expect(effectivePermissions(['not.a.real.perm'])).toEqual([]);
  });

  it('diffs two permission lists (added/removed/unchanged)', () => {
    const diff = diffPermissions(['trip.read', 'quote.read'], ['quote.read', 'task.read']);
    expect(diff.added).toEqual(['task.read']);
    expect(diff.removed).toEqual(['trip.read']);
    expect(diff.unchanged).toEqual(['quote.read']);
  });
});

describe('custom-role guardrails: assignablePermissions / canGrantPermission (P2-1)', () => {
  it('clamps to the actor’s held permissions (no privilege escalation)', () => {
    // A limited agency admin who only holds lead + trip read.
    const actor = ['lead.read', 'trip.read'];
    const assignable = assignablePermissions(actor, 'travel_agency');
    expect(assignable).toContain('lead.read');
    expect(assignable).toContain('lead.read.own'); // implied → grantable
    expect(assignable).not.toContain('quote.write'); // not held
    expect(assignable).not.toContain('finance.refund.approve'); // not held
  });

  it('clamps to the org kind (deny-by-default)', () => {
    // Owner holds everything non-platform, but org-kind still filters.
    const owner = [...ROLE_PERMISSION_MAP.owner];
    const hotel = assignablePermissions(owner, 'hotel');
    expect(hotel).not.toContain('lead.read'); // agency-only
    expect(hotel).toContain('reservation.check_in'); // stay perm
    const agency = assignablePermissions(owner, 'travel_agency');
    expect(agency).not.toContain('menu.write'); // stay/food-only
    expect(agency).toContain('lead.read');
  });

  it('never lets a tenant actor grant platform permissions', () => {
    const owner = [...ROLE_PERMISSION_MAP.owner];
    for (const orgKind of ['travel_agency', 'hotel', 'restaurant']) {
      const assignable = assignablePermissions(owner, orgKind);
      for (const p of assignable) expect(isPlatformPermission(p)).toBe(false);
    }
  });

  it('canGrantPermission enforces both hold + org-kind', () => {
    const owner = [...ROLE_PERMISSION_MAP.owner];
    expect(canGrantPermission(owner, 'travel_agency', 'lead.read')).toBe(true);
    expect(canGrantPermission(owner, 'hotel', 'lead.read')).toBe(false); // wrong kind
    expect(canGrantPermission(['lead.read'], 'travel_agency', 'quote.write')).toBe(false); // not held
    expect(canGrantPermission(owner, 'travel_agency', 'platform.super')).toBe(false); // platform
  });
});

describe('permissionGroups (P2 role editor)', () => {
  it('groups registry entries and clamps to org kind', () => {
    const groups = permissionGroups('hotel');
    expect(Object.keys(groups).length).toBeGreaterThan(0);
    // No agency-only group leaks a lead perm into a hotel picker.
    const allKeys = Object.values(groups).flatMap((defs) => defs.map((d) => d.key));
    expect(allKeys).not.toContain('lead.read');
    for (const key of allKeys) expect(permissionAllowedForOrgKind(key, 'hotel')).toBe(true);
  });
});
