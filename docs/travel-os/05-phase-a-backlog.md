# 05 — Phase A Backlog

**Scope:** Execution roadmap for the next ~6–12 months. **No new commerce foundation layers.**  
**Inputs:** [Capability Matrix](./04-capability-matrix.md), [Domain Model](./03-domain-model-and-ubiquitous-language.md).  
**Defer:** Travel Exchange marketplace, payment gateway depth, deep AI feature packs, docs rehome until Agency + Stay + Restaurant are stable 1.0.

## Strategy

```text
Phase A — Complete independent business OSes
    → Phase B — Platform services (notify, search, imports, analytics)
        → Multi-org pilots refine existing domain
            → Intelligence as a consumer (not a milestone)
```

**Ordering principle:** Vertical OS completeness before platform polish *except where* Agency polish is listed as P1 (scale unblocks). Restaurant is P0 because it is the largest near-term maturity gap.

## Priority bands (locked)

| Band | Focus |
|------|--------|
| **P0** | Restaurant OS 1.0; Stay pilot-blocking gaps only |
| **P1** | Farmstay Experience OS 1.0; Agency platform polish |
| **P2** | Mobility OS 1.0 (car + driver); DMC OS 1.0 |

---

## P0 — Restaurant OS 1.0

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-REST-01 | Acquire | Direct group/event **inquiry** creatable; linkable to Party | Party |
| A-REST-02 | Pricing / Products | Inquiry → optional **quotation** for meal package (sell snapshot) | MealPackage |
| A-REST-03 | Reservations | Full **reservation lifecycle** (request → confirm → seated/served → cancel) with transition guards | MealReservation, Domain Model |
| A-REST-04 | Inventory | Hold/confirm/release dining capacity on confirm path (adapters already exist) | InventoryHold, DiningCapacityAdapter |
| A-REST-05 | Operations | Kitchen board tied to reservation lifecycle; prep statuses drive ops | Kitchen board |
| A-REST-06 | Finance | Bill / soft folio for meal reservation; payment allocate; outstanding checklist | CommercialDocument, FinanceBalance |
| A-REST-07 | Care | Customer (Party) history of past meal reservations | Party, MealReservation |
| A-REST-08 | UX | Partner restaurant home: Inquiry → Reserve → Kitchen → Bill without Network | PartnerHome |

**Exit:** Capability Matrix shows Restaurant **full|partial→full** on Acquire, Reservations, Operations, Finance (no `missing` on those four). Offline YES on eight questions for group dining pilots.

**Status (2026-07-15):** Restaurant OS 1.0 shipped — `MealInquiry`, hold-safe reservations, named ops, meal folio/payments, kitchen board, restaurant portal tabs (`/restaurant/*`). Care (Party history API) is live; deepen UX later.

---

## P0 — Stay OS harden (pilot-only)

Do **not** redesign Stay OS 1.0. Only close pilot blockers.

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-STAY-01 | Operations | Room assignment edge cases documented + fixed (overlap, OOO, move history) | StayReservation |
| A-STAY-02 | Finance | Folio ↔ PaymentAllocation / document link depth for checkout balance | FolioCharge, FinanceBalance |
| A-STAY-03 | Operations | Night audit (PropertyDayClose) polish from first pilot feedback | PropertyDayClose |
| A-STAY-04 | Products | Homestay attrs used in real check-in flow (rules ack when configured) | profileJson / reservation attrs |

**Exit:** Hotel pilot runs walk-in → assign → folio → day-close → checkout with blockers **without Network**; no P0 Stay bugs open.

**Status (2026-07-15):** Stay OS harden shipped — create/update assign guards + history; folio `amountPaid` / payments / invoice / outstanding checkout blockers; PropertyDayClose unpaid = charges−paid + day-close list UI; homestay house rules ack enforced at check-in.

---

## P1 — Farmstay / Experience OS 1.0

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-XP-01 | Products | Experience product catalog complete for sell | ExperienceProduct |
| A-XP-02 | Reservations | **ExperienceReservation** with slot hold/consume | ExperienceSlotAdapter |
| A-XP-03 | Operations | Participants list, attendance mark | ExperienceReservation |
| A-XP-04 | Care / Compliance | Waiver capture + timestamp | Domain Model Experience |
| A-XP-05 | Inventory | Resource scheduling (guide/equipment) **or** documented N/A for v1 | Capacity |
| A-XP-06 | UX | Farmstay nav: Stay + Experiences with reservation loop | StayExperiencesPanel |

**Exit:** Farmstay answers YES on Products, Inventory (slots), Reservations, Operations for experiences; Matrix Experience columns leave `missing`.

**Status (2026-07-15):** Experience / Farmstay OS 1.0 shipped — `ExperienceReservation` + participants/attendance/waiver, hold-safe `ExperienceSlotAdapter` (held→reserved), named ops under `/experience/*`, Farmstay Experiences tab reservation loop. Resource scheduling (guides/equipment) documented **N/A** via `GET /experience/resource-scheduling-policy` (`instructorRequired` sell flag only).

---

## P1 — Agency OS polish (platform services)

Agency vertical is ~95% complete; these unlock scale, not architecture.

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-AGY-01 | Care / Ops | **Notification engine** v1: in-app + email delivery for key events (not stub-only) | Outbox, worker |
| A-AGY-02 | Acquire / Ops | Org-scoped **search** across parties, trips, SRs, documents | Index strategy TBD |
| A-AGY-03 | Acquire | **CSV imports** beyond leads (parties and/or rates — pick highest pilot ask) | Existing lead import patterns |
| A-AGY-04 | Finance / Ops | Basic **analytics** dashboards (bookings, conversion, aging AR) | Dashboard |

**Exit:** Agency Matrix Care moves toward full; production email actually sends for configured events.

**Status (2026-07-15):** Agency polish shipped — SMTP email in worker (`notification.email` / `quote.email`); dual-channel notify for lead assign / quote accept / payment; notifications bell + `GET /search`; parties CSV import; dashboard conversion, bookings 30d, AR aging. Rates CSV → Phase B **B-AGY-05 Done**.

---

## P2 — Mobility OS 1.0

### Car rental

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-MOB-CAR-01 | Products / Inventory | Fleet units + availability calendar sold as products | **Done** — AssetFleetUnit + calendar + allocation |
| A-MOB-CAR-02 | Pricing | Rental rates + deposits | **Done** — AssetFleetRate |
| A-MOB-CAR-03 | Reservations | Rental reservation lifecycle (hold → checkout → return) | **Done** — RentalReservation + `/mobility/*` |
| A-MOB-CAR-04 | Operations | Checkout / return checklist; damage note | **Done** — checklists + FolioCharge damage |
| A-MOB-CAR-05 | Finance | Deposit + final bill documents | **Done** — deposit/final CommercialDocument + payments |

### Driver

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-MOB-DRV-01 | Inventory | Driver availability calendar | **Done** — AssetCalendarBlock + `/driver/*/availability` |
| A-MOB-DRV-02 | Reservations / Ops | Assignment to transfer / job | **Done** — DriverJob (+ optional ServiceRequest) |
| A-MOB-DRV-03 | Finance | Pay / settlement lightweight | **Done** — invoice + PaymentRecord |
| A-MOB-DRV-04 | UX | **Mobile-first** thin flows (responsive; native app optional later) | **Done** — Today / Jobs / Pay portal |

**Exit:** Car and Driver Matrix have no `missing` on Inventory, Reservations, Operations, Finance for intended thin depth; offline capable.

---

## P2 — DMC OS 1.0

Treat as **Agency OS variant** — reuse Trip / BookingRequirement / ServiceRequest spine. No parallel trip model.

| ID | Capability | Outcome / exit criteria | Depends on |
|----|------------|-------------------------|------------|
| A-DMC-01 | Acquire | B2B client (Party) workflows emphasized | **Done** — B2B type + filter; seeded agency client |
| A-DMC-02 | Pricing | Net rates + markup on multi-service packages | **Done** — quote Net/Sell labels; Rates = net rates |
| A-DMC-03 | Reservations / Ops | Multi-SR item fulfilment to local suppliers | **Done** — DmcFulfilmentBoard + SR items |
| A-DMC-04 | Finance | Sub-supplier payables + partner settlements | **Done** — settlement rollup on DMC home |
| A-DMC-05 | UX | DMC org kind landing = Agency-like workspace with DMC labels | **Done** — `dmc` uses Agency shell + labels |

**Exit:** DMC answers YES on Acquire, Products, Pricing, Reservations, Operations, Finance at Agency-variant depth.

**Status (2026-07-15):** DMC OS 1.0 shipped — `dmc` uses Agency shell/roles; B2B Party UX; Net/Sell quotes; DmcFulfilmentBoard; settlements.

---

## Phase A exit status

**Closed (2026-07-15).** All P0–P2 named IDs met. Capability Matrix has **no `missing`** on Acquire / Products / Inventory / Reservations / Operations / Finance for each kind’s intended depth (Care remains partial on partner OSes → Phase B).

---

## Phase B — Platform & Care deepen

| ID | Focus | Outcome / exit criteria | Status |
|----|-------|-------------------------|--------|
| B-CARE-01 | Guest history | Cross-vertical Party/guest lookup (stay, meal, rental, driver) | **Done** — `/commerce/care/history` + Care tabs |
| B-CARE-02 | Incidents / reviews | Surface PartnerRating + ServiceIncident on Care | **Done** — `/commerce/care/board` + Care panel report/resolve + related incidents in history |
| B-AGY-05 | Imports | Rates CSV (deferred from A-AGY-03) | **Done** — `/commerce/negotiated-rates/import/csv` + Network rates CSV paste |
| B-PLT-01 | Search deepen | Faceted global search beyond v1 | **Done** — leads/quotes/assets + `types` facets + chip UI |
| B-PLT-02 | Notify deepen | More event types + digest | **Done** — incident/task/quote-approval notifies + owner digest |
| B-MOB-01 | Mobile polish | Driver/care PWA-ready viewport pass | **Done** — manifest + safe-area bottom nav + Care touch targets |

**Ordering:** Care UX for pilots first; then Agency/platform polish. No new commerce foundation layers.

---

## Pilot harden — Care completeness (post Phase B)

| ID | Focus | Outcome | Status |
|----|-------|---------|--------|
| P-CARE-01 | Lookup quality | Party-scoped history; phone last-10 digit match; empty-state clarity | **Done** |
| P-CARE-02 | Permissions | `incident.manage` on partner admin / front_desk / reservation_manager; Care board = ops | **Done** |
| P-CARE-03 | Driver Care | Compact layout still allows report + resolve | **Done** |
| P-CARE-04 | Experiences | Care history includes experience reservations / participants | **Done** |

---

## Explicit non-goals (Phase A)

- New Offering / BookingRequirement table redesign  
- Exchange / opportunity posts / consumer checkout  
- Autonomous AI milestones  
- Full GL accounting  
- Rehoming all docs into Travel OS chapters before Restaurant OS 1.0 stabilizes  

---

## Phase A exit (overall)

1. Capability Matrix: no `missing` on Acquire / Products / Inventory / Reservations / Operations / Finance for each kind’s **intended** depth (Platform n/a).  
2. Restaurant, Stay (pilot-harden), Experience, Mobility, DMC have named exit criteria above met or consciously deferred with Matrix update.  
3. Domain Model concepts for each shipped vertical updated in the same PR that closes the backlog ID.

## After Phase A

**Phase B** — deepen notifications, search, imports, analytics, integrations, mobile.  
**Pilots** — refine existing domain; do not invent parallel abstractions.  
**Intelligence** — agents as clients of Domain Model + APIs only.

---

## Phase Guest Services — QR Guest Services 1.0 (Defined)

**Canonical design:** [07 — QR Guest Services](./07-guest-services-qr.md).  
**Domain vocabulary:** [Domain Model § J](./03-domain-model-and-ubiquitous-language.md#j-guest-services-qr--defined).  
**Rule:** Vertical Guest Services module; bill via `FolioCharge` first; no spine redesign; no e-invoice promise in Phase 1.

| ID | Focus | Outcome / exit criteria | Status |
|----|-------|-------------------------|--------|
| GS-01 | Locations | `ServiceLocation` + opaque public token; regenerate/disable | **Done** |
| GS-02 | QR admin | Staff QR management + printable QR PDF | **Done** |
| GS-03 | Public page | Mobile catalog for available offerings only + allergen disclaimer | **Done** — `/o/:token` |
| GS-04 | Place order | Cart + idempotent place + rate limit + scan/order audit | **Done** |
| GS-05 | Restaurant | TableSession staff open/close; kitchen board; FolioCharge on session | **Done** |
| GS-06 | Stay | Checked-in stay + hotel room PIN; FolioCharge on stay folio | **Done** |
| GS-07 | Guest status | Placed → accepted → preparing → ready/served tracking | **Done** |
| GS-08 | Controls | Enable QR, hours, pause accepting, stop-sell, max qty | **Done** — Guest QR Settings tab |
| GS-09 | Notify | New-order alert + unaccepted escalation (worker) | **Partial** — in-app new-order notify; timed escalation later |
| GS-10 | Host boards | Homestay/farmstay host task fulfilment (not hotel-only) | **Done** — Guest QR board on stay kinds |
| GS-15 | Check doc | Optional CommercialDocument guest-check snapshot | **Done** |
| GS-16 | Check PDF | Printable guest check PDF | **Done** (+ e-invoice adapter stub) |

### Explicitly deferred (see 07)

Modifiers, i18n, call waiter depth, online pay, tips, split bill, KOT printers, course firing, floor maps, GST e-invoice/IRN, delivery marketplace, ingredient inventory.

---

## Phase Pilot / Travel OS 1.1 (stub)

**Goal:** Close run-the-business gaps discovered in pilots.  
**Rule:** No new commerce entities unless a pilot proves an *existing* concept is wrong; prefer vertical OS UX/ops.  
**Seed hypotheses (not a build mandate):** agency inventory depth, stay acquire/pricing, farmstay finance, analytics ◐ across kinds — confirm in pilots before scheduling.
