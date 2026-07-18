# Sembark vs Travel OS — Strategy Memo

**Status:** Canonical competitive strategy + 90-day agency-depth backlog  
**Product:** Wayrune (Travel OS)  
**Related:** [Product Bible](../00_PRODUCT_BIBLE.md) · [Product Blueprint](../01_PRODUCT_BLUEPRINT.md) · [Travel OS Index](../travel-os/README.md)

This memo revises the Sembark competitive analysis against the current codebase. Use it for roadmap sequencing and external positioning — not as a greenfield feature wishlist.

---

## Executive verdict

**Sembark is currently deeper; our Travel OS is broader.**

Sembark concentrates on a commercially valuable agency journey:

> Lead → quotation → booking → supplier coordination → payment → tour operations

Our long-term advantage:

> Agency ERP → communication platform → digital presence → partner operating systems → connected travel network

**Strategic rule:** First become indispensable to one travel agency’s daily workflow. Then connect the travel ecosystem.

Customers buy relief from today’s problems (fast quotes, correct costing, follow-ups, ops coordination, supplier payables, vouchers, trip profit) — not platform architecture. Match Sembark’s depth on that wedge before leading with multi-org or Presence.

---

## 1. Revised comparison (codebase-backed)

Maturity labels: **early** | **partial** | **mature** | **structural** (architecture ahead of productized UX).

| Area | Sembark | Our Travel OS (today) | Current advantage |
|------|---------|----------------------|-------------------|
| Lead and enquiry intake | Lead APIs, round-robin, follow-ups | Parties, leads, inquiries, pipelines, custom fields, travel-request intake | **Objects near parity; outcomes still Sembark** until SLA, assignment, and quote-turnaround metrics are visible |
| Communication | WhatsApp notifications, calling add-on, email parsing | Unified inbox (WhatsApp / email / Instagram / website / Google Business), AI rewrite/summarize; Microsoft = SSO only; HubSpot = light contact sync; quote WA share = `wa.me` deep link | **Stronger foundation; uneven channel depth** — do not claim Microsoft messaging or full HubSpot CRM |
| Itinerary creation | Productised ~60s workflow with costing | Flexible itinerary builder + public proposal | **Sembark for speed and costing** |
| Quotation pricing | Multi-currency, tax, component markup, reusable supplier data | Versioned quotes, hotel/transfer rate resolve, cost/sell/tax/margin, branded PDF/email, public accept — FX stub, no margin gates, activity rates thin | **Sembark** — workflow exists; costing engine depth lags |
| Supplier contracts | Mature rates, seasons, stop/blackout dates, bulk upload | Hotel rates + transfer fares + allotments/stop-sell + negotiated CSV; `blackoutJson` not enforced in resolve; activities early | **Sembark today** — partial hotel/transfer; early activities & contracting controls |
| Booking operations | Reservations, assignment, vouchers, movement charts | Booking components + readiness checklist; vouchers = internal notes (not customer PDFs); no movement chart | **Sembark deeper** — vouchers/movement **early** |
| Payments and accounting | Receivables, payables, instalments, payment links, ledgers | Per-trip AR/AP + margin; trip payment links missing; org-wide ledgers thin | **Sembark** — trip P&L is our foothold |
| Multi-brand / multi-org | Multiple brands under one login | Org kinds (agency, hotel, DMC, driver, …), multi-membership, org switcher; partner OS / Travel Exchange unfinished | **Structural advantage; productized partner network still early** |
| Digital presence | No equivalent found | Hosted sites, themes, modules, platform hosts, forms→CRM; custom-domain TLS/verify deferred | **Ours** if framed as embedded travel site + CRM — not finished hosting ops |
| Partner ecosystem | Primarily one company’s internal ops | Planned connected partner OSes and network | **Long-term ours** — not a current sales wedge |
| Integrations | Lead APIs, email parsing, flights, calling, WhatsApp | Broader connector contract; channel depth uneven | **Foundation ours; depth mixed** |
| Onboarding | Mandatory consultant-led setup + extensive guides | Register, org seed, claim invite, Presence wizard — no implementation product | **Sembark** |
| Reporting | Extensive ops reports + saved presets | Role-composed dashboards; exportable BI early | **Sembark** |
| Market credibility | Public release notes, docs, claimed scale | Early-stage product | **Sembark** |

### Where we are already better (qualified)

- **True multi-organization platform** — architecture differentiates; do not sell as a finished partner network.
- **Omnichannel CRM foundation** — fair for agency inbox; qualify Microsoft / HubSpot depth.
- **Digital Presence** — strongest current differentiator among the four; secondary in sales narrative after quote/ops outcomes.

---

## 2. Ninety-day Priority 0 sequence

Do **not** ship the full costing/contracting wishlists as one epic. Three releases, then movement board.

### Release 1 — Quote speed path (days 1–30)

**Target:** Trained sales exec creates a normal INR FIT quotation in **under three minutes**. Public “60 seconds” only after telemetry.

| Work item | Build on | Notes |
|-----------|----------|-------|
| Reusable itinerary / quote templates + package clone | `QuoteTemplate` (seeded packages) | Seed: Darjeeling + Goa priced FIT packages; trip UI sorts by destination match; save-as-template stores `destinationHint` |
| Itinerary → priced lines loop | `POST /rates/resolve`, Trip workspace quote UI | Live auto-rematch in hotel/transfer drawer when match keys change; bulk refresh uses same apply helper |
| Markup presets (fixed + %) | Org `defaultMarkupPercent`, rate resolve | Agent vs customer markup later if needed |
| Margin warning + `below_margin.approve` | Org `minMarginPercent` + line override audit | API blocks send/approval; UI Send opens override when margin is the only gate |
| One-click branded proposal | PDF + email already | WhatsApp Cloud send (`POST …/send-whatsapp`) with public proposal link; `wa.me` fallback when Cloud is off |
| Quote revision UX polish | Versioning + revise-from-accepted | Strong already — polish, don’t rebuild |

**Defer past R1:** live FX, country tax regimes, full adult/child matrix everywhere, customer-facing quote comparison UI.

### Release 2 — Hotel + transfer contracting (days 31–60)

| Work item | Build on | Notes |
|-----------|----------|-------|
| Seasonal / weekend / occupancy-meal depth for hotels | `SupplierHotelRate`, Rates UI | Date windows exist; deepen grid UX |
| Blackout / stop-sale **enforced** in `rates/resolve` | `SupplierContract.blackoutJson`, inventory stop-sell | Active contract blackouts + linked-asset stop-sell allotments block hotel/transfer matches (`rateMeta.blockReason`) |
| Transfer capacity / closing dates / point-to-point polish | `TransferFare`, transfer matrix | Align with Sembark-like transport depth |
| CSV/XLSX bulk import + draft preview | Negotiated-rate CSV pattern | Hotel + transfer rate sheets; validation + version history |
| Rate-change detection + effective dates | Rate date windows | Surface “last updated” / approval where missing |

**Defer to P0.5:** activity/attraction rate cards, gala supplements catalogs, full cancellation-policy engines.

### Release 3 — Trip control centre (days 61–90)

Compose existing surfaces — do **not** rebuild booking.

| Work item | Build on | Notes |
|-----------|----------|-------|
| Single trip control screen | `OperationsPanel`, `FinancePanel`, readiness checklist, Trip workspace | Customer/supplier payment, hotels, transport, drivers, activities, vouchers pending, tasks, risks, profitability |
| Service status vocabulary | Booking component statuses | Unrequested → enquiry → awaiting → available → on hold → confirmed → payment pending → voucher pending → cancelled |
| Unconfirmed / risk flags | Readiness checklist | Missing transfer, unconfirmed hotel near departure, balance pending |

### After R3 — Movement and conflict board

Calendar / timeline / table across trips: departures, check-ins, transfers, driver/guide assignments, payment deadlines. Conflict flags (double vehicle/driver, missing transfer, overdue supplier pay). Ship only when trip control already stores assignment data the board can read.

### Priority 1 (after P0 wedge)

- Trip finance panel: payment links for instalments, org-wide AR/AP aging, portfolio profitability reports
- Role dashboards (sales / ops / accounts / owner) — compose from existing widgets + metrics
- Guided onboarding: checklist, sample data, destination starter packs, “first quotation” walkthrough, health score — before mandatory setup fees
- Downloadable / saved report presets

### Phase 3 differentiators (parallel demo only — not the sales wedge)

Hosted agency websites, forms→CRM, customer portal, hotel/DMC/driver partner orgs, shared inventory, marketplace. Keep Product Bible Stages B–D as unlock order. Do **not** pause Phase 1 agency depth to polish Presence for competitive messaging.

---

## 3. Appendix — Already built (polish, don’t re-spec)

| Capability | Maturity | Primary paths |
|------------|----------|---------------|
| Versioned quotations, approval, accept, revise-from-accepted | Partial → mature-leaning | `apps/api/src/modules/quotations/` |
| Quote templates (list/save/apply) + quotation clone | Partial | `quote-templates` API, trip workspace ··· menu |
| Quote cost-safety + sticky pricing summary + guided empty state | Partial | Trip Quotations tab: incomplete cost banner, send/approval gate, Add service / Import / Preview / Send |
| Margin gate (below-cost + org `minMarginPercent` floor) | Partial → mature-leaning | `below_margin.approve`, margin-overrides API, Settings min margin % |
| Quote service drawers (hotel / transfer / activity V1) | Partial | `QuoteServiceDetailSheet.tsx` — activity is manual buy→markup→sell |
| Branded proposal PDF + email | Partial → mature-leaning | `branded-proposal-pdf.ts`, quotation email send |
| Public itinerary / proposal share + accept | Partial → mature-leaning | `itineraries` share links, `PublicItineraryPage` |
| Hotel rates + transfer fares + `rates/resolve` | Partial | `apps/api/src/modules/rates/`, `RatesPage.tsx` |
| Itinerary builder (story, not priced) | Partial | `ItineraryBuilder.tsx`, itinerary versions |
| Trip booking components + supplier assign | Partial | `operations` module, `OperationsPanel.tsx` |
| Trip readiness checklist (incl. voucher note) | Partial | Trip workspace / ops |
| Trip finance summary (AR/AP, margin, est vs actual) | Partial | `FinancePanel.tsx`, `getFinanceSummary` |
| Role-composed dashboards | Partial | `composeDashboard.ts`, `DashboardPage.tsx` |
| Unified engagement inbox | Partial | `InboxPage.tsx`, `interactions`, connectors |
| Multi-org kinds + membership + switcher | Mature (arch) | `organizations`, RBAC, `OrgKindSchema` |
| Digital Presence builder + publish + forms→CRM | Mature core / partial hosting | `apps/api/src/modules/presence/`, `apps/web/src/pages/presence/` |
| Progressive complexity / capability gating | Partial | `apps/web/src/lib/progressiveComplexity/` |

### Intentionally not built yet (expect greenfield or thin stubs)

- Movement / conflict board across trips
- Customer voucher PDFs and bulk voucher send
- Trip payment links / instalment checkout
- Activity rate catalog in quote resolve (Activity drawer V1 is manual pricing)
- Blackout enforcement in rate resolve
- Guided implementation / onboarding centre
- Org-wide ledger and scheduled report packs
- Live FX and place-of-supply tax regimes

---

## 4. Positioning (adopt for site and sales)

### Do not lead with

> A multi-tenant connected travel-commerce operating ecosystem.

### Lead with

> **Capture every enquiry, create professional quotations faster, manage bookings and suppliers, collect payments and operate every trip from one place.**

Then introduce differentiators: connected WhatsApp and email → agency website → customer-facing proposals → hotel/DMC collaboration → multi-organization network → AI assistance.

### Primary website message

**Headline:** From Travel Enquiry to Successful Trip — All in One Place

**Supporting statement:** Capture leads, build professional itineraries, manage suppliers and bookings, collect payments, coordinate operations and grow your agency from one connected Travel OS.

**Outcome cards:**

- Reply faster
- Quote accurately
- Never miss follow-ups
- Control every booking
- Track every rupee
- Deliver better trips

**Secondary brand line (after outcomes):** Run your travel company and grow your travel brand from one platform.

### Claim discipline

- Public quote-speed target: **under three minutes** until median creation time is measured.
- Do not copy unverified “10X / 95% faster” marketing without methodology.
- Prefer telemetry: median quote time, lead response time, follow-up completion, conversion, collection time, confirmation time.
- Do not imply finished custom-domain hosting, Microsoft inbox, or full HubSpot CRM until shipped.

### What we should not copy from Sembark

- Feature-first complexity without progressive defaults
- Their multi-brand model (preserve our org-kind architecture)
- Unverified marketing numbers

---

## 5. Alignment with Product Bible

| Bible stage | This memo |
|-------------|-----------|
| Stage A — Agency PMF | Releases 1–3 + trip finance foothold |
| Stage B–D — invite, exchange, kind portals | Phase 3 differentiators; secondary in sales |
| Commercial sell boundary | Section 4 outcome messaging |

When this memo and older PRD wishlists conflict on near-term order, **this memo wins for the next 90 days**; Bible still wins on vision and staged unlock.
