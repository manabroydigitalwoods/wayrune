# Phase 1 — Named pilot recruitment tracker

**Opened:** 2026-07-21 · **Updated:** 2026-07-21 (PW-as-human Days 1–4)  
**Program:** [close-sembark-gaps-plan.md](../close-sembark-gaps-plan.md) Phase 1  
**Ops canon:** [pilot-operations-pack.md](./pilot-operations-pack.md) §§1–4, 7  
**Evidence:** [market-proof-evidence-pack.md](./market-proof-evidence-pack.md) · artifact `beat-pilot-named-week.json`

**Claim:** stays **Testing**. Playwright-as-human on seed ≠ Market-proven (flip criteria require a real non-eng named week).

---

## 1.1 Recruit — status

| Field | Value |
| --- | --- |
| Facilitator | Wayrune (seed provision) |
| Target week (preferred) | 2026-07-21 (seed staging week) |
| Status | **Agency locked (seed staging)** |
| Named agency locked? | **Yes — seed** · slug `pilot-staging` |

### Candidate pipeline

| # | Agency / contact | Channel | Screener done? | Fit (Y/N/?) | Invite sent | Reply | Decision |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | **North India Tours** · owner@northindia.tours.demo | seed | Y (seed profile) | Y (FIT INR) | n/a | seed | **Locked (seed staging)** |

### Screening answers (winner)

| # | Answer |
| --- | --- |
| FIT quotes / week | Seed staging — grow real n after human week |
| Tools today | Excel/WA typical (persona) |
| Primary operator | sales@northindia.tours.demo (`sales_executive`) |
| Staging + real rates OK? | Y — clean org (not demo-travel) |
| Session replay OK? | Confirm on pilot build (`VITE_POSTHOG_KEY`) |
| Hard blockers | Seed ≠ real customer; Market-proven still open |

### Logins (password: `Password123!` unless `SEED_PASSWORD` set)

- Owner: `owner@northindia.tours.demo`
- Sales: `sales@northindia.tours.demo`
- Org slug: **`pilot-staging`** · Name: **North India Tours**

---

## 1.2 Provision — checklist

| # | Step | Owner | Done |
| ---: | --- | --- | --- |
| 1 | Create new agency org (not demo-travel) | Seed `ensurePilotStagingAgency` | **Y** |
| 2 | Branding | Seed primaryColour + companyName | **Y** |
| 3 | Invite sales (+ ops) members | Seed owner + sales_executive | **Y** |
| 4 | Optional FIT/demo pack | Skipped — keep clean for Replace | **N/A** |
| 5 | Pilot Day-0 Quote progressing | Branding + sales + markup/tax seeded | **Y** (open About after login) |
| 6 | PostHog | Set `VITE_POSTHOG_KEY` on pilot build | Manual |
| 7 | `pilotProgram.mode` = named + `seedStaging: true` | Seed | **Y** |
| 8 | Evidence pack identity | This tracker + evidence pack | **Y** |
| 9 | Replace before live bookings | Day 2 PW import | **Y (PW)** — soft-delete + ratesImported 1 |

---

## 1.3–1.5 (honest)

| Step | Status |
| --- | --- |
| 1.3 Replace + Day 2 Named scorecard | **Done (PW-as-human)** — Named Day 2 row filled; claim still Testing |
| 1.4 Days 1–4 Named scorecard | **Done (PW-as-human)** — spine/ops/collect green; revise/Match noted as prior demo beats |
| 1.5 Claim recommendation | **Testing** — PW/seed does **not** meet Market-proven flip criteria |

To reach Market-proven: real non-eng operator runs Days 1–4 on this org (or another) without eng/API stand-in and refreshes Named-pilot scorecard.
