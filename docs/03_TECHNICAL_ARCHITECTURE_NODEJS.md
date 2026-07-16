# Technical Architecture — Full Node.js / TypeScript

## 1. Decision

Use TypeScript across frontend, backend, workers and shared contracts.

Recommended architecture:

- Frontend: React + Vite
- Backend API: NestJS
- Runtime: Node.js LTS
- Database: MySQL
- ORM: Prisma ORM
- Cache and jobs: Redis / Valkey with BullMQ
- Object storage: Amazon S3 or compatible service
- Search: MySQL FULLTEXT and LIKE initially
- PDF generation: HTML templates rendered by Playwright
- Authentication: first-party JWT auth (OIDC adapters later)
- API: REST with OpenAPI
- Realtime: WebSocket or Server-Sent Events only where required
- Observability: OpenTelemetry, structured logs and error tracking
- Deployment: Docker containers



## 2. Why Node.js Is Suitable

The application is dominated by:

- HTTP APIs
- Database access
- Webhooks
- file and document workflows
- notifications
- integration calls
- background jobs
- collaborative SaaS screens

These are I/O-heavy workloads and fit Node.js well.

Use workers or external services for CPU-heavy work such as:

- very large PDF batches
- image processing
- OCR
- complex optimization
- machine-learning inference



## 3. Architecture Style

Start with a modular monolith.

Do not start with microservices.

### Modules

- identity
- organizations
- users
- authorization
- parties
- leads
- inquiries
- trips
- travellers
- itineraries
- quotations
- catalogue
- suppliers
- operations
- receivables
- payables
- documents
- tasks
- communications
- notifications
- reports
- ai-assistance
- audit
- integrations

Each module owns:

- domain model
- application services
- persistence access
- controllers
- events
- validation
- authorization policies

Modules communicate through explicit services and domain events, not by importing each other's database repositories freely.

## 4. Repository Layout

```text
travel-platform/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── contracts/
│   ├── ui/
│   ├── config/
│   ├── auth/
│   ├── observability/
│   └── testing/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
├── docs/
├── infrastructure/
└── package.json
```

Use a monorepo with pnpm workspaces and Turborepo or Nx.

## 5. Backend Module Layout

```text
src/modules/trips/
├── domain/
│   ├── trip.entity.ts
│   ├── trip-status.ts
│   ├── trip.events.ts
│   └── trip.repository.ts
├── application/
│   ├── commands/
│   ├── queries/
│   ├── dto/
│   └── trip.service.ts
├── infrastructure/
│   ├── prisma-trip.repository.ts
│   └── trip.mapper.ts
├── presentation/
│   ├── trip.controller.ts
│   └── trip.presenter.ts
└── trips.module.ts
```

Avoid excessive ceremony in simple CRUD modules. Use richer domain patterns only where business rules justify them.

## 6. Multi-Tenancy

Use shared database and shared schema initially.

Every tenant-owned table contains:

- organization_id
- created_at
- updated_at
- created_by
- updated_by
- optional deleted_at

Requirements:

- organization context resolved from authenticated membership
- all repositories require organization scope
- composite unique constraints include organization_id
- database row-level security may be added for defence in depth
- background jobs carry organization context
- object-storage keys are tenant-prefixed
- audit records include tenant and actor

Never accept organization_id from an untrusted client as the authority.

## 7. Main Data Model



### Identity

- users
- organizations
- organization_memberships
- roles
- permissions
- role_permissions
- membership_roles



### CRM

- parties
- individuals
- organizations_profile
- party_contacts
- addresses
- leads
- lead_sources
- campaigns
- pipelines
- pipeline_stages
- lead_stage_history
- activities



### Travel

- inquiries
- inquiry_destinations
- inquiry_requirements
- trips
- travellers
- trip_travellers
- itineraries
- itinerary_versions
- itinerary_days
- itinerary_items



### Commercial

- quotations
- quotation_versions
- quotation_sections
- quotation_items
- taxes
- discounts
- approvals



### Supply and Operations

- suppliers
- supplier_services
- rate_plans
- booking_components
- booking_status_history
- vouchers
- operational_checklists



### Finance

- customer_payment_schedules
- customer_payments
- refunds
- supplier_invoices
- supplier_payments
- currency_rate_snapshots



### Platform

- documents
- document_versions
- tasks
- comments
- notifications
- webhooks
- integration_connections
- audit_events
- outbox_events



## 8. API Conventions

- Prefix: /api/v1
- JSON request and response
- Cursor or page-based pagination
- Idempotency-Key for lead ingestion, payments and external callbacks
- Request correlation ID
- OpenAPI specification
- RFC 7807-style problem responses
- Optimistic locking for itinerary and quotation versions
- Soft delete only where legally and operationally appropriate

Examples:

```text
POST   /api/v1/leads
GET    /api/v1/leads
POST   /api/v1/inquiries
POST   /api/v1/inquiries/:id/convert-to-trip
GET    /api/v1/trips/:id
POST   /api/v1/trips/:id/itinerary-versions
POST   /api/v1/trips/:id/quotation-versions
POST   /api/v1/quotations/:id/request-approval
POST   /api/v1/booking-components/:id/confirm
POST   /api/v1/customer-payments
```



## 9. Asynchronous Processing

Use an outbox table and job queues.

Queues:

- lead-ingestion
- notifications
- pdf-generation
- document-processing
- ocr
- reports
- webhook-delivery
- integration-sync

Use BullMQ with Redis / Valkey initially.

Every job should support:

- retries with backoff
- idempotency
- dead-letter handling
- tenant context
- correlation ID
- structured error details



## 10. Integrations

Create provider interfaces and adapters.

Examples:

- LeadProvider: Facebook, website webhook, CSV
- MessagingProvider: WhatsApp BSP, email
- StorageProvider: S3
- PaymentProvider: Razorpay, Stripe or manual
- AIProvider: configurable model vendor
- OCRProvider
- MapsProvider

Integration logic must not leak into core domain services.

## 11. Security

- OIDC / OAuth 2.1 compatible authentication
- short-lived access tokens
- secure refresh-token rotation
- organization membership checks
- fine-grained permissions
- MFA for privileged users
- encrypted secrets
- field-level protection for passport and bank data
- signed URLs for documents
- webhook signature verification
- rate limits
- audit events
- malware scanning for uploads
- data retention and deletion policies



## 12. Testing

- Unit tests for business rules
- Integration tests using real MySQL and Redis containers
- Contract tests for integrations
- API tests
- End-to-end tests for critical workflows
- Tenant-isolation tests
- Permission matrix tests
- Migration tests
- Load tests for ingestion and reports

Critical golden workflows:

1. Facebook lead → assigned lead → inquiry
2. B2B agency inquiry → quotation → confirmation
3. B2C family inquiry → itinerary versions → accepted quote
4. Confirmed trip → booking components → payments → completion
5. Cross-tenant access attempt must always fail



## 13. Deployment

Initial:

- web container
- API container
- worker container
- MySQL
- Redis / Valkey
- S3-compatible storage
- reverse proxy / load balancer

Scale horizontally by adding API and worker replicas.

Do not split services until a demonstrated boundary requires:

- independent scaling
- independent ownership
- significantly different reliability requirements
- regulatory isolation

