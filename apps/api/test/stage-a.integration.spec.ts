import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ZodExceptionFilter } from '../src/common/zod-exception.filter';
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

describe('Stage A exit criteria (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ZodExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('partners get 403 on agency CRM; can still list suppliers via network perms', async () => {
    const partnerEmail = `hotel-${Date.now()}@partner.test`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: partnerEmail,
        password: 'Password123!',
        fullName: 'Partner Owner',
        organizationName: `Partner Hotel ${Date.now()}`,
        organizationKind: 'hotel',
      });
    expect(reg.status).toBeLessThan(300);
    const token = cookieValue(reg, ACCESS_COOKIE);

    for (const path of ['/api/v1/leads', '/api/v1/parties', '/api/v1/inquiries', '/api/v1/trips']) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status, path).toBe(403);
    }

    const suppliers = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`);
    expect(suppliers.status).toBeLessThan(300);
  });

  it('revise-from-accepted + branded PDF download; cancel booking cascades unpaid finance', async () => {
    const email = `stage-a-${Date.now()}@agency.test`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        fullName: 'Agency Owner',
        organizationName: `Stage A Agency ${Date.now()}`,
      });
    expect(reg.status).toBeLessThan(300);
    const token = cookieValue(reg, ACCESS_COOKIE);

    const inquiry = await request(app.getHttpServer())
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
    expect(inquiry.status).toBeLessThan(300);

    const tripRes = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/${inquiry.body.id}/convert-to-trip`)
      .set('Authorization', `Bearer ${token}`);
    expect(tripRes.status).toBeLessThan(300);
    const tripId = tripRes.body.id as string;

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations`)
      .set('Authorization', `Bearer ${token}`);
    expect(quote.status).toBeLessThan(300);

    const version = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations/${quote.body.id}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        currency: 'INR',
        items: [
          {
            id: '1',
            description: 'Package',
            quantity: 2,
            unitCost: 8000,
            unitSell: 12000,
            taxPercent: 5,
            pricingUnit: 'per_person',
          },
        ],
        discountTotal: 0,
      });
    expect(version.status).toBeLessThan(300);

    // A version is created as `draft`; the state machine requires it to reach
    // `approved`/`sent` before it can be accepted (draft → request_approval →
    // approve → accept).
    const requestApproval = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/request-approval`)
      .set('Authorization', `Bearer ${token}`);
    expect(requestApproval.status).toBeLessThan(300);

    const approve = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approve.status).toBeLessThan(300);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(accept.status).toBeLessThan(300);
    expect(accept.body.status).toBe('accepted');

    const revise = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/quotations/from-accepted`)
      .set('Authorization', `Bearer ${token}`);
    expect(revise.status).toBeLessThan(300);
    expect(revise.body.versions?.[0]?.status || revise.body.status).toBeTruthy();

    const pdf = await request(app.getHttpServer())
      .post(`/api/v1/quotations/${version.body.id}/pdf`)
      .set('Authorization', `Bearer ${token}`);
    expect(pdf.status).toBeLessThan(300);
    expect(pdf.body.delivery).toBe('pdf');
    expect(pdf.body.documentId).toBeTruthy();

    const file = await request(app.getHttpServer())
      .get(`/api/v1/files/${pdf.body.documentId}/content`)
      .set('Authorization', `Bearer ${token}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.isBuffer(file.body) ? file.body.length : Buffer.from(file.body).length).toBeGreaterThan(100);

    const booking = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/bookings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'hotel',
        title: 'Beach resort',
        status: 'pending',
        costAmount: 15000,
      });
    expect(booking.status).toBeLessThan(300);
    const bookingId = booking.body.id as string;

    const pay = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        direction: 'supplier',
        label: 'Hotel deposit',
        amount: 5000,
        currency: 'INR',
        status: 'scheduled',
        bookingComponentId: bookingId,
      });
    expect(pay.status).toBeLessThan(300);

    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancel.status).toBeLessThan(300);
    expect(cancel.body.status).toBe('cancelled');
    expect(cancel.body.cascaded?.cancelledPayments).toBeGreaterThanOrEqual(1);

    const finance = await request(app.getHttpServer())
      .get(`/api/v1/trips/${tripId}/finance-summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(finance.status).toBeLessThan(300);
    expect(finance.body.costCompare).toBeTruthy();
    expect(finance.body.costCompare.estimatedCost).toBeGreaterThan(0);
    expect(finance.body.costCompare.actualBookingCost).toBe(0);
  });
});
