# Travel OS — Documentation Index

**Start here.** This is the canonical entry point for Wayrune (Travel OS) documentation.

**Product:** Wayrune · wayrune.com · wayrune.ai · wayrune.in


## What this platform is

A **Travel Commerce Operating System**: multi-organization SaaS where each business kind (agency, hotel, restaurant, mobility, …) runs an independent operating system on a shared commerce spine. The network connects organizations; it does not own their core records.

We are **not** a consumer OTA, public marketplace, or GDS.

## How to navigate

1. **[03 — Domain Model & Ubiquitous Language](./03-domain-model-and-ubiquitous-language.md)** — freeze vocabulary first
2. **[04 — Capability Matrix](./04-capability-matrix.md)** — maturity dashboard per organization kind
3. **[05 — Phase A Backlog](./05-phase-a-backlog.md)** — Phase A/B closed; Guest Services + Pilot stubs
4. **[07 — QR Guest Services](./07-guest-services-qr.md)** — guest self-service ordering design (Defined; not built)
5. Then deep references below for architecture detail already shipped

### Vocabulary rule

The **Domain Model** is the source of business language. Contracts (`@wayrune/contracts`), Prisma, APIs, UI copy, events, and future AI agents should use the same terms. If code and Domain Model disagree, **code wins until the Domain Model is updated** — then align the docs in the same change.

### Architecture freeze

Do **not** add new foundational commerce abstractions (new layers over ServiceRequest / BookingRequirement / Hold / Reservation / Document / Payment) unless a real pilot forces a refinement of an *existing* concept. Extend vertical business OSes instead.

---

## Chapter map

| # | Chapter | Status | Where to read today |
|---|---------|--------|---------------------|
| 01 | Platform Foundation | Linked (pre-migration) | [Product Bible](../00_PRODUCT_BIBLE.md), [Technical Architecture](../03_TECHNICAL_ARCHITECTURE_NODEJS.md) |
| 02 | Commerce Foundation | Linked (pre-migration) | [Multi-Org Commerce Foundation](../06_MULTI_ORG_COMMERCE_FOUNDATION.md), [Commerce Integrity](../commerce-integrity/README.md) |
| 03 | Domain Model & Ubiquitous Language | **Canonical** | [This pass](./03-domain-model-and-ubiquitous-language.md) |
| 04 | Capability Matrix | **Canonical** | [This pass](./04-capability-matrix.md) — executive view; see also [Integrity 08](../commerce-integrity/08-organization-kind-capability-matrix.md) |
| 05 | Phase A Backlog | **Canonical** | [This pass](./05-phase-a-backlog.md) — includes Guest Services GS-* + Pilot stub |
| 07 | QR Guest Services | **Phase 1 shipped** | [This pass](./07-guest-services-qr.md) — public `/o/:token`, staff Guest QR, FolioCharge; Domain Model § J |
| — | Agency OS | Stub — migrate later | Bible + [Master PRD](../02_MASTER_PRD.md) + [UX inventory](../04_UX_WORKFLOWS_AND_SCREENS.md) |
| — | Stay OS | Stub — migrate later | [Integrity 11](../commerce-integrity/11-inventory-adapters-and-stay-modify.md) + Stay module |
| — | Restaurant OS | 1.0 complete | Phase A closed |
| — | Mobility OS (Car + Driver) | 1.0 complete | Phase A closed |
| — | DMC OS | 1.0 complete (Agency variant) | Phase A closed |
| — | Experience OS | 1.0 complete | Phase A closed |
| — | Phase B Care / platform | Guest history, incidents, rates CSV, search facets, notify + digest, driver PWA | Phase B backlog closed |
| — | Network | Linked | Bible Stages B/C + network module |
| — | Data Governance | Linked | [Integrity 10](../commerce-integrity/10-data-governance-and-ai-readiness.md) |
| — | Integrations | Future | — |
| — | Analytics | Future | Phase B |
| — | Future Intelligence | Deferred as milestone | AI is a *consumer* of the platform, not a roadmap stage |

---

## Incremental migration policy

Migrate an OS chapter into `docs/travel-os/` only when:

1. That OS is at **stable 1.0**, and  
2. Domain Model concepts for it are **frozen**.

Until then, **link** to existing docs. Do not rehome Bible / Foundation / Integrity en masse.

---

## Vision & staging (still authoritative)

[Product Bible](../00_PRODUCT_BIBLE.md) remains the source of truth for **positioning, commercial boundary, and staged unlock** until an Agency OS chapter is migrated here.

**Competitive / agency-depth sequencing (90 days):** [Sembark vs Travel OS](../strategy/sembark-vs-travel-os.md) — revised maturity vs Sembark, Priority 0 release order, already-built appendix, outcome messaging.
