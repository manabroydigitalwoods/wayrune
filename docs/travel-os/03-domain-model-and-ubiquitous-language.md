# 03 — Travel Domain Model & Ubiquitous Language

**Status:** Canonical vocabulary for Travel OS.  
**Aligns with:** [Commerce Integrity domain ownership](../commerce-integrity/01-domain-ownership.md), [lifecycle transitions](../../apps/api/src/modules/commerce/lifecycle-transitions.ts).  
**Rule:** Prefer these names in product, code comments, APIs, events, and AI prompts.

### Implementation status legend

| Tag | Meaning |
|-----|---------|
| **Implemented** | Shipped in production schema/API |
| **Partial** | Model or thin UI exists; business OS incomplete |
| **Defined** | Vocabulary locked; vertical OS backlog |

### Concept template

Every concept below uses:

> Purpose · Definition · Owner · Lifecycle · Relationships · Business Rules (Invariants) · States · Events · Permissions · Snapshots · Search Metadata · Future AI Notes

---

## A. Platform & identity

### Organization

| Field | Content |
|-------|---------|
| **Purpose** | Legal/business account that owns data and users. |
| **Definition** | A tenant with an `orgKind` (travel_agency, hotel, restaurant, …). Users may belong to many Organizations and switch in-session. |
| **Owner** | Platform (account lifecycle); org admins (profile, members). |
| **Lifecycle** | Created → Active → Suspended → Deleted (soft). |
| **Relationships** | Memberships, PartnerAssets, Parties (agency), Policies, CommercialDocuments, Network relationships. |
| **Business Rules** | All business rows are scoped by `organizationId`. Partner inventory hangs off PartnerAsset, not Organization alone. `dmc` is an **Agency workspace kind** (same Trip / Quotation / ServiceRequest spine); inventory partner kinds are hotel/homestay/farmstay/car_rental/driver/restaurant. |
| **States** | active, suspended, deleted. |
| **Events** | OrganizationCreated, OrganizationProfileUpdated. |
| **Permissions** | `org.settings.*`, membership roles. |
| **Snapshots** | Partner profile / commerce profile fields for discoverability. |
| **Search Metadata** | name, kind, city, discoverable flag. |
| **Future AI Notes** | Org kind drives which tools/agents are allowed. |
| **Status** | **Implemented** |

### DMC (Agency OS variant)

| Field | Content |
|-------|---------|
| **Purpose** | Ground operator packaging multi-service trips for B2B buyers. |
| **Definition** | Organization.kind = `dmc`. Reuses Agency CRM, Trips (“Packages”), Quotation net+sell, ServiceRequest items to local Suppliers, PartnerSettlement — **no parallel trip model**. |
| **Owner** | DMC Organization. |
| **Lifecycle** | Same as Agency commerce: Party → Inquiry/Lead → Trip → Quote → SR → Docs/Settlements. |
| **Relationships** | Party (B2B `businessType`), Supplier (local), ServiceRequest(+Item), PartnerSettlement, CommercialDocument. |
| **Business Rules** | Offline capable without Network; must not land on PartnerAsset inventory shell. |
| **States** | Same as Agency entities. |
| **Events** | Same Agency/commerce events. |
| **Permissions** | Agency ROLE_PERMISSION_MAP (not partner clamp). |
| **Snapshots** | Quote version cost/sell totals. |
| **Search Metadata** | B2B party name, package trip number. |
| **Future AI Notes** | Prefer Agency tools with DMC labels. |
| **Status** | **Implemented** (DMC OS 1.0) |

### Membership

| Field | Content |
|-------|---------|
| **Purpose** | Bind a User to an Organization with roles. |
| **Definition** | User ↔ Organization link carrying Role/Permission grants. |
| **Owner** | Organization. |
| **Lifecycle** | Invited → Active → Revoked. |
| **Relationships** | User, Organization, Role. |
| **Business Rules** | Permissions are evaluated in the context of the *current* organization. |
| **States** | invited, active, revoked. |
| **Events** | MembershipGranted, MembershipRevoked. |
| **Permissions** | Members management. |
| **Snapshots** | — |
| **Search Metadata** | user email, display name. |
| **Future AI Notes** | Scope agent actions to membership permissions. |
| **Status** | **Implemented** |

### PartnerAsset

| Field | Content |
|-------|---------|
| **Purpose** | Operable unit of inventory/ops under a partner Organization. |
| **Definition** | Hotel property, vehicle, driver profile, restaurant outlet, etc. Adding another property usually adds an Asset, not a new Organization. |
| **Owner** | Partner Organization. |
| **Lifecycle** | Draft → Active → Inactive → Deleted. |
| **Relationships** | Room products/units, allotments, StayReservations, MealReservations, Experience products, fleet units. |
| **Business Rules** | Stage D inventory hangs off PartnerAsset. Agency “Supplier” may *link* to an Asset via network claim. |
| **States** | active, inactive. |
| **Events** | AssetCreated, AssetProfileUpdated. |
| **Permissions** | Partner ops / network.write. |
| **Snapshots** | `profileJson` (incl. homestay attrs). |
| **Search Metadata** | name, kind, location. |
| **Future AI Notes** | Asset is the default fulfilment target. |
| **Status** | **Implemented** |

### Party

| Field | Content |
|-------|---------|
| **Purpose** | Customer or counterparty record for CRM and billing. |
| **Definition** | B2B or B2C client of an Organization (agency client, hotel guest company, restaurant group booker). |
| **Owner** | Organization that created it. |
| **Lifecycle** | Active → Merged/Archived. |
| **Relationships** | Contacts, addresses, roles; Trips; CommercialDocuments; Stay/Meal guests may reference Party. |
| **Business Rules** | Customer PII stays org-private; sharing across orgs uses fulfilment payloads only. |
| **States** | active, archived. |
| **Events** | PartyCreated, PartyUpdated. |
| **Permissions** | CRM / parties.* |
| **Snapshots** | — |
| **Search Metadata** | displayName, phones, emails. |
| **Future AI Notes** | Eligible for summarization with PII redaction. |
| **Status** | **Implemented** (agency-strong; partner CRM **Partial**) |

### Traveller / Guest

| Field | Content |
|-------|---------|
| **Purpose** | Person attending a service (trip passenger or stay guest). |
| **Definition** | Traveller is the agency Trip person; Guest is the stay/meal/experience/rental/driver participant. May link to Party. |
| **Owner** | Agency Trip (traveller) or partner Reservation (guest fields). |
| **Lifecycle** | Listed → Checked-in / Attended → Completed. |
| **Relationships** | Trip travellers; Stay/Meal/Rental/DriverJob guest fields; Experience participants; Care history aggregate. |
| **Business Rules** | Confirmed stay may require guestName; checkout blockers enforce incomplete guest fields. |
| **States** | listed, checked_in, departed. |
| **Events** | TravellerAdded, GuestCheckedIn. |
| **Permissions** | Trip/stay/ops; `GET /commerce/care/history`. |
| **Snapshots** | Passenger details on quotation / fulfilments. |
| **Search Metadata** | name, phone (Care lookup). |
| **Future AI Notes** | Do not train on raw PII. |
| **Status** | **Implemented** (fields + Care history); Experience participants **Implemented** |

---

## B. Agency planning

### Lead

| Field | Content |
|-------|---------|
| **Purpose** | Early sales interest before a structured Inquiry. |
| **Definition** | CRM opportunity with pipeline stage, owner, activities. |
| **Owner** | Agency Organization. |
| **Lifecycle** | New → Qualified → Won/Lost → Converted. |
| **Relationships** | Activities; convert → Party / Inquiry. |
| **Business Rules** | Duplicate detection on create; merge preserves history. |
| **States** | Pipeline stages (configurable). |
| **Events** | LeadCreated, LeadStageChanged, LeadConverted. |
| **Permissions** | leads.* |
| **Snapshots** | Import/webhook payloads. |
| **Search Metadata** | name, phone, source. |
| **Future AI Notes** | Lead parse/enrichment later (consumer, not foundation). |
| **Status** | **Implemented** |

### Inquiry

| Field | Content |
|-------|---------|
| **Purpose** | Structured travel brief before Trip. |
| **Definition** | Destinations, dates, budget, travellers needed, missing fields. |
| **Owner** | Agency. |
| **Lifecycle** | Open → Working → Converted / Closed. |
| **Relationships** | Convert → Trip; link Party. |
| **Business Rules** | Clone allowed; conversion creates Trip shell. |
| **States** | open, converted, closed. |
| **Events** | InquiryCreated, InquiryConvertedToTrip. |
| **Permissions** | inquiries.* |
| **Snapshots** | Brief fields at convert. |
| **Search Metadata** | destination, dates. |
| **Future AI Notes** | Brief extraction is an optional agent. |
| **Status** | **Implemented** |

### Trip

| Field | Content |
|-------|---------|
| **Purpose** | Agency delivery container for one customer journey. |
| **Definition** | Planning, itinerary, quotations, booking requirements, ops, finance, closure. |
| **Owner** | Agency. |
| **Lifecycle** | Planning → Confirmed/In progress → Completed / Cancelled. |
| **Relationships** | Travellers, ItineraryVersions, Quotations, BookingRequirements, ServiceRequests, TripChangeCases, Incidents, payments. |
| **Business Rules** | Trip close records reconciliation; does not silently erase money. |
| **States** | planning, confirmed, in_progress, completed, cancelled (product map). |
| **Events** | TripCreated, TripStatusChanged, TripClosed. |
| **Permissions** | trips.*, ops.*, finance.* |
| **Snapshots** | Closure notes. |
| **Search Metadata** | code, client, dates. |
| **Future AI Notes** | Trip timeline is primary agent context. |
| **Status** | **Implemented** |

### Itinerary (Journey)

| Field | Content |
|-------|---------|
| **Purpose** | Day-by-day narrative and logistics plan. |
| **Definition** | Versioned itinerary; Living Proposal shares a public snapshot with family thread. |
| **Owner** | Agency. |
| **Lifecycle** | Draft versions → Published share → Restored/compared. |
| **Relationships** | Trip, places, itinerary blocks, proposal family. |
| **Business Rules** | Catalog updates never silently rewrite an accepted proposal; refresh is explicit (version bump). |
| **States** | draft, shared, superseded. |
| **Events** | ItineraryVersionSaved, ProposalShared. |
| **Permissions** | itineraries.* |
| **Snapshots** | Shared token content is frozen view. |
| **Search Metadata** | Destination places. |
| **Future AI Notes** | Proposal story drafting already consumes place catalog. |
| **Status** | **Implemented** |

### Quotation

| Field | Content |
|-------|---------|
| **Purpose** | Customer commercial promise (sell side). |
| **Definition** | Versioned quote; **accepted** version freezes what the customer was sold. |
| **Owner** | Agency. |
| **Lifecycle** | Draft → Approval → Sent → Accepted / Rejected → Revise (new version). |
| **Relationships** | Trip, QuotationVersions, sell totals; downstream BookingRequirements. |
| **Business Rules** | Accepted quotation is immutable; never overwrite sell from live rates. Fulfilment drift needs explicit reconciliation. |
| **States** | draft, pending_approval, sent, accepted, rejected. |
| **Events** | QuotationSent, QuotationAccepted. |
| **Permissions** | quotations.*, margin read gated. |
| **Snapshots** | Sell price, inclusions, policy sold to customer. |
| **Search Metadata** | version, totals. |
| **Future AI Notes** | Quote lines are priced facts — do not invent margin into partner payloads. |
| **Status** | **Implemented** |

---

## C. Commerce spine

### BookingRequirement (= BookingComponent)

| Field | Content |
|-------|---------|
| **Purpose** | What the agency must fulfil for the Trip. |
| **Definition** | Agency delivery need (hotel night, transfer, meal…). In code: `BookingComponent`. Synonym: BookingRequirement. |
| **Owner** | Agency. |
| **Lifecycle** | pending/required → drafted → requested/sent → held → confirmed → cancelled. |
| **Relationships** | Trip, Supplier/PartnerAsset, ServiceRequest(s), ServiceRequestItem(s), InventoryAllocation. |
| **Business Rules** | Exactly one *selected* fulfilment path for a completed requirement. Status is **agency readiness**, not supplier reservation status. Many SRs may attach historically; selection deselects siblings. |
| **States** | See transition graph `booking_requirement`. |
| **Events** | BookingRequirementCreated, BookingConfirmed (agency), BookingCancelled. |
| **Permissions** | ops.write |
| **Snapshots** | Cost/confirm mirrors from selected item — not ownership of supplier truth. |
| **Search Metadata** | type, title, dates. |
| **Future AI Notes** | Prefer “BookingRequirement” in speech; UI may still say Booking. |
| **Status** | **Implemented** |

### ServiceRequest

| Field | Content |
|-------|---------|
| **Purpose** | Commercial negotiation between buyer and seller. |
| **Definition** | Header: parties, service type, validity, overall negotiation status. |
| **Owner** | Buyer Organization (agency); seller participates. |
| **Lifecycle** | drafted → sent → acknowledged/available/held → confirmed \| rejected \| expired \| cancelled. |
| **Relationships** | Items, Trip, BookingRequirement, seller org/supplier/asset, reservations, documents. |
| **Business Rules** | Confirm requires rate + policy snapshots on path. SR status ≠ reservation ops status. |
| **States** | See `service_request` graph. |
| **Events** | ServiceRequested, ServiceRequestConfirmed, ServiceRequestRejected. |
| **Permissions** | commerce / ops |
| **Snapshots** | Header rate/policy on confirm. |
| **Search Metadata** | title, serviceType, status. |
| **Future AI Notes** | Safe cross-tenant input via fulfilment payload only. |
| **Status** | **Implemented** |

### ServiceRequestItem

| Field | Content |
|-------|---------|
| **Purpose** | Line-level negotiated terms and selection. |
| **Definition** | Product ref, quantity, offered/agreed amounts; links Hold and selection onto a BookingRequirement. |
| **Owner** | Same as ServiceRequest. |
| **Lifecycle** | drafted → sent → acknowledged → offered → held → confirmed \| rejected \| expired \| cancelled. |
| **Relationships** | ServiceRequest, BookingRequirement, InventoryHold. |
| **Business Rules** | Selecting one item deselects other selected items on the same BookingRequirement. No jumps such as rejected → confirmed without returning to drafted/sent. |
| **States** | See `service_request_item` graph. |
| **Events** | ItemOffered, ItemConfirmed, ItemRejected. |
| **Permissions** | ops.write |
| **Snapshots** | rateSnapshotJson, policySnapshotJson required at confirm. |
| **Search Metadata** | productRef, status. |
| **Future AI Notes** | Item is the negotiated atomic commercial unit. |
| **Status** | **Implemented** |

### InventoryHold

| Field | Content |
|-------|---------|
| **Purpose** | Temporary capacity claim with expiry. |
| **Definition** | Soft lock on a resource (dining capacity, experience slot, stay allotment, …) until confirm, release, or expire. |
| **Owner** | Organization placing the hold (usually buyer/seller fulfilment org). |
| **Lifecycle** | active → confirmed \| released \| expired. |
| **Relationships** | ServiceRequestItem (optional unique source), resourceType/resourceId. |
| **Business Rules** | Create/consume/release/expire mutates capacity **in the same transaction** as the hold row. Concurrent last-unit: one wins. |
| **States** | active, confirmed, released, expired. |
| **Events** | HoldCreated, HoldExpired, HoldConfirmed, HoldReleased. |
| **Permissions** | ops / commerce |
| **Snapshots** | windowStart/End, quantity. |
| **Search Metadata** | resourceType, resourceId, expiresAt. |
| **Future AI Notes** | Never invent capacity; read adapter availability. |
| **Status** | **Implemented** |

### Rate / Offer

| Field | Content |
|-------|---------|
| **Purpose** | Priced commercial terms for an audience and window. |
| **Definition** | Agency rates, partner rate plans, negotiated rates, meal packages — evaluated into a priced result with tax basis. |
| **Owner** | Publishing Organization. |
| **Lifecycle** | Draft → Active → Expired/Superseded. |
| **Relationships** | Policies, PartnerAsset products, NegotiatedRate, Quotation lines. |
| **Business Rules** | Live rate change must not rewrite confirmed snapshots. |
| **States** | draft, active, expired. |
| **Events** | RatePublished, NegotiatedRateCreated. |
| **Permissions** | rates.*, network |
| **Snapshots** | Captured on quote accept and SR confirm. |
| **Search Metadata** | product, season, audience. |
| **Future AI Notes** | Pricing agents propose only; humans confirm. |
| **Status** | **Implemented** (depth varies by OS) |

### Policy

| Field | Content |
|-------|---------|
| **Purpose** | Rules for cancellation, payment, ops preferences. |
| **Definition** | Versionable ruleset attachable to entities; evaluator computes charge/refund. |
| **Owner** | Publishing Organization. |
| **Lifecycle** | Draft → Active → Superseded. |
| **Relationships** | Attachments; CancellationCase evaluation snapshots. |
| **Business Rules** | Supplier policy on confirm is snapshot; live Policy is draft for future sells only. |
| **States** | draft, active. |
| **Events** | PolicyPublished, PolicyAttached. |
| **Permissions** | org.settings / policies |
| **Snapshots** | applicablePolicySnapshotJson on cancel cases. |
| **Search Metadata** | name, type. |
| **Future AI Notes** | Explain cancellations using evaluator humanExplanation. |
| **Status** | **Implemented** |

### Contract (SupplierContract)

| Field | Content |
|-------|---------|
| **Purpose** | Standing commercial terms between agency and supplier/partner. |
| **Definition** | Agency↔partner contract record (validity, notes, commercial frame). |
| **Owner** | Agency (and counterparty org if networked). |
| **Lifecycle** | Draft → Active → Expired. |
| **Relationships** | Supplier, partner org, negotiated rates. |
| **Business Rules** | Does not replace per-transaction SR confirms. |
| **States** | draft, active, expired. |
| **Events** | ContractCreated. |
| **Permissions** | ops / suppliers |
| **Snapshots** | — |
| **Search Metadata** | counterparty, validity. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

---

## D. Fulfilment

### Reservation (abstract)

| Field | Content |
|-------|---------|
| **Purpose** | Supplier fulfilment commitment and operational status. |
| **Definition** | Abstract role. Concrete: StayReservation, MealReservation, ExperienceReservation, RentalReservation. |
| **Owner** | Fulfilment Organization (partner). |
| **Lifecycle** | Kind-specific (inquiry → confirmed → executed → closed). |
| **Relationships** | May link ServiceRequest / BookingRequirement; InventoryAllocation; Folio. |
| **Business Rules** | Reservation status owns supplier truth. BookingRequirement status is agency readiness. |
| **States** | Kind-specific. |
| **Events** | ReservationConfirmed, ReservationCancelled. |
| **Permissions** | Partner OS |
| **Snapshots** | Rate/policy at confirm. |
| **Search Metadata** | guest, dates, status. |
| **Future AI Notes** | Prefer concrete type names in tools. |
| **Status** | **Defined** (pattern); concretes below |

### StayReservation

| Field | Content |
|-------|---------|
| **Purpose** | Room/product stay at a property. |
| **Definition** | Check-in/out, guest, product, optional unit, folio, source (walk-in, agency, network…). |
| **Owner** | Stay PartnerAsset’s Organization. |
| **Lifecycle** | inquiry → tentative → held → confirmed → checked_in → checked_out \| cancelled \| no_show. |
| **Relationships** | Asset, room product/unit, inventory allocation, folio charges, booking/SR links. |
| **Business Rules** | Confirmed may exist **without** unit; create/update assign and check-in **require** unit free (not OOO, no overlap). MoveUnit / initial assign append `assignmentHistoryJson`. Checkout blocked when folio outstanding (charges − amountPaid) > 0. Homestay house rules ack required at check-in when configured. |
| **States** | See `stay_reservation` graph. |
| **Events** | StayConfirmed, CheckedIn, CheckedOut, StayExtended, UnitMoved, StayPaymentReceived, PropertyDayClosed. |
| **Permissions** | stay ops |
| **Snapshots** | rateSnapshotJson, policySnapshotJson. |
| **Search Metadata** | guestName, dates, unit. |
| **Future AI Notes** | Day-close and blockers are operational invariants. |
| **Status** | **Implemented** (Stay OS 1.0 + A-STAY harden) |

### MealInquiry

| Field | Content |
|-------|---------|
| **Purpose** | Direct group/event dining inquiry (restaurant Acquire). |
| **Definition** | Contact + guest count + optional package; quote via CommercialDocument; convert to MealReservation. |
| **Owner** | Restaurant Organization. |
| **Lifecycle** | open → quoted → converted \| closed \| cancelled. |
| **Relationships** | PartnerAsset, Party, MealPackage, CommercialDocument, MealReservation. |
| **Business Rules** | Independent of agency Inquiry. Quote freezes sell snapshot on CommercialDocument. |
| **States** | open, quoted, converted, closed, cancelled. |
| **Events** | MealInquiryCreated, MealInquiryQuoted. |
| **Permissions** | restaurant ops |
| **Snapshots** | quotedAmount + document lines. |
| **Search Metadata** | contactName, preferredServiceAt. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (Restaurant OS 1.0) |

### MealReservation

| Field | Content |
|-------|---------|
| **Purpose** | Dining booking against packages/capacity. |
| **Definition** | Guest count, serviceAt, package, kitchen preparation status, soft folio + amountPaid. |
| **Owner** | Restaurant PartnerAsset’s Organization. |
| **Lifecycle** | requested → held/confirmed → arrived/seated → served → completed \| cancelled \| no_show. |
| **Relationships** | MealPackage, DiningCapacity, InventoryHold, MealInquiry, Party, FolioCharge, ServiceRequest. |
| **Business Rules** | Capacity via DiningCapacityAdapter (hold → consume). Cancel releases capacity. Complete blocked by outstanding folio unless forced. **Sits beside** QR Guest Services (`TableSession` + `ServiceOrder` for walk-in / a la carte covers) — does **not** replace open-table ordering ([07 Guest Services](./07-guest-services-qr.md)). |
| **States** | See `meal_reservation` transition graph. |
| **Events** | MealReservationConfirmed, MealServiceCompleted, MealPaymentReceived. |
| **Permissions** | restaurant ops |
| **Snapshots** | rate/policy on create/confirm. |
| **Search Metadata** | guestName, serviceAt, partyId. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (Restaurant OS 1.0) |

### Experience (product / slot / reservation)

| Field | Content |
|-------|---------|
| **Purpose** | Sell and schedule activities (esp. farmstay). |
| **Definition** | ExperienceProduct + ExperienceSlot capacity; **ExperienceReservation** with participants, attendance, booker/participant waivers. |
| **Owner** | PartnerAsset Organization. |
| **Lifecycle** | Product active; Slot held→reserved via ExperienceSlotAdapter; Reservation held → confirmed → checked_in → completed / cancelled. |
| **Relationships** | PartnerAsset, Party, InventoryHold (experience_slot), ExperienceParticipant. |
| **Business Rules** | Availability = capacity − reserved − held; concurrency via FOR UPDATE on slot; resource scheduling (guides/equipment) **N/A** in 1.0. |
| **States** | Product active/inactive; Slot open/full; Reservation held/confirmed/checked_in/completed/cancelled/no_show. |
| **Events** | ExperienceHoldCreated, ExperienceBooked, ExperienceCancelled. |
| **Permissions** | stay/experience ops (`/experience/*`) |
| **Snapshots** | waiverTextSnapshot on booker ack. |
| **Search Metadata** | product name, slot time, bookerName. |
| **Future AI Notes** | Waiver text is compliance-sensitive. |
| **Status** | **Implemented** (Experience / Farmstay OS 1.0) |

### RentalReservation (Car / Mobility OS 1.0)

| Field | Content |
|-------|---------|
| **Purpose** | Self-drive vehicle rental at a car_rental PartnerAsset. |
| **Definition** | Fleet unit + window + rate/deposit; checkout/return checklists; damage folio; deposit + final CommercialDocument. |
| **Owner** | Car rental Organization via PartnerAsset. |
| **Lifecycle** | held → confirmed → checked_out → returned \| cancelled \| no_show. |
| **Relationships** | AssetFleetUnit, AssetFleetRate, InventoryHold (fleet_unit), InventoryAllocation, AssetCalendarBlock (booked), FolioCharge, Party. |
| **Business Rules** | Calendar conflict blocks book; offline walk-in loop without Network; deposit and charges tracked separately. |
| **States** | held, confirmed, checked_out, returned, cancelled, no_show. |
| **Events** | RentalHoldCreated, RentalBooked, RentalCheckedOut, RentalReturned, RentalCancelled, RentalPaymentReceived. |
| **Permissions** | `/mobility/*` ops + finance.payment.manage |
| **Snapshots** | rateSnapshotJson at create. |
| **Search Metadata** | guestName, plate, window, status. |
| **Future AI Notes** | Damage notes are ops evidence. |
| **Status** | **Implemented** (Mobility Car OS 1.0) |

### DriverJob (Driver / Mobility OS 1.0)

| Field | Content |
|-------|---------|
| **Purpose** | Driven transfer / chauffeur duty at a driver PartnerAsset. |
| **Definition** | Time-window duty with pickup/drop; books driver calendar on assign; optional ServiceRequest link; invoice + payment. |
| **Owner** | Driver Organization via PartnerAsset. |
| **Lifecycle** | offered → assigned → en_route → completed \| cancelled \| no_show. |
| **Relationships** | PartnerAsset (assetKind=driver), InventoryHold (driver_asset), InventoryAllocation, AssetCalendarBlock, optional ServiceRequest, Party. |
| **Business Rules** | Calendar conflict blocks assign; offline walk-in job without Network; mobile-first ops UI. |
| **States** | offered, assigned, en_route, completed, cancelled, no_show. |
| **Events** | DriverJobOffered, DriverJobAssigned, DriverJobStarted, DriverJobCompleted, DriverJobCancelled, DriverPaymentReceived. |
| **Permissions** | `/driver/*` ops + finance.payment.manage |
| **Snapshots** | rateAmount at create. |
| **Search Metadata** | guestName, pickup, window, status. |
| **Future AI Notes** | Native app later; web is responsive 1.0. |
| **Status** | **Implemented** (Mobility Driver OS 1.0) |

---

## E. Inventory

### Capacity

| Field | Content |
|-------|---------|
| **Purpose** | How much can be promised. |
| **Definition** | DiningCapacity.totalCapacity, ExperienceSlot.capacity, room allotment covering a date window, fleet unit free calendar. |
| **Owner** | Partner Organization via Asset. |
| **Lifecycle** | Defined → Open for sale → Stop-sell. |
| **Relationships** | Holds, Allocations, Reservations. |
| **Business Rules** | `available = total − reserved − held` (resource-specific equation). UI is not the sole gate. |
| **States** | open, stop_sell, closed. |
| **Events** | CapacityUpdated. |
| **Permissions** | inventory.write |
| **Snapshots** | — |
| **Search Metadata** | date, resource id. |
| **Future AI Notes** | Always re-read under lock before promise. |
| **Status** | **Implemented** (stay/dining/experience/fleet rental/driver job) |

### Allotment

| Field | Content |
|-------|---------|
| **Purpose** | Dated stock window for a room product. |
| **Definition** | `AssetAllotment` availableCount over start/end dates; stopSell flag. |
| **Owner** | Stay organization. |
| **Lifecycle** | Created → Adjusted → Closed. |
| **Relationships** | RoomProduct, InventoryAllocation ledger. |
| **Business Rules** | Remaining ≈ allotment capacity − overlapping allocations. |
| **States** | open, stop_sell. |
| **Events** | AllotmentUpdated. |
| **Permissions** | inventory |
| **Snapshots** | — |
| **Search Metadata** | product, dates. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### InventoryAllocation

| Field | Content |
|-------|---------|
| **Purpose** | Ledger row consuming stay (or similar) capacity. |
| **Definition** | hold \| confirmed \| released allocation against product/dates. |
| **Owner** | Partner Asset org. |
| **Lifecycle** | hold → confirmed \| released. |
| **Relationships** | StayReservation, BookingRequirement, StayAllotmentAdapter. |
| **Business Rules** | Release on cancel; modify ops reallocate deltas. |
| **States** | hold, confirmed, released. |
| **Events** | AllocationCreated, AllocationReleased. |
| **Permissions** | inventory / stay |
| **Snapshots** | — |
| **Search Metadata** | product, dates. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

---

## F. Money

### CommercialDocument

| Field | Content |
|-------|---------|
| **Purpose** | Legal money demand or credit between parties. |
| **Definition** | Invoice, credit note, etc., with lines, tax, amountPaid denorm. |
| **Owner** | Issuing Organization. |
| **Lifecycle** | open → partial → paid \| cancelled \| void. |
| **Relationships** | PaymentAllocations, Trip, ServiceRequest, Party/counterparty. |
| **Business Rules** | Outstanding from FinanceBalanceService: total − credits − allocated − writeOffs. Never silently delete money; draft credits on cancel. |
| **States** | open, partial, paid, cancelled, void. |
| **Events** | DocumentIssued, DocumentPaid. |
| **Permissions** | finance.* |
| **Snapshots** | Line amounts at issue. |
| **Search Metadata** | documentNumber, party, status. |
| **Future AI Notes** | Use balance endpoint, not ad-hoc UI math. |
| **Status** | **Implemented** |

### Payment (PaymentRecord)

| Field | Content |
|-------|---------|
| **Purpose** | Money movement recorded. |
| **Definition** | Inbound/outbound payment with method and reference. |
| **Owner** | Recording Organization. |
| **Lifecycle** | Recorded → Allocated (via allocations) → (Refund **Partial**). |
| **Relationships** | PaymentAllocations, optional CommercialDocument. |
| **Business Rules** | Unallocated = amount − allocations − refunded. |
| **States** | recorded (allocations independently). |
| **Events** | PaymentReceived, PaymentAllocated. |
| **Permissions** | finance.* |
| **Snapshots** | — |
| **Search Metadata** | reference, amount. |
| **Future AI Notes** | Gateway webhook idempotency later. |
| **Status** | **Implemented** (manual); gateway **Defined** |

### PaymentAllocation

| Field | Content |
|-------|---------|
| **Purpose** | Apply payment to a document. |
| **Definition** | Amount link PaymentRecord → CommercialDocument; keeps amountPaid in sync. |
| **Owner** | Same as payment org. |
| **Lifecycle** | Created (immutable row; reverse via credit/adjustment). |
| **Relationships** | Payment, Document. |
| **Business Rules** | Cannot allocate more than payment remainder. Document status transitions via guards. |
| **States** | — |
| **Events** | PaymentAllocated. |
| **Permissions** | finance.* |
| **Snapshots** | — |
| **Search Metadata** | — |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### Settlement (PartnerSettlement)

| Field | Content |
|-------|---------|
| **Purpose** | Buyer–seller reconciliation of accrued amounts. |
| **Definition** | Not a substitute invoice; rolls agreed SR amounts vs paid/settled. |
| **Owner** | Initiating org (usually agency). |
| **Lifecycle** | Open → Settled. |
| **Relationships** | ServiceRequest, partner. |
| **Business Rules** | Trip payable rollup = agreed selected items − settlements. |
| **States** | open, settled. |
| **Events** | SettlementRecorded. |
| **Permissions** | finance / network |
| **Snapshots** | — |
| **Search Metadata** | partner, period. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### CreditNote

| Field | Content |
|-------|---------|
| **Purpose** | Reduce amount owed on prior documents. |
| **Definition** | CommercialDocument with docType credit_note; may draft on cancellation. |
| **Owner** | Issuing Organization. |
| **Lifecycle** | Same as CommercialDocument. |
| **Relationships** | Linked document / cancellation case. |
| **Business Rules** | No silent money delete; human applies credit. |
| **States** | open → … |
| **Events** | CreditNoteDrafted. |
| **Permissions** | finance.* |
| **Snapshots** | — |
| **Search Metadata** | linked document. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

---

## G. Orchestration & care

### CancellationCase

| Field | Content |
|-------|---------|
| **Purpose** | Orchestrate multi-record cancel side effects with policy math. |
| **Definition** | Approval + execution statuses; affected entities; evaluation JSON. |
| **Owner** | Initiating Organization. |
| **Lifecycle** | Approval: draft → awaiting_approval → approved \| rejected. Execution: pending → applying → applied \| partially_applied \| failed. |
| **Relationships** | Trip, affected holds/items/bookings/reservations/allocations. |
| **Business Rules** | Require approved (or approve-and-apply). Partial apply if some steps fail; never mark applied if nothing succeeded when work was required. |
| **States** | Dual status fields as above. |
| **Events** | CancellationApplied, CancellationPartiallyApplied. |
| **Permissions** | ops.write |
| **Snapshots** | Policy + charges/refunds. |
| **Search Metadata** | scope, status. |
| **Future AI Notes** | Explain with humanExplanation from evaluator. |
| **Status** | **Implemented** |

### TripChangeCase

| Field | Content |
|-------|---------|
| **Purpose** | Structured change with impact and supplier/customer gates. |
| **Definition** | Change type, impact JSON (release holds, cancel items), status workflow. |
| **Owner** | Agency. |
| **Lifecycle** | requested → impact_calculated → awaiting_* → applied \| rejected. |
| **Relationships** | Trip, holds, items. |
| **Business Rules** | Apply uses transition guards; side effects release holds/cancel items. |
| **States** | See `trip_change` graph. |
| **Events** | TripChangeApplied. |
| **Permissions** | ops.write |
| **Snapshots** | impactJson. |
| **Search Metadata** | trip, status. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### WorkflowRecoveryItem

| Field | Content |
|-------|---------|
| **Purpose** | Durable failure for multi-step commerce workflows. |
| **Definition** | failedStep, affected entities, retryEligible, compensation JSON. |
| **Owner** | Organization where workflow ran. |
| **Lifecycle** | open → retrying → resolved \| dead. |
| **Relationships** | Holds, SR items, etc. |
| **Business Rules** | Do not silently mark confirm success if fulfilment failed; enqueue recovery. |
| **States** | open, retrying, resolved, dead. |
| **Events** | RecoveryOpened, RecoveryResolved. |
| **Permissions** | ops.* |
| **Snapshots** | lastError. |
| **Search Metadata** | workflowType, status. |
| **Future AI Notes** | Operator assist for compensate vs retry. |
| **Status** | **Implemented** |

### Incident (ServiceIncident)

| Field | Content |
|-------|---------|
| **Purpose** | Service failure or guest complaint during delivery. |
| **Definition** | Severity, category, compensation, trip/SR links. |
| **Owner** | Reporting Organization. |
| **Lifecycle** | open → investigating → resolved. |
| **Relationships** | Trip, ServiceRequest, supplier. |
| **Business Rules** | Does not by itself cancel money; may spawn CancellationCase. |
| **States** | open, investigating, resolved. |
| **Events** | IncidentReported, IncidentResolved. |
| **Permissions** | ops.* |
| **Snapshots** | — |
| **Search Metadata** | title, severity. |
| **Future AI Notes** | Care agent suggests playbooks only. |
| **Status** | **Implemented** |

### Review (PartnerRating)

| Field | Content |
|-------|---------|
| **Purpose** | Post-service quality signal between orgs. |
| **Definition** | Rating / comment between network parties. |
| **Owner** | Submitting Organization. |
| **Lifecycle** | Submitted (immutable or amend **Partial**). |
| **Relationships** | Partner orgs, ServiceRequest. |
| **Business Rules** | Not a substitute for Incident. |
| **States** | submitted. |
| **Events** | RatingSubmitted. |
| **Permissions** | network |
| **Snapshots** | — |
| **Search Metadata** | score. |
| **Future AI Notes** | Aggregate only with consent. |
| **Status** | **Partial** |

---

## H. Stay operations records

### FolioCharge

| Field | Content |
|-------|---------|
| **Purpose** | Guest ledger line on a stay (and reusable soft-bill line elsewhere). |
| **Definition** | Room, tax, extras, discounts posted to StayReservation; also meal soft folio and (Defined) QR `ServiceOrder` / `TableSession` session bills. Soft folio cleared via `amountPaid` + PaymentRecord; optional CommercialDocument invoice + PaymentAllocation. |
| **Owner** | Owning Organization (stay / restaurant / mobility). |
| **Lifecycle** | Posted (reversals as compensating charges). |
| **Relationships** | StayReservation; MealReservation; (Defined) TableSession / ServiceOrder; PaymentRecord; CommercialDocument / PaymentAllocation. |
| **Business Rules** | Checkout / unpaid-departure Math = Σ folioCharges − amountPaid (do not double-count rateAmount after night posts). Guest Services Phase 1 posts order snapshots as FolioCharge — do not invent a parallel invoice table ([07](./07-guest-services-qr.md)). |
| **States** | posted. |
| **Events** | FolioChargePosted, NightAuditPosted, StayPaymentReceived. |
| **Permissions** | stay / restaurant / guest-services ops |
| **Snapshots** | posting date/source; order line name/price when from ServiceOrder. |
| **Search Metadata** | category, stay id / session id. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (stay/meal/rental paths); Guest Services posting **Defined** |

### HousekeepingTask

| Field | Content |
|-------|---------|
| **Purpose** | Clean/inspect room readiness. |
| **Definition** | Task on a room unit with assignee, due, inspect timestamps. |
| **Owner** | Stay Organization. |
| **Lifecycle** | pending → cleaning → inspected → ready (blocked allowed). |
| **Relationships** | RoomUnit, Asset. |
| **Business Rules** | Transition guards; reopen from blocked needs reopenedReason. |
| **States** | pending, cleaning, inspected, ready, blocked. |
| **Events** | RoomMarkedReady. |
| **Permissions** | stay HK |
| **Snapshots** | — |
| **Search Metadata** | unit, assignee, due. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### MaintenanceWorkOrder

| Field | Content |
|-------|---------|
| **Purpose** | Repair / downtime tracking. |
| **Definition** | Work order with category, vendor, downtime window, cost, optional OOO. |
| **Owner** | Stay Organization. |
| **Lifecycle** | open → in_progress → done. |
| **Relationships** | RoomUnit; may block inventory. |
| **Business Rules** | Blocking maintenance on unit is a checkout/check-in concern. |
| **States** | open, in_progress, done. |
| **Events** | MaintenanceOpened, UnitOOO. |
| **Permissions** | stay maintenance |
| **Snapshots** | partsJson. |
| **Search Metadata** | unit, vendor, category. |
| **Future AI Notes** | — |
| **Status** | **Implemented** |

### PropertyDayClose

| Field | Content |
|-------|---------|
| **Purpose** | Night audit / business-date close for a property. |
| **Definition** | Posted room charges, no-shows, unresolved arrivals, unpaid departures for a businessDate. |
| **Owner** | Stay Organization. |
| **Lifecycle** | Closed once per (asset, businessDate) — idempotent. |
| **Relationships** | PartnerAsset, StayReservations, FolioCharges. |
| **Business Rules** | Unique (assetId, businessDate). Unpaid departures use folio outstanding (charges − amountPaid). Unresolved arrivals include inquiry/tentative/held/confirmed not yet checked in. |
| **States** | closed. |
| **Events** | PropertyDayClosed. |
| **Permissions** | stay ops |
| **Snapshots** | summaryJson. |
| **Search Metadata** | asset, businessDate. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (A-STAY-03 polish) |

---

## I. Platform glue

### Conversation

| Field | Content |
|-------|---------|
| **Purpose** | Human thread linked to a business entity. |
| **Definition** | Subject + messages; optional counterparty org/party. |
| **Owner** | Organization. |
| **Lifecycle** | open → closed. |
| **Relationships** | linkedEntityType/Id, Messages. |
| **Business Rules** | Not a substitute for Timeline events. |
| **States** | open, closed. |
| **Events** | MessagePosted. |
| **Permissions** | ops / tasks |
| **Snapshots** | — |
| **Search Metadata** | subject, linked entity. |
| **Future AI Notes** | Visibility matrices Phase B+. |
| **Status** | **Implemented** |

### TimelineEvent (BusinessTimelineEvent)

| Field | Content |
|-------|---------|
| **Purpose** | Append-only business history. |
| **Definition** | eventType, entity, summary, optional payload; often paired with outbox. |
| **Owner** | Organization. |
| **Lifecycle** | Append-only. |
| **Relationships** | Any entity. |
| **Business Rules** | Prefer timeline over silent field edits for auditable ops. |
| **States** | — |
| **Events** | (is the event store) |
| **Permissions** | read by ops |
| **Snapshots** | payloadJson. |
| **Search Metadata** | eventType, entityId. |
| **Future AI Notes** | Primary audit trail for agents. |
| **Status** | **Implemented** |

### DataQualityIssue

| Field | Content |
|-------|---------|
| **Purpose** | Detect incomplete or inconsistent commercial data. |
| **Definition** | ruleCode + entity + message; open issues feed ops centre. |
| **Owner** | Organization. |
| **Lifecycle** | open → resolved. |
| **Relationships** | service_request, stay_reservation, etc. |
| **Business Rules** | Detection is advisory until ops closes. |
| **States** | open, resolved. |
| **Events** | DataQualityDetected. |
| **Permissions** | ops.read |
| **Snapshots** | — |
| **Search Metadata** | ruleCode, entity. |
| **Future AI Notes** | Suggest fixes; do not auto-mutate without policy. |
| **Status** | **Implemented** |

---

## J. Guest Services (QR) — Defined

Canonical product chapter: [07 — QR Guest Services](./07-guest-services-qr.md). Status of all concepts below: **Defined** (not in schema yet). Do not stuff these into the commerce spine (`ServiceRequest` / generic Reservation).

### ServiceLocation

| Field | Content |
|-------|---------|
| **Purpose** | Physical or logical place a guest can scan to order (table, room, zone). |
| **Definition** | Scoped to Organization + PartnerAsset; `locationType` (RESTAURANT_TABLE, HOTEL_ROOM, HOMESTAY_ROOM, FARMSTAY_UNIT, DINING_ZONE, EVENT_AREA); opaque `publicToken` for QR URL `/o/{token}`; human label (“Table 12”, “Room 204”). |
| **Owner** | Partner Organization. |
| **Lifecycle** | active → disabled; token regeneratable (invalidates prior QR prints). |
| **Relationships** | PartnerAsset; TableSession (restaurant); Stay unit / room reference; ServiceOrders. |
| **Business Rules** | QR never embeds guest PII or internal DB ids. Token rotation for misuse. Ordering rules depend on type (open TableSession vs checked_in Stay). |
| **States** | active, disabled. |
| **Events** | ServiceLocationCreated, ServiceLocationTokenRotated, ServiceLocationDisabled. |
| **Permissions** | guest-services / ops manage |
| **Snapshots** | printable metadata (logo URL, label). |
| **Search Metadata** | label, locationType, asset. |
| **Future AI Notes** | Token resolves only via public guest API. |
| **Status** | **Implemented** (Guest Services Phase 1) |

### TableSession

| Field | Content |
|-------|---------|
| **Purpose** | Open dining cover for a restaurant table so QR orders attach to one bill. |
| **Definition** | Restaurant table + openedAt + guestCount + status OPEN → BILL_REQUESTED → BILLED → PAID → CLOSED. |
| **Owner** | Restaurant Organization. |
| **Lifecycle** | Staff opens (default) or walk-in QR toggle; reset when paid / closed / staff reset. |
| **Relationships** | ServiceLocation (table); optional MealReservation / Party; ServiceOrders; FolioCharges. |
| **Business Rules** | Sits **beside** MealReservation (group/packages). Guest cannot place when session required and none OPEN. Prevents new cover from seeing prior bill. |
| **States** | open, bill_requested, billed, paid, closed. |
| **Events** | TableSessionOpened, TableSessionClosed, TableBillRequested. |
| **Permissions** | restaurant ops |
| **Snapshots** | — |
| **Search Metadata** | table label, openedAt. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (Guest Services Phase 1) |

### ServiceOffering / ServiceCatalogAvailability

| Field | Content |
|-------|---------|
| **Purpose** | Sellable guest-service items with time/location availability. |
| **Definition** | PartnerAsset-scoped catalogue item (name, price, category, dietary labels, photo); availability by days/hours/meal period/stopSell/max qty. |
| **Owner** | Partner Organization. |
| **Lifecycle** | draft → active → inactive; stop-sell without deleting. |
| **Relationships** | PartnerAsset; location scope; ServiceOrderItem. |
| **Business Rules** | Not the same as MealPackage. Public page shows only currently available offerings. Allergen labels are informational — no guaranteed allergy-safe claim. |
| **States** | active, inactive, stop_sell. |
| **Events** | ServiceOfferingPublished, ServiceOfferingStopSell. |
| **Permissions** | guest-services catalog manage |
| **Snapshots** | price/tax at order line (ServiceOrderItem). |
| **Search Metadata** | name, category. |
| **Future AI Notes** | Modifiers Defined for Phase 2. |
| **Status** | **Implemented** (availability windows + stop-sell; modifiers Phase 2) |

### ServiceOrder / ServiceOrderItem

| Field | Content |
|-------|---------|
| **Purpose** | Guest (or staff) cart fulfilment with price snapshots. |
| **Definition** | Order with source (QR, STAFF, PHONE, GUEST_PORTAL); optional serviceLocation, tableSession, stay reservation, party; status DRAFT→PLACED→…→COMPLETED / REJECTED / CANCELLED; items with nameSnapshot, unitPriceSnapshot, taxSnapshot, qty, instructions. |
| **Owner** | Partner Organization. |
| **Lifecycle** | Place (idempotent) → accept → prepare → ready/out → served/completed. |
| **Relationships** | ServiceLocation; TableSession; StayReservation; FolioCharge; notify events. |
| **Business Rules** | Snapshots freeze menu price at place. Hotel: checked_in + PIN (Phase 1). Restaurant: OPEN session when required. Post charges via FolioCharge — not a new invoice engine. |
| **States** | draft, placed, accepted, preparing, ready, out_for_delivery, served, completed, rejected, cancelled. |
| **Events** | ServiceOrderPlaced, ServiceOrderAccepted, ServiceOrderReady, ServiceOrderCompleted, ServiceOrderCancelled. |
| **Permissions** | public place (token); ops accept/complete |
| **Snapshots** | line name/price/tax; modifier snapshots Phase 2. |
| **Search Metadata** | location, status, placedAt. |
| **Future AI Notes** | Orchestrate status only via APIs. |
| **Status** | **Implemented** (Guest Services Phase 1) |

### GuestServiceRequest

| Field | Content |
|-------|---------|
| **Purpose** | Non-food guest request from the same QR/ guest UI. |
| **Definition** | Towels, laundry pickup, maintenance, wake-up, transfer ask — routed to HK / laundry / maintenance / front desk / host board. |
| **Owner** | Partner Organization. |
| **Lifecycle** | requested → accepted → in_progress → done \| cancelled. |
| **Relationships** | ServiceLocation; StayReservation; may create MaintenanceWorkOrder / HousekeepingTask. |
| **Business Rules** | Separate from ServiceOrder (billing optional). Same public UX ok; different ops records. |
| **States** | requested, accepted, in_progress, done, cancelled. |
| **Events** | GuestServiceRequested, GuestServiceCompleted. |
| **Permissions** | public create (token + stay rules); ops manage |
| **Snapshots** | — |
| **Search Metadata** | category, room label. |
| **Future AI Notes** | — |
| **Status** | **Implemented** (create via public API; deep routing/boards Phase 2) |

---

## Naming cheat-sheet

| Prefer saying | Avoid / alias |
|---------------|---------------|
| BookingRequirement | “Booking” when meaning supplier reservation |
| ServiceRequest | RFQ, ticket (informal OK in UI) |
| Reservation (Stay/Meal…) | Confirming an SR without fulfilment record |
| Organization | Tenant, community |
| PartnerAsset | “Hotel account” for a second property |
| Hold | Soft block in UI only |
| CommercialDocument | “Invoice row” in ops spreadsheets |
| Snapshot | Live rate as truth after confirm |
| ServiceOrder | Kitchen ticket as if it were a ServiceRequest |
| TableSession | MealReservation for walk-in QR covers |
| ServiceOffering | MealPackage for a la carte QR menu |
| FolioCharge | Parallel “QR invoice” table |

---

## Change control

Updates to this document require:

1. Matching transition/invariant change in code or an explicit “Defined only” note, and  
2. A one-line entry in Phase A backlog or a vertical OS chapter when behaviour expands.
