import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assignablePermissions,
  diffPermissions,
  effectivePermissions,
  getPermissionDefinition,
  permissionGroups,
  roleAllowedForOrgKind,
  type PermissionKey,
} from '@travel/rbac';
import { generateRefreshToken, hashPassword, hashToken } from '@travel/auth';
import { loadEnv } from '@travel/config';
import type {
  AcceptInviteInput,
  AssignRoleInput,
  CreateRoleInput,
  InviteMemberInput,
  SetPropertyScopesInput,
  UpdateRoleInput,
} from '@travel/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OutboxService } from '../outbox/outbox.service';
import { slugify, type AuthUser } from '../../common/helpers';

/** Pending/recent invites are valid for one week. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Administration maturity (P2): runtime management of custom roles, member role
 * assignment, and property/branch scope assignment — with the guardrails the
 * RBAC review called out:
 *   - no privilege escalation (you can only grant permissions you hold);
 *   - deny-by-default org-kind clamp (a custom role can't hold cross-vertical or
 *     platform perms; enforced by {@link assignablePermissions});
 *   - system roles are immutable/undeletable and at least one owner must remain;
 *   - every mutation is audited (with a permission diff) and invalidates the
 *     affected member's sessions so changes take effect immediately.
 */
@Injectable()
export class AccessService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private outbox: OutboxService,
  ) {}

  private async orgKind(user: AuthUser): Promise<string> {
    if (user.organizationKind) return user.organizationKind;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { kind: true },
    });
    return org.kind;
  }

  /** The permissions the acting user may grant in this org (clamped set). */
  private grantableSet(user: AuthUser, orgKind: string): Set<string> {
    return new Set<string>(assignablePermissions(user.permissions, orgKind));
  }

  /** Reject any requested permission the actor cannot grant (escalation guard). */
  private assertGrantable(grantable: Set<string>, requested: readonly string[]) {
    const bad = [...new Set(requested)].filter((p) => !grantable.has(p));
    if (bad.length) {
      throw new ForbiddenException(
        `You cannot grant these permissions: ${bad.join(', ')}`,
      );
    }
  }

  private async permIdByKey(keys: readonly string[]): Promise<Record<string, string>> {
    if (!keys.length) return {};
    const rows = await this.prisma.permission.findMany({
      where: { key: { in: [...keys] } },
      select: { id: true, key: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.id]));
  }

  private async uniqueRoleKey(organizationId: string, name: string): Promise<string> {
    const base = `custom_${slugify(name).replace(/-/g, '_')}` || 'custom_role';
    let key = base;
    let i = 1;
    // eslint-disable-next-line no-await-in-loop
    while (
      await this.prisma.role.findUnique({
        where: { organizationId_key: { organizationId, key } },
        select: { id: true },
      })
    ) {
      key = `${base}_${i++}`;
    }
    return key;
  }

  private permissionMeta(key: string) {
    const def = getPermissionDefinition(key);
    return {
      key,
      group: def?.group ?? 'other',
      description: def?.description ?? key,
      risk: def?.risk ?? 'medium',
      scope: def?.scope ?? 'org',
    };
  }

  /* ------------------------------- roles -------------------------------- */

  async listRoles(user: AuthUser) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);
    const roles = await this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => {
      const perms = r.permissions.map((p) => p.permission.key);
      return {
        id: r.id,
        key: r.key,
        name: r.name,
        isSystem: r.isSystem,
        memberCount: r._count.memberships,
        allowedForOrgKind: roleAllowedForOrgKind(r.key, orgKind),
        // Whether the actor holds every permission this role grants — gates
        // editing/assigning in the UI (no escalation).
        manageable: !r.isSystem && perms.every((p) => grantable.has(p)),
        permissions: perms,
      };
    });
  }

  /** The permission registry for this org kind, flagged by what the actor may grant. */
  async permissionCatalog(user: AuthUser) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);
    const groups = permissionGroups(orgKind);
    return {
      orgKind,
      groups: Object.entries(groups)
        .map(([group, defs]) => ({
          group,
          permissions: defs
            .map((d) => ({
              key: d.key,
              description: d.description,
              risk: d.risk,
              scope: d.scope,
              assignable: grantable.has(d.key),
            }))
            .sort((a, b) => a.key.localeCompare(b.key)),
        }))
        .sort((a, b) => a.group.localeCompare(b.group)),
      assignable: [...grantable].sort(),
    };
  }

  async createRole(user: AuthUser, input: CreateRoleInput) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);

    const seed = new Set<string>();
    if (input.cloneFromRoleId) {
      const src = await this.prisma.role.findFirst({
        where: { id: input.cloneFromRoleId, organizationId: user.organizationId },
        include: { permissions: { include: { permission: { select: { key: true } } } } },
      });
      if (!src) throw new NotFoundException('Role to clone was not found');
      // Clone is a convenience template: silently clamp to what the actor can grant.
      for (const p of src.permissions) if (grantable.has(p.permission.key)) seed.add(p.permission.key);
    }
    // Explicitly requested permissions must be grantable (hard error on escalation).
    this.assertGrantable(grantable, input.permissions);
    for (const p of input.permissions) seed.add(p);

    const name = input.name.trim();
    const key = await this.uniqueRoleKey(user.organizationId, name);
    const permKeys = [...seed];
    const permByKey = await this.permIdByKey(permKeys);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { organizationId: user.organizationId, name, key, isSystem: false },
      });
      if (permKeys.length) {
        await tx.rolePermission.createMany({
          data: permKeys
            .filter((k) => permByKey[k])
            .map((k) => ({ roleId: created.id, permissionId: permByKey[k] })),
        });
      }
      return created;
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      metadata: {
        name,
        key,
        clonedFrom: input.cloneFromRoleId ?? null,
        diff: diffPermissions([], permKeys),
      },
    });

    return this.presentRole(user, role.id);
  }

  async updateRole(user: AuthUser, roleId: string, input: UpdateRoleInput) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be edited');

    const before = role.permissions.map((p) => p.permission.key);

    if (input.permissions !== undefined) {
      this.assertGrantable(grantable, input.permissions);
      // You also can't strip a permission you don't hold (would silently keep it) —
      // require the actor to be able to manage the whole existing set.
      this.assertGrantable(grantable, before);
    }

    const after = input.permissions !== undefined ? [...new Set(input.permissions)] : before;
    const permByKey = await this.permIdByKey(after);

    await this.prisma.$transaction(async (tx) => {
      if (input.name !== undefined) {
        await tx.role.update({ where: { id: role.id }, data: { name: input.name.trim() } });
      }
      if (input.permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (after.length) {
          await tx.rolePermission.createMany({
            data: after
              .filter((k) => permByKey[k])
              .map((k) => ({ roleId: role.id, permissionId: permByKey[k] })),
          });
        }
      }
    });

    const diff = diffPermissions(before, after);
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'role.update',
      entityType: 'role',
      entityId: role.id,
      metadata: { name: input.name ?? role.name, diff },
    });

    // A permission change ripples to everyone holding the role — re-mint them.
    if (input.permissions !== undefined && (diff.added.length || diff.removed.length)) {
      await this.invalidateRoleHolders(user.organizationId, role.id);
    }

    return this.presentRole(user, role.id);
  }

  async deleteRole(user: AuthUser, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');

    const holders = await this.prisma.membershipRole.findMany({
      where: { roleId: role.id },
      include: { membership: { select: { userId: true, organizationId: true } } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.role.delete({ where: { id: role.id } });
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'role.delete',
      entityType: 'role',
      entityId: role.id,
      metadata: {
        name: role.name,
        key: role.key,
        removedFromMembers: holders.length,
        diff: diffPermissions(role.permissions.map((p) => p.permission.key), []),
      },
    });

    // Re-mint everyone who lost the role.
    for (const h of holders) {
      await this.auth.invalidateMembershipSessions(h.membership.organizationId, h.membership.userId);
    }

    return { ok: true, removedFromMembers: holders.length };
  }

  /** Effective (post-implication) capability set a role confers — "test this role". */
  async roleEffective(user: AuthUser, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    const granted = role.permissions.map((p) => p.permission.key);
    const effective = effectivePermissions(granted);
    return {
      roleId: role.id,
      name: role.name,
      granted: [...granted].sort(),
      effective,
      implied: effective.filter((k) => !granted.includes(k)),
      permissions: effective.map((k) => this.permissionMeta(k)),
    };
  }

  private async presentRole(user: AuthUser, roleId: string) {
    const roles = await this.listRoles(user);
    return roles.find((r) => r.id === roleId);
  }

  /* ------------------------------ members ------------------------------- */

  async listMembers(user: AuthUser) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: user.organizationId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        roles: { include: { role: { select: { id: true, key: true, name: true } } } },
        propertyScopes: { select: { partnerAssetId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.user.id,
      membershipId: m.id,
      fullName: m.user.fullName,
      email: m.user.email,
      isOwner: m.isOwner,
      isActive: m.isActive,
      roles: m.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
      propertyScopes: m.propertyScopes.map((s) => s.partnerAssetId),
    }));
  }

  private async loadMembership(user: AuthUser, membershipId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: user.organizationId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: { select: { key: true } } } } } } } },
      },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return membership;
  }

  async assignRole(user: AuthUser, membershipId: string, input: AssignRoleInput) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);
    const membership = await this.loadMembership(user, membershipId);
    const role = await this.prisma.role.findFirst({
      where: { id: input.roleId, organizationId: user.organizationId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (!roleAllowedForOrgKind(role.key, orgKind)) {
      throw new BadRequestException(`Role "${role.name}" is not available for this organization`);
    }
    // No escalation: you may only assign a role whose permissions you can all grant.
    this.assertGrantable(grantable, role.permissions.map((p) => p.permission.key));

    const existing = await this.prisma.membershipRole.findUnique({
      where: { membershipId_roleId: { membershipId, roleId: role.id } },
      select: { membershipId: true },
    });
    if (!existing) {
      await this.prisma.membershipRole.create({ data: { membershipId, roleId: role.id } });
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'membership.role.assign',
      entityType: 'membership',
      entityId: membershipId,
      metadata: { roleId: role.id, roleKey: role.key, roleName: role.name },
    });
    await this.auth.invalidateMembershipSessions(user.organizationId, membership.userId);
    return this.memberEffective(user, membershipId);
  }

  async removeRole(user: AuthUser, membershipId: string, roleId: string) {
    const membership = await this.loadMembership(user, membershipId);
    const link = await this.prisma.membershipRole.findUnique({
      where: { membershipId_roleId: { membershipId, roleId } },
      include: { role: { select: { key: true, name: true } } },
    });
    if (!link) throw new NotFoundException('Role is not assigned to this member');

    // At least one owner must remain.
    if (link.role.key === 'owner') {
      const ownerCount = await this.prisma.membershipRole.count({
        where: {
          role: { organizationId: user.organizationId, key: 'owner' },
          membership: { isActive: true },
        },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove the last owner from the organization');
      }
    }

    await this.prisma.membershipRole.delete({
      where: { membershipId_roleId: { membershipId, roleId } },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'membership.role.remove',
      entityType: 'membership',
      entityId: membershipId,
      metadata: { roleId, roleKey: link.role.key, roleName: link.role.name },
    });
    await this.auth.invalidateMembershipSessions(user.organizationId, membership.userId);
    return this.memberEffective(user, membershipId);
  }

  async setPropertyScopes(user: AuthUser, membershipId: string, input: SetPropertyScopesInput) {
    const membership = await this.loadMembership(user, membershipId);
    const assetIds = [...new Set(input.partnerAssetIds)];
    if (assetIds.length) {
      const valid = await this.prisma.partnerAsset.findMany({
        where: { id: { in: assetIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (valid.length !== assetIds.length) {
        throw new BadRequestException('One or more properties do not belong to this organization');
      }
    }

    const before = (
      await this.prisma.membershipPropertyScope.findMany({
        where: { membershipId },
        select: { partnerAssetId: true },
      })
    ).map((s) => s.partnerAssetId);

    await this.prisma.$transaction(async (tx) => {
      await tx.membershipPropertyScope.deleteMany({ where: { membershipId } });
      if (assetIds.length) {
        await tx.membershipPropertyScope.createMany({
          data: assetIds.map((partnerAssetId) => ({ membershipId, partnerAssetId })),
        });
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'membership.scope.set',
      entityType: 'membership',
      entityId: membershipId,
      metadata: { before, after: assetIds },
    });
    await this.auth.invalidateMembershipSessions(user.organizationId, membership.userId);
    return this.memberEffective(user, membershipId);
  }

  /** Effective access for a member: union of role perms expanded via implications. */
  async memberEffective(user: AuthUser, membershipId: string) {
    const membership = await this.loadMembership(user, membershipId);
    const granted = new Set<string>();
    for (const mr of membership.roles) {
      for (const rp of mr.role.permissions) granted.add(rp.permission.key);
    }
    const effective = effectivePermissions([...granted]);
    return {
      membershipId,
      userId: membership.userId,
      isOwner: membership.isOwner,
      isActive: membership.isActive,
      roles: membership.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
      propertyScopes: (
        await this.prisma.membershipPropertyScope.findMany({
          where: { membershipId },
          select: { partnerAssetId: true },
        })
      ).map((s) => s.partnerAssetId),
      granted: [...granted].sort(),
      effective,
      permissions: effective.map((k) => this.permissionMeta(k)),
    };
  }

  private async invalidateRoleHolders(organizationId: string, roleId: string) {
    const holders = await this.prisma.membershipRole.findMany({
      where: { roleId },
      include: { membership: { select: { userId: true, organizationId: true } } },
    });
    for (const h of holders) {
      await this.auth.invalidateMembershipSessions(h.membership.organizationId, h.membership.userId);
    }
  }

  /** Partner assets (properties/branches) available for scope assignment. */
  async listProperties(user: AuthUser) {
    const assets = await this.prisma.partnerAsset.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true, assetKind: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    return assets;
  }

  /* ------------------------------ invites ------------------------------- */

  private roleIdsOf(json: unknown): string[] {
    return Array.isArray(json) ? json.filter((x): x is string => typeof x === 'string') : [];
  }

  /**
   * Invite someone to join this org with a preset role set. Mirrors the
   * SupplierInvite token pattern (hashed token, 1-week expiry) and enforces the
   * same no-escalation / org-kind guardrails as direct role assignment. Emails a
   * tokenised accept link via the outbox (delivery requires SMTP; the raw token
   * is also returned once so admins can share the link when email is off).
   */
  async createInvite(user: AuthUser, input: InviteMemberInput) {
    const orgKind = await this.orgKind(user);
    const grantable = this.grantableSet(user, orgKind);
    const email = input.email.trim().toLowerCase();
    const roleIds = [...new Set(input.roleIds)];

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, organizationId: user.organizationId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles were not found');
    }
    for (const role of roles) {
      if (!roleAllowedForOrgKind(role.key, orgKind)) {
        throw new BadRequestException(`Role "${role.name}" is not available for this organization`);
      }
      // No escalation: only invite into roles whose permissions you can all grant.
      this.assertGrantable(grantable, role.permissions.map((p) => p.permission.key));
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      const membership = await this.prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId: user.organizationId, userId: existingUser.id },
        },
        select: { isActive: true, deletedAt: true },
      });
      if (membership && membership.isActive && !membership.deletedAt) {
        throw new BadRequestException('That person is already a member of this organization');
      }
    }

    // One live invite per email/org — supersede any prior pending ones.
    await this.prisma.memberInvite.updateMany({
      where: { organizationId: user.organizationId, email, status: 'pending' },
      data: { status: 'revoked' },
    });

    const rawToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await this.prisma.memberInvite.create({
      data: {
        organizationId: user.organizationId,
        email,
        fullName: input.fullName ?? null,
        roleIdsJson: roleIds,
        tokenHash: hashToken(rawToken),
        invitedBy: user.sub,
        expiresAt,
      },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'an organization';
    const acceptUrl = `${loadEnv().webOrigin}/accept/${rawToken}`;
    await this.outbox.enqueue({
      organizationId: user.organizationId,
      eventType: 'notification.email',
      payload: {
        toEmail: email,
        title: `You're invited to join ${orgName}`,
        body: `You've been invited to join ${orgName} with the role${roles.length > 1 ? 's' : ''}: ${roles
          .map((r) => r.name)
          .join(', ')}. This invite expires on ${expiresAt.toDateString()}.`,
        linkPath: acceptUrl,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'member.invite.create',
      entityType: 'membership',
      entityId: invite.id,
      metadata: { email, roleIds, roleNames: roles.map((r) => r.name) },
    });

    return {
      id: invite.id,
      email,
      status: invite.status,
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      expiresAt,
      acceptPath: `/accept/${rawToken}`,
      acceptToken: rawToken,
    };
  }

  async listInvites(user: AuthUser) {
    const invites = await this.prisma.memberInvite.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const allRoleIds = new Set<string>();
    for (const inv of invites) for (const id of this.roleIdsOf(inv.roleIdsJson)) allRoleIds.add(id);
    const roleRows = allRoleIds.size
      ? await this.prisma.role.findMany({
          where: { id: { in: [...allRoleIds] } },
          select: { id: true, name: true },
        })
      : [];
    const roleName = new Map(roleRows.map((r) => [r.id, r.name]));
    const now = Date.now();
    return invites.map((inv) => {
      const ids = this.roleIdsOf(inv.roleIdsJson);
      const expired = inv.status === 'pending' && inv.expiresAt.getTime() < now;
      return {
        id: inv.id,
        email: inv.email,
        fullName: inv.fullName,
        status: expired ? 'expired' : inv.status,
        roles: ids.map((id) => ({ id, name: roleName.get(id) ?? '(removed role)' })),
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        acceptedAt: inv.acceptedAt,
      };
    });
  }

  async revokeInvite(user: AuthUser, id: string) {
    const invite = await this.prisma.memberInvite.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status === 'pending') {
      await this.prisma.memberInvite.update({ where: { id }, data: { status: 'revoked' } });
    }
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.sub,
      action: 'member.invite.revoke',
      entityType: 'membership',
      entityId: invite.id,
      metadata: { email: invite.email },
    });
    return { ok: true };
  }

  /** Public: inspect an invite by raw token (drives the accept page). */
  async peekInvite(rawToken: string) {
    const invite = await this.prisma.memberInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    const org = await this.prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });
    const ids = this.roleIdsOf(invite.roleIdsJson);
    const roleRows = ids.length
      ? await this.prisma.role.findMany({ where: { id: { in: ids } }, select: { name: true } })
      : [];
    const expired = invite.expiresAt.getTime() < Date.now();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    return {
      email: invite.email,
      fullName: invite.fullName,
      organizationName: org?.name ?? null,
      roles: roleRows.map((r) => r.name),
      status: expired && invite.status === 'pending' ? 'expired' : invite.status,
      claimable: invite.status === 'pending' && !expired,
      // A brand-new invitee must set a name + password; existing users just accept.
      needsAccount: !existingUser,
    };
  }

  /**
   * Public: accept an invite. Creates the User (with the chosen password) when
   * the invitee has no account yet, then creates/reactivates the membership and
   * assigns the invited roles. Idempotent-ish: re-accepting a consumed invite
   * throws, but re-running roles on an existing membership is safe.
   */
  async acceptInvite(rawToken: string, input: AcceptInviteInput) {
    const invite = await this.prisma.memberInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') throw new BadRequestException('This invite is no longer valid');
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.memberInvite.update({ where: { id: invite.id }, data: { status: 'expired' } });
      throw new BadRequestException('This invite has expired');
    }

    // Roles may have been deleted since the invite was sent — keep the survivors.
    const ids = this.roleIdsOf(invite.roleIdsJson);
    const roles = ids.length
      ? await this.prisma.role.findMany({
          where: { id: { in: ids }, organizationId: invite.organizationId },
          select: { id: true },
        })
      : [];

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    const userExisted = !!existing;

    // Hash outside the transaction to keep it short.
    let newUser: { email: string; passwordHash: string; fullName: string } | null = null;
    if (!existing) {
      const fullName = (input.fullName ?? invite.fullName ?? '').trim();
      if (!input.password) {
        throw new BadRequestException('A password is required to create your account');
      }
      if (!fullName) throw new BadRequestException('Your full name is required');
      newUser = { email: invite.email, passwordHash: await hashPassword(input.password), fullName };
    }

    const { membershipId, userId } = await this.prisma.$transaction(async (tx) => {
      const u = existing ?? (await tx.user.create({ data: newUser! }));
      const m = await tx.organizationMembership.upsert({
        where: {
          organizationId_userId: { organizationId: invite.organizationId, userId: u.id },
        },
        create: { organizationId: invite.organizationId, userId: u.id, isOwner: false },
        update: { isActive: true, deletedAt: null },
      });
      for (const role of roles) {
        await tx.membershipRole.upsert({
          where: { membershipId_roleId: { membershipId: m.id, roleId: role.id } },
          create: { membershipId: m.id, roleId: role.id },
          update: {},
        });
      }
      await tx.memberInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedUserId: u.id, acceptedAt: new Date() },
      });
      return { membershipId: m.id, userId: u.id };
    });

    await this.audit.record({
      organizationId: invite.organizationId,
      actorUserId: userId,
      action: 'member.invite.accept',
      entityType: 'membership',
      entityId: membershipId,
      metadata: { email: invite.email, userExisted, roleIds: roles.map((r) => r.id) },
    });
    // If the invitee already had a live session in this org, re-mint it for the new roles.
    await this.auth.invalidateMembershipSessions(invite.organizationId, userId);

    return { ok: true, organizationId: invite.organizationId, email: invite.email, userExisted };
  }

  /* ------------------------------ history ------------------------------- */

  async auditHistory(user: AuthUser, entityType?: string, entityId?: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        ...(entityType ? { entityType } : { entityType: { in: ['role', 'membership'] } }),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows;
  }
}
