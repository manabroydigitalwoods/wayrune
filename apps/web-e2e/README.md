# Web E2E — UX dogfood

Playwright journeys for Agency Competitive Validation. Measures complexity (clicks, transitions, validation errors), axe accessibility, and optional visual baselines.

## Prerequisites

- MySQL + Redis up (`pnpm infra:up` / local stack)
- Migrated + seeded: `pnpm db:migrate:deploy && pnpm db:seed`
- Playwright Chromium (once per machine / after Playwright upgrade):

```bash
pnpm --filter @wayrune/web-e2e playwright:install
# or: cd apps/web-e2e && pnpm exec playwright install chromium
```

- API + web running: `pnpm dev` (local), **or** let CI `webServer` start them

Demo users (from seed):

- Persona: `salesexec@demo.travel` / `Password123!`
- Pack install: `owner@demo.travel` / `Password123!`

## Commands

```bash
# From repo root (reuse pnpm dev servers)
pnpm test:e2e

# Interactive
pnpm test:e2e:ui

# Visual baselines (Phase 2)
E2E_VISUAL=1 pnpm --filter @wayrune/web-e2e test:e2e
E2E_VISUAL=1 pnpm --filter @wayrune/web-e2e test:e2e:update-snapshots
```

Journeys:

- `standard-fit-quote` — demo trip Match → Send control (budget ≤180s / 25 clicks)
- `family-fit-revise-book-voucher` — golden wedge (quote UI + API accept→voucher + ops/finance tabs; ≤300s / 45 clicks)
- `beat-revision-comfort` — Resend latest + revise cues (≤120s / 20 clicks)
- `beat-match-keep-markup` — Match Use (keep markup) preserves % (≤90s / 15 clicks)
- `beat-replace-demo-proof` — Replace demo + rates + Match + live doc no `[Demo]` (≤240s; restores FIT pack after)
- `beat-onboarding-checklist` — owner checklist + imported H/T Operate gates (≤180s)
- `beat-finance-reporting` — aging / portfolio / export + five money questions (≤180s; no P8/GL)
- `lead-inquiry-fit-voucher` — **new lead → inquiry → trip → quote → accept → voucher** (hybrid; finish = mark-vouchered; ≤360s)

Artifacts:

- `e2e-results/standard-fit-quote.json` — UX metrics + axe scan summaries
- `e2e-results/screenshots/` — soft screenshots
- `test-results/` — traces on failure

Axe: soft evidence by default (counts in JSON). Strict gate: `E2E_AXE_STRICT=1`.
ARIA snapshot assert: `E2E_ARIA_SNAPSHOT=1`.

## Budgets

See `helpers/uxMetrics.ts` — `STANDARD_FIT_QUOTE_BUDGET`. Demo path timings never count toward public FIT Proven.
