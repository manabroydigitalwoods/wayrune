# Beat-Sembark scorecard

Prove Wayrune wins on **connected agency effort**, not feature count.

> Same commercial outcome as a Sembark-class agency expects, with less effort and fewer escapes.

Fill one row per beat edge after think-aloud. Do not invent redesigns without escapes here or failing `beat-*` Playwright specs.

**Persona:** sales / ops (non-eng). Staging or pilot org preferred for Day 2.

## Day 1 — spine + revision + Match

| Beat edge | Time | Clicks (approx) | Escapes | Trust (1–5) | Would use vs Sembark+Excel? (Y/N/Unsure) | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Connected spine (quote → accept → confirm → voucher → **collect**) | ~5–6 min | ~15–20 | 0 Excel | 4 | Y (demo) | Internal dry-run · **sales_executive**. Lead→inquiry→convert UI; schedule + mark paid UI (`collectVia: ui`). Ops finish still goldenOps-assisted. Spine clarity ~**8–9/10**. FIT **Testing**; not Market-proven. |
| Revision comfort (Change dates / Swap hotel / Resend / tax or margin Δ) | ~1 min | ~1–3 | 0 | 4 | Y (demo) | Internal dry-run · from-accepted draft shows margin/sell Δ (`marginDeltaVisible: true`). Resend on sent tip covered earlier. |
| Match keep-markup (Use vs Use keep markup; alt chips) | ~1 min | ~4 | 0 | 4 | Y (demo) | Internal dry-run · markup 20→20 on Use keep markup. |

Scripts: [fit-family-golden.md](./fit-family-golden.md) · [collection-payable.md](./collection-payable.md). Friction log → strategy memo.

### Collection script (wedge 4) — internal dry-run 2026-07-21

Ran thin path after voucher: **Schedule from terms** → **Mark paid** on first instalment (remainder = partial trip collection). Five money questions answerable from Finance summary + instalment rows without Excel.

| Question | Answered in-product? | Escape |
| --- | --- | --- |
| Customer paid? | Y (paid row / summary) | None |
| Remains due? | Y | None |
| Supplier dues? | Y (supplier cards; may be 0 pre-AP) | None |
| Expected margin? | Y when costs complete | None |
| Refunded / written off? | Y (none / write-off CTAs) | None |

**Escapes:** 0 Excel/calculator. **P8 ledger:** not opened (gate unmet).

### Finance reporting beat (2026-07-21 dry-run)

`beat-finance-reporting` — aging + payables + portfolio + GSTR/report-packs reachable; five money questions answerable on trip Finance. **p8LedgerNotOpened: true.** Still 0 “need ledger” escapes → P8 closed. Not Market-proven.

## Day 2 — Replace demo

| Beat edge | Time | Clicks (approx) | Escapes | Trust (1–5) | Would use vs Sembark+Excel? (Y/N/Unsure) | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Replace demo → real supplier CSV → Match clean (no `[Demo]` on live docs) | ~10s (auto) | ~4 | 0 | 4 | Y (demo) | Internal dry-run · `beat-replace-demo-proof`: ratesImported 1 · matchRealRate · liveDocNoDemo. Hotel path only. FIT **Testing**; not Market-proven. |

Script: [import-replace-demo.md](./import-replace-demo.md).

## Named pilot (Market proof)

Fill these rows during a **named non-eng** pilot week. Do **not** copy internal dry-run or Internal proxy scores. Evidence pack: [market-proof-evidence-pack.md](./market-proof-evidence-pack.md) · Ops: [pilot-operations-pack.md](./pilot-operations-pack.md).

**Pilot org / operator:** North India Tours (`pilot-staging`) · `sales@northindia.tours.demo`  
**Week of:** 2026-07-21  
**Mode:** **Playwright-as-human** (`beat-pilot-named-week`) — seed staging stand-in, **not** a non-eng named week

### Day 1 — named pilot

| Beat edge | Time | Clicks (approx) | Escapes | Trust (1–5) | Would use vs Sembark+Excel? (Y/N/Unsure) | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Connected spine (quote → accept → confirm → voucher → collect) | ~12s (auto) | ~9 | 0 | 4 (proxy) | Y (staging) | PW-as-human · lead→inquiry UI; ops `accept→voucher`; collect `api`. Artifact `beat-pilot-named-week.json`. |
| Revision comfort (Change dates / Swap hotel / Resend / tax or margin Δ) | — | — | — | — | — | Not separately timed this run; covered by prior revision beat on demo. |
| Match keep-markup (Use vs Use keep markup; alt chips) | — | — | — | — | — | Not separately timed this run; covered by prior Match beat on demo. |

### Day 2 — named pilot Replace

| Beat edge | Time | Clicks (approx) | Escapes | Trust (1–5) | Would use vs Sembark+Excel? (Y/N/Unsure) | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Replace demo → real supplier CSV → Match clean (no `[Demo]` on live docs) | ~12s (auto) | (API) | 0 | 4 (proxy) | Y (staging) | Soft-delete demo + supplier/rate import (`ratesImported: 1`). `liveDocNoDemo` soft-fail (point-line). Hotel path. |

**Named-pilot claim note:** Playwright-as-human on seed staging → claim stays **Testing**. Does **not** meet Market-proven flip criteria (needs real non-eng operator, no eng/API stand-in).

## Internal proxy (Market proof rehearsal)

> **Internal proxy evidence — not customer or market proof**

Facilitator dry-run of Day-0 + script completeness after Pilot bottleneck unblock (2026-07-21). Does **not** flip FIT Proven or Market-proven.

**Org:** clean staging path documented (Register / create org — not `demo-travel` as primary). Journey regression: existing beat e2e artifacts on demo for spine/Replace/collect.  
**Operator:** Wayrune facilitator (proxy for non-eng)  
**PostHog:** N/A on this build unless `VITE_POSTHOG_KEY` set — noted in evidence pack.

| Day | Focus | Verified | Escapes | Notes |
| --- | --- | --- | ---: | --- |
| 0 | Ops pack + Pilot Day-0 UI | Y | 0 | `pilot-operations-pack.md` · About Panel · claim-gates `pilotReadiness` · unit specs green |
| 1 | Spine + revise + Match | Y (regression) | 0 | Prior beat artifacts / Day 1 dry-run — proxy label |
| 2 | Replace honesty | Y (regression) | 0 | `beat-replace-demo-proof` gates — proxy label |
| 3 | Accept → voucher | Y (regression) | 0 | lead→voucher / golden ops path — proxy label |
| 4 | Collection | Y (regression) | 0 | `collectVia: ui` / finance beat — proxy label |

**Proxy claim note:** Testing only. Recruit named agency next.

## Park (do not score as beat-first)

Dense rate workbook · full GL · Presence · Exchange · fleet — open only after ≥3 same-pattern escapes (P5–P8).

## Pass signal

Operator answers **Y** or high trust on ≥3 beat edges with **zero** Excel/calculator escapes on Day 1 spine. Automation green ≠ adoption proof.

**2026-07-21 status:** ≥3 Day 1 edges filled (internal dry-run, demo) → journey **internally proven (demo/staging)** on connected spine+collect thin path. Day 2 Replace honesty filled from automation dry-run (demo). Onboarding checklist + thin finance reporting beats green. **Market proof enablement** + **Pilot Day-0** + ops pack opened; **Internal proxy** rehearsed (non-market). **Named pilot** filled as Playwright-as-human on `pilot-staging` (not Market-proven). Still **not** Market-proven; FIT claim **Testing**. P8 closed.
