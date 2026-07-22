import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isCi = !!process.env.CI;
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const apiPublic = process.env.API_PUBLIC_URL || 'http://localhost:3001';

/**
 * UX dogfood e2e — Agency Competitive Validation Phase 1.
 * Prefer reuseExistingServer locally (pnpm dev). CI starts API + Vite.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'e2e-results/playwright-report.json' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: isCi
    ? [
        {
          command: 'pnpm --filter @wayrune/api start',
          cwd: root,
          url: `${apiPublic}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...process.env,
            APP_ENV: process.env.APP_ENV || 'local',
          },
        },
        {
          command: 'pnpm --filter @wayrune/web exec vite --host 127.0.0.1 --port 5173',
          cwd: root,
          url: webOrigin,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            ...process.env,
            APP_ENV: 'local',
            VITE_APP_ENV: 'local',
          },
        },
      ]
    : undefined,
});
