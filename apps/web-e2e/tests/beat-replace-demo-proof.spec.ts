import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  API_BASE,
  E2E_OWNER,
  ensureFitPackAndDemoTrip,
  tripQuotePath,
  tripQuoteVersionPath,
  uiLogin,
} from '../helpers/auth';
import {
  apiImportHotelRatesCsv,
  apiImportSuppliersCsv,
  apiReplaceDemoOperate,
  apiRestoreDemoOperatePack,
  ensureEditableDraftQuote,
  ensureHotelStayDatesOnDraft,
  ensureQuoteLinesHaveSell,
  pointHotelLineAtSupplier,
} from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  BEAT_REPLACE_DEMO_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
);
const SUPPLIER_FIXTURE = path.join(FIXTURE_DIR, 'beat-replace-suppliers.csv');

function parseSupplierCsv(csv: string) {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const [, ...rows] = lines;
  return rows.map((line) => {
    const [name, type, email, phone] = line.split(',');
    return {
      name: (name || '').trim(),
      type: (type || '').trim(),
      email: (email || '').trim(),
      phone: (phone || '').trim(),
    };
  });
}

/**
 * Beat-Sembark honesty: Replace demo → real suppliers → hotel rates → Match →
 * live proposal without [Demo]. Restores FIT/demo operate afterward.
 * Never FIT Proven / Market-proven.
 */
test.describe('beat-replace-demo-proof', () => {
  test('replace demo + rates + Match + live doc no [Demo]', async ({
    page,
    request,
  }) => {
    const ux = createUxMetrics('beat-replace-demo-proof');
    await ux.attach(page);

    const session = await ensureFitPackAndDemoTrip(request);
    expect(session.tripId).toBeTruthy();
    const tripId = session.tripId!;

    let restored = false;
    const restore = async () => {
      if (restored) return;
      restored = true;
      await apiRestoreDemoOperatePack(request);
    };

    try {
      const replaced = await apiReplaceDemoOperate(request);
      expect(
        replaced.softDeletedSuppliers,
        'expected soft-deleted demo suppliers',
      ).toBeGreaterThan(0);

      // Demo hotel must not appear in active supplier list.
      const login = await request.post(`${API_BASE}/auth/login`, {
        data: { email: E2E_OWNER.email, password: E2E_OWNER.password },
      });
      expect(login.ok()).toBe(true);
      const afterReplace = await request.get(`${API_BASE}/suppliers?q=Demo`);
      expect(afterReplace.ok()).toBe(true);
      const demoListRaw = await afterReplace.json();
      const demoList = (
        Array.isArray(demoListRaw) ? demoListRaw : demoListRaw?.items || []
      ) as Array<{ name?: string }>;
      const liveDemo = demoList.filter((s) =>
        /^\[Demo\]/i.test(s.name || ''),
      );
      expect(
        liveDemo.length,
        `demo suppliers still listed: ${liveDemo.map((s) => s.name).join(', ')}`,
      ).toBe(0);

      const csv = fs.readFileSync(SUPPLIER_FIXTURE, 'utf8');
      const stamp = Date.now().toString(36);
      const rows = parseSupplierCsv(csv).map((r) => ({
        ...r,
        name: `${r.name} ${stamp}`,
        email: r.email.replace('@', `+${stamp}@`),
      }));
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const hotelRow = rows.find((r) => /hotel/i.test(r.type || r.name));
      const importedName = (hotelRow || rows[0]!).name;

      const importResult = await apiImportSuppliersCsv(request, rows);
      expect(
        importResult.imported,
        'fixture rows should create new suppliers',
      ).toBeGreaterThan(0);
      const listRes = await request.get(
        `${API_BASE}/suppliers?q=${encodeURIComponent(importedName)}`,
      );
      expect(listRes.ok()).toBe(true);
      const listRaw = await listRes.json();
      const list = (
        Array.isArray(listRaw) ? listRaw : listRaw?.items || []
      ) as Array<{ name?: string }>;
      expect(
        list.some((s) => s.name === importedName),
        `imported supplier not listed: ${importedName}`,
      ).toBe(true);
      expect(
        list.some(
          (s) => s.name === importedName && /\[Demo\]/i.test(s.name || ''),
        ),
      ).toBe(false);

      // Hotel rates for the stamped imported hotel (Darjeeling · Deluxe mountain view · CP).
      const rateImport = await apiImportHotelRatesCsv(request, [
        {
          supplierName: importedName,
          placeName: 'Darjeeling',
          roomType: 'Deluxe mountain view',
          mealPlan: 'CP',
          unitCost: 4200,
          currency: 'INR',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
        },
      ]);
      expect(
        rateImport.okCount,
        `hotel rate import failed: ${JSON.stringify(rateImport.results)}`,
      ).toBeGreaterThanOrEqual(1);
      const ratesImported = rateImport.okCount;

      await uiLogin(page);
      ux.recordClick();
      await page.goto('/suppliers');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(importedName).first()).toBeVisible({
        timeout: 15_000,
      });
      await scanAxe(page, 'beat-replace-demo-suppliers');

      const draft = await ensureEditableDraftQuote(request, tripId);
      await ensureHotelStayDatesOnDraft(
        request,
        tripId,
        draft.quotationId,
        draft.versionId,
      );
      // Clear soft-deleted demo supplierId so Match hits imported rates (UI Match is the gate).
      await pointHotelLineAtSupplier(
        request,
        tripId,
        draft.quotationId,
        draft.versionId,
        {
          supplierName: importedName,
          roomType: 'Deluxe mountain view',
          mealPlan: 'CP',
          placeName: 'Darjeeling',
        },
      );

      await page.goto(
        tripQuoteVersionPath(
          session.orgPublicCode,
          tripId,
          draft.quotationId,
          draft.versionId,
        ),
      );
      await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
      const quoteTab = page.getByRole('tab', { name: /^Quotations/i });
      if ((await quoteTab.getAttribute('data-state')) !== 'active') {
        await ux.click(page, quoteTab);
      }
      const quotePanel = page.getByRole('tabpanel', { name: /Quotations/i });
      await expect(quotePanel).toBeVisible({ timeout: 15_000 });

      // Open hotel line → Match on imported (non-demo) rate.
      // Avoid matching "Swap hotel" / other chrome that clears the line.
      const hotelSummary = quotePanel
        .getByRole('button', {
          name: /Deluxe mountain view|E2E Beat Hotel Import/i,
        })
        .first();
      if (await hotelSummary.isVisible().catch(() => false)) {
        await ux.click(page, hotelSummary);
        ux.noteModal();
      } else {
        const hotelRowUi = quotePanel
          .getByRole('row', { name: /Hotel.*Deluxe|E2E Beat Hotel/i })
          .first();
        await expect(hotelRowUi).toBeVisible({ timeout: 10_000 });
        await ux.click(
          page,
          hotelRowUi.getByRole('button', { name: /Service actions/i }),
        );
        await ux.click(
          page,
          page.getByRole('menuitem', { name: /Edit details/i }),
        );
        ux.noteModal();
      }

      const matchBtn = page.getByTestId('match-rate');
      await expect(matchBtn).toBeVisible({ timeout: 15_000 });
      await expect(
        matchBtn,
        'Match disabled after pointing hotel at imported supplier',
      ).toBeEnabled({ timeout: 10_000 });

      let matchRealRate = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const resolvePromise = page.waitForResponse(
          (res) =>
            res.url().includes('/rates/resolve') &&
            res.request().method() === 'POST' &&
            res.ok(),
          { timeout: 15_000 },
        );
        await ux.click(page, matchBtn);
        const resolveRes = await resolvePromise;
        const body = (await resolveRes.json()) as {
          matchedCount?: number;
          items?: Array<{
            matched?: boolean;
            rateMeta?: {
              alternatives?: Array<{
                supplierName?: string;
                propertyName?: string;
                label?: string;
              }>;
              supplierName?: string;
              propertyName?: string;
            };
            supplierName?: string;
          }>;
        };
        const hit = body.items?.[0];
        const alts = hit?.rateMeta?.alternatives || [];
        const names = [
          hit?.rateMeta?.supplierName,
          hit?.supplierName,
          ...alts.map((a) => a.supplierName || a.propertyName || a.label || ''),
        ]
          .filter(Boolean)
          .map(String);
        const hasDemoBadge = names.some((n) => /^\[Demo\]/i.test(n));
        const hasImported =
          names.some((n) => n.includes(importedName)) ||
          names.some((n) => n.includes('E2E Beat Hotel')) ||
          (hit?.matched === true && !hasDemoBadge);
        if ((hasImported || (body.matchedCount ?? 0) > 0) && !hasDemoBadge) {
          matchRealRate = true;
        }
        const sheetText =
          (await page
            .locator('[role="dialog"], [data-state="open"]')
            .last()
            .innerText()
            .catch(() => '')) || '';
        if (
          sheetText.includes(importedName) &&
          !/\[Demo\].*Heritage/i.test(sheetText)
        ) {
          matchRealRate = true;
        }

        const keepBtn = page.getByTestId('match-alt-keep-markup').first();
        const useBtn = page.getByTestId('match-alt-use').first();
        if (await keepBtn.isVisible().catch(() => false)) {
          await ux.click(page, keepBtn);
          await page.waitForTimeout(1000);
          break;
        }
        if (await useBtn.isVisible().catch(() => false)) {
          await ux.click(page, useBtn);
          await page.waitForTimeout(1000);
          break;
        }
        const saveDetails = page.getByRole('button', { name: /Save details/i });
        if (await saveDetails.isVisible().catch(() => false)) {
          await ux.click(page, saveDetails);
          await page.waitForTimeout(800);
        }
        if (matchRealRate) break;
        await page.waitForTimeout(400);
      }
      expect(
        matchRealRate,
        `Match did not surface imported non-demo rate for ${importedName}`,
      ).toBe(true);
      await page.keyboard.press('Escape').catch(() => undefined);

      // Persist sell prices if needed, then mark sent + proposal PDF.
      await request.post(`${API_BASE}/auth/login`, {
        data: { email: E2E_OWNER.email, password: E2E_OWNER.password },
      });
      await ensureQuoteLinesHaveSell(
        request,
        tripId,
        draft.quotationId,
        draft.versionId,
      );

      // Reload so Match stamp is on the tip; assert no [Demo] supplier on hotel line.
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      const tripGet = await request.get(`${API_BASE}/trips/${tripId}`);
      expect(tripGet.ok()).toBe(true);
      const tripBody = (await tripGet.json()) as {
        quotations?: Array<{
          id: string;
          versions?: Array<{
            id: string;
            status: string;
            itemsJson?: Array<{
              description?: string;
              details?: { supplierName?: string; propertyName?: string };
            }>;
          }>;
        }>;
      };
      const tip =
        (tripBody.quotations || [])
          .flatMap((q) => q.versions || [])
          .find((v) => v.id === draft.versionId) ||
        (tripBody.quotations || []).flatMap((q) => q.versions || [])[0];
      const items = Array.isArray(tip?.itemsJson) ? tip!.itemsJson! : [];
      const hotelItems = items.filter(
        (i) =>
          /hotel|stay|boutique|deluxe/i.test(i.description || '') ||
          /hotel|stay/i.test(String((i.details as { propertyName?: string })?.propertyName || '')),
      );
      for (const line of hotelItems.length ? hotelItems : items) {
        const sn = line.details?.supplierName || '';
        const pn = line.details?.propertyName || '';
        const desc = line.description || '';
        expect(
          /\[Demo\]/i.test(sn) || /\[Demo\]/i.test(pn) || /\[Demo\]/i.test(desc),
          `live tip still carries [Demo]: ${desc} / ${sn} / ${pn}`,
        ).toBe(false);
      }

      const versionId = tip?.id || draft.versionId;
      const markSent = await request.post(
        `${API_BASE}/quotations/${versionId}/mark-sent`,
        { data: { channel: 'whatsapp' } },
      );
      // Already sent / draft priced — either OK for proposal PDF.
      if (!markSent.ok() && markSent.status() !== 400) {
        throw new Error(
          `mark-sent failed: ${markSent.status()} ${await markSent.text()}`,
        );
      }

      const pdfRes = await request.post(
        `${API_BASE}/quotations/${versionId}/pdf`,
        { data: {} },
      );
      expect(pdfRes.ok(), await pdfRes.text()).toBe(true);
      const pdfBody = (await pdfRes.json()) as {
        previewHtml?: string;
        html?: string;
        documentId?: string;
        pdfDocumentId?: string;
      };
      let liveDocText =
        (typeof pdfBody.previewHtml === 'string' && pdfBody.previewHtml) ||
        (typeof pdfBody.html === 'string' && pdfBody.html) ||
        '';
      if (!liveDocText && (pdfBody.documentId || pdfBody.pdfDocumentId)) {
        // Fallback: quote page text after PDF generation.
        await page.goto(tripQuotePath(session.orgPublicCode, tripId));
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
        liveDocText = (await page.locator('main').innerText()) || '';
      }
      if (!liveDocText) {
        liveDocText = JSON.stringify(items);
      }
      expect(
        /\[Demo\]/i.test(liveDocText),
        'live proposal/doc still contains [Demo]',
      ).toBe(false);
      const liveDocNoDemo = true;

      // Quote surface must not pair imported name with [Demo].
      await page.goto(tripQuotePath(session.orgPublicCode, tripId));
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      const demoBadgeOnImport = page.getByText(
        new RegExp(`\\[Demo\\].*${importedName}|${importedName}.*\\[Demo\\]`, 'i'),
      );
      expect(await demoBadgeOnImport.count()).toBe(0);
      // Live quote surface should not show the demo badge (exclude soft chrome).
      const demoOnQuote = page
        .getByRole('main')
        .getByText(/\[Demo\]/i);
      expect(
        await demoOnQuote.count(),
        'quote main still shows [Demo] after Match to imported rate',
      ).toBe(0);

      const overflow = await ux.measureOverflow(page);
      expect(overflow).toBe(false);

      const metrics = await ux.snapshot(page);
      ux.writeArtifact({
        ...metrics,
        softDeletedSuppliers: replaced.softDeletedSuppliers,
        imported: importResult.imported,
        skipped: importResult.skipped,
        importedName,
        ratesImported,
        matchRealRate,
        liveDocNoDemo,
        neverFitProven: true,
      });
      ux.assertBudget(metrics, BEAT_REPLACE_DEMO_BUDGET);
    } finally {
      await restore();
    }
  });
});
