# 04 — Capability Matrix

**Audience:** Executives, product, pilots.  
**Deep offline OS notes:** [Commerce Integrity 08](../commerce-integrity/08-organization-kind-capability-matrix.md).  
**Vocabulary:** [Domain Model](./03-domain-model-and-ubiquitous-language.md).  
**What to build:** [Phase A Backlog](./05-phase-a-backlog.md) (includes Phase B band).

## Legend

| Score | Meaning |
|-------|---------|
| **full** | Business can run this capability offline end-to-end for typical pilots |
| **partial** | Core records or thin UI exist; workflow incomplete |
| **missing** | Not usable for a real pilot of that kind |
| **n/a** | Not required for that kind |

## Matrix

| Capability | Agency | Hotel | Homestay | Farmstay | Restaurant | Car | Driver | DMC | Platform |
|------------|--------|-------|----------|----------|------------|-----|--------|-----|----------|
| **Acquire** (CRM / inquiry / walk-in) | full | partial | partial | partial | full | partial | partial | full | n/a |
| **Products** (what they sell) | full | full | full | full | full | full | full | full | full* |
| **Pricing** (rates, packages, negotiate) | full | partial | partial | partial | full | full | partial | full | full* |
| **Inventory** (promise capacity) | partial | full | full | full | full | full | full | partial | n/a |
| **Reservations** | full | full | full | full | full | full | full | full | n/a |
| **Operations** (fulfil) | full | full | full | full | full | full | full | full | n/a |
| **Finance** (bill / collect / settle) | full | full | full | partial | full | full | full | full | n/a |
| **Care** (incidents, reviews, history) | full | full* | full* | full* | full* | full* | full* | full* | n/a |

\*Partner Care = org-scoped history + incidents + mirrored ratings; not cross-org guest graph or CS queue.

## Eight-question YES checklist (snapshot)

| Kind | Acquire | Products | Pricing | Inventory | Reserve | Operate | Finance | Care | Focus next |
|------|---------|----------|---------|-----------|---------|---------|---------|------|------------|
| Agency | YES | YES | YES | ◐ | YES | YES | YES | YES | Pilots; inventory depth |
| Hotel | ◐ | YES | ◐ | YES | YES | YES | YES | YES | Pilots; acquire/pricing |
| Homestay | ◐ | YES | ◐ | YES | YES | YES | YES | YES | Pilots; acquire/pricing |
| Farmstay | ◐ | YES | ◐ | YES | YES | YES | ◐ | YES | Pilots; Pricing/Finance |
| Restaurant | YES | YES | YES | YES | YES | YES | YES | YES | Pilots |
| Car | ◐ | YES | YES | YES | YES | YES | YES | YES | Pilots; acquire |
| Driver | ◐ | YES | ◐ | YES | YES | YES | YES | YES | Pilots; acquire/pricing |
| DMC | YES | YES | YES | ◐ | YES | YES | YES | YES | Pilots; inventory depth |
| Platform | n/a | YES | YES | n/a | n/a | n/a | n/a | n/a | Catalog depth as needed |

◐ = partial YES (usable but not complete).

## How to read this

- **Architecture is not the gap** — vertical **business completeness** is.
- Every kind should eventually answer **YES** (or n/a) on the eight questions without requiring the Network.
- Update this matrix when a Phase A / Phase B backlog item ships; do not invent new capability rows without Domain Model coverage.

## Maturity sketch (indicative)

| Kind | Completeness (indicative) |
|------|---------------------------|
| Agency | ~99% — A-AGY notify/search/import/analytics + rates CSV |
| Stay (Hotel) | ~94% — Stay OS 1.0 + Care hardened |
| Homestay | ~90% — same stay core + Care |
| Restaurant | ~93% — Restaurant OS 1.0 + Care hardened |
| Farmstay / Experience | ~84% — Experience OS 1.0 + Care experiences |
| Car rental | ~88% — Mobility Car OS 1.0 + Care hardened |
| Driver | ~90% — Driver OS + Care report on mobile |
| DMC | ~92% — Agency variant + party-scoped Care |
