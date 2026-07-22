# Pilot week runbook — Sembark-wedge dogfood

Test **Wayrune**. Score with [sembark-wedge-comparison.md](../sembark-wedge-comparison.md) and the [beat-sembark-scorecard.md](./beat-sembark-scorecard.md). Friction log fields: strategy memo Agency Competitive Validation.

**Market proof:** [pilot-operations-pack.md](./pilot-operations-pack.md) · [phase-1-named-pilot-tracker.md](./phase-1-named-pilot-tracker.md) (Phase 1.1 recruiting) · [market-proof-evidence-pack.md](./market-proof-evidence-pack.md). Fill scorecard **Named pilot** (or **Internal proxy** — never Market-proven). Enable PostHog per [posthog-session-replay.md](../posthog-session-replay.md). Demo / proxy timings ≠ FIT Proven / Market-proven.

**Day 1–2 = beat edges first.** Day 3+ = import/owner breadth only as evidence for P5–P8.

## Day plan

| Day | Focus | Script |
| --- | --- | --- |
| 1 | Beat edges: golden spine + revision + Match keep-markup (think-aloud) | [fit-family-golden.md](./fit-family-golden.md) · [beat-sembark-scorecard.md](./beat-sembark-scorecard.md) (**Named pilot** rows) |
| 2 | Beat: Replace demo + real CSV on staging | [import-replace-demo.md](./import-replace-demo.md) · scorecard Day 2 Named pilot |
| 2–3 | FIT matrix FIT-01…08 (as time allows — not before beat edges) | [fit-matrix.md](./fit-matrix.md) |
| 3 | Accept → confirm → voucher (observe Next action / WA) | [accept-confirm-voucher.md](./accept-confirm-voucher.md) |
| 4 | Collection + payable (five money questions) | [collection-payable.md](./collection-payable.md) |
| 5 | Departures-7d + owner questions | [departures-7d.md](./departures-7d.md) · [owner-control.md](./owner-control.md) |

## Pre-flight (named pilot)

1. Staging org separate from shared demo seed; branding set.
2. **Replace demo** before live bookings ([import-replace-demo.md](./import-replace-demo.md)).
3. PostHog: `VITE_POSTHOG_KEY` on pilot build only.
4. Open evidence pack; confirm Settings → About claim gates show FIT **Testing** (demo samples excluded from public gate).
5. Eng on-call: correctness only; P5–P8 only after ≥3 same-pattern escapes.

## Automation (eng, any day)

```bash
pnpm --filter @wayrune/web-e2e playwright:install   # once
pnpm dev                                            # API + web
pnpm test:e2e                                       # standard + golden + beat-* specs
```

Append metrics to [ux-dogfood-report.md](../ux-dogfood-report.md). Demo timings ≠ FIT Proven.

## Escape gate

≥3 same-pattern escapes → open matching P5–P8 thin entry only. Fix correctness immediately.

## Out of scope

Digital Presence · Travel Exchange · partner network · advanced fleet.
