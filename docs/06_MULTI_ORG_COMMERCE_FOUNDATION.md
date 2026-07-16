# Multi-Organization Commerce Foundation

Architecture note for Phases 0–6. Complements [00_PRODUCT_BIBLE.md](./00_PRODUCT_BIBLE.md).

## Principles

1. Independent Business OS first — network is optional.
2. One shared vocabulary (Product, Inventory, Reservation, Rate, Party, Policy, Invoice, Document, Message, Incident).
3. AI later; structure now — see `AI_READY_DATA_RULES` in `@travel/contracts` (`commerce-foundation.ts`).
4. Evolve existing models (`BookingComponent`, `StayReservation`, `Party`, trip finance) toward generics — no parallel HotelPayment stacks.

## Canonical contracts

Package: [`packages/contracts/src/commerce-foundation.ts`](../packages/contracts/src/commerce-foundation.ts)

| Primitive | Purpose |
|-----------|---------|
| VisibilityScope / Provenance / CommercialSnapshot | Ownership, source, history |
| Multi-status enums | Planning, availability, reservation, payment, operations (separate) |
| Controlled vocabularies | Dietary, meal plan, sources, incidents, cancel/lost reasons |
| AvailabilityBucket | Generic capacity over time |
| Policy + rules | Structured cancellation/LOS + human text |
| ServiceRequest | Agency↔partner commerce spine |
| CommercialDocument / PaymentRecord | Reusable money docs |
| Conversation / Message | Org inbox linked to business entities |
| DomainEventType | Outbox catalog |

## Lifecycle matrices

Keep these dimensions **independent** on records that need them:

| Dimension | Example values |
|-----------|----------------|
| Planning | draft → approved |
| Availability | available → held → reserved |
| Reservation | requested → confirmed → completed |
| Payment | scheduled → partial → paid |
| Operations | not_started → in_progress → completed |

## Phase map

| Phase | Focus |
|-------|--------|
| 0 | Contracts (this doc + Zod schemas) |
| 1 | Shared primitives (profile, party, policy, service request, money, inbox, events) |
| 2 | Agency ops depth |
| 3 | Stay OS |
| 4 | Homestay / farmstay overlays |
| 5 | Restaurant OS |
| 6 | Network collaboration |

## Engineering rules

- Every row: `organizationId` (+ visibility where shared).
- Snapshot rate + policy on confirm.
- Emit domain events via `OutboxService` with IDs only.
- Prefer extending Nest modules over new silos.

## Exit criteria (foundation)

See plan “Multi-Organization Commerce Foundation” completion criteria (profiles, shared stay domain, restaurant packages, service requests, explicit states, snapshots, no forced network).

## Commerce Integrity (next milestone)

Canonical ownership and lifecycle rules live in [`commerce-integrity/`](./commerce-integrity/01-domain-ownership.md). Foundation primitives are necessary but not sufficient until Integrity 1.0 exit criteria are met (one owner per commercial fact, atomic holds, payment allocation, cancel/change orchestration).
