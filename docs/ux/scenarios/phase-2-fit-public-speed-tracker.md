# Phase 2 — FIT public speed tracker

**Opened:** 2026-07-21  
**Program:** [close-sembark-gaps-plan.md](../close-sembark-gaps-plan.md) Phase 2  
**Evidence:** [market-proof-evidence-pack.md](./market-proof-evidence-pack.md) · FIT real-sample tally (M3)  
**Baseline artifact:** [`beat-fit-claim-gates.json`](../../../apps/web-e2e/e2e-results/beat-fit-claim-gates.json)

**Claim:** FIT Proven stays **Testing** until `publicClaimAllowed === true` **and** product sign-off. Demo seed / Playwright / inventing samples **never** flip the registry.

---

## Goal

Clear the **technical** gate for public “under 3 minutes” (n≥20 **real** samples, median ≤3m on a non-demo org). Marketing copy stays Testing until sign-off (step 2.4).

---

## 2.1 Train — operator path

| Field | Value |
| --- | --- |
| Org | **North India Tours** · slug `pilot-staging` (preferred) — not `demo-travel` for public gate |
| Operator | `sales@northindia.tours.demo` (sales) · owner glances Settings → About |
| Protocol | Workspace open → Match/package → first successful **Send** (INR FIT) |
| In-product cue | Trip Quotations tab · `FitDogfoodTimingCue` (n/20 remaining) |
| Training surface | Settings → About · **FIT dogfood kit** (`fitCaptureSteps`) |
| Status | **Opened** — kit + cue verified in `beat-fit-claim-gates` |

**Do:** grow real Sends on `pilot-staging` (or another non-demo customer org).  
**Do not:** count demo-travel `demo_seed` audits toward the public gate.

---

## 2.2 Monitor — live gate snapshot

| Week ending | Org | sampleSize | demoSampleSize | medianMinutes | publicClaimAllowed | Source |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 2026-07-21 (W0 baseline) | `pilot-staging` | 0 | 0 | — | false | API + About UI |
| 2026-07-21 (contrast) | `demo-travel` | 1 | 20 | ~11.0 | false | API (hygiene) |

Monitor path: `GET /dashboard/claim-gates` · Settings → About `ClaimGatesPanel`.

| Check | Status |
| --- | --- |
| Sample progress shown on About | **Y** (beat) |
| Ops checklist / FIT dogfood kit present | **Y** (beat) |
| Registry language remains Testing | **Y** — no FIT Proven invent |
| Weekly tally row in evidence pack | **Y** — W0 baseline |

---

## 2.3 Hygiene

| Issue | Severity | Notes | Action |
| --- | --- | --- | --- |
| `demo-travel` has 20 `demo_seed` + 1 “real” (~11m) | Info | Demo seed correctly excluded; lone real sample keeps gate false | Continue excluding demo from public claim |
| `pilot-staging` sampleSize = 0 | Expected | Clean seed — grow via operator Sends | Train + weekly monitor |
| PW/API inventing n≥20 | Forbidden | Would fake publicClaimAllowed | Never |

**Blockers documented:** none for protocol start/end. Contamination risk is using demo-travel for public tally — **use pilot-staging**.

---

## 2.4 Flip (blocked)

| Gate | Status |
| --- | --- |
| `publicClaimAllowed === true` on non-demo org | **false** (pilot-staging n=0) |
| Product sign-off for website / registry | Not requested |
| FIT Proven in About / public docs | **Do not flip** |

---

## Next

1. Operators: repeat qualified enquiry → Send on `pilot-staging` until About shows progress toward 20/20.  
2. Each week: append FIT tally row (evidence pack + this tracker).  
3. Only when gate clears: request product sign-off → then 2.4.
