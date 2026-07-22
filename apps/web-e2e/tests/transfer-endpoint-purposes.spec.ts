import { test, expect } from '@playwright/test';
import { API_BASE, apiLogin } from '../helpers/auth';

type PlaceItem = { id: string; name: string; kind: string; matchType?: string };

/**
 * Step 5 P0 Places cleanup: transfer_pickup / transfer_drop purposes.
 * Catalog IDs only; exact search outranks weaker purpose-kind boosts.
 */
test.describe('transfer-endpoint-purposes', () => {
  test('pickup purpose ranks exact city ahead of weaker airport-ish match', async ({
    request,
  }) => {
    test.setTimeout(60_000);
    await apiLogin(request);

    const res = await request.get(
      `${API_BASE}/places?q=${encodeURIComponent('Darjeeling')}&purpose=transfer_pickup&limit=20`,
    );
    expect(res.ok(), await res.text()).toBe(true);
    const items = ((await res.json()) as { items?: PlaceItem[] }).items || [];
    expect(items.length).toBeGreaterThan(0);

    const exactCity = items.find(
      (p) => p.name.toLowerCase() === 'darjeeling' && p.kind === 'city',
    );
    if (!exactCity) {
      test.skip(true, 'Darjeeling city not in catalog for this env');
      return;
    }

    expect(items[0]?.id).toBe(exactCity.id);
  });

  test('drop purpose returns ranked results for a corridor city', async ({
    request,
  }) => {
    test.setTimeout(60_000);
    await apiLogin(request);

    const res = await request.get(
      `${API_BASE}/places?q=${encodeURIComponent('Gangtok')}&purpose=transfer_drop&limit=10`,
    );
    expect(res.ok(), await res.text()).toBe(true);
    const items = ((await res.json()) as { items?: PlaceItem[] }).items || [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((p) => /gangtok/i.test(p.name))).toBe(true);
  });
});
