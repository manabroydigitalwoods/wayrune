# Sembark-competitive workflow — current-state report

**Date:** 2026-07-21  
**Scope:** Inspect-only baseline for the Wayrune Agency Competitive Validation program.  
**Status:** No broad product implementation in this pass. First vertical slice proposed below.

Related canon: [sembark-vs-travel-os.md](../strategy/sembark-vs-travel-os.md) · [ux-dogfood-report.md](./ux-dogfood-report.md) · [beat-sembark-scorecard.md](./scenarios/beat-sembark-scorecard.md) · [pilot-week-runbook.md](./scenarios/pilot-week-runbook.md) · [market-proof-evidence-pack.md](./scenarios/market-proof-evidence-pack.md)

---

## Verdict

Wayrune already has the **end-to-end commercial spine** (inquiry → trip → quote → accept → supplier confirm → voucher → collect/cancel). The competitive gap vs Sembark is **not missing stages**. It is:

1. **Usability depth and escape rate** on daily jobs (quote speed, revision comfort, Match trust, import honesty) — **guided spine clarity improved** (Option A ~8–9/10; new-sales path lead→Send without travellers/seed/sell-fill API on demo; Send readiness inline; New lead for sales_executive).
2. **Proof** — automation green on demo/fixture; internal Day 1–2 scorecards filled; **Market proof enablement** shipped (evidence pack); named pilot week **not yet run**.
3. **Action queues** for departures-7d and owner attention — scripts exist; product surfaces are thin or absent.

**Readiness today (post Market proof enablement · 2026-07-21)**

| Gate | Engineering | Adoption proof |
| --- | --- | --- |
| Quote-ready | Prod-ready (checklist + FIT pack + guided Send/Next) | Strongest wedge; public FIT claim remains **Testing** |
| Operate-ready | Demo operate-through Prod-ready; Replace honesty thin-closed | Real named-agency operate **unproven** |
| Pilot-ready | Dogfood + scripts + evidence pack + Named-pilot PW-as-human on `pilot-staging` | Real non-eng week still open |
| FIT public speed | Phase 2 W0: claim-gates baseline n=0 on pilot-staging | Grow real Sends → gate + sign-off |
| Market-proven | — | **Do not claim** (Testing) |

---

## 1. Workflow map (existing path — reuse only)

```text
Inquiry / travel request
  → convert-to-trip
Trip workspace (?tab=)
  quotations: package/template · Match H/T/A · progress strip · revise/resend · send
  operations: from-accepted · enquiry → confirm → payable → voucher
  finance: instalments · chase · payables · closure/CN
Dashboard / Settings
  onboarding checklist · FIT pack · Replace demo · claim gates (marketing only)
```

### Entry points

| Surface | Route pattern | Primary page / panel |
| --- | --- | --- |
| Inquiries | `/:orgRef/inquiries`, `/work/requests`, `/work/planning` | `InquiriesPage`, `TravelRequestWorkspace` |
| Trip spine | `/:orgRef/trips/:id?tab=` | `TripWorkspacePage` |
| Packages | No `/packages` route — templates inside Quotations + `from-package` | `PackageFolderTree`, `createTripFromPackage` |
| Proposals | Public `/p/itinerary/:token`; staff preview | `PublicItineraryPage`, `ItineraryPreviewPage` |
| Operations | Trip Operations tab; lists under `/operations*` | `OperationsPanel`, `TripControlCentre` |
| Finance | Trip Finance tab; `/finance*` aging/portfolio | `FinancePanel`, `FinanceAgingPage` |
| Onboarding | Dashboard checklist; Settings → About | `AgencyOnboardingChecklist`, `DemoOperateReplacePanel` |

Many nav URLs alias the same list pages via `agencyPageVariants` — usability risk (two metaphors), not a second product.

### Key implementation (do not duplicate)

| Concern | UI | API |
| --- | --- | --- |
| Match + alts + keep markup | `QuoteServiceDetailSheet.tsx` | `POST /rates/resolve`, `rate-resolve-alternatives.ts` |
| Guided FIT steps | `FitQuoteProgressStrip` + `fitQuoteProgress.ts` | — |
| Revision moves | `FitReviseMovesStrip` + `fitReviseMoves.ts` | `from-accepted`, version autosave |
| Margin/tax Δ | `FitRevisionMarginDeltaStrip` + `revisionMarginDelta.ts` | — |
| Send / accept | `TripWorkspacePage`, public itinerary | `quotations` send/accept/CAS |
| Ops pipeline | `OperationsPanel`, `TripControlCentre` | `operations.service` + H/T/A helpers |
| Quote vs Operate checklist | `AgencyOnboardingChecklist` | `onboarding-status.ts` |
| Replace demo | `DemoOperateReplacePanel` | `replaceDemoOperatePack` |
| Owner/CRM strips | `SalesCrmSlaStrip`, `TravelRequestQueueStrip` | dashboard SLA / inquiry queue |

### Playwright / UX instrumentation (baseline)

| Spec | What it proves | Limit |
| --- | --- | --- |
| `standard-fit-quote` | Login → quote → Match → Send control | Demo path; not FIT Proven |
| `family-fit-revise-book-voucher` | Hybrid UI + **API** accept→confirm→voucher | Send UI soft; Match/revise optional |
| `beat-match-keep-markup` | Keep markup % + alt chips | markup 20→20 · `matchAltsVisible` |
| `beat-revision-comfort` | From-accepted Δ + swap dates | `marginDeltaVisible` · `deltaSellTaxVisible` · `hotelSwapKeptDates` |
| `beat-replace-demo-proof` | Replace → suppliers → hotel rates → Match real → live doc no `[Demo]` | Demo/fixture; restores FIT pack; not Market-proven |
| `beat-onboarding-checklist` | Owner checklist scores + imported H/T Operate gates | Demo; honesty cue; never FIT Proven |
| `beat-finance-reporting` | Aging / portfolio / export-or-pack + five money questions | Thin reporting; P8 not opened |

Helpers: `helpers/uxMetrics.ts`, `helpers/goldenOps.ts`, `helpers/axe.ts` (soft).  
Artifacts: `apps/web-e2e/e2e-results/*.json`. Rule: `.cursor/rules/ux-dogfood.mdc`.

### Automated UX baseline (local dry-run 2026-07-20)

| Journey | Duration (s) | Clicks | Transitions | Validation errors | Overflow | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| standard-fit-quote | 10 | 3 | 4 | 0 | false | axe critical noise (button-name/label); competingPrimaries ≈ 37 |
| family-fit-revise-book-voucher | 6 | 3 | 4 | 0 | false | API golden ops; occasional 401 noise in pageErrors |
| beat-match-keep-markup | 5 | 4 | 4 | 0 | false | markup 20→20 |
| beat-revision-comfort | 3 | 2 | 4 | 0 | false | `marginDeltaVisible: false` on sent |
| beat-replace-demo-proof | 9 | 4 | 5 | 0 | false | ratesImported 1 · matchRealRate · liveDocNoDemo |

These timings are **regression budgets**, not public claims.

---

## 2. Strengths (already competitive or ahead)

| Area | Why |
| --- | --- |
| Connected spine | One trip workspace for quote → ops → finance; Trip Control next-action |
| Revision primitives | from-accepted immutability of accepted snapshot; revise moves; Resend latest; hotel swap keeps dates |
| Match keep-markup | Alt chips + Use vs Use (keep markup); recent bugfix (alts no longer wiped on Match save) |
| Operate honesty signals | Dual Quote-ready / Operate-ready checklist; `[Demo]` pack + Replace |
| Ops chain integrity | H/T/A enquiry → confirm → payable → voucher ladders marked done in strategy memo |
| Evidence discipline | Beat dogfood canon; claim gates stay Testing; P5–P8 escape gates for workbook/GL |

---

## 3. Gaps (evidence-ranked — not feature wishlist)

| ID | Classification | Problem | Evidence | Competitive impact |
| --- | --- | --- | --- | --- |
| G1 | UX friction | Match sheet can obscure Send toolbar | **Closed A1** — `openSendFlow` dismisses sheet; e2e `sendWhileMatchOpen` | Was high |
| G2 | UX / proof | Revision Δ hidden for sales without view_cost; beat on sent tip | **Closed A1** — sell/tax Δ without cost; beat asserts Δ on from-accepted draft | Was medium |
| G3 | UX friction | High competing primary button count on quote surfaces | **Further partial** — attention vs Send readiness de-duped; Match/rates strip quieter; page-wide competingPrimaries still ~22–23 (Trip Control excluded from toolbar goal) | Medium → lower on guided Send |
| G4 | External escape risk | Human scorecard empty; Excel preference unknown | **Partial** — internal Day 1–2 filled; **Market proof enablement opened** ([market-proof-evidence-pack.md](./scenarios/market-proof-evidence-pack.md)); named pilot **not scheduled**; claim **Testing** | Medium — Market-proven still blocked |
| G5 | Missing capability (thin) | No agency next-7d departure **action queue** with deep links | `departures-7d.md` script only; Movement 14d widget ≠ queue | Medium — wedge priority 5 |
| G6 | Missing capability (thin) | Owner action strip incomplete vs P7 script | CRM/queue strips only | Medium — wedge priority 6 |
| G7 | Data/onboarding | Replace e2e proves suppliers, not rates / no-`[Demo]` on live docs | **Thin-closed** — `ratesImported` · `matchRealRate` · `liveDocNoDemo`; claim gates still Testing | Was medium — Operate honesty stronger |
| G8 | Hygiene | Route aliasing / “packages” naming vs quote-templates | `agencyPageVariants` | Low — training/docs first |
| G9 | A11y | Soft axe criticals (button-name, label, dl) on trip/quote | e2e axe scans | Low–medium — fix opportunistically |

**Parked until ≥3 same-pattern escapes:** dense occupancy workbook · full GL/journals · Presence · Exchange · fleet · party/supplier ledger (P8).

---

## 4. Duplication risks

- Do **not** add a second quote builder — extend `TripWorkspacePage` + `QuoteServiceDetailSheet` + FIT strips.
- Do **not** add a second booking pipeline — extend `OperationsPanel` / `trip-control`.
- Do **not** conflate FIT starter pack (`fit_templates_v1`) with demo operate pack / Replace.
- Do **not** treat `claim-gates` or Playwright green as Operate-ready or FIT Proven.
- progressiveComplexity gates **UI density**, not org Quote/Operate readiness.

---

## 5. Prioritized improvement backlog (first cut)

| # | Item | Type | Workflow | Proposed change | Completion gate |
| ---: | --- | --- | --- | --- | --- |
| 1 | Send path unblocked when Match open | Hygiene / superiority | Guided FIT | Ensure Send/Resend remain reachable or Match dismisses cleanly before send | e2e assert Send visible after Match close; dogfood note closed |
| 2 | Revision Δ on from-accepted draft | Superiority / proof | Revision | Beat (or golden) asserts margin Δ strip after revise-from-accepted | `marginDeltaVisible: true` in metrics |
| 3 | Hotel swap keeps dates (e2e) | Hygiene | Revision | **Done** — `hotelSwapKeptDates: true` in beat-revision-comfort; check-in/out hard assert after Swap hotel | beat artifact |
| 4 | Guided rail: reduce competing CTAs | Parity | Guided FIT | **Option A done** — progress Next CTA + Send primary + blocked checklist | competingPrimaries ↓ on toolbar; human time |
| 5 | Replace + rate import proof | Honesty | Onboarding | **Done** — beat rates + Match + live doc no `[Demo]`; Day 2 scorecard dry-run | `ratesImported` · `matchRealRate` · `liveDocNoDemo` |
| 6 | Accept→voucher UI clarity | Parity | Ops | Observe Trip Control + checklist; fix only if escapes | scorecard spine Y |
| 7 | Departures-7d action queue | Parity | Ops | Build only after pilot escape or explicit Day 3 failure | deep-link queue |
| 8 | Owner action strip | Parity | Owner | Expand beyond CRM strips after escapes | clickable queues |
| 9 | Party/supplier ledger | Depth | Finance | P8 gate only | ≥3 Excel-ledger escapes |

---

## 6. First implementation slice

### Slice A1 — Guided FIT send + revision proof — **done** (2026-07-21)

Closed G1–G2. See [ux-dogfood-report.md](./ux-dogfood-report.md) A1 section.

### Slice Option A — New-user spine clarity — **done** (2026-07-21)

Partial G3/G4. New lead for `sales_executive`; Send checklist; quote primary demotion; lead→voucher mostly-UI e2e; Day 1 spine scorecard dry-run (~8–9/10). FIT claim remains Testing.

### Slice spine mature + collect — **done** (2026-07-21)

Extended lead→voucher e2e through **Schedule from terms → Mark paid** (`collectVia: ui`). Day 1 scorecard ≥3 edges (spine+collect, revision, Match). Collection thin path 0 Excel escapes → **internally proven (demo/staging)**. G4 largely closed for Day 1; Day 2 Replace still blank. P8/G7 not opened (escape gate unmet). FIT claim **Testing**; not Market-proven.

### Slice new-sales guided path (lead → first Send) — **done** (2026-07-21)

G3 further partial. Happy demo path clears **zero** of `api_travellers_fallback` / `api_from_previous|template` / `api_sell_fill_assist` before Send (`ui_use_previous` → travellers → Match/resolve → mark included → Send). Ops goldenOps after Send only. Guided Send reliability note — still not Market-proven / FIT Proven.

### Slice Match / keep-markup / revise Δ — **done** (2026-07-21)

Backlog #3 closed. Hard e2e: swap keeps stay dates; revision sell/tax Δ labels; Match alt chips + keep-markup 20→20. G1/G2 remain closed. Demo proof only — not Market-proven / FIT Proven.

### Slice Honesty (demo vs real) — **done** (2026-07-21)

G7 thin-closed / backlog #5 done. `beat-replace-demo-proof`: Replace → supplier CSV → hotel rate CSV → Match imported non-demo hotel → proposal preview with 0 `[Demo]`. Day 2 scorecard filled from dry-run. Claim gates / FIT remain **Testing**. Not Market-proven.

### Slice Accounting / reporting / onboarding maturity — **done** (2026-07-21)

Phase A+B: `beat-onboarding-checklist` (owner checklist + imported H/T Operate gates + honesty cues) and `beat-finance-reporting` (aging/payables/portfolio + GSTR/report-packs + five money questions). P8 **not** opened (0 ledger escapes). No GL. FIT **Testing**; not Market-proven.

### Slice Pilot bottleneck unblock (1+4 + proxy) — **opened** (2026-07-21)

Ops pack ([pilot-operations-pack.md](./scenarios/pilot-operations-pack.md)) + in-product Pilot Day-0 on About/Dashboard. `pilotReadiness` on claim-gates; demo pack ≠ Operate-ready for pilot. Proxy rehearsal stamped Internal proxy — **claim recommendation: Testing**. Named agency still to recruit.

---

## 7. Program readiness conclusion (post Pilot Day-0)

| Question | Answer |
| --- | --- |
| Where at parity (engineering)? | End-to-end stages including thin collect; H/T/A book/voucher; Quote/Operate checklist; aging/portfolio/exports |
| Where measurably better (automation)? | Keep-markup; revision Δ; Replace honesty; onboarding + finance reporting beats; guided Send |
| Where Sembark likely still ahead? | Dense contracting; owner/departures queues; trained speed; full ledger; **market confidence** |
| Evidence-backed gaps? | G3 page-wide CTAs; **real non-eng named week** still open (PW-as-human ≠ Market-proven) |
| Speculative / parked? | Workbook, full GL, Presence, Exchange, fleet, P8 (no ≥3 ledger escapes) |
| Product label today? | **Quote-ready** · **Operate-ready (demo)** · **Internally proven (demo)** · **Pilot-ready (PW-as-human seed)** · not Market-proven |

---

## 8. Next action after Pilot Day-0

**Program plan:** [close-sembark-gaps-plan.md](./close-sembark-gaps-plan.md) — Phase 1 seed + PW week done; real non-eng week next; P5–P8 / GL only on evidence.

1. Phase 2: grow real FIT Sends on `pilot-staging`; weekly tally — [phase-2-fit-public-speed-tracker.md](./scenarios/phase-2-fit-public-speed-tracker.md).
2. Recruit a real named non-eng operator; re-run Days 1–4 without PW/API stand-in.
3. Flip FIT Proven **only** if `publicClaimAllowed` + product sign-off; Market-proven only on flip criteria.
4. Open P5–P8 / ledger only after ≥3 same-pattern escapes or segment reject.
