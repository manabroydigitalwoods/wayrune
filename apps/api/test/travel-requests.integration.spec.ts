import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { hashPassword } from '@wayrune/auth';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ZodExceptionFilter } from '../src/common/zod-exception.filter';
import { InquiriesService } from '../src/modules/inquiries/inquiries.service';
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

describe('Travel Requests (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function registerAgency(): Promise<{ token: string; orgId: string }> {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `owner-${stamp}@test.travel`,
        password: 'Password123!',
        fullName: 'Owner',
        organizationName: `Agency ${stamp}`,
      });
    expect(res.status).toBeLessThan(300);
    return { token: cookieValue(res, ACCESS_COOKIE), orgId: res.body.organizationId as string };
  }

  const travelFields = {
    travelType: 'leisure',
    domesticOrIntl: 'domestic' as const,
    destinations: ['Kerala'],
    adults: 2,
    budgetAmount: 80000,
    budgetCurrency: 'INR',
  };

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

  it('new person → atomically creates Party + Lead + Inquiry, linked, with missingFields', async () => {
    const { token, orgId } = await registerAgency();
    const email = `traveller-${Date.now()}@test.travel`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Sharma Family', email, phone: '+919812345678' },
        ...travelFields,
      });

    expect(res.status).toBeLessThan(300);
    expect(res.body.partyId).toBeTruthy();
    expect(res.body.leadId).toBeTruthy();
    expect(res.body.inquiryId).toBeTruthy();
    expect(res.body.inquiryNumber).toMatch(/^INQ-/);
    expect(Array.isArray(res.body.missingFields)).toBe(true);

    const party = await prisma.party.findFirst({ where: { id: res.body.partyId, organizationId: orgId } });
    expect(party?.email).toBe(email);
    expect(party?.type).toBe('individual');

    const lead = await prisma.lead.findFirst({ where: { id: res.body.leadId, organizationId: orgId } });
    expect(lead?.partyId).toBe(res.body.partyId);
    expect(lead?.email).toBe(email);

    const inquiry = await prisma.inquiry.findFirst({
      where: { id: res.body.inquiryId, organizationId: orgId },
    });
    expect(inquiry?.partyId).toBe(res.body.partyId);
    expect(inquiry?.leadId).toBe(res.body.leadId);
  });

  it('matches an existing party by email instead of creating a duplicate', async () => {
    const { token, orgId } = await registerAgency();
    const email = `repeat-${Date.now()}@test.travel`;

    const created = await request(app.getHttpServer())
      .post('/api/v1/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'individual', displayName: 'Existing Client', email, phone: '+919800000001' });
    expect(created.status).toBeLessThan(300);
    const existingPartyId = created.body.id as string;

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: { name: 'Someone Else', email }, ...travelFields });

    expect(res.status).toBeLessThan(300);
    expect(res.body.partyId).toBe(existingPartyId);

    const parties = await prisma.party.findMany({ where: { organizationId: orgId, email } });
    expect(parties).toHaveLength(1);
  });

  it('reuses an explicitly linked partyId', async () => {
    const { token, orgId } = await registerAgency();
    const email = `linked-${Date.now()}@test.travel`;

    const created = await request(app.getHttpServer())
      .post('/api/v1/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'individual', displayName: 'Linked Client', email });
    expect(created.status).toBeLessThan(300);
    const partyId = created.body.id as string;

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ partyId, ...travelFields });

    expect(res.status).toBeLessThan(300);
    expect(res.body.partyId).toBe(partyId);

    const parties = await prisma.party.findMany({ where: { organizationId: orgId, email } });
    expect(parties).toHaveLength(1);
  });

  it('rolls back Party + Lead when Inquiry creation fails (atomicity)', async () => {
    const { token, orgId } = await registerAgency();
    const email = `rollback-${Date.now()}@test.travel`;

    const spy = vi
      .spyOn(app.get(InquiriesService), 'create')
      .mockRejectedValueOnce(new Error('boom'));

    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/travel-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ contact: { name: 'Rollback Person', email }, ...travelFields });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      spy.mockRestore();
    }

    const parties = await prisma.party.findMany({ where: { organizationId: orgId, email } });
    expect(parties).toHaveLength(0);
    const leads = await prisma.lead.findMany({ where: { organizationId: orgId, email } });
    expect(leads).toHaveLength(0);
  });

  it('denies partners (non-agency org) with 403', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `hotelier-${stamp}@test.travel`,
        password: 'Password123!',
        fullName: 'Hotelier',
        organizationName: `Hotel ${stamp}`,
        organizationKind: 'hotel',
      });
    expect(reg.status).toBeLessThan(300);
    const token = cookieValue(reg, ACCESS_COOKIE);

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: { name: 'Walk-in' }, ...travelFields });
    expect(res.status).toBe(403);
  });

  it('PATCH /inquiries/:id updates fields and recomputes missingFields', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Edit Person', email: `edit-${Date.now()}@test.travel` },
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        destinations: ['Kerala'],
        adults: 2,
        budgetAmount: 80000,
        budgetCurrency: 'INR',
      });
    expect(created.status).toBeLessThan(300);
    const inquiryId = created.body.inquiryId as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        travelType: 'honeymoon',
        budgetAmount: 120000,
        startDate: '2026-12-01',
      });
    expect(patched.status).toBeLessThan(300);
    expect(patched.body.travelType).toBe('honeymoon');
    expect(Number(patched.body.budgetAmount)).toBe(120000);
    expect(patched.body.missingFieldsJson).toEqual([]);
  });

  it('PATCH /inquiries/:id rejects edits on converted inquiries', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Convert Person', email: `conv-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(created.status).toBeLessThan(300);
    const inquiryId = created.body.inquiryId as string;

    const trip = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/convert-to-trip`)
      .set('Authorization', `Bearer ${token}`);
    expect(trip.status).toBeLessThan(300);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ budgetAmount: 99999 });
    expect(patched.status).toBe(400);
  });

  it('POST /inquiries/:id/status walks open → qualified → lost → open and records history', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Status Person', email: `status-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(created.status).toBeLessThan(300);
    const inquiryId = created.body.inquiryId as string;

    const qualified = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'qualified' });
    expect(qualified.status).toBeLessThan(300);
    expect(qualified.body.status).toBe('qualified');

    const lostNoReason = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'lost' });
    expect(lostNoReason.status).toBe(400);

    const lost = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'lost', reason: 'Chose a competitor' });
    expect(lost.status).toBeLessThan(300);
    expect(lost.body.status).toBe('lost');

    const reopened = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });
    expect(reopened.status).toBeLessThan(300);
    expect(reopened.body.status).toBe('open');

    const history = await prisma.inquiryStatusHistory.findMany({
      where: { inquiryId },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.status)).toEqual(['open', 'qualified', 'lost', 'open']);
    expect(history.at(-2)?.note).toBe('Chose a competitor');

    // Invalid transition: cannot jump straight to a duplicate/unreachable state.
    const invalid = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });
    expect(invalid.status).toBe(400);
  });

  it('POST /inquiries/:id/status rejects manual transitions once converted', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Converted Status Person', email: `conv-status-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(created.status).toBeLessThan(300);
    const inquiryId = created.body.inquiryId as string;

    const trip = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/convert-to-trip`)
      .set('Authorization', `Bearer ${token}`);
    expect(trip.status).toBeLessThan(300);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'qualified' });
    expect(res.status).toBe(400);
  });

  it('records travel_request.create audit after intake', async () => {
    const { token, orgId } = await registerAgency();
    const email = `audit-${Date.now()}@test.travel`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: { name: 'Audit Person', email }, ...travelFields });
    expect(res.status).toBeLessThan(300);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        action: 'travel_request.create',
        entityId: res.body.inquiryId as string,
      },
    });
    expect(audit).toBeTruthy();
    expect(audit?.metadataJson).toMatchObject({
      leadId: res.body.leadId,
      partyId: res.body.partyId,
    });
  });

  it('denies travel-requests when actor lacks party.write or lead.write', async () => {
    const { orgId } = await registerAgency();
    const stamp = Date.now();
    const consultantRole = await prisma.role.findFirst({
      where: { organizationId: orgId, key: 'travel_consultant' },
    });
    expect(consultantRole?.id).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        email: `consultant-${stamp}@test.travel`,
        passwordHash: await hashPassword('Password123!'),
        fullName: 'Travel Consultant',
        isActive: true,
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: orgId, userId: user.id, isOwner: false },
    });
    await prisma.membershipRole.create({
      data: { membershipId: membership.id, roleId: consultantRole!.id },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Password123!', organizationId: orgId });
    expect(login.status).toBeLessThan(300);
    const token = cookieValue(login, ACCESS_COOKIE);

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Blocked Person', email: `blocked-${stamp}@test.travel` },
        ...travelFields,
      });
    expect(res.status).toBe(403);
  });

  it('syncs linked lead to requirements_pending after travel request intake', async () => {
    const { token } = await registerAgency();

    const res = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Sync Person', email: `sync-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(res.status).toBeLessThan(300);

    const lead = await prisma.lead.findFirst({
      where: { id: res.body.leadId as string },
      include: { stage: true },
    });
    expect(lead?.stage?.key).toBe('requirements_pending');
  });

  it('auto-qualifies inquiry and syncs lead when requirements become complete', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Complete Person', email: `complete-${Date.now()}@test.travel` },
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        destinations: ['Kerala'],
        adults: 2,
      });
    expect(created.status).toBeLessThan(300);
    const inquiryId = created.body.inquiryId as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ budgetAmount: 90000, budgetCurrency: 'INR' });
    expect(patched.status).toBeLessThan(300);
    expect(patched.body.status).toBe('qualified');
    expect(patched.body.missingFieldsJson).toEqual([]);

    const lead = await prisma.lead.findFirst({
      where: { id: created.body.leadId as string },
      include: { stage: true },
    });
    expect(lead?.stage?.key).toBe('qualified');
  });

  it('syncs linked lead to lost when inquiry is marked lost', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Lost Person', email: `lost-sync-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(created.status).toBeLessThan(300);

    const lost = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${created.body.inquiryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'lost', reason: 'Budget mismatch' });
    expect(lost.status).toBeLessThan(300);

    const lead = await prisma.lead.findFirst({
      where: { id: created.body.leadId as string },
      include: { stage: true },
    });
    expect(lead?.stage?.key).toBe('lost');
    expect(lead?.lostReason).toBe('Budget mismatch');
  });

  it('POST /leads/:id/convert-to-client matches an existing party by email', async () => {
    const { token } = await registerAgency();
    const email = `client-match-${Date.now()}@test.travel`;

    const party = await request(app.getHttpServer())
      .post('/api/v1/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'individual', displayName: 'Existing Client', email });
    expect(party.status).toBeLessThan(300);

    const lead = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Match me', contactName: 'Match me', email });
    expect(lead.status).toBeLessThan(300);

    const converted = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.body.lead.id}/convert-to-client`)
      .set('Authorization', `Bearer ${token}`);
    expect(converted.status).toBeLessThan(300);
    expect(converted.body.party.id).toBe(party.body.id);
    expect(converted.body.created).toBe(false);
  });

  it('travel request → convert to trip marks linked lead won', async () => {
    const { token } = await registerAgency();

    const created = await request(app.getHttpServer())
      .post('/api/v1/travel-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contact: { name: 'Won Person', email: `won-${Date.now()}@test.travel` },
        ...travelFields,
      });
    expect(created.status).toBeLessThan(300);

    const trip = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${created.body.inquiryId}/convert-to-trip`)
      .set('Authorization', `Bearer ${token}`);
    expect(trip.status).toBeLessThan(300);
    expect(trip.body.leadOutcome?.markedWon).toBe(true);

    const lead = await prisma.lead.findFirst({
      where: { id: created.body.leadId as string },
      include: { stage: true },
    });
    expect(lead?.stage?.key).toBe('won');
  });
});
