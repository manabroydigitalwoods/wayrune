import { test, expect } from '@playwright/test';
import { API_BASE, apiLogin } from '../helpers/auth';

type PlaceItem = { id: string; name: string; kind: string };

/**
 * Step 6 P0: template destinationPlaceId + org profile placeId.
 */
test.describe('template-profile-place-hints', () => {
  test('save template dual-writes primary destination hint + placeId', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    await apiLogin(request);

    const placeRes = await request.get(
      `${API_BASE}/places?q=${encodeURIComponent('Darjeeling')}&purpose=destination&limit=10`,
    );
    expect(placeRes.ok(), await placeRes.text()).toBe(true);
    const places = ((await placeRes.json()) as { items?: PlaceItem[] }).items || [];
    const darj =
      places.find((p) => p.name.toLowerCase() === 'darjeeling' && p.kind === 'city') ||
      places[0];
    expect(darj, 'Darjeeling place').toBeTruthy();

    const stamp = Date.now();
    const createRes = await request.post(`${API_BASE}/quote-templates`, {
      data: {
        name: `E2E Dest Hint ${stamp}`,
        contentJson: {
          currency: 'INR',
          items: [],
          destinationHint: darj!.name,
          destinationPlaceId: darj!.id,
        },
        asNew: true,
      },
    });
    expect(createRes.ok(), await createRes.text()).toBe(true);
    const created = (await createRes.json()) as {
      content?: { destinationHint?: string | null; destinationPlaceId?: string | null };
    };
    expect(created.content?.destinationHint).toBe(darj!.name);
    expect(created.content?.destinationPlaceId).toBe(darj!.id);

    // Inaccessible ID is cleared; hint retained.
    const staleRes = await request.post(`${API_BASE}/quote-templates`, {
      data: {
        name: `E2E Dest Stale ${stamp}`,
        contentJson: {
          currency: 'INR',
          items: [],
          destinationHint: 'Private island near Phuket',
          destinationPlaceId: 'place_does_not_exist_xyz',
        },
        asNew: true,
      },
    });
    expect(staleRes.ok(), await staleRes.text()).toBe(true);
    const stale = (await staleRes.json()) as {
      content?: { destinationHint?: string | null; destinationPlaceId?: string | null };
    };
    expect(stale.content?.destinationHint).toBe('Private island near Phuket');
    expect(stale.content?.destinationPlaceId ?? null).toBeNull();
  });

  test('org profile derives snapshots from Place; clear wipes ID + snapshots', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    await apiLogin(request);

    const placeRes = await request.get(
      `${API_BASE}/places?q=${encodeURIComponent('Gangtok')}&purpose=destination&kinds=city&limit=5`,
    );
    expect(placeRes.ok(), await placeRes.text()).toBe(true);
    const places = ((await placeRes.json()) as { items?: PlaceItem[] }).items || [];
    const city = places.find((p) => p.kind === 'city') || places[0];
    expect(city, 'city place').toBeTruthy();

    const linked = await request.patch(`${API_BASE}/commerce/profile`, {
      data: {
        placeId: city!.id,
        // Mismatched client strings must be ignored while linked.
        city: 'Wrong City',
        region: 'Wrong Region',
        country: 'Wrong Country',
      },
    });
    expect(linked.ok(), await linked.text()).toBe(true);
    const linkedBody = (await linked.json()) as {
      placeId?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
    };
    // API may return partner profile nested or flat depending on serializer.
    const profile =
      (linkedBody as { partnerProfile?: typeof linkedBody }).partnerProfile || linkedBody;
    expect(profile.placeId).toBe(city!.id);
    expect(profile.city).toBe(city!.name);
    expect(profile.city).not.toBe('Wrong City');

    const cleared = await request.patch(`${API_BASE}/commerce/profile`, {
      data: { placeId: null },
    });
    expect(cleared.ok(), await cleared.text()).toBe(true);
    const clearedBody = (await cleared.json()) as {
      placeId?: string | null;
      city?: string | null;
      partnerProfile?: {
        placeId?: string | null;
        city?: string | null;
        region?: string | null;
        country?: string | null;
      };
    };
    const clearedProfile = clearedBody.partnerProfile || clearedBody;
    expect(clearedProfile.placeId ?? null).toBeNull();
    expect(clearedProfile.city ?? null).toBeNull();
  });
});
