# Wayrune — Product Bible

> **Navigation:** Prefer the [Travel OS Index](./travel-os/README.md) as the docs entry point. The [Domain Model](./travel-os/03-domain-model-and-ubiquitous-language.md) freezes business vocabulary; [Phase A Backlog](./travel-os/05-phase-a-backlog.md) owns near-term execution order. **This Bible remains the source of truth for vision, positioning, staged unlock, and commercial boundary** until an Agency OS chapter is migrated into Travel OS.

**Product:** Wayrune · **Domains:** wayrune.com (canonical), wayrune.ai, wayrune.in · **Company/studio:** CodePoetry

**Single source of truth** for vision, positioning, staged unlock, and commercial boundary. Detailed requirements, architecture, UX inventory, and phase exit criteria live in the numbered docs below — this Bible owns *what we are building and in what order* for staging (A→D).

---

## 1. What we are (and are not)

**We are:** a multi-tenant SaaS that starts as a **travel-agency ERP** and grows into a **connected B2B business network** (Travel Exchange).

**We are not:** a consumer OTA, public marketplace, GDS, or autonomous booking agent.

Local (offline) suppliers remain first-class forever. Network links are optional upgrades. AI is a utility layer under human control.

**Working name for the long-term platform:** Travel Operating System / Travel Exchange (short: Travel OS). Prefer **Organization** in product and code (already the model). Avoid “Community,” “Marketplace,” or “Airbnb for travel” in v1 messaging.

The long-term shape is a **shared knowledge layer** plus agency ERP: agencies **assemble** trips; they do not invent the universe of destination content. Local suppliers remain first-class forever.

---

## 1b. Five catalogs (Travel OS)

| Catalog | Owner | Examples |
|---------|-------|----------|
| **Places** | Platform (system) + org-local overrides | Cities, landmarks, airports; photos, hours, suitability |
| **Suppliers** | Agency-local list forever; optional network claim | Hotels, cars, drivers linked via `linkedOrganizationId` / `linkedAssetId` |
| **Travel knowledge** | Platform | Seasons, weather notes, packing tips, route edges |
| **Agency templates** | Agency-private | Reusable day skeletons / blocks referencing place IDs |
| **Customer data** | Agency-private | Leads, quotes, payments, documents, family threads |

**Living Proposal rule:** customer-facing proposals store **snapshots**. Catalog updates never silently rewrite a shared family thread; agencies refresh explicitly (version bump).

Stage A sell boundary is unchanged: Lead → Inquiry → Trip → Itinerary → Quotation (Living Proposal). Knowledge-layer depth ships beside that wedge — it does not replace it.

## 1c. Account, Asset, and Supplier (two planes)

Do not mix agency CRM with partner inventory.

| Plane | Who | Entity | Meaning |
|-------|-----|--------|---------|
| **Agency (buyer)** | Travel agency staff | **Supplier** | Private list of hotels, cars, drivers, DMCs — offline-first; optional network link |
| **Partner (seller)** | Hotel / homestay / car / driver operator | **Organization** (account) + **PartnerAsset** | One login/account owns many properties, vehicles, or drivers |

- **Organization** = legal/business account (e.g. “Himalayan Stays Pvt Ltd”). Users may belong to several accounts and **switch org** in-session.
- **PartnerAsset** = operable unit under that account (Hotel A, Homestay B, one Innova unit, one driver profile). Adding another hotel = add an Asset — not a new email/org — unless it is a separate legal business.
- **Supplier** stays agency-private forever. When a partner claims an invite, link to `linkedAssetId` (preferred) or `linkedOrganizationId` (fallback).
- `RoomType` / `VehicleType` are **itinerary catalogue enums**, not owned inventory.
- Stage D inventory (rooms, fleet slots, driver calendars) hangs **off PartnerAsset**, not off Organization.

## 2. Organization kinds and experiences

Kinds: `travel_agency | platform | hotel | homestay | farmstay | car_rental | driver | restaurant | dmc | other`

| Kind | Experience |
|------|------------|
| `travel_agency` | Full ERP: leads → inquiry → trip → itinerary → quotation → ops → finance |
| `platform` | Travel OS super-admin: system places, route knowledge, contribution moderation |
| Other kinds | Partner-facing network profile; local supplier lists |
| Partner kinds | Thin home: **portfolio of Assets**, profile, followers, inbound linked bookings; network discover |

Agency staff manage hotels, restaurants, drivers, etc. as **local Suppliers** (and optional network partners). Kind-specific inventory portals (rooms, menus, fleets) are **Stage D only** and are scoped **per PartnerAsset**.

---

## 3. Staged unlock (A → D)

Architect for the platform. Ship agency SaaS. Unlock network depth after agencies stick.

| Stage | Goal | Status intent |
|-------|------|----------------|
| **A — Agency PMF** | Quotes, ops, finance reliable; partners blocked from agency CRM | **Complete** |
| **B — Invite + confirm** | Supplier invite-to-claim; partner confirms inbound bookings; doc uploads | **In progress** |
| **C — Travel Exchange** | Structured opportunity posts (last-minute rooms, seats, meals); expiry; place filters; **no payments** | After B |
| **D — Kind portals** | Inventory **per PartnerAsset**: room allotment, restaurant packages, driver calendars, fleet availability; kind org switcher | **In progress** |

### Stage A exit (product)
- Agency can revise quotes after accept and download a branded proposal
- Partner orgs cannot use agency CRM routes or APIs
- Trip finance shows estimated vs actual cost; bookings can be cancelled cleanly

**Status:** Complete — branded PDF download, partner CRM block (+ slim partner permissions), finance compare, booking cancel with unpaid finance cascade.

### Stage B–D (product)

**Stage B (in progress):** invite tokens + claim link + partner inbound confirm shipped. Simple partner document uploads on inbound bookings still pending. Partner accounts own a **PartnerAsset** portfolio (multi-property / fleet); claim links can bind a supplier to a specific asset.

**Stage C:** Travel Exchange models (opportunity posts; no payments).

**Stage D (inventory engines live):** Inventory hangs off **PartnerAsset** — room allotment, fleet calendar, driver calendar, restaurant packages. Agencies switch org context (agency ↔ hotel/homestay/…); local-only suppliers use shadow assets on the agency org. Do not attach inventory tables to Organization.

**Stage D — hotel / stay partner portal (first draft):** Stay org kinds (`hotel` | `homestay` | `farmstay`) open a partner ops shell (dashboard KPIs, properties, rooms & allotment calendar, reservations with check-in/out, housekeeping board, thin rate plans, inbound inbox). Models: `AssetRoomUnit`, `StayReservation`, `AssetRatePlan` hang off `PartnerAsset` / room products. Agency inbound confirm creates a `StayReservation` and consumes allotment; not a consumer OTA, channel manager, or full folio PMS.

---

## 4. Commercial sell boundary

**Sell first around:** Lead Management + Inquiry + Trip + Itinerary + Quotation (delivery Phase 3).

**Outcome message (external):** *From Travel Enquiry to Successful Trip — All in One Place.* Capture leads, build professional itineraries, manage suppliers and bookings, collect payments, coordinate operations and grow your agency from one connected Travel OS. Outcome cards: reply faster · quote accurately · never miss follow-ups · control every booking · track every rupee · deliver better trips.

Introduce differentiators **after** that wedge: WhatsApp/email inbox → agency website (Presence) → customer proposals → hotel/DMC collaboration → multi-organization network → AI assistance. Do not lead with platform/ecosystem language.

Near-term agency depth vs Sembark (90-day sequence): [strategy/sembark-vs-travel-os.md](./strategy/sembark-vs-travel-os.md).

Phase 4 ops/finance should be thin-but-real for pilots; do not wait for Exchange or portals before testing willingness to pay.

Delivery phases 0–6 remain in [05_PHASES_DELIVERY_AND_ACCEPTANCE.md](./05_PHASES_DELIVERY_AND_ACCEPTANCE.md). Network unlock sits **after** those agency phases as a separate roadmap.

---

## 5. Explicit non-goals (until later stages)

- Consumer search/booking, own flight/hotel inventory, GDS, OTA marketplace
  - Full kind-specific inventory ERPs as separate top-level systems (Stage D engines hang off PartnerAsset: rooms, fleet, calendars, restaurant offers) (Stage D engines are now shipping: rooms, fleet, calendars, restaurant offers)
- Travel Exchange money rails / booking checkout in Exchange v0
- Full general ledger accounting
- Autonomous AI that sends, books, or moves money without confirmation

---

## 6. Architectural discipline

- Prefer **capabilities on Organization** gated by `kind` + permissions; portfolio operations use **PartnerAsset**
- Avoid separate `Hotel` / `Driver` / `Restaurant` top-level schemas — use `PartnerAsset.assetKind` until Stage D needs typed inventory tables hanging off an asset
- Keep **local Supplier** forever; `linkedAssetId` / `linkedOrganizationId` bridge to the network
- One partner login may manage many Assets; one person with two legal businesses uses **two Organizations** + org switcher
- Reject “new registration per hotel” as the primary UX for portfolio owners

---

## 7. Document map

| Doc | Role |
|-----|------|
| **This Bible** | Vision, stages, sell boundary, non-goals |
| [01_PRODUCT_BLUEPRINT.md](./01_PRODUCT_BLUEPRINT.md) | Product definition, objects, principles |
| [02_MASTER_PRD.md](./02_MASTER_PRD.md) | Deep agency ERP requirements |
| [03_TECHNICAL_ARCHITECTURE_NODEJS.md](./03_TECHNICAL_ARCHITECTURE_NODEJS.md) | NestJS / Prisma / monorepo architecture |
| [04_UX_WORKFLOWS_AND_SCREENS.md](./04_UX_WORKFLOWS_AND_SCREENS.md) | Workflows and screens |
| [05_PHASES_DELIVERY_AND_ACCEPTANCE.md](./05_PHASES_DELIVERY_AND_ACCEPTANCE.md) | Delivery phases + network unlock section |
| [strategy/sembark-vs-travel-os.md](./strategy/sembark-vs-travel-os.md) | Competitive strategy, revised maturity, 90-day P0 backlog |

When docs conflict, **this Bible wins** on vision and sequencing; amend numbered docs to match. For the next 90 days of agency-depth ordering vs Sembark, prefer the strategy memo.
