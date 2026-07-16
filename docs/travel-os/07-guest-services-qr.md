# 07 — QR Guest Services (design-ready)

**Status:** UX Waves A–E **shipping** — distinct guest page + Links/Menu/Board/Settings; printable QR PDF; GS-08 settings; modifiers; Razorpay/mock pay; guest_check PDF + e-invoice stub; separate MealReservation kitchen pass.  
**Audience:** Product, pilots, engineering.  
**Related:** [Domain Model — Guest Services](./03-domain-model-and-ubiquitous-language.md#j-guest-services-qr--defined), [Money model](../commerce-integrity/06-money-and-settlement-model.md), [Phase A backlog](./05-phase-a-backlog.md).

## What this is

**Guest Self-Service Ordering** — not a standalone “QR menu.”

A guest scans a QR, opens a public mobile page, views currently available items/services, places an order, and that order enters the organization’s operational workflow (kitchen, housekeeping, host tasks, etc.) with charges posted to the correct bill.

Same foundation for:

```text
Restaurant table · Hotel room · Homestay room · Farmstay cottage
Poolside table · Event zone
```

**Boundary (non-negotiable):** guest ordering + operational fulfilment + billing post — **not** a full restaurant POS, food-delivery platform, or ingredient inventory system.

**Architecture rule:** Guest Services is a **vertical module**. Do **not** stuff kitchen tickets into `ServiceRequest` or treat a table check as a generic commerce `Reservation`. Reuse frozen money primitives (`FolioCharge`, `PaymentRecord`, optional `CommercialDocument`).

---

## Invoice and billing stance

### Do we manage invoices today?

**Yes — as staff operational / commercial records, not as guest-facing printable tax invoices.**

| Layer | Exists today? | Role in Guest Services |
|-------|---------------|------------------------|
| **Soft bill / folio** | Yes | Primary Phase 1 path: post `ServiceOrder` line snapshots as `FolioCharge` |
| **Formal invoice row** | Yes | `CommercialDocument` (`invoice` / credit_note / receipt) — optional after session/stay extras settle |
| **Agency supplier / trip invoices** | Yes | Parallel track; unchanged by Guest Services |
| **Printable guest check / tax invoice PDF** | **No** | Phase 1.5 / Phase 2 — only branded **proposal** PDFs exist today |
| **Online payment of guest check** | **No** | Phase 3 |

### Preferred Phase 1 money path

```text
ServiceOrder accepted / served
  → FolioCharge lines (nameSnapshot, unitPriceSnapshot, taxSnapshot, qty)
  → Restaurant: attach to TableSession bill ledger
  → Stay: attach to StayReservation folio (checked_in only)
  → Payments: existing PaymentRecord + amountPaid patterns
  → Later: optional CommercialDocument “guest check” + PDF
```

**Invariants:**

1. Do **not** invent a parallel invoice system for QR orders.  
2. Do **not** promise GST e-invoice / IRN in Phase 1 unless a pilot legally requires it.  
3. Outstanding table-session / stay folio math remains **Σ FolioCharge − amountPaid**.  
4. Hotel folio posting is allowed **only** when the stay is **checked_in**.  
5. Restaurant ordering requires an **OPEN** `TableSession` unless the org enables “accepting walk-in QR” (staff-open default).

---

## Architectural invariants

### QR identifies a location — never a guest

Public URL shape:

```text
https://guest.codepoetry.app/o/{publicToken}
```

Token resolves server-side to `ServiceLocation` (`organizationId`, `assetId`, `locationType`, `locationId`, `status`). Guests never see internal DB IDs. Tokens are opaque, rotatable, and revocable.

### Session and stay binding

| Context | Acceptance rule |
|---------|-----------------|
| Restaurant table | Active OPEN `TableSession` (or walk-in toggle); orders attach to that session |
| Hotel / stay unit | Active **checked_in** `StayReservation` for that unit; **hotel: 4-digit room PIN** at place-order (Phase 1) |
| No session / no stay | Ordering unavailable; contact reception / waiter |

Privacy: public page shows **location label** (“Room 204”, “Table 12”), not the guest’s full name, until verified (PIN / surname / code — PIN for hotel in Phase 1).

### Catalog vs packages

`MealPackage` remains for **group/event** dining (`MealInquiry` → `MealReservation`).  
QR a la carte uses **`ServiceOffering`** (+ availability), not overloaded packages.

### Food vs non-food

| Record | Use |
|--------|-----|
| `ServiceOrder` (+ items) | Chargeable catalogue fulfilment (food, shoppable services) |
| `GuestServiceRequest` | Non-food ops (towels, maintenance, wake-up) — may share guest UI |

Routing (category → kitchen / HK / laundry / front desk / host board) is vertical config, not commerce-spine logic.

### Spine stay small

```text
Guest Services module
  ServiceLocation · ServiceCatalog / ServiceOffering · ServiceCatalogAvailability
  ServiceOrder · ServiceOrderItem · GuestServiceRequest · TableSession

Billing (existing)
  FolioCharge · PaymentRecord · CommercialDocument (optional later)

Never
  ServiceRequest-as-KOT · generic Reservation-as-POS-check
```

Notify / Care / Search **consume** events; they do not own ordering.

---

## Phase 1 backlog (QR Guest Services 1.0)

Pilot-usable. Hypothesis until engineering starts — no schema until this boundary is accepted.

| ID | Outcome / exit criteria |
|----|-------------------------|
| **GS-01** | `ServiceLocation` CRUD per asset; location types table/room/unit/zone; opaque `publicToken`; regenerate / disable |
| **GS-02** | Staff QR management UI: list locations, status, last scanned, orders today, download printable QR (logo, label, token URL) |
| **GS-03** | Public unauthenticated route `/o/:token` (mobile-first): location label, accepting-orders status, available offerings only, allergen disclaimer |
| **GS-04** | Cart + place order with **idempotency key**; rate limit; scan/order audit (org, location, IP — privacy note) |
| **GS-05** | Restaurant: physical tables as locations; staff **open/close** `TableSession`; walk-in QR org toggle; `ServiceOrder` → kitchen board; FolioCharge on session bill |
| **GS-06** | Stay (hotel/homestay/farmstay): permanent room/unit QR; require checked_in stay; **hotel room PIN** at check-in + verify on order; post FolioCharge to stay folio |
| **GS-07** | Guest order status tracking (placed → accepted → preparing → ready / out → served/completed) |
| **GS-08** | Org controls: enable QR, business hours, pause accepting orders, item stop-sell, max qty |
| **GS-09** | Notify: new order to ops; escalation if unaccepted (reuse worker / outbox) |
| **GS-10** | Homestay/farmstay fulfilment board (host task queue or reuse HK-style board) so Phase 1 is not hotel-kitchen-only |

**Phase 1 acceptance (run-the-business):**

- Restaurant: guest can QR-order to an open table; kitchen sees ticket; charges appear on session bill.  
- Hotel: checked-in guest with PIN can order room service food; charges appear on stay folio.  
- No Excel / WhatsApp for those two happy paths.

### Phase 1.5 (billing polish — only if pilots demand)

| ID | Outcome |
|----|---------|
| **GS-15** | Staff/guest “request check”; `CommercialDocument` snapshot of session/stay extras |
| **GS-16** | Printable/PDF guest check (not full Indian e-invoice unless required) |

---

## Explicit deferrals (non-goals until later)

| Defer | Phase |
|-------|-------|
| Item modifiers / customizations | 2 |
| Multilingual menus | 2 |
| Call waiter / request bill deep UX | 2 |
| GuestServiceRequest depth (HK-only UI polish) | 2 |
| Order ETA / cancel rules enrichment | 2 |
| Surname / OTP alternatives to room PIN | 2 |
| Experience / activity booking via QR (waiver entanglement) | 2+ |
| Online payments | 3 |
| Tips | 3 |
| QR feedback / reorder / recommendations | 3 |
| Guest portal SSO integration | 3 |
| Split bill / seat assignment | Post–Phase 1 |
| Kitchen printer / KOT hardware | Post–Phase 1 (in-app board first) |
| Course firing / fire-hold | Post–Phase 1 |
| Interactive floor / table map | Post–Phase 1 (list + status enough) |
| Ingredient / stock ERP | Never for this module |
| Delivery marketplace / aggregator | Never |
| GST e-invoice / IRN | Not Phase 1 |

---

## Phasing summary

```text
Phase 1   — Locations, QR, public catalog, cart, TableSession + stay guards,
            kitchen/host board, FolioCharge, hotel PIN, status, notify
Phase 1.5 — Guest check CommercialDocument + PDF (pilot-driven)
Phase 2   — Modifiers, i18n, call waiter, HK requests, ETA, cancel rules
Phase 3   — Online pay, tips, feedback, reorder, guest portal
```

Roadmap position relative to Travel OS:

```text
Vertical OS 1.0 + Care (done)
  → Pilots run day-to-day business
  → QR Guest Services 1.0 (this chapter)
  → Pilot findings → 1.1 polish
  → Exchange / Intelligence later
```

---

## Customer and owner value (product note)

**Guests:** less waiting, clearer prices, dietary labels (with disclaimer), status tracking, itemized bill later.  
**Owners:** fewer missed orders, folio/session posting, ancillary hotel revenue, better kitchen coordination — without leaving Travel OS.

---

## Change control

When implementation starts:

1. Promote concepts from **Defined** → **Implemented** in the Domain Model in the same PR as schema/API.  
2. Close GS-* backlog IDs in [05 — Phase A Backlog](./05-phase-a-backlog.md) with status notes.  
3. Keep Guest Services out of the commerce spine unless a pilot proves a primitive is wrongly scoped.
