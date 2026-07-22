# Market-proof evidence pack

**Purpose:** Capture adoption evidence for a **named non-eng pilot**. Demo / Playwright / internal dry-runs do **not** flip Market-proven or FIT Proven.

**Related:** [pilot-operations-pack.md](./pilot-operations-pack.md) · [pilot-week-runbook.md](./pilot-week-runbook.md) · [beat-sembark-scorecard.md](./beat-sembark-scorecard.md) · [posthog-session-replay.md](../posthog-session-replay.md) · strategy Agency Competitive Validation in [sembark-vs-travel-os.md](../../strategy/sembark-vs-travel-os.md)

---

## Flip criteria (Market-proven)

Flip **Market-proven** only when **all** are true:

1. Named non-eng agency (not Wayrune staff as primary operator) completes **Real agency** track: import real suppliers/rates → quote/revise → accept → book → confirm → voucher → collect — **without** developer/DB intervention.
2. Beat scorecard Day 1 (≥3 edges) + Day 2 Replace filled by that persona with trust ≥4 and **Y** (or Unsure→Y after one retry) vs Sembark+Excel.
3. Zero **blocking** escapes on the core journey; Excel/calculator use logged. If ≥3 same-pattern escapes → open matching P5–P8 thin entry **before** claiming market proof.
4. Replace-demo checklist (strategy steps 1–8) satisfied on their data — no `[Demo]` on live documents.
5. **FIT Proven** (optional parallel): only if `fitClaimProtocol.publicClaimAllowed === true` (n≥20 **real** samples, median ≤3m). Market-proven may land without FIT Proven; public “under 3 minutes” stays Testing until the gate clears.

Until then: **Pilot-ready / Testing / Internally proven** only.

---

## Pilot identity

| Field | Value |
| --- | --- |
| Org name (staging / pilot) | **North India Tours** (seed) |
| Org id / public code | slug **`pilot-staging`** (see DB after seed) |
| Primary operator role | sales (`sales@northindia.tours.demo`) |
| Secondary glance | owner (`owner@northindia.tours.demo`) |
| Wayrune eng on-call | correctness fixes only |
| Staging vs production | **Staging seed** — not demo-travel |
| PostHog replay enabled | Set on pilot build — confirm Day-0 |
| Demo operate replaced before live work | Soft-delete + CSV import on seed (`ratesImported: 1`) — PW-as-human |
| Week start date | 2026-07-21 (seed lock + PW week) |
| Status | **Phase 1.1–1.5 PW-as-human complete** · claim **Testing** (not Market-proven) |

> Seed staging + Playwright stand-in for human. **Not Market-proven** until a real non-eng week clears flip criteria.

---

## Week schedule

| Day | Focus | Script | Done (Y/N) | Notes |
| --- | --- | --- | --- | --- |
| 1 | Beat: spine + revision + Match | [fit-family-golden.md](./fit-family-golden.md) · scorecard Named pilot Day 1 | **Y (PW)** | Spine UI + draft; revise/Match not re-timed |
| 2 | Replace + real CSV | [import-replace-demo.md](./import-replace-demo.md) · scorecard Named pilot Day 2 | **Y (PW)** | `day2Replace` · `ratesImported: 1` |
| 2–3 | FIT matrix (optional) | [fit-matrix.md](./fit-matrix.md) | N | Skipped |
| 3 | Accept → confirm → voucher | [accept-confirm-voucher.md](./accept-confirm-voucher.md) | **Y (PW)** | goldenOps steps on pilot-staging |
| 4 | Collection + payable | [collection-payable.md](./collection-payable.md) | **Y (PW)** | `collectVia: api` |
| 5 | Departures / owner (if time) | [departures-7d.md](./departures-7d.md) · [owner-control.md](./owner-control.md) | N | Skipped |

Artifact: [`apps/web-e2e/e2e-results/beat-pilot-named-week.json`](../../../apps/web-e2e/e2e-results/beat-pilot-named-week.json) · mode `playwright_as_human`. Spec: `beat-pilot-named-week.spec.ts`. **Never** counts as Market-proven.

---

## Friction log

Copy rows from strategy structured friction log. One row per incident.

| Date | User / role | Journey stage | Expected action | What happened | Workaround | Frequency | Business impact | Severity | Root cause | Evidence | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

**Escape count (same-pattern):** 0 (PW-as-human seed week; no Excel escapes logged).  
**P5–P8 opened?** No — gate unmet.

### Internal proxy rehearsal (2026-07-21)

> **Internal proxy evidence — not customer or market proof**

| Check | Result |
| --- | --- |
| Setup instructions (ops pack §7–9) | Verified — UI-only provision path documented |
| Role permissions | Owner `org.settings.write` can set `pilotProgram` |
| UI clarity | Pilot Day-0 panel + dashboard strip shipped |
| Telemetry | `GET /dashboard/claim-gates` → `pilotReadiness`; FIT demo excluded |
| Evidence capture | Ops pack logs + this pack + scorecard Internal proxy section |
| Lead→voucher execution | Regression via prior beat/golden artifacts — **proxy label** |
| PostHog | N/A unless pilot build has `VITE_POSTHOG_KEY` |
| FIT / Market flip | **None** — claim stays Testing |

---

## FIT real-sample tally (M3)

Protocol: qualified enquiry → customer-ready Send. **Demo seed never counts.** Monitor Settings → About [`ClaimGatesPanel`](../../apps/web/src/components/agency/ClaimGatesPanel.tsx) or `GET /dashboard/claim-gates`.

**Phase 2 tracker:** [phase-2-fit-public-speed-tracker.md](./phase-2-fit-public-speed-tracker.md)

| Week ending | Org | sampleSize (real) | demoSampleSize | medianMinutes | publicClaimAllowed | Notes |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 2026-07-21 (W0) | `pilot-staging` | 0 | 0 | — | false | Phase 2 baseline · `beat-fit-claim-gates` |
| 2026-07-21 (contrast) | `demo-travel` | 1 | 20 | ~11.0 | false | Hygiene — do not use for public claim |

**Do not** flip FIT Proven in registry until `publicClaimAllowed === true` on a non-demo org **and** product sign-off.

---

## Scorecard links

- Internal dry-run (already filled): [beat-sembark-scorecard.md](./beat-sembark-scorecard.md) Day 1–2 “demo” rows  
- **Internal proxy** (rehearsed, non-market): same file → section **Internal proxy**  
- **Named pilot** (PW-as-human on seed): same file → section **Named pilot** — claim still Testing  
- Ops: [pilot-operations-pack.md](./pilot-operations-pack.md)

---

## Claim recommendation (M4)

| Decision | Choose one |
| --- | --- |
| **Testing** (default until pilot) | Keep Market-proven / FIT Proven off; Pilot-ready evidence pack only |
| Market-proven candidate | Flip criteria 1–4 met; document evidence above |
| Blocked | List top escapes / blockers below |

**Current recommendation (2026-07-21):** **Testing** — Phase 1 Days 1–4 ran as **Playwright-as-human** on seed org **North India Tours** (`pilot-staging`). Flip criteria require a real non-eng operator without eng/API stand-in. Do **not** invent Market-proven.

### M2 — Pilot week status

| Item | Status |
| --- | --- |
| Days 1–4 executed by named non-eng | **Not yet** — PW stand-in only (`playwright_as_human`) |
| Days 1–4 Playwright-as-human | **Done** — `beat-pilot-named-week` all day flags true |
| Internal proxy Days 0–4 | Rehearsed earlier (non-market) |
| Seed staging 1.1–1.2 | **Done** — [phase-1-named-pilot-tracker.md](./phase-1-named-pilot-tracker.md) |
| Friction log rows | 0 named human (PW soft-fails: sell-fill version; point-line) |
| Named-pilot scorecard rows | Filled as **PW-as-human** — not Market-proven |

### M3 — FIT sample discipline status

| Item | Status |
| --- | --- |
| Phase 2 | **Started** — [phase-2-fit-public-speed-tracker.md](./phase-2-fit-public-speed-tracker.md) |
| Monitor path | Settings → About ClaimGatesPanel · `GET /dashboard/claim-gates` on **pilot-staging** |
| W0 baseline | sampleSize **0** · median **—** · publicClaimAllowed **false** |
| Forced Proven flip | **Forbidden** |
| Weekly tally table | W0 row filled; grow via operator Sends on pilot-staging |

### M4 — Decision recorded

**Outcome:** keep **Testing**. Market-proven **not** flipped. FIT Proven **not** flipped.  
**PW-as-human:** Days 1–4 green on seed staging — **not** Market-proven candidate.  
**Revisit when:** real non-eng Days 1–4 (no eng/API stand-in) on pilot-staging or real agency + flip criteria reviewed.

**Blockers / next steps:**

1. Recruit a real named non-eng operator (or convert seed to live customer contact).
2. Re-run Days 1–4 without Playwright/API stand-in; refresh Named scorecard + friction log.
3. Grow FIT real samples on **non-demo** org toward n≥20.
4. Revisit claim recommendation only when flip criteria 1–4 are all true.

---

## Eng on-call rules

- Fix **correctness** immediately (wrong totals, data loss, broken nav, tenant isolation, accidental send/charge).
- Do **not** build P5–P8 depth unless friction log shows ≥3 same-pattern escapes.
- Do **not** upgrade About / changelog / public docs to Market-proven or FIT Proven without this pack’s flip criteria.
