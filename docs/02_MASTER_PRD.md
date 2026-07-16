# Master Product Requirements Document

## 1. Lead Management

### Sources
- Facebook Lead Ads
- Instagram
- Website forms
- WhatsApp
- Google Ads
- Phone
- Walk-in
- Referral
- Existing client
- B2B partner
- Manual import
- CSV import
- API / webhook

### Required Capabilities
- Manual lead creation
- Source and campaign attribution
- Automatic assignment rules
- Round-robin and team assignment
- Duplicate detection by phone, email and configurable rules
- Lead ownership
- Tags, priority and score
- Follow-up date and reminders
- Activity timeline
- Bulk assignment and status updates
- Custom fields
- Lost reason tracking
- Lead merge

### Default Pipeline
New → Attempted Contact → Contacted → Requirements Pending → Qualified → Proposal Sent → Negotiation → Won / Lost

Organizations may configure their own pipeline.

## 2. Party and Account Management

The system must use a flexible Party model.

### Individual
- Name
- Phone and email
- Address
- Nationality
- Preferences
- Communication consent
- Travel history
- Associated family or travellers

### Organization
- Legal and trade name
- GST / tax identifiers
- Business type
- Billing address
- Branches
- Contact persons
- Credit limit
- Payment terms
- Commission structure
- Account manager
- Outstanding balance

### Supported Organization Types
- Corporate client
- Travel agency
- Reseller
- Supplier
- DMC
- Hotel
- Transport company
- Activity provider

## 3. Inquiry Management

An inquiry captures the commercial requirement before confirmation.

### Core Fields
- Inquiry number
- Customer or B2B account
- Contact person
- Lead source
- Sales owner
- Travel type
- Domestic / international
- Origin
- Destinations
- Flexible or fixed dates
- Nights and days
- Adults, children and infants
- Room requirements
- Budget and currency
- Hotel category
- Meals
- Transport preference
- Flights required
- Visa assistance
- Insurance
- Activities and interests
- Accessibility or special requirements
- Internal notes
- Expected closing date

### Requirements
- Multiple inquiries per customer
- Inquiry cloning
- Requirement checklist
- Missing-information indicator
- Conversion to trip without losing history
- Inquiry status history
- Link all communications and documents

## 4. Trip Workspace

A Trip is created when planning becomes active or when an inquiry is confirmed, depending on organization policy.

### Workspace Sections
- Overview
- Client and contact
- Travellers
- Itinerary
- Quotations
- Booking components
- Suppliers
- Customer payments
- Supplier payments
- Documents
- Tasks
- Communication
- Notes
- Audit timeline
- Profitability

### Trip Statuses
Planning → Quoted → Awaiting Approval → Confirmed → Booking in Progress → Ready to Travel → In Progress → Completed → Cancelled

Statuses must be configurable.

### Business Rules
- A trip may originate from an inquiry or be created directly with permission.
- A trip may have multiple quotations but only one accepted commercial version at a time.
- Internal cost must not be visible in customer-facing output.
- Cancellation must record reason, fees and refund state.
- Completed trips become part of account travel history.

## 5. Traveller Management

- Multiple travellers per trip
- Lead traveller
- Traveller type: adult, child, infant
- Date of birth
- Passport data
- Passport expiry alert
- Visa status
- Emergency contact
- Food and accessibility preferences
- Room allocation
- Document attachments
- Consent and privacy controls

Sensitive fields require restricted permissions and encryption where appropriate.

## 6. Itinerary Builder

### Capabilities
- Day-by-day structure
- Drag-and-drop days and items
- Hotel, transfer, flight-reference, activity, meal, free-time and note blocks
- Reusable block catalogue
- Destination and attraction library
- Images and attachments
- Rich text
- Map links and location coordinates
- Start time, end time and duration
- Internal and customer-visible notes
- Duplicate day or entire itinerary
- Templates
- Version history
- Compare versions
- Branded PDF output
- Shareable proposal link in a later phase

### Rules
- Itinerary data is structured; PDF is only an output.
- Quote items may link to itinerary components.
- Updating itinerary dates should flag affected bookings and prices.
- AI-generated content is always a draft.

## 7. Quotation and Pricing

### Capabilities
- Multiple quotation versions
- Cost and selling price
- Per-person, per-room, per-service and package pricing
- Adults / children / infants pricing
- Supplier currency and customer currency
- Exchange-rate snapshot
- Markup by percentage or fixed amount
- Commission
- Discount
- Taxes and fees
- Rounding
- Inclusions and exclusions
- Terms and cancellation policy
- Valid-until date
- Internal approval
- Branded PDF and email
- Accepted / rejected / expired state
- Quote comparison

### Profitability
- Estimated revenue
- Estimated supplier cost
- Gross profit
- Gross margin
- Actual cost variance after booking

## 8. Supplier and Service Catalogue

### Supplier Data
- Supplier type
- Destinations served
- Contacts
- Contracts and validity
- Payment terms
- Bank details with restricted permission
- Tax data
- Credit balance
- Rating and notes
- Blacklist / inactive status

### Catalogue
- Hotels and room types
- Transfers and vehicles
- Activities
- Guides
- Meals
- Visa services
- Insurance
- Miscellaneous service items
- Seasonal rates
- Child policies
- Cancellation terms

## 9. Operations and Fulfilment

### Booking Components
- Hotel
- Flight reference
- Transfer
- Activity
- Guide
- Visa
- Insurance
- Train / cruise
- Miscellaneous

### Component Status
Draft → Requested → On Hold → Confirmed → Vouchered → Completed → Cancelled

### Capabilities
- Assign supplier
- Confirmation number
- Cost and currency
- Due date
- Cancellation deadline
- Voucher
- Operational owner
- Notes
- Dependencies
- Exception flags
- Booking checklist
- Trip readiness score

## 10. Finance Tracking

This module tracks operational finance and is not a complete accounting system.

### Customer Receivables
- Payment schedule
- Advance
- Instalments
- Due dates
- Payment method
- Reference number
- Receipt
- Refund
- Outstanding balance
- Overdue reminders

### Supplier Payables
- Supplier invoice
- Amount due
- Due date
- Partial payment
- Payment reference
- Currency
- Reconciliation against booking component

### Controls
- Permission-based financial visibility
- Immutable audit log for payment changes
- Reversal rather than destructive edits
- Manual approval thresholds

## 11. Documents

- Passport
- Visa
- Tickets
- Voucher
- Invoice
- Receipt
- Insurance
- Quotation
- Supplier confirmation
- Contract
- Custom document type
- Expiry date
- Visibility: internal, customer-shareable, restricted
- Virus scanning
- File versioning
- Access audit

## 12. Tasks, Calendar and Notifications

### Tasks
- Assignee
- Team
- Due date
- Priority
- Related lead, inquiry, trip, payment or booking component
- Checklist
- Recurrence
- Comments
- Completion evidence

### Notifications
- In-app
- Email
- WhatsApp through approved provider
- Follow-up due
- Payment due
- Passport expiry
- Trip start
- Booking deadline
- Unconfirmed component
- Supplier payment due
- Approval requested

## 13. Communication Timeline

- Email metadata and linked messages
- WhatsApp conversation references
- Call logs
- Internal comments
- Customer-visible comments in a later phase
- Message templates
- Consent and opt-out tracking

The platform should not attempt to become a full omnichannel inbox in the first release.

## 14. Reports

### Sales
- Leads by source and campaign
- Response time
- Pipeline conversion
- Lost reasons
- Salesperson performance
- Forecast value

### Trip and Operations
- Trips by destination and status
- Upcoming departures
- Unconfirmed bookings
- Operational exceptions
- Supplier performance

### Finance
- Gross booking value
- Revenue
- Estimated vs actual margin
- Outstanding receivables
- Supplier payables
- Refunds and cancellations

## 15. AI Utilities

- Parse lead messages into structured inquiry fields
- Highlight missing requirements
- Generate an itinerary draft from structured requirements
- Rewrite emails and WhatsApp messages
- Summarize conversations
- Extract fields from passports and supplier documents
- Suggest reusable catalogue items

### Guardrails
- No autonomous booking
- No automatic financial changes
- No sending without user confirmation
- Show source content for extracted facts
- Confidence indicator
- User review before persistence
- Store generated and approved versions separately

## 16. Permissions

Permissions must be action-based and scoped.

Examples:
- lead.read.own
- lead.read.team
- lead.assign
- trip.create
- itinerary.edit
- quote.view_cost
- quote.approve
- payment.record
- supplier.bank_details.read
- traveller.passport.read
- report.finance.read
- audit.read

## 17. Audit Requirements

Audit:
- Login and security events
- Ownership changes
- Status changes
- Quote version creation and approval
- Pricing edits
- Payment changes
- Supplier bank-detail access
- Document access and deletion
- Role and permission changes

## 18. Non-Functional Requirements

- Tenant isolation
- Responsive desktop-first UI
- Accessible core flows
- Search results under two seconds for normal tenant sizes
- Pagination for all lists
- Idempotent webhook ingestion
- Background processing for PDF, OCR and notifications
- Backups and point-in-time recovery
- Encryption in transit and at rest
- India-ready timezone, currency and tax configuration
- Internationalization-ready data model
