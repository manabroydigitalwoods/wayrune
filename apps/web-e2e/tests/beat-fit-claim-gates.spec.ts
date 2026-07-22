import { test, expect } from '@playwright/test';
import {
  API_BASE,
  E2E_PILOT_OWNER,
  usePilotStagingCredentials,
} from '../helpers/auth';
import { createUxMetrics } from '../helpers/uxMetrics';

/**
 * Phase 2 — FIT public speed baseline (2.1 train surface + 2.2 monitor).
 * Never invents samples or flips FIT Proven / Market-proven.
 */
test.describe('beat-fit-claim-gates', () => {
  test('pilot-staging claim gates baseline + FIT dogfood kit', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    usePilotStagingCredentials();

    const ux = createUxMetrics('beat-fit-claim-gates');
    await ux.attach(page);

    const login = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: E2E_PILOT_OWNER.email,
        password: E2E_PILOT_OWNER.password,
      },
    });
    expect(login.ok(), await login.text()).toBe(true);

    const meRes = await request.get(`${API_BASE}/auth/me`);
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as {
      organization: { slug?: string; name?: string };
    };
    expect(me.organization.slug || '').toBe('pilot-staging');

    const gatesRes = await request.get(`${API_BASE}/dashboard/claim-gates`);
    expect(gatesRes.ok(), await gatesRes.text()).toBe(true);
    const gates = (await gatesRes.json()) as {
      fitClaimProtocol: {
        sampleSize: number;
        demoSampleSize: number;
        medianMinutes: number | null;
        publicClaimAllowed: boolean;
        claimStatus: string;
        minSampleSize: number;
        targetMinutes: number;
      };
      fitOpsChecklist: string[];
      registryStatus: string;
      parityDogfoodKit?: {
        fitCaptureSteps: string[];
      };
    };

    const fit = gates.fitClaimProtocol;
    expect(fit.publicClaimAllowed).toBe(false);
    expect(fit.claimStatus).toBe('testing');
    expect(gates.registryStatus).toBe('testing');
    expect(fit.minSampleSize).toBeGreaterThanOrEqual(20);
    expect(fit.targetMinutes).toBeLessThanOrEqual(3);
    expect(gates.fitOpsChecklist.length).toBeGreaterThan(0);
    expect(gates.parityDogfoodKit?.fitCaptureSteps?.length ?? 0).toBeGreaterThan(
      0,
    );

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(E2E_PILOT_OWNER.email);
    await page.getByPlaceholder('Password').fill(E2E_PILOT_OWNER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

    await page.goto('/settings?section=about');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: /Marketing claim gates/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/FIT dogfood kit/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/Registry stays Testing until product sign-off/i),
    ).toBeVisible();
    // Progress copy: 0/20 real on clean pilot-staging
    await expect(
      page.getByText(
        new RegExp(`${fit.sampleSize}\\s*/\\s*${fit.minSampleSize}\\s*real`, 'i'),
      ),
    ).toBeVisible();

    const base = await ux.snapshot(page);
    const artifact = {
      ...base,
      journey: 'beat-fit-claim-gates',
      orgSlug: 'pilot-staging',
      orgName: me.organization.name || 'North India Tours',
      mode: 'phase2_baseline',
      sampleSize: fit.sampleSize,
      demoSampleSize: fit.demoSampleSize,
      medianMinutes: fit.medianMinutes,
      publicClaimAllowed: fit.publicClaimAllowed,
      claimStatus: fit.claimStatus,
      registryStatus: gates.registryStatus,
      minSampleSize: fit.minSampleSize,
      targetMinutes: fit.targetMinutes,
      remaining:
        Math.max(0, fit.minSampleSize - Math.max(0, fit.sampleSize)),
      fitOpsChecklistCount: gates.fitOpsChecklist.length,
      fitCaptureStepsCount: gates.parityDogfoodKit?.fitCaptureSteps?.length ?? 0,
      neverFitProven: true,
      neverMarketProven: true,
      claimNote:
        'Phase 2 W0 baseline — publicClaimAllowed false; do not invent FIT Proven',
    };
    ux.writeArtifact(artifact);

    expect(artifact.publicClaimAllowed).toBe(false);
    expect(artifact.neverFitProven).toBe(true);
  });
});
