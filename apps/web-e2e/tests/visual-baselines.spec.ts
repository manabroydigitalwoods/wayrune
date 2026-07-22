import { test, expect } from '@playwright/test';
import {
  ensureFitPackAndDemoTrip,
  tripQuotePath,
  uiLogin,
  E2E_USER,
} from '../helpers/auth';

/**
 * Phase 2 visual baselines — short commercial allowlist.
 * Opt-in: E2E_VISUAL=1 pnpm --filter @wayrune/web-e2e test:e2e
 * Update: E2E_VISUAL=1 pnpm --filter @wayrune/web-e2e test:e2e:update-snapshots
 */
const runVisual = process.env.E2E_VISUAL === '1';

test.describe('visual baselines', () => {
  test.skip(!runVisual, 'Set E2E_VISUAL=1 to run screenshot baselines');

  test.beforeEach(async ({ page, request }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('travel.ui.theme', 'light');
      window.localStorage.setItem('travel.ui.density', 'compact');
      window.localStorage.setItem('travel.ui.fontScale', 'default');
      window.localStorage.setItem('travel.ui.motion', 'allow');
      document.documentElement.dataset.density = 'compact';
      document.documentElement.dataset.fontScale = 'default';
      document.documentElement.dataset.motion = 'allow';
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    });
    await ensureFitPackAndDemoTrip(request);
    await uiLogin(page);
  });

  test('owner dashboard', async ({ page }) => {
    // salesexec lands on sales home; still a commercially important shell.
    await page.goto('/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page).toHaveScreenshot('owner-dashboard.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('trip quotations editor', async ({ page, request }) => {
    const session = await ensureFitPackAndDemoTrip(request);
    await page.goto(tripQuotePath(session.orgPublicCode, session.tripId!));
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page).toHaveScreenshot('quotation-editor.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('enquiry intake list', async ({ page }) => {
    await page.goto('/inquiries');
    // May redirect under org prefix — wait for main.
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveScreenshot('enquiry-intake.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('login screen (unauthenticated)', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login');
    await expect(page.getByTestId('login-submit')).toBeVisible();
    // Mask demo credentials fields for stable/privacy-safe snapshot.
    await expect(page).toHaveScreenshot('login.png', {
      maxDiffPixelRatio: 0.02,
      mask: [page.getByPlaceholder('Email'), page.getByPlaceholder('Password')],
    });
  });
});

// Silence unused in skip paths
void E2E_USER;
