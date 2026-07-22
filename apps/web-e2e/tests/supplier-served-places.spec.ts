import { test, expect } from '@playwright/test';
import { API_BASE, apiLogin } from '../helpers/auth';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PlaceItem = { id: string; name: string; kind: string };

const resultsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../e2e-results',
);

/**
 * Step 4 Places cleanup: Supplier servedPlaceIds / service areas.
 * Exact Place ID matching; stay types do not broaden via coverage.
 */
test.describe('supplier-served-places', () => {
  test('DMC coverage persists; filter matches served; hotel not broadened; airports rejected', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    await apiLogin(request);

    async function searchPlace(q: string, purpose = 'destination'): Promise<PlaceItem> {
      const res = await request.get(
        `${API_BASE}/places?q=${encodeURIComponent(q)}&purpose=${purpose}&limit=20`,
      );
      expect(res.ok(), await res.text()).toBe(true);
      const items = ((await res.json()) as { items?: PlaceItem[] }).items || [];
      const hit =
        items.find((p) => p.name.toLowerCase() === q.toLowerCase()) ||
        items.find((p) => p.name.toLowerCase().includes(q.toLowerCase())) ||
        items[0];
      expect(hit, `place for ${q}`).toBeTruthy();
      return hit!;
    }

    const gangtok = await searchPlace('Gangtok');
    const pelling = await searchPlace('Pelling');
    const airport = await searchPlace('IXB', 'origin').catch(() => null);
    const airportRes = await request.get(
      `${API_BASE}/places?q=airport&purpose=transfer_pickup&kinds=airport&limit=5`,
    );
    const airports = ((await airportRes.json()) as { items?: PlaceItem[] }).items || [];
    const airportPlace = airports[0] || airport;

    const stamp = Date.now();
    const createRes = await request.post(`${API_BASE}/suppliers`, {
      data: {
        name: `E2E DMC Coverage ${stamp}`,
        type: 'dmc',
        phone: `7${String(stamp).slice(-9)}`,
        servedPlaceIds: [gangtok.id, pelling.id, gangtok.id],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBe(true);
    const created = (await createRes.json()) as {
      id: string;
      servedPlaceIds?: string[] | null;
      servedPlaces?: Array<{ id: string; name: string }>;
      profileJson?: { destinationsServed?: string[] };
    };
    expect(created.servedPlaceIds).toEqual([gangtok.id, pelling.id]);
    expect(created.servedPlaces?.map((p) => p.id)).toEqual([gangtok.id, pelling.id]);
    expect(created.profileJson?.destinationsServed).toEqual(
      expect.arrayContaining([gangtok.name, pelling.name]),
    );

    const listRes = await request.get(
      `${API_BASE}/suppliers?type=dmc&placeId=${encodeURIComponent(gangtok.id)}`,
    );
    expect(listRes.ok(), await listRes.text()).toBe(true);
    const listed = (await listRes.json()) as Array<{ id: string }>;
    expect(listed.some((s) => s.id === created.id)).toBe(true);

    // Parent/child: Sikkim-only coverage must NOT match Gangtok (exact only).
    // Covered by unit semantics — here verify remove updates filter.
    const clearRes = await request.patch(`${API_BASE}/suppliers/${created.id}`, {
      data: { servedPlaceIds: [pelling.id] },
    });
    expect(clearRes.ok(), await clearRes.text()).toBe(true);
    const listAfter = await request.get(
      `${API_BASE}/suppliers?type=dmc&placeId=${encodeURIComponent(gangtok.id)}`,
    );
    const after = (await listAfter.json()) as Array<{ id: string }>;
    expect(after.some((s) => s.id === created.id)).toBe(false);

    if (airportPlace?.id) {
      const bad = await request.patch(`${API_BASE}/suppliers/${created.id}`, {
        data: { servedPlaceIds: [airportPlace.id] },
      });
      expect(bad.ok()).toBe(false);
    }

    // Hotel: coverage does not broaden list when filtering by type=hotel
    const hotelRes = await request.post(`${API_BASE}/suppliers`, {
      data: {
        name: `E2E Hotel Coverage ${stamp}`,
        type: 'hotel',
        phone: `6${String(stamp).slice(-9)}`,
        placeId: gangtok.id,
        servedPlaceIds: [pelling.id],
      },
    });
    expect(hotelRes.ok(), await hotelRes.text()).toBe(true);
    const hotel = (await hotelRes.json()) as { id: string };
    const hotelList = await request.get(
      `${API_BASE}/suppliers?type=hotel&placeId=${encodeURIComponent(pelling.id)}`,
    );
    const hotels = (await hotelList.json()) as Array<{ id: string }>;
    expect(hotels.some((s) => s.id === hotel.id)).toBe(false);

    const nullLegacy = await request.post(`${API_BASE}/suppliers`, {
      data: {
        name: `E2E Legacy CSV ${stamp}`,
        type: 'dmc',
        phone: `5${String(stamp).slice(-9)}`,
        profileJson: { destinationsServed: ['Darjeeling', 'Kalimpong'] },
      },
    });
    expect(nullLegacy.ok(), await nullLegacy.text()).toBe(true);
    const legacy = (await nullLegacy.json()) as {
      id: string;
      servedPlaceIds?: string[] | null;
      profileJson?: { destinationsServed?: string[] };
    };
    expect(legacy.servedPlaceIds).toBeNull();
    expect(legacy.profileJson?.destinationsServed).toEqual(['Darjeeling', 'Kalimpong']);

    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      path.join(resultsDir, 'supplier-served-places.json'),
      JSON.stringify(
        {
          ok: true,
          dmcId: created.id,
          hotelId: hotel.id,
          legacyId: legacy.id,
          servedPlaceIds: created.servedPlaceIds,
        },
        null,
        2,
      ),
    );
  });
});
