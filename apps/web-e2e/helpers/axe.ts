import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export type AxeScanSummary = {
  label: string;
  serious: number;
  critical: number;
  contrast: number;
  ids: string[];
};

/**
 * Scan accessibility. Default: record + warn (evidence).
 * Set E2E_AXE_STRICT=1 to fail on serious/critical (excl. color-contrast debt).
 */
export async function scanAxe(
  page: Page,
  label: string,
): Promise<AxeScanSummary> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['color-contrast'])
    .analyze();

  const contrastOnly = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();

  const serious = results.violations.filter((v) => v.impact === 'serious');
  const critical = results.violations.filter((v) => v.impact === 'critical');
  const summary: AxeScanSummary = {
    label,
    serious: serious.length,
    critical: critical.length,
    contrast: contrastOnly.violations.length,
    ids: [...critical, ...serious].map((v) => v.id),
  };

  if (summary.serious + summary.critical + summary.contrast > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[axe:${label}] critical=${summary.critical} serious=${summary.serious} contrast=${summary.contrast}`,
      summary.ids.join(', ') || '(contrast only)',
    );
  }

  if (process.env.E2E_AXE_STRICT === '1') {
    expect(
      [...critical, ...serious],
      `[axe:${label}] E2E_AXE_STRICT serious/critical`,
    ).toEqual([]);
  }

  return summary;
}

/** @deprecated use scanAxe — kept for call-site clarity */
export async function assertNoSeriousAxeViolations(page: Page, label: string) {
  return scanAxe(page, label);
}
