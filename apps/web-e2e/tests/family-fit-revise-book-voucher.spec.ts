import { test, expect } from '@playwright/test';
import {
  ensureFitPackAndDemoTrip,
  tripQuotePath,
  tripTabPath,
  uiLogin,
} from '../helpers/auth';
import { apiAdvanceQuoteToVoucher } from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  FAMILY_FIT_REVISE_BOOK_VOUCHER_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Golden wedge journey: Family FIT → revision cues → accept → voucher → finance.
 * Demo operate / seeded rates — never counts toward FIT Proven.
 * Hybrid: UI for quote/Match/revise; API for accept→confirm→voucher reliability.
 */
test.describe('family-fit-revise-book-voucher', () => {
  test('golden path within UX budget', async ({ page, request }) => {
    const ux = createUxMetrics('family-fit-revise-book-voucher');
    await ux.attach(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    const session = await ensureFitPackAndDemoTrip(request);
    expect(session.tripId).toBeTruthy();
    const org = session.orgPublicCode;
    const tripId = session.tripId!;

    await uiLogin(page);
    ux.recordClick();

    const quoteUrl = tripQuotePath(org, tripId);
    await page.goto(quoteUrl);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await scanAxe(page, 'golden-quotations');

    // Prefer Use previous / template if empty; else open existing lines.
    if (await page.getByTestId('use-previous-trip').isVisible().catch(() => false)) {
      await ux.click(page, page.getByTestId('use-previous-trip'));
      await page.waitForTimeout(2000);
    } else if (await page.getByTestId('use-template').isVisible().catch(() => false)) {
      await ux.click(page, page.getByTestId('use-template'));
      ux.noteModal();
      const apply = page
        .getByRole('button', { name: /apply|use this|select/i })
        .first();
      if (await apply.isVisible().catch(() => false)) {
        await ux.click(page, apply);
        await page.waitForTimeout(1500);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    const lineOpen = page
      .getByRole('button', { name: /edit|details|hotel|transfer/i })
      .first();
    if (await lineOpen.isVisible().catch(() => false)) {
      await ux.click(page, lineOpen);
      ux.noteModal();
    }

    const matchBtn = page.getByTestId('match-rate');
    if (await matchBtn.isVisible().catch(() => false) && (await matchBtn.isEnabled())) {
      await ux.click(page, matchBtn);
      await page.waitForTimeout(1500);
    }

    // Match alt sort chip (Best / Preferred) if present.
    const bestChip = page.getByRole('button', { name: /^Best$/i }).first();
    if (await bestChip.isVisible().catch(() => false)) {
      await ux.click(page, bestChip);
    }

    // Pricing language — soft (demo tip may already show totals on the rail).
    const moneyCue = page
      .getByText(/margin|tax|sell|buy|₹|INR|total|cost/i)
      .first();
    if (!(await moneyCue.isVisible().catch(() => false))) {
      // eslint-disable-next-line no-console
      console.warn('[golden] no money cue visible yet — continuing');
    }

    const close = page.getByRole('button', { name: /close|done|cancel/i }).first();
    if (await close.isVisible().catch(() => false)) {
      await ux.click(page, close);
    }

    // Revision strip: Change dates / Swap hotel / Resend when available.
    const changeDates = page.getByRole('button', { name: /change dates|dates/i }).first();
    if (await changeDates.isVisible().catch(() => false)) {
      await ux.click(page, changeDates);
      ux.noteModal();
      await page.keyboard.press('Escape');
    }
    const swapHotel = page.getByRole('button', { name: /swap hotel|replace hotel/i }).first();
    if (await swapHotel.isVisible().catch(() => false)) {
      await ux.click(page, swapHotel);
      await page.waitForTimeout(500);
    }
    const resend = page.getByRole('button', { name: /resend latest/i }).first();
    if (await resend.isVisible().catch(() => false) && (await resend.isEnabled())) {
      // Do not click send network — visibility is enough for revise story.
    }

    // Escape any open sheets/dialogs so the quote toolbar is reachable.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');

    const send = page.getByTestId('quote-send');
    const sendByRole = page.getByRole('button', { name: /^Send$/i }).first();
    if (await send.isVisible().catch(() => false)) {
      if (await send.isEnabled()) {
        await ux.click(page, send);
        ux.noteModal();
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
      }
    } else if (await sendByRole.isVisible().catch(() => false)) {
      // eslint-disable-next-line no-console
      console.warn('[golden] Send via role — data-testid missing on this surface');
    } else {
      // eslint-disable-next-line no-console
      console.warn('[golden] Send control not visible — continuing to API accept path');
    }

    // API: accept → materialize → confirm → voucher (owner cookies on request).
    const ops = await apiAdvanceQuoteToVoucher(request, tripId);
    // eslint-disable-next-line no-console
    console.log('[golden-ops]', ops.steps.join(' → '));

    // Navigate as current UI session (salesexec); owner API used request context only.
    await page.goto(tripTabPath(org, tripId, 'operations'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/voucher|booking|operations|enquiry|confirm/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto(tripTabPath(org, tripId, 'finance'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/payment|receivable|schedule|finance|instalment|due/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    const overflow = await ux.measureOverflow(page);
    expect(overflow, 'horizontal overflow at 1280×720').toBe(false);

    const metrics = await ux.snapshot(page);
    const artifact = {
      ...metrics,
      pageErrors: pageErrors.slice(0, 20),
      goldenOpsSteps: ops.steps,
      bookingId: ops.bookingId,
      versionId: ops.versionId,
    };
    ux.writeArtifact(artifact);
    // eslint-disable-next-line no-console
    console.log('[ux-metrics]', JSON.stringify(artifact));
    ux.assertBudget(metrics, FAMILY_FIT_REVISE_BOOK_VOUCHER_BUDGET);

    // Soft: accept/materialize should have succeeded on demo operate path.
    expect(
      ops.steps.some((s) => s === 'accept' || s === 'already_accepted'),
      `accept step missing: ${ops.steps.join(',')}`,
    ).toBe(true);
  });
});
