# Delivery Phases, Dependencies and Acceptance

## Phase 0 — Discovery and Validation

### Outcomes
- Interview 15–25 agencies
- Include B2C, B2B, tour operator and DMC workflows
- Collect current lead sheets, itinerary samples, quotations and operational checklists
- Validate terminology
- Select the narrow launch segment
- Define pricing hypothesis

### Exit Criteria
- At least five agencies agree to pilot
- Top three daily pain points are consistent
- MVP workflow confirmed
- B2B and B2C differences documented

## Phase 1 — Platform Foundation

### Scope
- Monorepo and CI
- Authentication
- Organizations and memberships
- Roles and permissions
- Tenant scoping
- Audit framework
- File storage
- Background jobs
- Notification framework
- Organization settings

### Exit Criteria
- Tenant isolation tests pass
- Role matrix works
- Audit events are generated
- Files use signed access
- Deployment and rollback documented

## Phase 2 — CRM and Inquiry MVP

### Scope
- Parties
- Leads
- Manual entry
- CSV import
- Website webhook
- Facebook Lead Ads adapter
- Pipelines
- Assignment
- Activities, tasks and reminders
- B2B and B2C inquiries
- Dashboard

### Exit Criteria
- Lead can enter from each supported source
- Duplicate handling works
- Lead can convert to inquiry
- Sales manager can report by source and owner
- Pilot agencies can replace their lead spreadsheet

## Phase 3 — Itinerary and Quotation MVP

### Scope
- Trip workspace
- Travellers
- Structured itinerary builder
- Reusable components
- Templates
- Quote versions
- Pricing, tax, markup and margin
- Approval
- PDF output
- Email sending

### Exit Criteria
- Agency can produce a complete proposal without Word or Excel
- One itinerary supports multiple versions
- Accepted quote is immutable
- Margin is permission-controlled
- PDF output matches agency branding

This is the recommended first commercially sellable release.

## Phase 4 — Operations and Supplier Management

### Scope
- Suppliers and catalogue
- Booking components
- Confirmation workflow
- Vouchers
- Readiness checklist
- Customer payment schedules
- Supplier invoices and payments
- Documents
- Operational dashboard

### Exit Criteria
- Confirmed trip can be operated end to end
- Missing confirmations and documents are visible
- Receivables and payables reconcile to trip
- Estimated and actual margin can be compared

## Phase 5 — Integrations and AI Assistance

### Scope
- WhatsApp provider
- Email sync or forwarding model
- Payment gateway
- Lead parser
- Inquiry field extraction
- Itinerary draft
- Communication rewrite
- Document OCR
- Conversation summary

### Exit Criteria
- AI output requires review
- Parsed fields show source and confidence
- No AI feature can send, book or alter money without confirmation
- Integration failures are retryable and visible

## Phase 6 — Collaboration and External Sharing

### Scope
- Secure proposal links
- Customer or B2B approval
- Commenting
- Document sharing
- Payment links
- Optional client portal

This remains an agency-controlled extension, not a consumer marketplace.

## Network unlock roadmap (after agency phases)

Do **not** expand Phase 3/4 into hotel/restaurant/driver inventory portals. Sequence network depth separately (see [00_PRODUCT_BIBLE.md](./00_PRODUCT_BIBLE.md)):

1. **Invite + partner confirm** — supplier invite-to-claim; partner write path on inbound bookings; simple document uploads; claim optionally binds a **PartnerAsset**  
2. **Travel Exchange v0** — structured opportunity posts (last-minute rooms, seats, meal packages); expiry; place/kind filters; **no payments**  
3. **Kind-specific portals (Stage D)** — inventory engines hang off **PartnerAsset** (room allotment, fleet calendar, driver calendar, restaurant packages); org switcher agency ↔ hotel/homestay/farmstay/restaurant/driver/cars. Shadow assets for local-only suppliers.  

Phase 3 remains the recommended first commercial sell boundary. Phase 4 stays thin-but-real ops/finance for pilots.

## Missing Parts That Must Not Be Forgotten

- Branch support
- B2B credit and commission
- Multi-currency snapshots
- Quote and itinerary versioning
- Cancellation and refunds
- Duplicate leads
- Data import and export
- Custom fields
- Configurable statuses
- Consent and communication preferences
- Passport and bank-detail permissions
- Supplier cancellation deadlines
- Actual vs estimated cost
- Audit history
- Idempotent webhooks
- Data retention and deletion
- Backup and disaster recovery
- Support impersonation with explicit audit
- Feature flags
- Plan limits and subscription billing
- Tenant offboarding and data export

## Recommended Initial Commercial Boundary

Sell the first version around:

**Lead Management + Inquiry + Trip + Itinerary + Quotation**

Do not wait for every operations, finance, portal and AI feature before testing willingness to pay.

## Definition of Done

A feature is complete only when it has:
- approved requirements
- UX states
- permission rules
- validation
- API contract
- database migration
- audit behavior
- telemetry
- unit and integration tests
- tenant-isolation test
- empty, loading and error states
- documentation
- migration / rollback plan where relevant
