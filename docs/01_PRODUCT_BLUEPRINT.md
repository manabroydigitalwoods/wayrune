# CodePoetry Travel Agency Platform — Product Blueprint

## 1. Product Definition

A multi-tenant SaaS platform that starts as a **travel-agency ERP** and extends into a **Travel Operating System** with a shared destination knowledge layer and a **connected B2B business network** (Travel Exchange foresight — not a marketplace).

Canonical vision and staging: [00_PRODUCT_BIBLE.md](./00_PRODUCT_BIBLE.md).

**Agencies assemble trips.** Platform owns canonical places, routes, and destination knowledge. Partner businesses own their profiles (and Stage D inventory). Agencies own CRM, pricing, and Living Proposal snapshots.

The platform manages:

- B2C travellers and families
- B2B travel agencies, resellers and corporate clients
- Leads from Facebook, Instagram, websites, WhatsApp, referrals, phone and manual entry
- Travel inquiries, quotations, itineraries, operations, suppliers, customer collections and supplier payments
- Shared **Places** catalog (geo + landmarks) with optional community contributions under moderation
- **Place edges** (drive times / distances) and seasonal destination knowledge
- Cross-organization partner discovery (hotels, homestays, farmstays, car rental, drivers, restaurants, DMCs) with follow/preferred relationships
- Private org-local supplier catalogs (always available) with optional links to networked partner organizations
- Selective AI-assisted productivity features

This is **not** a consumer booking application, OTA, or autonomous AI system. The partner network is **B2B** (agencies ↔ supply partners), not a public marketplace.

### Staged unlock (summary)

1. **Agency SaaS (Stage A)** — reliable CRM → quote → ops → finance; partners blocked from agency CRM  
2. **Invite + confirm (Stage B)** — claim invites; partners confirm inbound bookings  
3. **Travel Exchange (Stage C)** — opportunity posts only; no money rails  
4. **Kind portals (Stage D)** — inventory/availability only after network demand  

Architect with Organization kinds; ship the Agency experience first.

## 2. Product Positioning

**A travel-agency business management platform that converts leads into profitable, operationally manageable trips — designed to become a connected travel business network without launching as a full multi-portal marketplace.**

AI is a utility layer. Users remain in control. Local (offline) suppliers remain first-class forever.

## 3. Target Customers

### Primary
- Small and medium travel agencies
- Tour operators
- Domestic and international package sellers
- DMCs
- B2B travel wholesalers

### Secondary (network partners — thin onboarding)
- Hotels and homestays / farmstays
- Car rental and drivers
- Restaurants serving group / tour catering
- Corporate travel desks
- Group and educational tour operators
- Religious, medical and event-travel operators

### Organization kinds
`travel_agency | hotel | homestay | farmstay | car_rental | driver | restaurant | dmc | other`

Agency orgs get the full ERP. Partner orgs get a thin home: **portfolio of PartnerAssets** (hotels, vehicles, drivers under one account), profile, followers, inbound bookings.

### Account vs Asset vs Supplier

| Plane | Entity | Notes |
|-------|--------|-------|
| Agency buyer | `Supplier` | Local catalogue forever; types: hotel, homestay, farmstay, car_rental, driver, restaurant, dmc, other |
| Partner seller | `Organization` + `PartnerAsset` | Account owns many assets; one login adds hotels/cars without re-registering |
| Network bridge | `Supplier.linkedAssetId` (preferred) or `linkedOrganizationId` | Stage B claim |

Stage D inventory attaches to **PartnerAsset**, not Organization.

## 4. User Roles

- Organization Owner
- Administrator
- Sales Manager
- Sales Executive
- Travel Consultant
- Operations Manager
- Operations Executive
- Finance / Accounts
- Support
- Read-only Auditor
- Custom Roles

## 5. Supported Business Relationships

A party may be:

- Individual traveller
- Family or traveller group
- Corporate client
- B2B travel agency
- Reseller or sub-agent
- Supplier
- DMC
- Hotel
- Transport provider
- Guide or activity provider

A company can contain multiple contact persons, branches, negotiated rates, credit limits, payment terms and outstanding balances.

## 6. Core Product Lifecycle

Lead → Inquiry → Proposal / Quote → Negotiation → Confirmed Trip → Operations → Travel → Completion → Feedback / Repeat Sale

## 7. Core Business Objects

### Lead
A potential sales opportunity from an external or manual source.

### Inquiry
Structured travel requirements collected from the lead or existing client.

### Trip
The central operational workspace created when an inquiry becomes an active planning or delivery unit.

### Itinerary
The day-by-day travel plan attached to a trip.

### Quotation
A versioned commercial proposal containing sell price, cost, taxes, markup, discounts and margin.

### Booking Component
A hotel, transfer, activity, guide, flight reference, visa service, insurance service or other fulfilment item.

### Party
A common abstraction for individuals and organizations participating as customers, agencies, suppliers or contacts.

### PartnerAsset
An operable unit under a partner **Organization** account: a hotel property, homestay, farmstay, vehicle unit, driver profile, or restaurant. One login manages a portfolio of Assets. Stage D inventory (rooms, fleet, calendars) hangs off the Asset.

### Supplier (agency-local)
Agency-private catalogue row for hotels, cars, drivers, etc. Optional network bridge via `linkedAssetId` / `linkedOrganizationId`.

## 8. Product Principles

1. Travel-workflow first.
2. Human-controlled decisions.
3. Trip-centric operations without turning Trip into a god object.
4. B2B and B2C from the first data model.
5. Configurable pipelines and statuses.
6. Reusable content before AI generation.
7. Strong cost, margin and payment visibility.
8. Multi-tenant security from day one.
9. Modular monolith before microservices.
10. Integrations should be replaceable through adapters.

## 9. Scope

### Included
- Lead ingestion and manual lead creation
- CRM and account management
- Inquiry capture
- Trip workspace
- Itinerary builder
- Quotation and proposal versions
- Supplier and service catalogue
- Booking operations
- Customer receivables
- Supplier payables
- Documents
- Tasks and reminders
- Audit history
- Reports
- Limited AI utilities

### Not Included in Initial Product
- Consumer travel search or booking
- Own flight or hotel inventory
- GDS
- OTA marketplace
- Full accounting ledger
- Autonomous booking agents
- Public customer mobile app
- Visa-processing marketplace
- Dynamic packaging engine using live inventory

## 10. Success Metrics

- Median lead response time
- Lead-to-qualified-inquiry conversion
- Inquiry-to-quotation time
- Quotation-to-confirmation conversion
- Average itinerary creation time
- Gross booking value
- Gross margin
- Overdue customer receivables
- Overdue supplier payables
- Active users per organization
- Weekly trips managed
- 30/90-day organization retention
