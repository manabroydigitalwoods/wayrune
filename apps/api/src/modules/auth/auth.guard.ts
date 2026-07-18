import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyAccessToken, type AccessClaims } from '@wayrune/auth';
import { hasAnyPermission, hasAllPermissions } from '@wayrune/rbac';
import { loadEnv } from '@wayrune/config';
import {
  AGENCY_ONLY_KEY,
  ALL_PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
  PERMISSION_POLICY_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ONLY_KEY,
  type PermissionPolicy,
} from '../../common/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from './auth-cookies';

type MembershipAuthState = { authVersion: number; isActive: boolean };

/**
 * Process-wide, short-TTL cache of membership auth state so the per-request
 * `authVersion`/`isActive` recheck costs a DB read only once per TTL window.
 * Bounded staleness = the window in which a revoked role/membership can still
 * pass (refresh tokens are revoked immediately in the same flow). Swap this for
 * a Redis-backed store to get cross-instance coherence.
 */
const MEMBERSHIP_CACHE_TTL_MS = 30_000;
const membershipAuthCache = new Map<string, { state: MembershipAuthState | null; expires: number }>();

/** Evict a membership from the guard cache (called after an authVersion bump). */
export function invalidateMembershipAuthCache(membershipId?: string) {
  if (membershipId) membershipAuthCache.delete(membershipId);
  else membershipAuthCache.clear();
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    @Optional() reflector?: Reflector,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    // Vitest/esbuild may not emit decorator metadata; fall back safely.
    this.reflector = reflector ?? new Reflector();
  }

  /**
   * Reject the token if the membership was deactivated or its `authVersion` was
   * bumped since mint (role/membership change). No-op when Prisma is unavailable
   * (unit tests) or the token predates `authVersion` (backwards-compat).
   */
  private async verifyMembershipState(claims: AccessClaims): Promise<void> {
    if (!this.prisma) return;
    const membershipId = claims.membershipId;
    if (!membershipId) return;

    const cached = membershipAuthCache.get(membershipId);
    let state = cached && cached.expires > Date.now() ? cached.state : undefined;
    if (state === undefined) {
      const row = await this.prisma.organizationMembership.findUnique({
        where: { id: membershipId },
        select: { authVersion: true, isActive: true, deletedAt: true },
      });
      state = row && !row.deletedAt ? { authVersion: row.authVersion, isActive: row.isActive } : null;
      membershipAuthCache.set(membershipId, {
        state,
        expires: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
      });
    }

    if (!state || !state.isActive) {
      throw new UnauthorizedException('Your membership is no longer active');
    }
    if (typeof claims.authVersion === 'number' && claims.authVersion !== state.authVersion) {
      throw new UnauthorizedException('Session expired due to a permission change');
    }
  }

  private async resolveOrgKind(request: {
    user: { organizationKind?: string; organizationId?: string };
  }): Promise<string | undefined> {
    let kind = request.user.organizationKind as string | undefined;
    if (!kind && this.prisma && request.user.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: request.user.organizationId },
        select: { kind: true },
      });
      kind = org?.kind;
      request.user.organizationKind = kind;
    }
    return kind;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const cookieToken = request.cookies?.[ACCESS_COOKIE] as string | undefined;

    let token: string | undefined;
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7);
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token) {
      throw new UnauthorizedException('Missing credentials');
    }

    try {
      const claims = verifyAccessToken(token, loadEnv().jwtAccessSecret);
      request.user = claims;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    // Reject sessions invalidated by a role/membership change since mint.
    await this.verifyMembershipState(request.user);

    const userPerms: string[] = request.user.permissions ?? [];

    // ANY semantics (OR) — the default @RequirePermissions(...).
    const requiredAny = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredAny?.length && !hasAnyPermission(userPerms, requiredAny)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // ALL semantics (AND) — @RequireAllPermissions(...).
    const requiredAll = this.reflector.getAllAndOverride<string[]>(ALL_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredAll?.length && !hasAllPermissions(userPerms, requiredAll)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Combined policy — @RequirePermissionPolicy({ anyOf, allOf }).
    const policy = this.reflector.getAllAndOverride<PermissionPolicy>(PERMISSION_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy) {
      const anyOk = !policy.anyOf?.length || hasAnyPermission(userPerms, policy.anyOf);
      const allOk = !policy.allOf?.length || hasAllPermissions(userPerms, policy.allOf);
      if (!anyOk || !allOk) throw new ForbiddenException('Insufficient permissions');
    }

    const agencyOnly = this.reflector.getAllAndOverride<boolean>(AGENCY_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (agencyOnly) {
      const kind = await this.resolveOrgKind(request);
      if (kind !== 'travel_agency' && kind !== 'dmc') {
        throw new ForbiddenException(
          'This feature is only available to travel agencies and DMCs',
        );
      }
    }

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (platformOnly) {
      const kind = await this.resolveOrgKind(request);
      if (kind !== 'platform') {
        throw new ForbiddenException('This feature is only available to platform administrators');
      }
    }

    return true;
  }
}
