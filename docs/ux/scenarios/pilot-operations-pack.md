# Pilot operations pack

**Purpose:** Let a non-engineering owner or facilitator **recruit, schedule, provision, and run** the first real agency pilot — without code or database access for normal setup.

**Related:** [market-proof-evidence-pack.md](./market-proof-evidence-pack.md) · [pilot-week-runbook.md](./pilot-week-runbook.md) · [beat-sembark-scorecard.md](./beat-sembark-scorecard.md) · [posthog-session-replay.md](../posthog-session-replay.md) · Settings → About **Pilot Day-0**

---

## Claim ladder (do not conflate)

| Label | Who | What it proves | Public FIT / Market-proven? |
| --- | --- | --- | --- |
| **Internal proxy run** | Wayrune non-eng staff on clean staging | Setup, roles, UI, telemetry, evidence capture | **Never** |
| **Named agency pilot** | External non-eng agency | Real adoption week in progress | **Never** until flip criteria |
| **Pilot evidence complete** | Pack + scorecards filled for that run | Artifacts exist | **No** by itself |
| **Pilot-proven** (docs only) | Named week done; escapes logged; candidate recommendation | Ready for claim review | Still **not** Market-proven |
| **Market-proven** | Flip criteria in evidence pack all true | Credible switch proof | Manual registry only — **never** in-product auto |

Stamp every proxy artifact:

> **Internal proxy evidence — not customer or market proof**

Demo / Playwright / proxy **never** flip FIT Proven or Market-proven.

---

## 1. Agency recruitment brief

**Why Wayrune:** One connected trip workspace for quote → accept → supplier confirm → voucher → collect — less Excel reconstruction than a quote-only tool.

**What the week asks:** ~4–5 half-days. One sales operator (+ ops glance). Real or staging data on a **dedicated** org. Think-aloud on beat scripts. Friction logged honestly.

**What we will not claim from this week alone:** “Under 3 minutes” FIT (needs n≥20 real samples), Market-proven (needs flip criteria), full ledger / Sembark feature parity.

**What success looks like:** Operator completes core journey without developer/DB help; scorecard trust ≥4 and Y (or Unsure→Y); zero blocking escapes — or escapes logged for the next eng slice.

---

## 2. Ideal pilot-agency profile

- INR FIT / leisure packages (not airline-only)
- 1 sales person who quotes daily + 1 ops or accounts glance
- Currently uses Excel / WhatsApp / Word heavily alongside any existing tool
- Willing to use a **staging** org for Days 0–2 (Replace + import)
- Can run ~5–15 real or realistic enquiries during/after the week (FIT sample growth)
- Decision-maker available Day 5 for claim-gate review (15–30 min)

**Avoid for first pilot:** multi-brand conglomerates, full GL-only evaluators, agencies that refuse any CSV import.

---

## 3. Screening questions

1. How many FIT quotes per week do you typically send?
2. What do you use today for quoting (Excel, Sembark, Word, WhatsApp, other)?
3. Who will be the primary operator (role, not eng)? Can they do Days 1–4?
4. Can we use a staging org with your branding and a sample of real suppliers/rates?
5. Are you OK with session replay on staging (PII masked) for friction review?
6. Any hard blockers (must-have ledger, dense occupancy workbook, multi-currency) we should log as out of scope?

---

## 4. Pilot invitation message

```text
Subject: Wayrune Travel OS — 1-week pilot (staging)

Hi {Name},

We’d like to run a focused week on Wayrune with your sales (+ ops glance) —
quote → revise → accept → confirm → voucher → collect — on a staging org
with your branding.

What we need: ~4 half-days, honest feedback when you escape to Excel, and
permission for masked session replay on staging.

What we won’t claim from one week alone: public “under 3 minutes” or that
you’ve switched permanently. The goal is proof the core journey works for
you without developer help.

If useful, reply with a good week and who should operate Day 1.

Thanks,
{Facilitator}
```

---

## 5. One-week pilot schedule

| Day | Focus | Script / surface |
| --- | --- | --- |
| **0** | Provision + Day-0 readiness | This pack §7–9 · in-app Pilot Day-0 |
| **1** | Spine + revision + Match | [fit-family-golden.md](./fit-family-golden.md) · scorecard |
| **2** | Replace demo + real CSV | [import-replace-demo.md](./import-replace-demo.md) |
| **3** | Accept → confirm → voucher | [accept-confirm-voucher.md](./accept-confirm-voucher.md) |
| **4** | Collection + payable | [collection-payable.md](./collection-payable.md) |
| **5** | (Optional) Departures / owner · claim review | [departures-7d.md](./departures-7d.md) · §13 |

Full day plan: [pilot-week-runbook.md](./pilot-week-runbook.md).

---

## 6. Roles and responsibilities

| Role | Who | Does | Does not |
| --- | --- | --- | --- |
| **Facilitator** | Wayrune (non-eng OK) | Schedule, Day-0, friction log, evidence pack | Build features mid-week |
| **Operator** | Agency sales (+ ops) | Run scripts; think aloud | Need code/DB |
| **Eng on-call** | Wayrune eng | Correctness fixes only | P5–P8 unless ≥3 same-pattern escapes |
| **Owner (claim)** | Wayrune product | Day 5 claim-gate review | Soft-upgrade Market-proven |

---

## 7. Staging organization provisioning (UI-only)

**No Prisma, SQL, or shell required for agency staff.**

1. **Create a new agency** — Register a new account, or Settings → create additional organization. Do **not** reuse shared `demo-travel` seed as the pilot org.
2. **Branding** — Settings → Branding (logo and/or brand colour).
3. **Invite users** — Settings → Members: sales (+ ops). Confirm they can open Trips / Inquiries.
4. **Optional walkthrough** — Dashboard → Install FIT / demo operate pack **only** for guided practice. Labels show `[Demo]`.
5. **Before live bookings** — Settings → About → **Replace demo with real data**, then import real suppliers/rates ([import-replace-demo.md](./import-replace-demo.md)).
6. **PostHog** — Pilot **deploy/build** sets `VITE_POSTHOG_KEY` ([posthog-session-replay.md](../posthog-session-replay.md)). Confirm Settings → About Pilot Day-0 Evidence track.
7. **Claim gates** — Settings → About → Marketing claim gates show FIT **Testing**; demo samples excluded from public gate.
8. **Evidence** — Open [market-proof-evidence-pack.md](./market-proof-evidence-pack.md); fill pilot identity; set in-app mode **Named** (or **Proxy** for internal rehearsal).

---

## 8. Data and privacy checklist

- [ ] Staging org only for Days 0–2 Replace/import when possible
- [ ] Session replay masking confirmed (inputs + PII selectors) per PostHog doc
- [ ] No passport / card / full phone dumps in friction notes — link trip id + timestamp
- [ ] Operator consent recorded (email/WA reply OK)
- [ ] Demo pack replaced (or explicitly labelled) before any customer-facing doc
- [ ] Eng interventions logged (§11) — DB/API help on core journey blocks Market-proven

---

## 9. Day-0 setup checklist

Mirror in-app **Pilot Day-0** (Settings → About / owner Dashboard).

### Quote-ready
- [ ] Organization profile complete
- [ ] Branding configured
- [ ] Sales user available
- [ ] Traveller intake usable
- [ ] Package or blank quote path available
- [ ] Markup and tax display configured
- [ ] Proposal preview successful

### Operate-ready
- [ ] Real **or explicitly labelled demo** suppliers available
- [ ] Supplier contacts complete (H/T/A)
- [ ] Hotel/transfer/activity rates available + activated
- [ ] Supplier enquiry / confirm / payable / voucher paths tested
- [ ] **Never** treat FIT pack alone as Operate-ready

### Evidence-ready
- [ ] PostHog enabled on pilot build
- [ ] Replay privacy masking confirmed
- [ ] Test user roles created
- [ ] Clean staging org (not shared demo seed)
- [ ] Evidence pack + friction log linked
- [ ] Claim status visible (Testing)
- [ ] Demo runs excluded from FIT proof understood

---

## 10. Daily facilitator checklist

- [ ] Confirm operator + org; PostHog sessions tagging if available
- [ ] Open day’s script; timebox; no mid-session redesign
- [ ] Log friction / escapes / failures live (§11)
- [ ] Eng only for correctness (wrong totals, broken nav, data loss)
- [ ] End-of-day: update scorecard row + evidence pack
- [ ] Proxy week: stamp **Internal proxy evidence — not customer or market proof**

---

## 11. Friction, escape, failure, and intervention logs

### Friction (strategy fields)

| Date | User / role | Journey stage | Expected action | What happened | Workaround | Frequency | Business impact | Severity | Root cause | Evidence | Resolution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

### Escape (left Wayrune for core task)

| Date | Stage | Tool escaped to | Why | Blocking? | Pattern id |
| --- | --- | --- | --- | --- | --- |
| | | | | Y/N | |

≥3 same-pattern → open matching P5–P8 **before** Market-proven.

### Failure (correctness / crash)

| Date | Stage | Symptom | Severity | Eng ticket | Fixed? |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Intervention (eng touched DB/API/shell for core journey)

| Date | Stage | What eng did | Why | Disqualifies Market-proven? |
| --- | --- | --- | --- | --- |
| | | | | **Yes** if core journey required it |

---

## 12. Evidence-pack structure

Use [market-proof-evidence-pack.md](./market-proof-evidence-pack.md):

1. Pilot identity + mode (proxy | named)
2. Week schedule done flags
3. Friction / escape / intervention tables (or link to this pack’s logs)
4. Scorecard (Named pilot **or** Internal proxy section)
5. FIT sample tally (About claim gates)
6. Claim recommendation (Testing | Market-proven candidate | blocked)

Required artifacts: scorecard rows · at least one PostHog session id (or “N/A — noted”) · Replace checklist result · claim-gates screenshot or numbers.

---

## 13. Pilot completion and claim-gate review

1. Fill evidence pack **claim recommendation**.
2. Settings → About: FIT gate still Testing unless `publicClaimAllowed` (real n≥20) — proxy never counts.
3. In-app: set **Pilot evidence complete** only when pack is filled; mode stays proxy or named.
4. **Do not** flip Market-proven or FIT Proven from proxy or incomplete named week.
5. If named flip criteria met → update competitive current-state + registry **manually**.
6. If not → keep Testing; list top escapes → next eng slice (evidence-gated).
