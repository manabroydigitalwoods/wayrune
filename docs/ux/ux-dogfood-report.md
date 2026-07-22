# UX dogfood report

Agency Competitive Validation — automation detects **regression**; pilots decide if UX is **genuinely good**. Score Wayrune with [sembark-wedge-comparison.md](./sembark-wedge-comparison.md).

## Cadence

| Cadence | What |
| --- | --- |
| Every PR | `standard-fit-quote` + `family-fit-revise-book-voucher` + beat-Sembark trio · UX budgets · axe soft · overflow |
| Opt-in visual | `E2E_VISUAL=1` screenshot baselines |
| Pilot weekly | Think-aloud · friction log · escapes · wedge comparison sheet |

## Wedge priority

1 FIT quote/revision · 2 Import · 3 Accept→voucher · 4 Collection · 5 Departures-7d · 6 Owner — see strategy memo. Out of scope: Presence / Exchange / fleet.

## Latest automated run

_Append dated sections below after each dogfood run. Do not invent redesigns without evidence._

### Template

```text
Date:
Journey: standard-fit-quote | family-fit-revise-book-voucher
Metrics JSON: apps/web-e2e/e2e-results/<journey>.json
Budget: pass | fail (list)
Overflow: pass | fail
Golden ops steps: (if applicable)
Evidence-backed issues:
- Issue:
  Severity:
  Evidence:
  Suggested fix: (only if evidence)
```

### 2026-07-20 — Sembark-wedge cycle kickoff

- Canon locked: wedge priorities 1–6, comparison sheet, FIT matrix, golden family script.
- Automation: `family-fit-revise-book-voucher` added (hybrid UI + API accept→voucher).
- Human next: run `docs/ux/scenarios/fit-family-golden.md` on named pilot; fill comparison sheet for FIT quote/revision.

**Dry-run (local):** `family-fit-revise-book-voucher` **pass**

```text
Metrics: apps/web-e2e/e2e-results/family-fit-revise-book-voucher.json
durationSeconds: 6 · clicks: 3 · pageTransitions: 4 · validationErrors: 0 · overflow: false
Budget: pass (≤300s / ≤45 clicks)
Golden ops: already_accepted → materialize → confirm → voucher
Note: Send toolbar sometimes obscured by Match sheet — Escape + API path covers accept→voucher; human golden script still verifies Send/Resend UX.
```

**Ops handoff:** [scenarios/pilot-week-runbook.md](./scenarios/pilot-week-runbook.md) — human scripts for priorities 2–6 ready for named pilot.

### 2026-07-20 — Beat-Sembark dogfood (Wayrune advantages)

- Canon: beat edges (connected spine, revision comfort, Match keep-markup, Replace demo) locked in strategy memo, wedge comparison scorecard, pilot runbook Day 1–2, [beat-sembark-scorecard.md](./scenarios/beat-sembark-scorecard.md), ux-dogfood rule.
- Product fix: Match alt cards no longer cleared when Match `onSave` refreshes the line prop (`QuoteServiceDetailSheet`).
- Automation: three thin Playwright specs (demo/fixture — never FIT Proven).

**Dry-run (local):** all three **pass**

```text
beat-match-keep-markup — pass
  Metrics: apps/web-e2e/e2e-results/beat-match-keep-markup.json
  durationSeconds: 5 · clicks: 4 · validationErrors: 0 · overflow: false
  markupBefore/After: 20 / 20 (Use keep markup)
  Budget: pass (≤90s / ≤15 clicks)

beat-replace-demo-proof — pass
  Metrics: apps/web-e2e/e2e-results/beat-replace-demo-proof.json
  durationSeconds: 3 · softDeletedSuppliers: 3 · imported: 2
  Budget: pass (≤180s)

beat-revision-comfort — pass
  Metrics: apps/web-e2e/e2e-results/beat-revision-comfort.json
  durationSeconds: 3 · clicks: 2 · lockedStatus: sent · marginDeltaVisible: false
  Asserted: Resend latest on sent tip
  Budget: pass (≤120s / ≤20 clicks)
```

**Human next:** fill [beat-sembark-scorecard.md](./scenarios/beat-sembark-scorecard.md) once (internal dry-run OK). No eng spend on workbook/GL/Presence this cycle.

### 2026-07-21 — Slice A1 (Guided FIT send + revision proof)

Closed **G1** (Send while Match open) and **G2** (revision Δ on from-accepted draft). Human Day 1 scorecard still **pending** (no invented scores). FIT claim remains Testing.

**Product**
- `openSendFlow` / `openResendLatest` / progress `send_readiness` clear `quoteDetailLineId` so the line sheet does not trap Send.
- Revision Δ strip visible to staff **without** `quote.view_cost` (sell/tax; cost/margin hidden). Baseline `costHidden` no longer nulls the snapshot.
- Golden ops prefer already-accepted tip for voucher advance (avoids draft mark-sent 400 after from-accepted).

**Dry-run (local):** all four **pass**

```text
beat-revision-comfort — pass
  Metrics: apps/web-e2e/e2e-results/beat-revision-comfort.json
  durationSeconds: 3 · clicks: 1 · marginDeltaVisible: true · fromAcceptedDraft: true
  Budget: pass

standard-fit-quote — pass
  Metrics: apps/web-e2e/e2e-results/standard-fit-quote.json
  durationSeconds: 9 · clicks: 4 · sendWhileMatchOpen: true
  Budget: pass

beat-match-keep-markup — pass (smoke)
family-fit-revise-book-voucher — pass (smoke · already_accepted → voucher)
```

**Human next:** still fill Day 1 rows on [beat-sembark-scorecard.md](./scenarios/beat-sembark-scorecard.md).

### 2026-07-21 — Lead → voucher spine e2e

New journey `lead-inquiry-fit-voucher`: register lead → inquiry → convert → quote (from-previous + sell fill + travellers) → Match/Send UI → API mark-sent → accept → materialize → confirm → **mark-vouchered** → ops/finance glance.

**Dry-run (local, pre–Option A):** **pass** (~9s)

```text
Metrics: apps/web-e2e/e2e-results/lead-inquiry-fit-voucher.json (superseded by Option A run below)
durationSeconds: 9 · clicks: 3 · pageTransitions: 6 · validationErrors: 0
goldenOpsSteps: mark_sent → accept → materialize → confirm → voucher
finishGate: mark-vouchered
leadCreateVia: api (sales_executive workspace hid New lead CTA)
Note: not commerce TripClosure; not FIT Proven.
```

### 2026-07-21 — Option A (New-user spine clarity)

Raised new-sales UX on lead→voucher spine toward ~**8–9/10** (eng + scorecard dry-run). FIT claim stays **Testing**. Do **not** market as 10/10 or Market-proven.

**Product**
- `sales_executive` sees **New lead** (`progressiveComplexity` create gate).
- Quote toolbar: Send is sole primary; Add demoted to outline; Import/PDF/version/approval in ⋯.
- Blocked Send: `quote-send-blocked` checklist + click scrolls to `#quote-send-readiness` (`aria-disabled`, not a dead button).
- Fit progress strip: **Next:** CTA on current step (`fit-progress-next`).

**Dry-run (local):** both **pass**

```text
lead-inquiry-fit-voucher — pass
  Metrics: apps/web-e2e/e2e-results/lead-inquiry-fit-voucher.json
  durationSeconds: 17 · clicks: 10 · pageTransitions: 7 · competingPrimaryButtons: 27
  leadCreateVia: ui · finishGate: mark-vouchered
  uiSteps: ui_create_lead → … → ui_match → ui_mark_sent → api_ops_finish (accept/confirm/voucher)
  Budget: pass (≤360s)
  Note: inquiry/convert/travellers still use API when UI wizard stalls; sell-fill assist last resort.

standard-fit-quote — pass
  Metrics: apps/web-e2e/e2e-results/standard-fit-quote.json
  durationSeconds: 7 · clicks: 5 · sendWhileMatchOpen: true · competingPrimaryButtons: 43
  Budget: pass
  Note: page-wide competingPrimaries still high (Trip Control / other chrome); quote toolbar primary is Send only.
```

**Scorecard:** Day 1 connected spine filled (internal dry-run, sales_executive). Revision / Match / Day 2 Replace left blank (no invented scores).

### 2026-07-21 — Spine mature + collect (lead → voucher → collect)

**Product**
- Inquiry create: destination **Quick add** (Darjeeling/Goa/Jaipur); `inquiry-save` test id; wizard Continue path.
- Convert: `convert-to-trip` / `convert-to-trip-confirm` (confirm label **Convert**).
- Travellers: `add-traveller` / `add-traveller-submit`.
- Finance: `finance-schedule-from-terms-btn`, `finance-schedule-confirm`, `payment-mark-paid`.

**Dry-run (local):** `lead-inquiry-fit-voucher` **pass** (~33s) through **collect**

```text
Metrics: apps/web-e2e/e2e-results/lead-inquiry-fit-voucher.json
durationSeconds: 32 · clicks: 20 · competingPrimaryButtons: 22
finishGate: mark-vouchered+collect · collectVia: ui · neverFitProven: true
uiSteps: ui_create_lead → ui_create_inquiry → ui_convert_trip → … → ui_mark_sent
  → api_ops_finish → ui_schedule → ui_mark_paid
Note: travellers / from-previous / sell-fill may still API-assist; ops finish goldenOps for remaining.
beat-revision-comfort · beat-match-keep-markup — pass (scorecard Day 1)
```

**Scorecard:** Day 1 **three** edges filled (spine+collect, revision, Match). Collection-payable thin path 0 Excel escapes. P8/G7 **not** opened. Internally proven (demo) — not Market-proven; FIT **Testing**.

### 2026-07-21 — New-sales guided path (lead → first Send)

**Goal:** brand-new `sales_executive` completes lead→Send via visible UI (no travellers / seed / sell-fill API on happy demo path). Internal trust ~9/10 guided Send — **not** Market-proven / FIT Proven.

**Product**
- Inquiry start date defaults (+45d) so seeded quotes have travel dates.
- Travellers: required name + empty-state Add; soft persist before Send.
- Quote seed: wait for draft/`quote-send` after Use previous / template (loading while cloning).
- Match-first: FIT **Next: Match** → Resolve rates → Apply markup → **Mark unpriced as included** (₹0/₹0) when demo rates cannot price transfers; included lines skipped by margin floor.
- Chrome (quotations): attention strip = Match/rates (+ quiet markup/included ghosts); Send readiness hides sell/cost/margin chips when attention is open (trip-level gates only).

**Dry-run (local):** `lead-inquiry-fit-voucher` **pass** (~31s)

```text
Metrics: apps/web-e2e/e2e-results/lead-inquiry-fit-voucher.json
durationSeconds: 30 · clicks: 27 · competingPrimaryButtons: 23 · apiFallbackCount: 1
neverFitProven: true · collectVia: ui

Before (spine mature run): api_travellers_fallback · api_from_previous · api_sell_fill_assist
After:  NONE of those three
uiSteps: ui_create_lead → ui_create_inquiry → ui_convert_trip → ui_use_previous
  → ui_add_traveller ×2 → ui_fit_next_match → ui_resolve_rates → ui_mark_included
  → ui_mark_sent → api_ops_finish (ops after Send only) → ui_schedule → ui_mark_paid
```

**Claims:** guided Send reliability improved on demo path. FIT claim remains **Testing**. Do **not** invent Market-proven / FIT Proven.

### 2026-07-21 — Match / keep-markup / revise Δ (proof harden)

**Goal:** Automation matches product claims for revision comfort + Match keep-markup — especially **hotel swap keeps dates** — without Market-proven / FIT Proven.

**Product**
- Revise moves (Swap hotel / Rematch) show on from-accepted drafts even when deep-linked (revision baseline present).
- Test ids: `fit-revise-swap_hotel`, `hotel-check-in` / `hotel-check-out`, `revision-delta-sell` / `revision-delta-tax`, `match-alts`.

**Dry-run (local):** both beats **pass**

```text
Before: swap soft-click only; Δ presence only; Match markup hard but alts soft
After:
  beat-revision-comfort — pass (~6s)
    Metrics: apps/web-e2e/e2e-results/beat-revision-comfort.json
    marginDeltaVisible: true · deltaSellTaxVisible: true · hotelSwapKeptDates: true
    fromAcceptedDraft: true · neverFitProven: true
  beat-match-keep-markup — pass (~7s)
    Metrics: apps/web-e2e/e2e-results/beat-match-keep-markup.json
    markupBefore/After: 20/20 · matchAltsVisible: true · neverFitProven: true
```

**Claims:** Day 1 revision + Match proof deepened (demo). FIT remains **Testing**. Not Market-proven.

### 2026-07-21 — Honesty (demo vs real) / G7 thin close

**Goal:** Replace proves suppliers **and** hotel rates **and** Match on real rate **and** live proposal free of `[Demo]` — without Market-proven / FIT Proven.

**Before:** `beat-replace-demo-proof` soft-archived demo suppliers + CSV import only (`imported ≥ 1`); no rate import, Match, or live-doc asserts.

**After:** same beat extends through `apiImportHotelRatesCsv` → point hotel at imported supplier → UI Match → mark-sent → proposal `previewHtml` with **0** `[Demo]`.

```text
beat-replace-demo-proof — pass (~10s)
  Metrics: apps/web-e2e/e2e-results/beat-replace-demo-proof.json
  softDeletedSuppliers: 3 · imported: 2 · ratesImported: 1
  matchRealRate: true · liveDocNoDemo: true · neverFitProven: true
  Budget: pass (≤240s)
```

**Claims:** Operate honesty signal stronger on thin post-Replace hotel path. Claim gates / FIT remain **Testing**. Not Market-proven. Day 2 scorecard filled from this dry-run (demo).

### 2026-07-21 — Accounting / reporting / onboarding maturity

**Goal:** Internally prove onboarding checklist + Operate gates on imported H/T, and thin finance reporting (aging/portfolio/export) — without Market-proven, FIT Proven, GL, or P8.

**Product**
- Checklist: compact readiness strip when Operate-ready complete (scores + demo-vs-real honesty cue) until dismiss.
- About Replace panel: honesty cue that demo Operate-ready ≠ real-agency Operate-ready.

**Dry-run (local):** both beats **pass**

```text
Before: checklist UI unasserted; Operate-ready after Replace hotel-only; finance aging/portfolio unit-only
After:
  beat-onboarding-checklist — pass (~7s)
    Metrics: apps/web-e2e/e2e-results/beat-onboarding-checklist.json
    checklistVisible · quoteReadyScore/operateReadyScore match API
    importedHotelTransfer · hotelRateOk · transferFareOk · demoPackClearedDuringAssert
    neverFitProven: true
  beat-finance-reporting — pass (~6s)
    Metrics: apps/web-e2e/e2e-results/beat-finance-reporting.json
    agingReachable · portfolioReachable · exportOrPackOk · fiveMoneyQuestions
    p8LedgerNotOpened: true · neverMarketProven: true
```

**Collection script (B3):** thin path still **0** “need ledger” Excel escapes (prior Day 1 collect dry-run + this reporting beat). **P8 stays closed.** No GL claim.

**Claims:** Internally proven (demo/staging) onboarding + thin finance reporting. FIT **Testing**. Not Market-proven. Full accounting / GST ledger **do not claim**.

### 2026-07-21 — Close Sembark gaps · Phase 1.1–1.2 seed lock

**Agency:** North India Tours · slug `pilot-staging` (seed, not demo-travel).  
**Logins:** owner@northindia.tours.demo · sales@northindia.tours.demo (`Password123!`).  
**Claim:** **Testing** — seed ≠ Market-proven. Days 1–4 Named scorecard still human.

### 2026-07-21 — Close Sembark gaps · Phase 1.1 opened (recruiting)

**Goal:** Lock one named non-eng agency for Real-agency track.

**Shipped (ops):** [scenarios/phase-1-named-pilot-tracker.md](./scenarios/phase-1-named-pilot-tracker.md) — candidate pipeline + 1.2 provision checklist. Evidence pack status → Recruiting.

**Blocked on human:** agency contact + invite accept. Claim stays **Testing**.

**Next:** Fill tracker candidates; send ops-pack invitation; on lock → 1.2 UI-only staging.

### 2026-07-21 — Close Sembark gaps · Phase 0 verified

**Goal:** Confirm baseline before Phase 1 recruit (no rebuild).

**Checked:** spine collectVia ui · match/revise beats · Replace liveDocNoDemo · onboarding/finance · ops pack · Pilot Day-0 · `pilot-readiness` 5/5 · claim Testing.

**Next:** Phase 1.1 recruit named agency ([close-sembark-gaps-plan.md](./close-sembark-gaps-plan.md)).

### 2026-07-21 — Pilot bottleneck unblock (ops pack + Day-0)

**Goal:** Unblock named-pilot recruitment without inventing Market-proven.

**Shipped:**
- [scenarios/pilot-operations-pack.md](./scenarios/pilot-operations-pack.md) — recruit · screen · invite · UI-only staging · Day-0 · logs · claim review
- Settings → About **Pilot Day-0** (`PilotReadinessPanel`) + owner Dashboard compact strip
- `GET /dashboard/claim-gates` → `pilotReadiness` (Quote / Operate / Evidence; demo pack ≠ Operate-ready for pilot)
- Owner `settingsJson.pilotProgram` mode: none | proxy | named + evidenceComplete

**Claim status:** **Testing**. Proxy / Day-0 never flips FIT Proven or Market-proven.

**Proxy rehearsal:** see evidence pack Internal proxy section — setup + journey verification stamped non-market.


