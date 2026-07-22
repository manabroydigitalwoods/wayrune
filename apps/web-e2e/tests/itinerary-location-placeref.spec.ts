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
 * Step 2: itinerary location/destination PlaceRef canonicalize-on-save.
 */
test.describe('itinerary-location-placeref', () => {
  test('autosave persists locationRef/destinationRef and omits legacy keys', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    await apiLogin(request);

    async function searchPlace(q: string): Promise<PlaceItem> {
      const res = await request.get(
        `${API_BASE}/places?q=${encodeURIComponent(q)}&purpose=destination&limit=20`,
      );
      expect(res.ok(), await res.text()).toBe(true);
      const body = (await res.json()) as { items?: PlaceItem[] };
      const items = body.items || [];
      const hit =
        items.find((p) => p.name.toLowerCase() === q.toLowerCase()) ||
        items.find((p) => p.name.toLowerCase().includes(q.toLowerCase())) ||
        items[0];
      expect(hit, `place for ${q}`).toBeTruthy();
      return hit!;
    }

    const dest = await searchPlace('Darjeeling');

    const createInq = await request.post(`${API_BASE}/inquiries`, {
      data: {
        travelType: 'leisure',
        domesticOrIntl: 'domestic',
        adults: 2,
        startDate: '2026-11-01',
        endDate: '2026-11-04',
        nights: 3,
        destinations: [{ placeId: dest.id, name: dest.name, kind: dest.kind }],
      },
    });
    expect(createInq.ok(), await createInq.text()).toBe(true);
    const inquiry = (await createInq.json()) as { id: string };

    await request.post(`${API_BASE}/inquiries/${inquiry.id}/status`, {
      data: { status: 'qualified' },
    });
    const convert = await request.post(
      `${API_BASE}/inquiries/${inquiry.id}/convert-to-trip`,
    );
    expect(convert.ok(), await convert.text()).toBe(true);
    const trip = (await convert.json()) as { id: string };

    // Legacy-shaped save (string destination + PlaceRef location) → server canonicalize
    const save = await request.post(
      `${API_BASE}/trips/${trip.id}/itinerary-versions`,
      {
        data: {
          label: 'Step2 canonical',
          days: [
            {
              id: 'd1',
              dayNumber: 1,
              title: 'Arrival',
              destination: 'Darjeeling',
              items: [
                {
                  id: 'i1',
                  type: 'sightseeing',
                  title: 'Tiger Hill',
                  customerVisible: true,
                  location: {
                    placeId: dest.id,
                    name: 'Tiger Hill',
                    kind: 'landmark',
                  },
                  details: { keepMe: true },
                },
              ],
            },
            {
              id: 'd2',
              dayNumber: 2,
              title: 'Explore',
              destination: {
                placeId: dest.id,
                name: dest.name,
                kind: dest.kind,
              },
              items: [
                {
                  id: 'i2',
                  type: 'note',
                  title: 'Custom stay',
                  customerVisible: true,
                  location: 'Private campsite near Sandakphu',
                  locationLabel: 'Near Sandakphu ridge',
                },
              ],
            },
          ],
        },
      },
    );
    expect(save.ok(), await save.text()).toBe(true);
    const version = (await save.json()) as {
      id: string;
      contentJson?: {
        days?: Array<Record<string, unknown>>;
      };
    };

    const days = version.contentJson?.days || [];
    expect(days.length).toBe(2);

    const d1 = days[0]!;
    expect(d1.destination).toBeUndefined();
    expect(d1.destinationRef).toEqual({
      placeId: null,
      name: 'Darjeeling',
    });
    const i1 = (d1.items as Record<string, unknown>[])[0]!;
    expect(i1.location).toBeUndefined();
    expect(i1.locationRef).toMatchObject({
      placeId: dest.id,
      name: 'Tiger Hill',
    });
    expect((i1.details as { keepMe?: boolean })?.keepMe).toBe(true);

    const d2 = days[1]!;
    expect(d2.destination).toBeUndefined();
    expect(d2.destinationRef).toMatchObject({
      placeId: dest.id,
      name: dest.name,
    });
    const i2 = (d2.items as Record<string, unknown>[])[0]!;
    expect(i2.location).toBeUndefined();
    expect(i2.locationRef).toEqual({
      placeId: null,
      name: 'Private campsite near Sandakphu',
    });
    expect(i2.locationLabel).toBe('Near Sandakphu ridge');

    // Public flatten uses custom label
    const workspace = await request.get(`${API_BASE}/trips/${trip.id}`);
    expect(workspace.ok()).toBe(true);

    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(
      path.join(resultsDir, 'itinerary-location-placeref.json'),
      JSON.stringify(
        {
          tripId: trip.id,
          versionId: version.id,
          destinationPlaceId: dest.id,
          passed: true,
        },
        null,
        2,
      ),
    );
  });
});
