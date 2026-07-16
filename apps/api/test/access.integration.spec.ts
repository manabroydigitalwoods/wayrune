import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ZodExceptionFilter } from '../src/common/zod-exception.filter';
import { ACCESS_COOKIE } from '../src/modules/auth/auth-cookies';
import { PrismaService } from '../src/prisma/prisma.service';

function cookieValue(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const entry of list) {
    if (entry.startsWith(`${name}=`)) {
      return decodeURIComponent(entry.split(';')[0]!.slice(name.length + 1));
    }
  }
  throw new Error(`Missing Set-Cookie: ${name}`);
}

function uniq(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Administration maturity (P2) integration coverage: custom-role CRUD guardrails,
 * member role assignment, property-scope assignment, effective-access preview,
 * audit history, and session invalidation on change.
 */
describe('access administration (integration)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ZodExceptionFilter());
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerOrg(kind?: string) {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `${uniq(kind ?? 'agency')}@test.dev`,
        password: 'Password123!',
        fullName: 'Org Owner',
        organizationName: uniq(kind ?? 'Agency'),
        ...(kind ? { organizationKind: kind } : {}),
      });
    expect(res.status, 'register').toBeLessThan(300);
    return {
      token: cookieValue(res, ACCESS_COOKIE),
      userId: res.body.user.id as string,
      orgId: res.body.organizationId as string,
    };
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  describe('custom role guardrails', () => {
    it('creates a clamped custom role and blocks privilege escalation', async () => {
      const org = await registerOrg();

      // System roles exist and are immutable.
      const roles = await request(server).get('/api/v1/access/roles').set(auth(org.token));
      expect(roles.status).toBe(200);
      const ownerRole = roles.body.find((r: any) => r.key === 'owner');
      expect(ownerRole.isSystem).toBe(true);

      // Create a custom role clamped to agency permissions the owner holds.
      const created = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(org.token))
        .send({ name: 'Regional Manager', permissions: ['lead.read', 'trip.read'] });
      expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
      expect(created.body.isSystem).toBe(false);
      expect(created.body.permissions).toEqual(expect.arrayContaining(['lead.read', 'trip.read']));

      // Cannot grant a platform-only permission.
      const escalate = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(org.token))
        .send({ name: 'Sneaky', permissions: ['platform.super'] });
      expect(escalate.status).toBe(403);

      // Cannot grant a permission invalid for this org kind (menu.* is stay/food).
      const wrongKind = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(org.token))
        .send({ name: 'Chef', permissions: ['menu.write'] });
      expect(wrongKind.status).toBe(403);

      // System roles cannot be edited or deleted.
      const editSys = await request(server)
        .patch(`/api/v1/access/roles/${ownerRole.id}`)
        .set(auth(org.token))
        .send({ name: 'Owner Renamed' });
      expect(editSys.status).toBe(403);
      const delSys = await request(server)
        .delete(`/api/v1/access/roles/${ownerRole.id}`)
        .set(auth(org.token));
      expect(delSys.status).toBe(403);
    });

    it('records an audit event with a permission diff on role changes', async () => {
      const org = await registerOrg();
      const created = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(org.token))
        .send({ name: 'Auditable', permissions: ['lead.read'] });
      expect(created.status).toBeLessThan(300);

      const history = await request(server)
        .get('/api/v1/access/audit')
        .set(auth(org.token));
      expect(history.status).toBe(200);
      const createEvent = history.body.find(
        (e: any) => e.action === 'role.create' && e.entityId === created.body.id,
      );
      expect(createEvent).toBeTruthy();
      expect(createEvent.metadataJson.diff.added).toContain('lead.read');
    });
  });

  describe('member role assignment + session invalidation', () => {
    it('assigns/removes a role, bumps authVersion, and reflects effective access', async () => {
      const org = await registerOrg();
      const role = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(org.token))
        .send({ name: 'Desk', permissions: ['lead.read', 'trip.read'] });
      expect(role.status).toBeLessThan(300);

      // Provision a second member with no roles.
      const memberUser = await prisma.user.create({
        data: { email: `${uniq('member')}@test.dev`, passwordHash: 'x', fullName: 'Second Member' },
      });
      const membership = await prisma.organizationMembership.create({
        data: { organizationId: org.orgId, userId: memberUser.id, isOwner: false },
      });

      const before = await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: membership.id },
        select: { authVersion: true },
      });

      const assign = await request(server)
        .post(`/api/v1/access/members/${membership.id}/roles`)
        .set(auth(org.token))
        .send({ roleId: role.body.id });
      expect(assign.status, JSON.stringify(assign.body)).toBeLessThan(300);
      expect(assign.body.effective).toEqual(expect.arrayContaining(['lead.read', 'lead.read.own']));

      const after = await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: membership.id },
        select: { authVersion: true },
      });
      expect(after.authVersion).toBeGreaterThan(before.authVersion);

      const remove = await request(server)
        .delete(`/api/v1/access/members/${membership.id}/roles/${role.body.id}`)
        .set(auth(org.token));
      expect(remove.status).toBeLessThan(300);
      expect(remove.body.effective).not.toContain('lead.read');
    });

    it('refuses to remove the last owner', async () => {
      const org = await registerOrg();
      const ownerMembership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: org.orgId, userId: org.userId },
        include: { roles: { include: { role: true } } },
      });
      const ownerRole = ownerMembership.roles.find((r) => r.role.key === 'owner');
      const res = await request(server)
        .delete(`/api/v1/access/members/${ownerMembership.id}/roles/${ownerRole!.roleId}`)
        .set(auth(org.token));
      expect(res.status).toBe(400);
    });
  });

  describe('property-scope assignment', () => {
    it('scopes a partner membership to a property and rejects cross-org assets', async () => {
      const partner = await registerOrg('hotel');
      const other = await registerOrg('hotel');

      const props = await request(server)
        .get('/api/v1/access/properties')
        .set(auth(partner.token));
      expect(props.status).toBe(200);
      expect(props.body.length).toBeGreaterThan(0);
      const assetId = props.body[0].id as string;

      // Scope a *second* member (not the actor — changing your own scope would
      // correctly invalidate your own session/token mid-test).
      const staffUser = await prisma.user.create({
        data: { email: `${uniq('staff')}@test.dev`, passwordHash: 'x', fullName: 'Front Desk' },
      });
      const staffMembership = await prisma.organizationMembership.create({
        data: { organizationId: partner.orgId, userId: staffUser.id, isOwner: false },
      });

      // Cross-org asset is rejected.
      const otherProps = await request(server)
        .get('/api/v1/access/properties')
        .set(auth(other.token));
      const foreignAssetId = otherProps.body[0].id as string;
      const bad = await request(server)
        .put(`/api/v1/access/members/${staffMembership.id}/property-scopes`)
        .set(auth(partner.token))
        .send({ partnerAssetIds: [foreignAssetId] });
      expect(bad.status).toBe(400);

      // In-org asset scopes the membership.
      const ok = await request(server)
        .put(`/api/v1/access/members/${staffMembership.id}/property-scopes`)
        .set(auth(partner.token))
        .send({ partnerAssetIds: [assetId] });
      expect(ok.status, JSON.stringify(ok.body)).toBeLessThan(300);
      expect(ok.body.propertyScopes).toEqual([assetId]);

      // Reset to org-wide.
      const wide = await request(server)
        .put(`/api/v1/access/members/${staffMembership.id}/property-scopes`)
        .set(auth(partner.token))
        .send({ partnerAssetIds: [] });
      expect(wide.status).toBeLessThan(300);
      expect(wide.body.propertyScopes).toEqual([]);
    });
  });

  describe('member invitations', () => {
    async function makeRole(token: string) {
      const role = await request(server)
        .post('/api/v1/access/roles')
        .set(auth(token))
        .send({ name: uniq('Coordinator'), permissions: ['lead.read', 'trip.read'] });
      expect(role.status, JSON.stringify(role.body)).toBeLessThan(300);
      return role.body.id as string;
    }

    it('invites a brand-new user who accepts, sets a password, and can log in', async () => {
      const org = await registerOrg();
      const roleId = await makeRole(org.token);
      const email = `${uniq('invitee')}@test.dev`;

      const invite = await request(server)
        .post('/api/v1/access/invites')
        .set(auth(org.token))
        .send({ email, fullName: 'New Person', roleIds: [roleId] });
      expect(invite.status, JSON.stringify(invite.body)).toBeLessThan(300);
      const token = invite.body.acceptToken as string;
      expect(token).toBeTruthy();

      // Public peek: brand-new invitee must create an account.
      const peek = await request(server).get(`/api/v1/access/invites/peek/${token}`);
      expect(peek.status).toBe(200);
      expect(peek.body.needsAccount).toBe(true);
      expect(peek.body.claimable).toBe(true);
      expect(peek.body.email).toBe(email);

      // Public accept without a password is rejected for a new user.
      const noPass = await request(server)
        .post(`/api/v1/access/invites/accept/${token}`)
        .send({});
      expect(noPass.status).toBe(400);

      // Accept with a password creates the user + membership + roles.
      const accept = await request(server)
        .post(`/api/v1/access/invites/accept/${token}`)
        .send({ password: 'Password123!', fullName: 'New Person' });
      expect(accept.status, JSON.stringify(accept.body)).toBeLessThan(300);
      expect(accept.body.userExisted).toBe(false);

      const created = await prisma.user.findUniqueOrThrow({ where: { email } });
      const membership = await prisma.organizationMembership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: org.orgId, userId: created.id } },
        include: { roles: true },
      });
      expect(membership.roles.map((r) => r.roleId)).toContain(roleId);

      // The password they set actually works.
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' });
      expect(login.status, JSON.stringify(login.body)).toBeLessThan(300);

      // The token is single-use.
      const reuse = await request(server)
        .post(`/api/v1/access/invites/accept/${token}`)
        .send({ password: 'Password123!', fullName: 'New Person' });
      expect(reuse.status).toBe(400);
    });

    it('invites an existing user who joins without setting a password', async () => {
      const org = await registerOrg();
      const roleId = await makeRole(org.token);
      const existing = await prisma.user.create({
        data: { email: `${uniq('existing')}@test.dev`, passwordHash: 'x', fullName: 'Existing User' },
      });

      const invite = await request(server)
        .post('/api/v1/access/invites')
        .set(auth(org.token))
        .send({ email: existing.email, roleIds: [roleId] });
      expect(invite.status).toBeLessThan(300);
      const token = invite.body.acceptToken as string;

      const peek = await request(server).get(`/api/v1/access/invites/peek/${token}`);
      expect(peek.body.needsAccount).toBe(false);

      const accept = await request(server)
        .post(`/api/v1/access/invites/accept/${token}`)
        .send({});
      expect(accept.status, JSON.stringify(accept.body)).toBeLessThan(300);
      expect(accept.body.userExisted).toBe(true);

      const membership = await prisma.organizationMembership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: org.orgId, userId: existing.id } },
        include: { roles: true },
      });
      expect(membership.roles.map((r) => r.roleId)).toContain(roleId);
    });

    it('enforces guardrails: existing member, unknown role, and revoked tokens', async () => {
      const org = await registerOrg();
      const roleId = await makeRole(org.token);
      const ownerEmail = (
        await prisma.user.findUniqueOrThrow({ where: { id: org.userId }, select: { email: true } })
      ).email;

      // Inviting someone who is already an active member is rejected.
      const dupe = await request(server)
        .post('/api/v1/access/invites')
        .set(auth(org.token))
        .send({ email: ownerEmail, roleIds: [roleId] });
      expect(dupe.status).toBe(400);

      // Unknown role id is rejected.
      const badRole = await request(server)
        .post('/api/v1/access/invites')
        .set(auth(org.token))
        .send({ email: `${uniq('x')}@test.dev`, roleIds: ['does-not-exist'] });
      expect(badRole.status).toBe(400);

      // Revoked invites are no longer claimable.
      const invite = await request(server)
        .post('/api/v1/access/invites')
        .set(auth(org.token))
        .send({ email: `${uniq('revoke')}@test.dev`, roleIds: [roleId] });
      const token = invite.body.acceptToken as string;
      const revoke = await request(server)
        .delete(`/api/v1/access/invites/${invite.body.id}`)
        .set(auth(org.token));
      expect(revoke.status).toBeLessThan(300);
      const peek = await request(server).get(`/api/v1/access/invites/peek/${token}`);
      expect(peek.body.claimable).toBe(false);
      const accept = await request(server)
        .post(`/api/v1/access/invites/accept/${token}`)
        .send({ password: 'Password123!', fullName: 'Nope' });
      expect(accept.status).toBe(400);

      // The create is audited.
      const history = await request(server).get('/api/v1/access/audit').set(auth(org.token));
      expect(
        history.body.some((e: any) => e.action === 'member.invite.create'),
      ).toBe(true);
    });
  });
});
