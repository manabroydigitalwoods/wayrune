import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ZodExceptionFilter } from '../src/common/zod-exception.filter';
import { hashPassword } from '@wayrune/auth';
import { ACCESS_COOKIE } from '../src/modules/auth/auth-cookies';

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

describe('Golden workflows (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ZodExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('B2C inquiry → itinerary versions → accepted quote; cross-tenant denial', async () => {
    const emailA = `owner-a-${Date.now()}@test.travel`;
    const emailB = `owner-b-${Date.now()}@test.travel`;

    const regA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailA,
        password: 'Password123!',
        fullName: 'Owner A',
        organizationName: `Agency A ${Date.now()}`,
      });
    expect(regA.status).toBeLessThan(300);
    expect(regA.body.accessToken).toBeUndefined();
    const tokenA = cookieValue(regA, ACCESS_COOKIE);
    const orgId = regA.body.organizationId as string;

    const regB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: emailB,
        password: 'Password123!',
        fullName: 'Owner B',
        organizationName: `Agency B ${Date.now()}`,
      });
    expect(regB.status).toBeLessThan(300);
    const tokenB = cookieValue(regB, ACCESS_COOKIE);

    const inquiry = await request(app.getHttpServer())
      .post('/api/v1/inquiries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        destinations: ['Kerala'],
        adults: 2,
        budgetAmount: 80000,
        budgetCurrency: 'INR',
        startDate: '2026-12-01',
      });
    expect(inquiry.status).toBeLessThan(300);

    const tripRes = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiry.body.id}/convert-to-trip`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(tripRes.status).toBeLessThan(300);
    const tripId = tripRes.body.id as string;

    const itin = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/itinerary-versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        label: 'v2',
        days: [
          {
            id: 'd1',
            dayNumber: 1,
            title: 'Arrival',
            items: [{ id: 'i1', type: 'hotel', title: 'Resort check-in', customerVisible: true }],
          },
        ],
      });
    expect(itin.status).toBeLessThan(300);

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(quote.status).toBeLessThan(300);

    const version = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations/${quote.body.id}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        currency: 'INR',
        items: [
          {
            id: '1',
            description: 'Package',
            quantity: 2,
            unitCost: 10000,
            unitSell: 15000,
            taxPercent: 5,
            pricingUnit: 'per_person',
          },
        ],
        discountTotal: 0,
      });
    expect(version.status).toBeLessThan(300);
    expect(Number(version.body.marginAmount)).toBeGreaterThan(0);

    // Drive the version through the approval state machine before accepting
    // (draft → request_approval → approve → accept).
    const requestApproval = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/request-approval`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(requestApproval.status).toBeLessThan(300);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/approve`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(approve.status).toBeLessThan(300);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/accept`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(accept.status).toBeLessThan(300);
    expect(accept.body.status).toBe('accepted');

    const immutable = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations/${quote.body.id}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        currency: 'INR',
        items: [
          {
            id: '1',
            description: 'Package',
            quantity: 1,
            unitCost: 1,
            unitSell: 2,
            taxPercent: 0,
            pricingUnit: 'package',
          },
        ],
      });
    expect(immutable.status).toBeGreaterThanOrEqual(400);

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(cross.status).toBe(404);

    const execEmail = `exec-${Date.now()}@test.travel`;
    const execUser = await prisma.user.create({
      data: {
        email: execEmail,
        fullName: 'Exec',
        passwordHash: await hashPassword('Password123!'),
      },
    });
    const salesRole = await prisma.role.findFirstOrThrow({
      where: { organizationId: orgId, key: 'sales_executive' },
    });
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: orgId, userId: execUser.id },
    });
    await prisma.membershipRole.create({
      data: { membershipId: membership.id, roleId: salesRole.id },
    });
    const loginExec = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: execEmail, password: 'Password123!' });
    expect(loginExec.status).toBeLessThan(300);

    const workspace = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${cookieValue(loginExec, ACCESS_COOKIE)}`);
    expect(workspace.status).toBeLessThan(300);
    const hiddenVersion = workspace.body.quotations?.[0]?.versions?.[0];
    expect(hiddenVersion.costHidden).toBe(true);
  });

  it('cookie session: me works with access cookie; logout clears', async () => {
    const email = `cookie-${Date.now()}@test.travel`;
    const agent = request.agent(app.getHttpServer());
    const reg = await agent.post('/api/v1/auth/register').send({
      email,
      password: 'Password123!',
      fullName: 'Cookie User',
      organizationName: `Cookie Org ${Date.now()}`,
    });
    expect(reg.status).toBeLessThan(300);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    const logout = await agent.post('/api/v1/auth/logout').send({});
    expect(logout.status).toBeLessThan(300);

    const meAfter = await agent.get('/api/v1/auth/me');
    expect(meAfter.status).toBe(401);
  });
});
