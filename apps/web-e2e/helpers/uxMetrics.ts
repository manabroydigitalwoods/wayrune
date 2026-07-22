import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export type UxJourneyMetrics = {
  journey: string;
  durationSeconds: number;
  clicks: number;
  pageTransitions: number;
  validationErrors: number;
  backtracks: number;
  manualSearches: number;
  modalOpens: number;
  slowInteractionsMs: number;
  horizontalOverflow: boolean;
  competingPrimaryButtons: number;
  startedAt: string;
  finishedAt: string;
};

export type UxBudget = {
  maxDurationSeconds: number;
  maxClicks: number;
  maxPageTransitions: number;
  maxValidationErrors: number;
};

/** Initial conservative budgets — tune after dry runs; demo path ≠ public FIT Proven. */
export const STANDARD_FIT_QUOTE_BUDGET: UxBudget = {
  maxDurationSeconds: 180,
  maxClicks: 25,
  maxPageTransitions: 5,
  maxValidationErrors: 0,
};

/** Golden Family FIT → revise → book → voucher (demo path). */
export const FAMILY_FIT_REVISE_BOOK_VOUCHER_BUDGET: UxBudget = {
  maxDurationSeconds: 300,
  maxClicks: 45,
  maxPageTransitions: 12,
  maxValidationErrors: 0,
};

/** Beat: revision strip / Resend on locked tip. */
export const BEAT_REVISION_COMFORT_BUDGET: UxBudget = {
  maxDurationSeconds: 120,
  maxClicks: 20,
  maxPageTransitions: 8,
  maxValidationErrors: 0,
};

/** Beat: Match Use (keep markup). */
export const BEAT_MATCH_KEEP_MARKUP_BUDGET: UxBudget = {
  maxDurationSeconds: 90,
  maxClicks: 15,
  maxPageTransitions: 6,
  maxValidationErrors: 0,
};

/** Beat: Replace demo → suppliers → rates → Match → live doc no-[Demo]. */
export const BEAT_REPLACE_DEMO_BUDGET: UxBudget = {
  maxDurationSeconds: 240,
  maxClicks: 40,
  maxPageTransitions: 14,
  maxValidationErrors: 0,
};

/** Beat: Dashboard dual-track onboarding checklist + FIT install/open. */
export const BEAT_ONBOARDING_CHECKLIST_BUDGET: UxBudget = {
  maxDurationSeconds: 180,
  maxClicks: 25,
  maxPageTransitions: 12,
  maxValidationErrors: 0,
};

/** Beat: aging / portfolio / export-or-pack + five money questions. */
export const BEAT_FINANCE_REPORTING_BUDGET: UxBudget = {
  maxDurationSeconds: 180,
  maxClicks: 30,
  maxPageTransitions: 14,
  maxValidationErrors: 0,
};

/** Lead → inquiry → trip → quote → accept → voucher → collect (hybrid CRM spine). */
export const LEAD_INQUIRY_FIT_VOUCHER_BUDGET: UxBudget = {
  maxDurationSeconds: 480,
  maxClicks: 60,
  maxPageTransitions: 20,
  maxValidationErrors: 0,
};

export function createUxMetrics(journey: string) {
  const startedAt = Date.now();
  let clicks = 0;
  let pageTransitions = 0;
  let validationErrors = 0;
  let backtracks = 0;
  let manualSearches = 0;
  let modalOpens = 0;
  let slowInteractionsMs = 0;
  let lastPath = '';

  return {
    async attach(page: Page) {
      lastPath = new URL(page.url()).pathname;
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const next = new URL(page.url()).pathname;
        if (next !== lastPath) {
          pageTransitions += 1;
          if (lastPath && next.length < lastPath.length) backtracks += 1;
          lastPath = next;
        }
      });
    },

    recordClick() {
      clicks += 1;
    },

    async click(page: Page, locator: Parameters<Page['locator']>[0] | ReturnType<Page['getByTestId']> | ReturnType<Page['getByRole']>) {
      const target =
        typeof locator === 'string' ? page.locator(locator) : locator;
      const t0 = Date.now();
      await target.click();
      clicks += 1;
      const elapsed = Date.now() - t0;
      if (elapsed > 1000) slowInteractionsMs += elapsed;
    },

    noteValidationError() {
      validationErrors += 1;
    },

    noteSearch() {
      manualSearches += 1;
    },

    noteModal() {
      modalOpens += 1;
    },

    async measureOverflow(page: Page): Promise<boolean> {
      return page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1;
      });
    },

    async countCompetingPrimaries(page: Page): Promise<number> {
      return page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll('button, [role="button"], a'),
        );
        const primaries = buttons.filter((el) => {
          const cls = (el as HTMLElement).className?.toString?.() ?? '';
          return (
            cls.includes('bg-primary') ||
            el.getAttribute('data-variant') === 'default'
          );
        });
        return primaries.length;
      });
    },

    async snapshot(page: Page, journeyName = journey): Promise<UxJourneyMetrics> {
      const finishedAt = Date.now();
      const horizontalOverflow = await this.measureOverflow(page);
      const competingPrimaryButtons = await this.countCompetingPrimaries(page);
      return {
        journey: journeyName,
        durationSeconds: Math.round((finishedAt - startedAt) / 1000),
        clicks,
        pageTransitions,
        validationErrors,
        backtracks,
        manualSearches,
        modalOpens,
        slowInteractionsMs,
        horizontalOverflow,
        competingPrimaryButtons,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
      };
    },

    writeArtifact(metrics: UxJourneyMetrics | Record<string, unknown>, outDir = 'e2e-results') {
      const dir = path.resolve(outDir);
      fs.mkdirSync(dir, { recursive: true });
      const journey =
        typeof metrics.journey === 'string' ? metrics.journey : 'journey';
      const file = path.join(dir, `${journey}.json`);
      fs.writeFileSync(file, JSON.stringify(metrics, null, 2));
      return file;
    },

    assertBudget(metrics: UxJourneyMetrics, budget: UxBudget) {
      const failures: string[] = [];
      if (metrics.durationSeconds > budget.maxDurationSeconds) {
        failures.push(
          `duration ${metrics.durationSeconds}s > ${budget.maxDurationSeconds}s`,
        );
      }
      if (metrics.clicks > budget.maxClicks) {
        failures.push(`clicks ${metrics.clicks} > ${budget.maxClicks}`);
      }
      if (metrics.pageTransitions > budget.maxPageTransitions) {
        failures.push(
          `pageTransitions ${metrics.pageTransitions} > ${budget.maxPageTransitions}`,
        );
      }
      if (metrics.validationErrors > budget.maxValidationErrors) {
        failures.push(
          `validationErrors ${metrics.validationErrors} > ${budget.maxValidationErrors}`,
        );
      }
      if (failures.length) {
        throw new Error(
          `UX budget exceeded for ${metrics.journey}: ${failures.join('; ')}\n${JSON.stringify(metrics, null, 2)}`,
        );
      }
    },
  };
}

export type UxMetricsSession = ReturnType<typeof createUxMetrics>;
