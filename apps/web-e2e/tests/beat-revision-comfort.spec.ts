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
  BEAT_REVISION_COMFORT_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Beat-Sembark: revision comfort — margin/tax Δ + hotel swap keeps dates.
 * Demo path — never FIT Proven.
 */
test.describe('beat-revision-comfort', () => {
  test('from-accepted draft shows revision margin delta within UX budget', async ({
    page,
    request,
  }) => {
    const ux = createUxMetrics('beat-revision-comfort');
    await ux.attach(page);

    const session = await ensureFitPackAndDemoTrip(request);
    expect(session.tripId).toBeTruthy();
    const tripId = session.tripId!;

    const draft = await ensureEditableDraftQuote(request, tripId);
    await ensureHotelStayDatesOnDraft(
      request,
      tripId,
      draft.quotationId,
      draft.versionId,
    );

    await uiLogin(page);
    ux.recordClick();

    await page.goto(
      tripQuoteVersionPath(
        session.orgPublicCode,
        tripId,
        draft.quotationId,
        draft.versionId,
      ),
    );
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await scanAxe(page, 'beat-revision-comfort');

    const quoteTab = page.getByRole('tab', { name: /^Quotations/i });
    if ((await quoteTab.getAttribute('data-state')) !== 'active') {
      await ux.click(page, quoteTab);
    }

    const deltaStrip = page.getByLabel('Revision margin delta');
    await expect(
      deltaStrip,
      'expected revision margin Δ on from-accepted / prior-baseline draft',
    ).toBeVisible({ timeout: 15_000 });

    // G2: sell + tax Δ visible even when cost/margin may be hidden for sales.
    const sellDelta = page.getByTestId('revision-delta-sell');
    const taxDelta = page.getByTestId('revision-delta-tax');
    await expect(sellDelta).toBeVisible({ timeout: 5_000 });
    await expect(taxDelta).toBeVisible({ timeout: 5_000 });
    await expect(sellDelta.getByText(/Sell/i)).toBeVisible();
    await expect(taxDelta.getByText(/Tax/i)).toBeVisible();
    const deltaSellTaxVisible = true;

    // Capture stay dates from the hotel sheet before Swap.
    const quotePanel = page.getByRole('tabpanel', { name: /Quotations/i });
    const hotelSummary = quotePanel
      .getByRole('button', {
        name: /Heritage boutique hotel|hotel|Deluxe|stay/i,
      })
      .first();
    if (await hotelSummary.isVisible().catch(() => false)) {
      await ux.click(page, hotelSummary);
      ux.noteModal();
    } else {
      const hotelRow = quotePanel
        .getByRole('row', { name: /Hotel|Heritage|boutique|stay/i })
        .first();
      await expect(hotelRow).toBeVisible({ timeout: 10_000 });
      await ux.click(
        page,
        hotelRow.getByRole('button', { name: /Service actions/i }),
      );
      await ux.click(page, page.getByRole('menuitem', { name: /Edit details/i }));
      ux.noteModal();
    }

    const checkInBefore = page.getByTestId('hotel-check-in');
    const checkOutBefore = page.getByTestId('hotel-check-out');
    await expect(checkInBefore).toBeVisible({ timeout: 10_000 });
    await expect(checkOutBefore).toBeVisible({ timeout: 5_000 });
    const checkInText = ((await checkInBefore.textContent()) || '').trim();
    const checkOutText = ((await checkOutBefore.textContent()) || '').trim();
    expect(checkInText.length, 'hotel check-in should be set before swap').toBeGreaterThan(4);
    expect(checkOutText.length, 'hotel check-out should be set before swap').toBeGreaterThan(4);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Swap hotel: clears property + rate, keeps stay dates, opens Match sheet.
    const swapHotel = page
      .getByTestId('fit-revise-swap_hotel')
      .or(page.getByRole('button', { name: /swap hotel/i }))
      .first();
    await expect(
      swapHotel,
      'Swap hotel revise chip should be available on from-accepted draft',
    ).toBeVisible({ timeout: 10_000 });
    await ux.click(page, swapHotel);
    ux.noteModal();
    await page.waitForTimeout(800);

    const checkInAfter = page.getByTestId('hotel-check-in');
    const checkOutAfter = page.getByTestId('hotel-check-out');
    await expect(checkInAfter).toBeVisible({ timeout: 10_000 });
    await expect(checkOutAfter).toBeVisible({ timeout: 5_000 });
    expect(
      ((await checkInAfter.textContent()) || '').trim(),
      'Swap hotel must keep check-in',
    ).toBe(checkInText);
    expect(
      ((await checkOutAfter.textContent()) || '').trim(),
      'Swap hotel must keep check-out',
    ).toBe(checkOutText);

    // Line flagged for rematch — Match control present (may need supplier/room
    // before enable; dates already kept above is the hard gate).
    const matchBtn = page.getByTestId('match-rate');
    await expect(
      matchBtn,
      'after swap, Match control should be present for a fresh property',
    ).toBeVisible({ timeout: 10_000 });
    const matchTitle = (await matchBtn.getAttribute('title')) || '';
    expect(
      matchTitle.length === 0 || /match|supplier|room|destination|property/i.test(matchTitle),
      `unexpected Match title after swap: ${matchTitle}`,
    ).toBe(true);

    const hotelSwapKeptDates = true;
    await page.keyboard.press('Escape');

    const changeDates = page
      .getByTestId('fit-revise-edit_dates')
      .or(page.getByRole('button', { name: /edit travel dates|change dates/i }))
      .first();
    if (await changeDates.isVisible().catch(() => false)) {
      await ux.click(page, changeDates);
      ux.noteModal();
      await page.keyboard.press('Escape');
    }

    // Soft: Resend still available if a sent tip exists (navigate optional).
    const resend = page.getByRole('button', { name: /resend latest/i }).first();
    const resendVisible = await resend.isVisible().catch(() => false);

    const overflow = await ux.measureOverflow(page);
    expect(overflow).toBe(false);

    const metrics = await ux.snapshot(page);
    ux.writeArtifact({
      ...metrics,
      marginDeltaVisible: true,
      deltaSellTaxVisible,
      hotelSwapKeptDates,
      lockedStatus: draft.status,
      resendVisible,
      fromAcceptedDraft: true,
      neverFitProven: true,
    });
    ux.assertBudget(metrics, BEAT_REVISION_COMFORT_BUDGET);
  });
});
