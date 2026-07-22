import { test, expect } from '@playwright/test';
import { API_BASE, apiLogin, uiLogin } from '../helpers/auth';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PlaceItem = {
  id: string;
  name: string;
  kind: string;
};

type InquiryRow = {
  id: string;
  origin?: string | null;
  originPlaceId?: string | null;
  originJson?: { placeId?: string | null; name?: string; kind?: string } | null;
  destinationsJson?: unknown;
  stopsJson?: unknown;
};

type TripRow = {
  id: string;
  settingsJson?: {
    proposalSeed?: {
      sourceSnapshot?: {
        origin?: { placeId?: string | null; name?: string } | null;
      };
    };
  } | null;
};

const resultsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../e2e-results',
);

/**
 * Step 1 Places cleanup: Inquiry origin canonical PlaceRef path.
 * API-first assertions; light UI check that detail shows origin name.
 */
test.describe('inquiry-origin-placeref', () => {
  test('create/edit origin persists originJson only; proposal seed reads PlaceRef', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const session = await apiLogin(request);
    const org = session.orgPublicCode;

    async function searchPlace(q: string, purpose: string): Promise<PlaceItem> {
      const res = await request.get(
        `${API_BASE}/places?q=${encodeURIComponent(q)}&purpose=${purpose}&limit=20`,
      );
      expect(res.ok(), await res.text()).toBe(true);
      const body = (await res.json()) as { items?: PlaceItem[] };
      const items = body.items || [];
      const hit =
        items.find((p) => p.name.toLowerCase() === q.toLowerCase()) ||
        items.find((p) => p.name.toLowerCase().includes(q.toLowerCase())) ||
        items[0];
      expect(hit, `expected place for query “${q}”`).toBeTruthy();
      return hit!;
    }

    const originA = await searchPlace('Delhi', 'origin');
    const originB = await searchPlace('Mumbai', 'origin');
    const dest = await searchPlace('Darjeeling', 'destination');
    expect(originA.id).not.toBe(originB.id);

    const createRes = await request.post(`${API_BASE}/inquiries`, {
      data: {
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        adults: 2,
        children: 0,
        infants: 0,
        startDate: '2026-10-01',
        endDate: '2026-10-04',
        nights: 3,
        origin: {
          placeId: originA.id,
          name: originA.name,
          kind: originA.kind,
        },
        destinations: [
          { placeId: dest.id, name: dest.name, kind: dest.kind },
        ],
        stops: [],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBe(true);
    const created = (await createRes.json()) as InquiryRow;
    expect(created.id).toBeTruthy();

    const get1 = await request.get(`${API_BASE}/inquiries/${created.id}`);
    expect(get1.ok(), await get1.text()).toBe(true);
    const inquiry1 = (await get1.json()) as InquiryRow;

    expect(inquiry1.originJson?.placeId).toBe(originA.id);
    expect(inquiry1.originJson?.name).toBe(originA.name);
    expect(inquiry1.origin).toBeNull();
    expect(inquiry1.originPlaceId).toBeNull();
    expect(Array.isArray(inquiry1.destinationsJson)).toBe(true);
    expect((inquiry1.destinationsJson as PlaceItem[]).length).toBe(1);
    expect((inquiry1.destinationsJson as Array<{ placeId?: string }>)[0]?.placeId).toBe(
      dest.id,
    );
    expect(inquiry1.stopsJson == null || Array.isArray(inquiry1.stopsJson)).toBe(true);

    const destinationsBefore = JSON.stringify(inquiry1.destinationsJson);
    const stopsBefore = JSON.stringify(inquiry1.stopsJson ?? []);

    const patchRes = await request.patch(`${API_BASE}/inquiries/${created.id}`, {
      data: {
        origin: {
          placeId: originB.id,
          name: originB.name,
          kind: originB.kind,
        },
      },
    });
    expect(patchRes.ok(), await patchRes.text()).toBe(true);

    const get2 = await request.get(`${API_BASE}/inquiries/${created.id}`);
    expect(get2.ok(), await get2.text()).toBe(true);
    const inquiry2 = (await get2.json()) as InquiryRow;
    expect(inquiry2.originJson?.placeId).toBe(originB.id);
    expect(inquiry2.originJson?.name).toBe(originB.name);
    expect(inquiry2.origin).toBeNull();
    expect(inquiry2.originPlaceId).toBeNull();
    expect(JSON.stringify(inquiry2.destinationsJson)).toBe(destinationsBefore);
    expect(JSON.stringify(inquiry2.stopsJson ?? [])).toBe(stopsBefore);

    // Unresolved / free-text origin: PlaceRef with null placeId (no silent catalog invent).
    const unresolvedName = `Custom Origin ${Date.now().toString(36)}`;
    const patchUnresolved = await request.patch(`${API_BASE}/inquiries/${created.id}`, {
      data: {
        origin: { placeId: null, name: unresolvedName },
      },
    });
    expect(patchUnresolved.ok(), await patchUnresolved.text()).toBe(true);
    const getUnresolved = await request.get(`${API_BASE}/inquiries/${created.id}`);
    const inquiryUnresolved = (await getUnresolved.json()) as InquiryRow;
    expect(inquiryUnresolved.originJson?.placeId == null).toBe(true);
    expect(inquiryUnresolved.originJson?.name).toBe(unresolvedName);
    expect(inquiryUnresolved.origin).toBeNull();
    expect(inquiryUnresolved.originPlaceId).toBeNull();

    // Restore catalog origin B for proposal seed
    await request.patch(`${API_BASE}/inquiries/${created.id}`, {
      data: {
        origin: {
          placeId: originB.id,
          name: originB.name,
          kind: originB.kind,
        },
      },
    });

    // Qualify if needed then convert
    await request.post(`${API_BASE}/inquiries/${created.id}/status`, {
      data: { status: 'qualified' },
    });

    const convertRes = await request.post(
      `${API_BASE}/inquiries/${created.id}/convert-to-trip`,
    );
    expect(convertRes.ok(), await convertRes.text()).toBe(true);
    const trip = (await convertRes.json()) as { id: string };
    expect(trip.id).toBeTruthy();

    const tripGet = await request.get(`${API_BASE}/trips/${trip.id}`);
    expect(tripGet.ok(), await tripGet.text()).toBe(true);
    const tripBody = (await tripGet.json()) as TripRow;
    const snapOrigin =
      tripBody.settingsJson?.proposalSeed?.sourceSnapshot?.origin ?? null;
    expect(snapOrigin?.placeId).toBe(originB.id);
    expect(snapOrigin?.name).toBe(originB.name);

    mkdirSync(resultsDir, { recursive: true });
    const result: Record<string, unknown> = {
      inquiryId: created.id,
      tripId: trip.id,
      originA: originA.id,
      originB: originB.id,
      destinationId: dest.id,
      proposalOriginPlaceId: snapOrigin?.placeId,
      passed: true,
      uiChecked: false,
    };

    // Light UI check when Vite is up (API path is the contract under test).
    try {
      await uiLogin(page);
      await page.goto(`/${org}/inquiries/${created.id}`);
      await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(originB.name, { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });
      result.uiChecked = true;
    } catch (err) {
      result.uiSkipped = err instanceof Error ? err.message.slice(0, 200) : 'ui unavailable';
    }

    writeFileSync(
      path.join(resultsDir, 'inquiry-origin-placeref.json'),
      JSON.stringify(result, null, 2),
    );
  });
});
