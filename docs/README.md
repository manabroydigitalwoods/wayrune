# CodePoetry Travel Platform — Docs

**Start here:** [Travel OS Index](./travel-os/README.md) — navigation for the Travel Commerce Operating System, Domain Model, Capability Matrix, and Phase A backlog.

The **[Domain Model & Ubiquitous Language](./travel-os/03-domain-model-and-ubiquitous-language.md)** freezes business vocabulary. The **[Product Bible](./00_PRODUCT_BIBLE.md)** remains the source of truth for vision, commercial boundary, and staged unlock until the Agency OS chapter is migrated into Travel OS.

### Travel OS (canonical)

1. [Travel OS Index](./travel-os/README.md)
2. [03 Domain Model & Ubiquitous Language](./travel-os/03-domain-model-and-ubiquitous-language.md)
3. [04 Capability Matrix](./travel-os/04-capability-matrix.md)
4. [05 Phase A Backlog](./travel-os/05-phase-a-backlog.md)
5. [07 QR Guest Services](./travel-os/07-guest-services-qr.md) (Defined — not built)

### Deep references (pre-migration)

Keep using these until chapter-by-chapter migration after each OS reaches stable 1.0:

1. [Product Bible](./00_PRODUCT_BIBLE.md)
2. [Product Blueprint](./01_PRODUCT_BLUEPRINT.md)
3. [Master PRD](./02_MASTER_PRD.md)
4. [Node.js Technical Architecture](./03_TECHNICAL_ARCHITECTURE_NODEJS.md)
5. [UX Workflows and Screen Inventory](./04_UX_WORKFLOWS_AND_SCREENS.md)
6. [Delivery Phases and Acceptance](./05_PHASES_DELIVERY_AND_ACCEPTANCE.md)
7. [Multi-Organization Commerce Foundation](./06_MULTI_ORG_COMMERCE_FOUNDATION.md)
8. [Commerce Integrity](./commerce-integrity/README.md) (docs 01–11)

Stack: Node.js + TypeScript + NestJS (API), Vite React (web), Prisma/MySQL.

Thesis: multi-org Travel Commerce OS — vertical business OSes share a commerce spine; network connects organizations. Contracts: `@travel/contracts` → `commerce-foundation.ts`.
