import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateRefreshToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
} from '@wayrune/auth';
import {
  loadEnv,
  PARTNER_ALLOWED_PERMISSIONS,
  PARTNER_ROLE_PERMISSION_MAP,
  ROLE_PERMISSION_MAP,
} from '@wayrune/config';
import { ORG_KINDS, permissionAllowedForOrgKind } from '@wayrune/rbac';
import {
  UpdateUserPreferencesSchema,
  UserAppearancePreferencesSchema,
  parseOrgAppearanceDefaults,
  orgAppearanceHasValues,
  type LoginInput,
  type RegisterInput,
  type UpdateUserPreferencesInput,
  type UserPreferences,
} from '@wayrune/contracts';
import { createLogger } from '@wayrune/observability';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/helpers';
import { invalidateMembershipAuthCache } from './auth.guard';

const log = createLogger('auth');

function parseUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = UpdateUserPreferencesSchema.safeParse(raw);
  if (!parsed.success) return {};
  return {
    appearance: UserAppearancePreferencesSchema.parse(parsed.data.appearance ?? {}),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private orgs: OrganizationsService,
    private audit: AuditService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        fullName: input.fullName,
      },
    });

    const org = await this.orgs.createOrganizationWithOwner({
      name: input.organizationName,
      ownerUserId: user.id,
      kind: input.organizationKind || 'travel_agency',
      city: input.city || null,
      discoverable: input.discoverable,
    });

    await this.audit.record({
      organizationId: org.id,
      actorUserId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
    });

    log.info('User registered', { userId: user.id, organizationId: org.id });
    return this.issueTokens(user.id, org.id);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.isActive) {
      log.warn('Login failed: unknown or inactive user', { email: input.email.toLowerCase() });
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      log.warn('Login failed: bad password', { userId: user.id });
      throw new UnauthorizedException('Invalid credentials');
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id, isActive: true, deletedAt: null },
      include: { organization: true },
    });
    if (!memberships.length) {
      log.warn('Login failed: no membership', { userId: user.id });
      throw new UnauthorizedException('No organization membership');
    }

    let membership = memberships[0];
    if (input.organizationSlug) {
      const found = memberships.find((m) => m.organization.slug === input.organizationSlug);
      if (!found) throw new UnauthorizedException('Organization not found for user');
      membership = found;
    }

    await this.audit.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    });

    log.info('User logged in', { userId: user.id, organizationId: membership.organizationId });
    return this.issueTokens(user.id, membership.organizationId);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Invalid refresh token');
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    let membership = null as { organizationId: string } | null;
    if (stored.organizationId) {
      membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: stored.userId,
          organizationId: stored.organizationId,
          isActive: true,
          deletedAt: null,
        },
      });
    }
    if (!membership) {
      membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: stored.userId, isActive: true, deletedAt: null },
      });
    }
    if (!membership) throw new UnauthorizedException('No membership');

    return this.issueTokens(stored.userId, membership.organizationId);
  }

  async revokeRefreshToken(refreshToken: string) {
    if (!refreshToken) return;
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke every refresh token for a user's session in a given organization. */
  async revokeUserOrgSessions(userId: string, organizationId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Invalidate all sessions for a membership after a role/membership change:
   * bump `authVersion` (so live access tokens fail the guard within its cache
   * TTL), evict the guard cache immediately, and revoke the user's refresh
   * tokens for that org. Call this from any future member-management mutation.
   */
  async invalidateMembershipSessions(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { authVersion: { increment: 1 } },
      select: { id: true },
    });
    invalidateMembershipAuthCache(membership.id);
    await this.revokeUserOrgSessions(userId, organizationId);
  }

  async me(user: AuthUser) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });
    const membershipRows = await this.prisma.organizationMembership.findMany({
      where: { userId: user.sub, isActive: true, deletedAt: null },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            kind: true,
            publicCode: true,
            subdomain: true,
            customDomain: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const activeMembership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.sub,
        organizationId: user.organizationId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        roles: { include: { role: { select: { key: true } } } },
      },
    });
    const settings =
      org.settingsJson && typeof org.settingsJson === 'object' && !Array.isArray(org.settingsJson)
        ? (org.settingsJson as Record<string, unknown>)
        : {};
    const display =
      settings.display && typeof settings.display === 'object' && !Array.isArray(settings.display)
        ? (settings.display as Record<string, unknown>)
        : {};
    const dateFormat =
      display.dateFormat === 'd_mmm_yyyy' ||
      display.dateFormat === 'dd_mm_yyyy' ||
      display.dateFormat === 'mm_dd_yyyy' ||
      display.dateFormat === 'yyyy_mm_dd'
        ? display.dateFormat
        : 'd_mmm_yyyy';
    const timeFormat =
      display.timeFormat === 'h12' || display.timeFormat === 'h24' ? display.timeFormat : 'h24';
    const appearance = parseUserPreferences(dbUser.preferencesJson).appearance ?? {};
    const appearanceDefaults = parseOrgAppearanceDefaults(settings.appearance);
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      preferences: { appearance },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        kind: org.kind,
        publicCode: org.publicCode,
        subdomain: org.subdomain,
        customDomain: org.customDomain,
        timezone: org.timezone,
        currency: org.currency,
        dateFormat,
        timeFormat,
        appearanceDefaults: orgAppearanceHasValues(appearanceDefaults)
          ? appearanceDefaults
          : undefined,
      },
      memberships: membershipRows.map((m) => ({
        organizationId: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        kind: m.organization.kind,
        publicCode: m.organization.publicCode,
        subdomain: m.organization.subdomain,
        customDomain: m.organization.customDomain,
      })),
      roles: activeMembership?.roles.map((mr) => mr.role.key) ?? [],
      permissions: user.permissions,
    };
  }

  async updatePreferences(user: AuthUser, input: UpdateUserPreferencesInput) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { preferencesJson: true },
    });
    const currentAppearance = parseUserPreferences(current.preferencesJson).appearance ?? {};
    const nextAppearance =
      input.appearance === null
        ? {}
        : UserAppearancePreferencesSchema.parse({
            ...currentAppearance,
            ...(input.appearance ?? {}),
          });
    const updated = await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        preferencesJson: { appearance: nextAppearance } as Prisma.InputJsonValue,
      },
      select: { preferencesJson: true },
    });
    return {
      preferences: {
        appearance: parseUserPreferences(updated.preferencesJson).appearance ?? {},
      },
    };
  }

  async switchOrganization(
    user: AuthUser,
    organizationId: string,
    currentRefreshToken?: string,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.sub,
        organizationId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!membership) throw new UnauthorizedException('Not a member of that organization');

    if (currentRefreshToken) {
      await this.revokeRefreshToken(currentRefreshToken);
    }

    await this.audit.record({
      organizationId,
      actorUserId: user.sub,
      action: 'auth.switch_organization',
      entityType: 'user',
      entityId: user.sub,
      metadata: { fromOrganizationId: user.organizationId, toOrganizationId: organizationId },
    });

    return this.issueTokens(user.sub, organizationId);
  }

  async issueTokens(userId: string, organizationId: string) {
    const env = loadEnv();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { kind: true },
    });
    const membership = await this.prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
        propertyScopes: { select: { partnerAssetId: true } },
      },
    });

    // Seed-safety fallback map must match the org family: partner orgs use the
    // partner role map, never the agency owner/admin superset (which would leak
    // agency-only + granular TENANT perms into partner tokens before the clamp).
    const isPartnerKind =
      org.kind !== 'travel_agency' && org.kind !== 'dmc' && org.kind !== 'platform';
    const fallbackRoleMap = isPartnerKind ? PARTNER_ROLE_PERMISSION_MAP : ROLE_PERMISSION_MAP;

    const permissions = new Set<string>();
    for (const mr of membership.roles) {
      for (const rp of mr.role.permissions) {
        permissions.add(rp.permission.key);
      }
      // fallback from role key map for seed safety
      const mapped = fallbackRoleMap[mr.role.key];
      if (mapped) mapped.forEach((p) => permissions.add(p));
    }

    // Deny-by-default org-kind clamp (RBAC Integrity 1.0 / P1-7): a token never
    // carries a permission that the registry says is invalid for the org's kind.
    // This generalizes the old partner-only clamp — e.g. an agency owner's token
    // is stripped of stay/food-only perms (menu.*, reservation.check_in, ...),
    // and a hotel token can never carry agency CRM perms.
    if ((ORG_KINDS as readonly string[]).includes(org.kind)) {
      for (const key of [...permissions]) {
        if (!permissionAllowedForOrgKind(key, org.kind)) {
          permissions.delete(key);
        }
      }
    } else if (
      org.kind !== 'travel_agency' &&
      org.kind !== 'dmc' &&
      org.kind !== 'platform'
    ) {
      // Fallback for any non-standard org kind not in the registry.
      for (const key of [...permissions]) {
        if (!PARTNER_ALLOWED_PERMISSIONS.has(key as never)) {
          permissions.delete(key);
        }
      }
    }

    // Property/branch scope assignments (P1-3). Empty = org-wide (all properties).
    const propertyScopes = membership.propertyScopes.map((s) => s.partnerAssetId);

    const accessToken = signAccessToken(
      {
        sub: user.id,
        email: user.email,
        organizationId,
        membershipId: membership.id,
        permissions: [...permissions],
        organizationKind: org.kind,
        authVersion: membership.authVersion,
        propertyScopes,
      },
      env.jwtAccessSecret,
      env.jwtAccessTtl,
    );

    const refreshToken = generateRefreshToken();
    const days = 7;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      organizationId,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    };
  }

  private oauthProviderConfig(provider: 'google' | 'microsoft') {
    const env = loadEnv();
    if (provider === 'google') {
      return {
        clientId: env.googleOauthClientId,
        clientSecret: env.googleOauthClientSecret,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
        scope: 'openid email profile',
      };
    }
    return {
      clientId: env.microsoftOauthClientId,
      clientSecret: env.microsoftOauthClientSecret,
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
      scope: 'openid email profile',
    };
  }

  private oauthRedirectUri(provider: 'google' | 'microsoft') {
    const env = loadEnv();
    return `${env.oauthRedirectBase.replace(/\/$/, '')}/api/v1/auth/oauth/${provider}/callback`;
  }

  /** Builds the Google/Microsoft consent screen URL for the login button to redirect to. */
  buildOAuthAuthorizeUrl(provider: 'google' | 'microsoft', orgSlug?: string): string {
    const cfg = this.oauthProviderConfig(provider);
    if (!cfg.clientId) {
      throw new BadRequestException(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in is not configured`);
    }
    const state = Buffer.from(JSON.stringify({ org: orgSlug || null })).toString('base64url');
    const url = new URL(cfg.authorizeUrl);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', this.oauthRedirectUri(provider));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', cfg.scope);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Exchanges the authorization code for a profile, then finds/creates the
   * user + org membership and issues session tokens exactly like `login`.
   * Rejects when the target org has explicitly disabled this SSO provider.
   */
  async handleOAuthCallback(
    provider: 'google' | 'microsoft',
    code: string | undefined,
    state: string | undefined,
  ) {
    if (!code) throw new UnauthorizedException('Missing OAuth authorization code');
    const cfg = this.oauthProviderConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new BadRequestException(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in is not configured`);
    }

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: this.oauthRedirectUri(provider),
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      log.warn('OAuth token exchange failed', { provider, status: tokenRes.status });
      throw new UnauthorizedException('OAuth token exchange failed');
    }
    const tokenData = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    if (!tokenData.access_token) throw new UnauthorizedException('OAuth token exchange failed');

    const profileRes = await fetch(cfg.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!profileRes.ok) throw new UnauthorizedException('Failed to fetch OAuth profile');
    const profile = (await profileRes.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
    };
    const email = profile.email?.toLowerCase().trim();
    if (!email) throw new UnauthorizedException('OAuth profile did not include an email');

    let orgSlug: string | null = null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
          org?: string | null;
        };
        orgSlug = decoded.org || null;
      } catch {
        // Ignore malformed/tampered state; falls back to the user's first org.
      }
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    let organizationId: string;
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          // OAuth-only account: an unguessable random hash, never used for password login.
          passwordHash: await hashPassword(generateRefreshToken()),
          fullName: profile.name?.trim() || email.split('@')[0] || 'New user',
        },
      });
      const org = await this.orgs.createOrganizationWithOwner({
        name: `${user.fullName}'s workspace`,
        ownerUserId: user.id,
        kind: 'travel_agency',
      });
      organizationId = org.id;
    } else {
      const memberships = await this.prisma.organizationMembership.findMany({
        where: { userId: user.id, isActive: true, deletedAt: null },
        include: { organization: { select: { id: true, slug: true } } },
      });
      if (!memberships.length) throw new UnauthorizedException('No organization membership');
      const matched = orgSlug
        ? memberships.find((m) => m.organization.slug === orgSlug)
        : undefined;
      organizationId = (matched ?? memberships[0]!).organizationId;
    }

    await this.audit.record({
      organizationId,
      actorUserId: user.id,
      action: 'auth.oauth_login',
      entityType: 'user',
      entityId: user.id,
      metadata: { provider },
    });

    log.info('User logged in via OAuth', { userId: user.id, organizationId, provider });
    return this.issueTokens(user.id, organizationId);
  }
}
