import { test, expect } from '@playwright/test';
import {
  ensureFitPackAndDemoTrip,
  tripQuoteVersionPath,
  uiLogin,
} from '../helpers/auth';
import {
  ensureEditableDraftQuote,
  ensureHotelStayDatesOnDraft,
  ensureSecondDemoHotelAlt,
} from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  BEAT_MATCH_KEEP_MARKUP_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Beat-Sembark: Match Use (keep markup) preserves line markup %.
 * Demo/seed path — never FIT Proven.
 */
test.describe('beat-match-keep-markup', () => {
  test('Use (keep markup) preserves markup percent', async ({
    page,
    request,
  }) => {
    const ux = createUxMetrics('beat-match-keep-markup');
    await ux.attach(page);

    const session = await ensureFitPackAndDemoTrip(request);
    expect(session.tripId).toBeTruthy();
    await ensureSecondDemoHotelAlt(request);
    const draft = await ensureEditableDraftQuote(request, session.tripId!);
    await ensureHotelStayDatesOnDraft(
      request,
      session.tripId!,
      draft.quotationId,
      draft.versionId,
    );

    await uiLogin(page);
    ux.recordClick();

    await page.goto(
      tripQuoteVersionPath(
        session.orgPublicCode,
        session.tripId!,
        draft.quotationId,
        draft.versionId,
      ),
    );
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

    const quoteTab = page.getByRole('tab', { name: /^Quotations/i });
    await expect(quoteTab).toBeVisible({ timeout: 15_000 });
    if ((await quoteTab.getAttribute('data-state')) !== 'active') {
      await ux.click(page, quoteTab);
    }
    const quotePanel = page.getByRole('tabpanel', { name: /Quotations/i });
    await expect(quotePanel).toBeVisible({ timeout: 15_000 });
    await scanAxe(page, 'beat-match-keep-markup');

    const hotelSummary = quotePanel
      .getByRole('button', {
        name: /Heritage boutique hotel · Deluxe mountain view/i,
      })
      .first();
    if (await hotelSummary.isVisible().catch(() => false)) {
      await ux.click(page, hotelSummary);
      ux.noteModal();
      await page.waitForTimeout(500);
    } else {
      const hotelRow = quotePanel
        .getByRole('row', { name: /Hotel.*mountain view|Heritage boutique/i })
        .first();
      await expect(hotelRow).toBeVisible({ timeout: 10_000 });
      await ux.click(
        page,
        hotelRow.getByRole('button', { name: /Service actions/i }),
      );
      await ux.click(page, page.getByRole('menuitem', { name: /Edit details/i }));
      ux.noteModal();
      await page.waitForTimeout(500);
    }

    await ensureSecondDemoHotelAlt(request);

    const matchBtn = page.getByTestId('match-rate');
    await expect(matchBtn).toBeVisible({ timeout: 15_000 });
    await expect(matchBtn).toBeEnabled({ timeout: 10_000 });

    const markupInput = page.getByTestId('line-markup-value');
    await expect(markupInput).toBeVisible({ timeout: 5_000 });
    const stampedBeforeMatch = Number(await markupInput.inputValue());

    const keepBtn = page.getByTestId('match-alt-keep-markup').first();
    const altsPanel = page.getByTestId('match-alts');
    let sawAlts = false;
    let matchAltsVisible = false;
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
        items?: Array<{ rateMeta?: { alternatives?: unknown[] } }>;
      };
      const altCount = Array.isArray(body.items?.[0]?.rateMeta?.alternatives)
        ? body.items![0]!.rateMeta!.alternatives!.length
        : 0;
      if (altCount > 0) {
        sawAlts = true;
        if (await altsPanel.isVisible().catch(() => false)) {
          matchAltsVisible = true;
          await expect(altsPanel.getByText(/Other eligible rates/i)).toBeVisible();
        }
        if (await keepBtn.isVisible().catch(() => false)) break;
        await page.waitForTimeout(300);
        if (await keepBtn.isVisible().catch(() => false)) {
          if (await altsPanel.isVisible().catch(() => false)) {
            matchAltsVisible = true;
          }
          break;
        }
      }
      await ensureSecondDemoHotelAlt(request);
    }

    expect(sawAlts, 'rates/resolve never returned alternatives').toBe(true);
    await expect(
      keepBtn,
      'Use (keep markup) not painted before auto rematch cleared alts',
    ).toBeVisible({ timeout: 1_500 });
    await expect(
      page.getByTestId('match-alts'),
      'Match alt chips / Other eligible rates must be visible before keep-markup',
    ).toBeVisible({ timeout: 1_500 });
    matchAltsVisible = true;

    const stamped = Number(await markupInput.inputValue());
    expect(Number.isFinite(stamped)).toBe(true);
    await ux.click(page, keepBtn);
    await page.waitForTimeout(1200);

    const after = Number(await markupInput.inputValue());
    expect(
      after,
      `keep markup should preserve ${stamped} (pre-match ${stampedBeforeMatch})`,
    ).toBe(stamped);

    const overflow = await ux.measureOverflow(page);
    expect(overflow).toBe(false);

    const metrics = await ux.snapshot(page);
    ux.writeArtifact({
      ...metrics,
      markupBefore: stamped,
      markupAfter: after,
      matchAltsVisible,
      neverFitProven: true,
    });
    ux.assertBudget(metrics, BEAT_MATCH_KEEP_MARKUP_BUDGET);
  });
});
