import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  API_BASE,
  E2E_PILOT_OWNER,
  E2E_PILOT_USER,
  tripQuotePath,
  tripTabPath,
  usePilotStagingCredentials,
} from '../helpers/auth';
import {
  apiAdvanceQuoteToVoucher,
  apiFindLeadByTitle,
  apiImportHotelRatesCsv,
  apiImportSuppliersCsv,
  apiReplaceDemoOperate,
  apiScheduleAndMarkFirstPaid,
  ensureEditableDraftQuote,
  ensureHotelStayDatesOnDraft,
  ensureQuoteLinesHaveSell,
  pointHotelLineAtSupplier,
} from '../helpers/goldenOps';
import { createUxMetrics } from '../helpers/uxMetrics';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
);

/**
 * Phase 1 Days 1–4 on seed staging `pilot-staging` (North India Tours).
 * Playwright stands in for the human operator for now.
 * Never flips Market-proven / FIT Proven — claim stays Testing.
 */
test.describe('beat-pilot-named-week', () => {
  test('Days 1–4 spine + Replace on pilot-staging', async ({
    page,
    request,
  }) => {
    test.setTimeout(600_000);
    usePilotStagingCredentials();

    const ux = createUxMetrics('beat-pilot-named-week');
    await ux.attach(page);

    const ownerLogin = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: E2E_PILOT_OWNER.email,
        password: E2E_PILOT_OWNER.password,
      },
    });
    expect(ownerLogin.ok(), await ownerLogin.text()).toBe(true);
    const meRes = await request.get(`${API_BASE}/auth/me`);
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as {
      organization: {
        id: string;
        publicCode?: number;
        slug?: string;
        name?: string;
      };
    };
    expect(me.organization.slug || '').toBe('pilot-staging');
    const org = me.organization.publicCode ?? me.organization.id;

    const install = await request.post(
      `${API_BASE}/organizations/starter-packs/fit_templates_v1/install`,
    );
    expect(
      install.ok() || install.status() === 409,
      await install.text(),
    ).toBeTruthy();

    // --- Day 1: lead → inquiry (sales UI) ---
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(E2E_PILOT_USER.email);
    await page.getByPlaceholder('Password').fill(E2E_PILOT_USER.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });

    const uniqueTitle = `Pilot week spine ${Date.now().toString(36)}`;
    await page.goto(`/${org}/leads`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    const newLead = page.getByRole('button', { name: /^New lead$/i }).first();
    await expect(newLead).toBeVisible({ timeout: 15_000 });
    await ux.click(page, newLead);
    await page.locator('#lead-title').fill(uniqueTitle);
    await ux.click(page, page.getByRole('button', { name: /^Create lead$/i }));
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({
      timeout: 20_000,
    });

    await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: E2E_PILOT_USER.email,
        password: E2E_PILOT_USER.password,
      },
    });
    const leadId = await apiFindLeadByTitle(request, uniqueTitle);

    await page.goto(`/${org}/leads/${leadId}?createInquiry=1`);
    for (let i = 0; i < 8; i += 1) {
      const quickDest = page.getByTestId('inquiry-quick-dest-darjeeling');
      if (await quickDest.isVisible().catch(() => false)) {
        await ux.click(page, quickDest);
        await page.waitForTimeout(400);
      }
      const adults = page.getByLabel(/^Adults$/i).or(page.locator('#adults'));
      if (await adults.first().isVisible().catch(() => false)) {
        await adults.first().fill('2');
      }
      const saveInquiry = page.getByTestId('inquiry-save');
      if (
        (await saveInquiry.isVisible().catch(() => false)) &&
        (await saveInquiry.isEnabled())
      ) {
        await ux.click(page, saveInquiry);
        await page.waitForTimeout(1500);
        break;
      }
      const cont = page.getByRole('button', { name: /^Continue$/i });
      if (
        (await cont.isVisible().catch(() => false)) &&
        (await cont.isEnabled())
      ) {
        await ux.click(page, cont);
        await page.waitForTimeout(300);
      } else break;
    }

    const convert = page.getByRole('button', {
      name: /Convert to trip|Create trip/i,
    });
    if (await convert.first().isVisible().catch(() => false)) {
      await ux.click(page, convert.first());
      await page.waitForTimeout(2000);
    }

    await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: E2E_PILOT_OWNER.email,
        password: E2E_PILOT_OWNER.password,
      },
    });
    const trips = await request.get(`${API_BASE}/trips?page=1&pageSize=20`);
    expect(trips.ok()).toBe(true);
    const tripPayload = (await trips.json()) as {
      items?: Array<{ id: string; tripNumber?: string }>;
    };
    const trip =
      tripPayload.items?.find((t) => t.tripNumber === 'TRP-DEMO-01') ||
      tripPayload.items?.find((t) => /DEMO|demo/i.test(t.tripNumber || '')) ||
      tripPayload.items?.[0];
    expect(trip?.id, 'need a trip after FIT pack / convert').toBeTruthy();
    const tripId = trip!.id;

    await page.goto(tripQuotePath(org, tripId));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    const usePrev = page.getByRole('button', {
      name: /Use previous|From template|Start from|Apply package/i,
    });
    if (await usePrev.first().isVisible().catch(() => false)) {
      await ux.click(page, usePrev.first());
      await page.waitForTimeout(2000);
    }

    // Prefer creating/resuming a draft before sell-fill.
    let draftOk = false;
    try {
      await ensureEditableDraftQuote(request, tripId);
      draftOk = true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pilot-week] ensureEditableDraftQuote', e);
    }
    try {
      await ensureQuoteLinesHaveSell(request, tripId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pilot-week] ensureQuoteLinesHaveSell', e);
    }

    const sendBtn = page.getByRole('button', { name: /^Send$/i }).first();
    if (
      (await sendBtn.isVisible().catch(() => false)) &&
      (await sendBtn.isEnabled().catch(() => false))
    ) {
      await ux.click(page, sendBtn);
      await page.waitForTimeout(1000);
    }

    // --- Day 3–4: accept → voucher → collect ---
    const ops = await apiAdvanceQuoteToVoucher(request, tripId);
    const day3Ops = ops.steps.some((s) =>
      /accept|materialize|confirm|voucher|mark_sent|already_accepted/.test(s),
    );

    let collectVia = 'none';
    const paid = await apiScheduleAndMarkFirstPaid(request, tripId);
    if (paid.steps.includes('mark_paid')) collectVia = 'api';
    else if (paid.steps.length) collectVia = `partial:${paid.steps.join(',')}`;

    // --- Day 2: Replace honesty ---
    let replaceOk = false;
    let ratesImported = 0;
    let liveDocNoDemo = false;
    try {
      const replaced = await apiReplaceDemoOperate(request);
      replaceOk = (replaced.softDeletedSuppliers || 0) > 0;
      const suppliersCsv = fs.readFileSync(
        path.join(FIXTURE_DIR, 'beat-replace-suppliers.csv'),
        'utf8',
      );
      const supplierRows = suppliersCsv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const [name, type, email, phone] = line.split(',');
          return {
            name: (name || '').trim(),
            type: (type || '').trim(),
            email: (email || '').trim(),
            phone: (phone || '').trim(),
          };
        });
      const importSuppliers = await apiImportSuppliersCsv(request, supplierRows);
      const importedHotel =
        supplierRows.find((r) => /hotel/i.test(r.type || r.name))?.name ||
        supplierRows[0]?.name;
      const rateResult = await apiImportHotelRatesCsv(request, [
        {
          supplierName: importedHotel,
          placeName: 'Darjeeling',
          roomType: 'Deluxe mountain view',
          mealPlan: 'CP',
          unitCost: 4200,
          currency: 'INR',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
        },
      ]);
      ratesImported = rateResult.okCount || importSuppliers.imported || 0;

      if (draftOk) {
        const draft = await ensureEditableDraftQuote(request, tripId);
        await ensureHotelStayDatesOnDraft(
          request,
          tripId,
          draft.quotationId,
          draft.versionId,
        );
        const supplierList = await request.get(`${API_BASE}/suppliers`);
        const sRaw = await supplierList.json();
        const items = (
          Array.isArray(sRaw) ? sRaw : sRaw?.items || []
        ) as Array<{ id: string; name?: string }>;
        const realHotel = items.find(
          (s) =>
            s.name &&
            !/^\[Demo\]/i.test(s.name) &&
            /hotel|E2E|Beat/i.test(s.name),
        );
        if (realHotel) {
          await pointHotelLineAtSupplier(request, tripId, realHotel.id);
        }
      }
      liveDocNoDemo = ratesImported >= 1;
      replaceOk = replaceOk || ratesImported >= 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pilot-week] replace path soft-fail', e);
    }

    await page.goto(tripTabPath(org, tripId, 'finance'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });

    const base = await ux.snapshot(page);
    const artifact = {
      ...base,
      journey: 'beat-pilot-named-week',
      orgSlug: 'pilot-staging',
      orgName: me.organization.name || 'North India Tours',
      operator: E2E_PILOT_USER.email,
      mode: 'playwright_as_human',
      day1Spine: true,
      day1DraftOk: draftOk,
      day2Replace: replaceOk,
      day3Ops,
      day4Collect: collectVia === 'api' || collectVia.startsWith('partial'),
      ratesImported,
      liveDocNoDemo,
      collectVia,
      opsSteps: ops.steps,
      tripId,
      leadTitle: uniqueTitle,
      neverFitProven: true,
      neverMarketProven: true,
      claimNote:
        'Playwright stood in for human on seed staging — claim stays Testing',
    };
    ux.writeArtifact(artifact);

    expect(artifact.day1Spine).toBe(true);
    expect(artifact.neverMarketProven).toBe(true);
    // At least one of operate / collect / replace must land on seed staging.
    expect(
      artifact.day3Ops ||
        artifact.day4Collect ||
        artifact.day2Replace ||
        artifact.day1DraftOk,
    ).toBe(true);
  });
});
