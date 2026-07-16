import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PARTNER_ALLOWED_PERMISSIONS } from '@travel/rbac';
import { AppModule } from '../src/app.module';
import { ZodExceptionFilter } from '../src/common/zod-exception.filter';
import { ACCESS_COOKIE } from '../src/modules/auth/auth-cookies';
import { AuthService } from '../src/modules/auth/auth.service';
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
 * Negative RBAC/tenant-isolation tests (RBAC Integrity 1.0, P0 step 7).
 * Proves the deny-by-default properties that the coarse permission model relies
 * on: cross-org IDs are invisible, own-scope reads are enforced, and partner /
 * platform permission surfaces are clamped.
 */
describe('tenant isolation + scope enforcement (integration)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ZodExceptionFilter());
    await app.init();
    server = app.getHttpServer();
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

  async function createAgencyFixtures(token: string) {
    const party = await request(server)
      .post('/api/v1/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'individual', displayName: 'Alice Traveler', email: `${uniq('alice')}@test.dev` });
    expect(party.status, 'create party').toBeLessThan(300);

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Goa family trip', priority: 'normal' });
    expect(lead.status, 'create lead').toBeLessThan(300);

    const inquiry = await request(server)
      .post('/api/v1/inquiries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        destinations: ['Goa'],
        adults: 2,
        budgetAmount: 50000,
        budgetCurrency: 'INR',
        startDate: '2026-12-01',
      });
    expect(inquiry.status, 'create inquiry').toBeLessThan(300);

    const trip = await request(server)
      .post(`/api/v1/inquiries/${inquiry.body.id}/convert-to-trip`)
      .set('Authorization', `Bearer ${token}`);
    expect(trip.status, 'convert to trip').toBeLessThan(300);

    return {
      partyId: party.body.id as string,
      leadId: (lead.body.lead?.id ?? lead.body.id) as string,
      tripId: trip.body.id as string,
    };
  }

  describe('cross-org resource access is denied', () => {
    it('org B cannot read org A leads / parties / trips / quotes', async () => {
      const orgA = await registerOrg();
      const orgB = await registerOrg();
      const a = await createAgencyFixtures(orgA.token);

      const reads = [
        `/api/v1/leads/${a.leadId}`,
        `/api/v1/parties/${a.partyId}`,
        `/api/v1/trips/${a.tripId}`,
      ];
      for (const path of reads) {
        const res = await request(server).get(path).set('Authorization', `Bearer ${orgB.token}`);
        expect([403, 404], `${path} should be forbidden/not-found for another org`).toContain(
          res.status,
        );
      }

      // Cross-org write against A's trip is also blocked.
      const quote = await request(server)
        .post(`/api/v1/trips/${a.tripId}/quotations`)
        .set('Authorization', `Bearer ${orgB.token}`);
      expect([403, 404]).toContain(quote.status);

      // Sanity: org A can read its own resources.
      const own = await request(server)
        .get(`/api/v1/leads/${a.leadId}`)
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(own.status).toBeLessThan(300);
    });
  });

  describe('own-scope (lead.read.own) enforcement', () => {
    it('a sales_executive can read their own lead but not a colleague’s', async () => {
      const orgA = await registerOrg();
      const prisma = app.get(PrismaService);
      const auth = app.get(AuthService);

      // Owner creates a lead owned by the owner.
      const ownerLead = await request(server)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({ title: 'Owner lead', priority: 'normal' });
      expect(ownerLead.status).toBeLessThan(300);
      const ownerLeadId = ownerLead.body.lead?.id ?? ownerLead.body.id;

      // Provision a second member with the sales_executive role (lead.read.own).
      const seUser = await prisma.user.create({
        data: {
          email: `${uniq('se')}@test.dev`,
          passwordHash: 'x',
          fullName: 'Sales Exec',
        },
      });
      const seRole = await prisma.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId: orgA.orgId, key: 'sales_executive' } },
      });
      const seMembership = await prisma.organizationMembership.create({
        data: { organizationId: orgA.orgId, userId: seUser.id, isOwner: false },
      });
      await prisma.membershipRole.create({
        data: { membershipId: seMembership.id, roleId: seRole.id },
      });
      const seToken = (await auth.issueTokens(seUser.id, orgA.orgId)).accessToken;

      // Sales exec creates their own lead.
      const seLead = await request(server)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${seToken}`)
        .send({ title: 'SE own lead', priority: 'normal' });
      expect(seLead.status).toBeLessThan(300);
      const seLeadId = seLead.body.lead?.id ?? seLead.body.id;

      // Own lead: readable.
      const readOwn = await request(server)
        .get(`/api/v1/leads/${seLeadId}`)
        .set('Authorization', `Bearer ${seToken}`);
      expect(readOwn.status, 'own lead should be readable').toBeLessThan(300);

      // Colleague's lead: forbidden.
      const readOther = await request(server)
        .get(`/api/v1/leads/${ownerLeadId}`)
        .set('Authorization', `Bearer ${seToken}`);
      expect(readOther.status, 'colleague lead should be forbidden').toBe(403);

      // List is scoped to own leads only.
      const list = await request(server)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${seToken}`);
      expect(list.status).toBeLessThan(300);
      const ids = (list.body.items ?? []).map((l: { id: string }) => l.id);
      expect(ids).toContain(seLeadId);
      expect(ids).not.toContain(ownerLeadId);
    });
  });

  describe('permission surface clamps', () => {
    it('partner tokens are clamped to PARTNER_ALLOWED_PERMISSIONS and carry no platform.* perms', async () => {
      const partner = await registerOrg('hotel');
      const me = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${partner.token}`);
      expect(me.status).toBeLessThan(300);

      const perms: string[] = me.body.permissions ?? [];
      expect(perms.length).toBeGreaterThan(0);
      const leaked = perms.filter((p) => !(PARTNER_ALLOWED_PERMISSIONS as ReadonlySet<string>).has(p));
      expect(leaked, `partner perms outside allowlist: ${leaked.join(', ')}`).toEqual([]);
      expect(perms.some((p) => p.startsWith('platform.'))).toBe(false);
    });

    it('tenant (agency) tokens never carry platform.* permissions', async () => {
      const agency = await registerOrg();
      const me = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${agency.token}`);
      expect(me.status).toBeLessThan(300);
      const perms: string[] = me.body.permissions ?? [];
      expect(perms.some((p) => p.startsWith('platform.'))).toBe(false);
    });
  });
});
