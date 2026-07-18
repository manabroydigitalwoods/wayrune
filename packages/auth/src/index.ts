import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

/**
 * Re-export the canonical permission helpers from the shared browser-safe core.
 * The `.own`/implication logic lives in exactly one place (`@wayrune/rbac`) so the
 * API guard, worker, and web UI can never drift.
 */
export {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  buildAbility,
  redactFields,
  canAccessRecord,
  effectiveScope,
  effectivePermissions,
  diffPermissions,
  assignablePermissions,
  canGrantPermission,
  permissionGroups,
  isPlatformPermission,
  type Ability,
  type RedactionRules,
  type PermissionKey,
  type PermissionScope,
  type PermissionDiff,
  type RecordScopeContext,
} from '@wayrune/rbac';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export type AccessClaims = {
  sub: string;
  email: string;
  organizationId: string;
  membershipId: string;
  permissions: string[];
  /** Organization.kind — used for agency-only route enforcement */
  organizationKind?: string;
  /**
   * Snapshot of `OrganizationMembership.authVersion` at mint time. The guard
   * rejects the token once the membership's version is bumped (role/membership
   * change), so permission changes take effect within the guard's cache TTL
   * instead of waiting for the ≤15m access-token expiry. Optional for
   * backwards-compat with tokens minted before this field existed.
   */
  authVersion?: number;
  /**
   * PartnerAsset ids this membership is scoped to (RBAC Integrity 1.0 / P1-3).
   * Empty/absent means org-wide (all properties) for backward compatibility;
   * services evaluate property-scoped permissions against this list via
   * `canAccessRecord(...)` from `@wayrune/rbac`.
   */
  propertyScopes?: string[];
};

export function signAccessToken(claims: AccessClaims, secret: string, expiresIn: string) {
  return jwt.sign(claims, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string, secret: string): AccessClaims {
  return jwt.verify(token, secret) as AccessClaims;
}

export function generateRefreshToken() {
  return randomBytes(48).toString('hex');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
