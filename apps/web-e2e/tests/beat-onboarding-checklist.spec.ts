import { test, expect } from '@playwright/test';
import {
  API_BASE,
  E2E_OWNER,
  ensureFitPackAndDemoTrip,
  uiLoginOwner,
} from '../helpers/auth';
import {
  apiGetOnboardingStatus,
  apiImportHotelRatesCsv,
  apiImportSuppliersCsv,
  apiImportTransferFaresCsv,
  apiReplaceDemoOperate,
  apiRestoreDemoOperatePack,
} from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  BEAT_ONBOARDING_CHECKLIST_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Beat: Dashboard dual-track checklist + Operate-ready on imported H/T
 * without reinstalling demo. Never FIT Proven / Market-proven.
 */
test.describe('beat-onboarding-checklist', () => {
  test('checklist scores + imported H/T Operate gates within UX budget', async ({
    page,
    request,
  }) => {
    const ux = createUxMetrics('beat-onboarding-checklist');
    await ux.attach(page);

    await ensureFitPackAndDemoTrip(request);

    let restored = false;
    const restore = async () => {
      if (restored) return;
      restored = true;
      await apiRestoreDemoOperatePack(request);
    };

    try {
      // Soft-archive demo operate so checklist stays visible (hideWhenComplete).
      const replaced = await apiReplaceDemoOperate(request);
      expect(replaced.softDeletedSuppliers).toBeGreaterThan(0);

      const statusBeforeImport = await apiGetOnboardingStatus(request);
      expect(statusBeforeImport.quoteReady).toBeTruthy();
      expect(statusBeforeImport.operateReady).toBeTruthy();

      await uiLoginOwner(page);
      ux.recordClick();
      await page.evaluate(() => {
        try {
          localStorage.setItem(
            'travel.onboarding.checklistDismissed',
            JSON.stringify({ v: 1, data: false }),
          );
        } catch {
          /* ignore */
        }
      });
      // Owner home shows AgencyOnboardingChecklist (business_health / owner workspace).
      await page.goto('/?workspace=owner');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

      const checklist = page.getByTestId('agency-onboarding-checklist');
      await expect(
        checklist,
        'owner dashboard checklist / readiness strip required',
      ).toBeVisible({ timeout: 20_000 });
      await scanAxe(page, 'beat-onboarding-checklist');

      const quoteScoreUi = Number(
        (
          await page.getByTestId('onboarding-quote-ready-score').innerText()
        ).replace(/%/g, ''),
      );
      const operateScoreUi = Number(
        (
          await page.getByTestId('onboarding-operate-ready-score').innerText()
        ).replace(/%/g, ''),
      );
      expect(quoteScoreUi).toBe(statusBeforeImport.quoteReady!.scorePercent);
      expect(operateScoreUi).toBe(statusBeforeImport.operateReady!.scorePercent);

      await expect(page.getByTestId('onboarding-demo-vs-real-cue')).toBeVisible();
      await expect(page.getByText('Quote-ready', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('Operate-ready', { exact: false }).first()).toBeVisible();

      const openDemo = page.getByTestId('onboarding-open-demo-trip');
      const installFit = page.getByTestId('onboarding-install-fit-pack');
      if (await openDemo.isVisible().catch(() => false)) {
        await ux.click(page, openDemo);
      } else if (await installFit.isVisible().catch(() => false)) {
        await ux.click(page, installFit);
      }
      await page.waitForTimeout(800);

      // Honesty cue on Settings → About while demo pack still absent (post-Replace).
      // Reinstall briefly only to surface Replace panel cue, then re-Replace for import path.
      await apiRestoreDemoOperatePack(request);
      await page.goto('/settings?section=about');
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
      const honestyCue = page.getByTestId('demo-operate-honesty-cue');
      if (await honestyCue.isVisible().catch(() => false)) {
        await expect(honestyCue).toContainText(/real-agency Operate-ready/i);
      }
      await apiReplaceDemoOperate(request);

      const stamp = Date.now().toString(36);
      const hotelName = `E2E Onb Hotel ${stamp}`;
      const transferName = `E2E Onb Transfer ${stamp}`;
      const importResult = await apiImportSuppliersCsv(request, [
        {
          name: hotelName,
          type: 'hotel',
          email: `e2e.onb.hotel+${stamp}@import.wayrune.test`,
          phone: '+919900009911',
        },
        {
          name: transferName,
          type: 'car_rental',
          email: `e2e.onb.xfer+${stamp}@import.wayrune.test`,
          phone: '+919900009912',
        },
      ]);
      expect(importResult.imported).toBeGreaterThanOrEqual(2);

      const hotelRates = await apiImportHotelRatesCsv(request, [
        {
          supplierName: hotelName,
          placeName: 'Darjeeling',
          roomType: 'Deluxe mountain view',
          mealPlan: 'CP',
          unitCost: 4100,
          currency: 'INR',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
        },
      ]);
      expect(
        hotelRates.okCount,
        `hotel rate import: ${JSON.stringify(hotelRates.results)}`,
      ).toBeGreaterThanOrEqual(1);

      const transferFares = await apiImportTransferFaresCsv(request, [
        {
          supplierName: transferName,
          fromPlace: 'Darjeeling',
          toPlace: 'Kalimpong',
          vehicleType: 'Hatchback / Sedan',
          unitCost: 3200,
          currency: 'INR',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
        },
      ]);
      expect(
        transferFares.okCount,
        `transfer fare import: ${JSON.stringify(transferFares.results)}`,
      ).toBeGreaterThanOrEqual(1);

      const statusAfter = await apiGetOnboardingStatus(request);
      const operateItems = statusAfter.operateReady?.items || [];
      const done = (key: string) =>
        operateItems.find((i) => i.key === key)?.done === true;
      expect(done('hotel_supplier'), 'hotel contact-complete after import').toBe(
        true,
      );
      expect(
        done('transfer_supplier'),
        'transfer contact-complete after import',
      ).toBe(true);
      expect(done('hotel_rate'), 'hotel rate after import').toBe(true);
      expect(done('transfer_rate'), 'transfer fare after import').toBe(true);

      // Real-agency Operate path: do not reinstall demo before asserting gates.
      await request.post(`${API_BASE}/auth/login`, {
        data: { email: E2E_OWNER.email, password: E2E_OWNER.password },
      });
      const org = await request.get(`${API_BASE}/organizations/current`);
      expect(org.ok()).toBe(true);
      const orgBody = (await org.json()) as {
        settingsJson?: { demoOperatePack?: unknown };
      };
      expect(
        orgBody.settingsJson?.demoOperatePack,
        'demo operate pack must stay cleared while proving imported Operate gates',
      ).toBeFalsy();

      const overflow = await ux.measureOverflow(page);
      expect(overflow).toBe(false);

      const metrics = await ux.snapshot(page);
      ux.writeArtifact({
        ...metrics,
        checklistVisible: true,
        quoteReadyScore: statusAfter.quoteReady?.scorePercent ?? quoteScoreUi,
        operateReadyScore:
          statusAfter.operateReady?.scorePercent ?? operateScoreUi,
        importedHotelTransfer: true,
        hotelRateOk: hotelRates.okCount >= 1,
        transferFareOk: transferFares.okCount >= 1,
        operateHotelTransferGates: true,
        demoPackClearedDuringAssert: true,
        neverFitProven: true,
      });
      ux.assertBudget(metrics, BEAT_ONBOARDING_CHECKLIST_BUDGET);
    } finally {
      await restore();
    }
  });
});
