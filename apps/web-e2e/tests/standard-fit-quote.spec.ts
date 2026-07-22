import { test, expect } from '@playwright/test';
import {
  ensureFitPackAndDemoTrip,
  tripQuoteVersionPath,
  uiLogin,
} from '../helpers/auth';
import {
  ensureEditableDraftQuote,
  ensureHotelStayDatesOnDraft,
} from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  STANDARD_FIT_QUOTE_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Standard FIT quote UX journey (Agency Competitive Validation).
 * Start: editable draft tip (from-accepted if needed).
 * End: Send reachable even while Match sheet was open (A1 / G1).
 * Demo/seed timings never count toward public FIT Proven.
 *
 * Axe: soft evidence by default; E2E_AXE_STRICT=1 fails on serious/critical.
 */
test.describe('standard-fit-quote', () => {
  test('login → quote tab → Match → review → Send control within UX budget', async ({
    page,
    request,
  }) => {
    const ux = createUxMetrics('standard-fit-quote');
    await ux.attach(page);
    const axeScans: Awaited<ReturnType<typeof scanAxe>>[] = [];

    const session = await ensureFitPackAndDemoTrip(request);
    expect(session.tripId).toBeTruthy();
    const draft = await ensureEditableDraftQuote(request, session.tripId!);
    await ensureHotelStayDatesOnDraft(
      request,
      session.tripId!,
      draft.quotationId,
      draft.versionId,
    );

    await uiLogin(page);
    ux.recordClick();

    axeScans.push(await scanAxe(page, 'post-login-home'));

    await page.goto(
      tripQuoteVersionPath(
        session.orgPublicCode,
        session.tripId!,
        draft.quotationId,
        draft.versionId,
      ),
    );
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

    axeScans.push(await scanAxe(page, 'trip-overview-quotations'));

    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    if (process.env.E2E_ARIA_SNAPSHOT === '1') {
      await expect(main).toMatchAriaSnapshot(`
        - main
      `);
    }

    const quoteTab = page.getByRole('tab', { name: /^Quotations/i });
    if ((await quoteTab.getAttribute('data-state')) !== 'active') {
      await ux.click(page, quoteTab);
    }
    const quotePanel = page.getByRole('tabpanel', { name: /Quotations/i });

    if (await page.getByTestId('use-template').isVisible().catch(() => false)) {
      await ux.click(page, page.getByTestId('use-template'));
      ux.noteModal();
      const apply = page
        .getByRole('button', { name: /apply|use this|select/i })
        .first();
      if (await apply.isVisible().catch(() => false)) {
        await ux.click(page, apply);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    const hotelSummary = quotePanel
      .getByRole('button', {
        name: /Heritage boutique hotel|hotel|Deluxe mountain/i,
      })
      .first();
    if (await hotelSummary.isVisible().catch(() => false)) {
      await ux.click(page, hotelSummary);
      ux.noteModal();
    } else {
      const lineOpen = quotePanel
        .getByRole('button', { name: /edit|details|hotel|transfer/i })
        .first();
      if (await lineOpen.isVisible().catch(() => false)) {
        await ux.click(page, lineOpen);
        ux.noteModal();
      }
    }

    const matchBtn = page.getByTestId('match-rate');
    const sheetOpen = await matchBtn.isVisible().catch(() => false);
    if (sheetOpen) {
      axeScans.push(await scanAxe(page, 'match-drawer'));
      if (await matchBtn.isEnabled()) {
        await ux.click(page, matchBtn);
        await page.waitForTimeout(1500);
      }
      await page.screenshot({
        path: 'e2e-results/screenshots/fit-match-drawer.png',
        fullPage: false,
      });

      // A1 / spine clarity: Send while Match open — opens send flow when ready,
      // otherwise focuses Send readiness (no longer a dead disabled button).
      const sendWhileOpen = page.getByTestId('quote-send');
      await expect(sendWhileOpen).toBeAttached({ timeout: 10_000 });
      await sendWhileOpen.click({ force: true });
      ux.recordClick();
      const sendDialog = page.getByRole('heading', { name: /Send quotation/i });
      const blocked = page.getByTestId('quote-send-blocked');
      const readiness = page.locator('#quote-send-readiness');
      const openedSend = await sendDialog.isVisible().catch(() => false);
      if (openedSend) {
        ux.noteModal();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else if (await blocked.isVisible().catch(() => false)) {
        await expect(blocked).toBeVisible();
      } else {
        await expect(readiness).toBeVisible({ timeout: 5_000 });
      }
      if (await page.getByTestId('match-rate').isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
      }
    }

    axeScans.push(await scanAxe(page, 'quote-review'));

    const send = page.getByTestId('quote-send');
    await expect(send).toBeVisible({ timeout: 20_000 });

    if (await send.isEnabled()) {
      await ux.click(page, send);
      const sendDialog = page.getByRole('heading', { name: /Send quotation/i });
      const blocked = page.getByTestId('quote-send-blocked');
      if (await sendDialog.isVisible().catch(() => false)) {
        ux.noteModal();
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
      } else if (await blocked.isVisible().catch(() => false)) {
        await expect(blocked).toBeVisible();
      }
    }

    const overflow = await ux.measureOverflow(page);
    expect(overflow, 'horizontal overflow at 1280×720').toBe(false);

    const metrics = await ux.snapshot(page);
    const artifact = {
      ...metrics,
      axeScans,
      axeSeriousTotal: axeScans.reduce((n, s) => n + s.serious, 0),
      axeCriticalTotal: axeScans.reduce((n, s) => n + s.critical, 0),
      sendWhileMatchOpen: sheetOpen,
    };
    ux.writeArtifact(artifact as typeof metrics);
    // eslint-disable-next-line no-console
    console.log('[ux-metrics]', JSON.stringify(artifact));
    ux.assertBudget(metrics, STANDARD_FIT_QUOTE_BUDGET);
  });
});
