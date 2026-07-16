# 01 — Domain ownership

**Invariant:** A record may describe another record’s state, but **only one record owns each lifecycle**.

Core records belong to each organization’s OS. The network only connects organizations.

## Roles of major entities

| Entity | Owns |
|--------|------|
| **Accepted quotation snapshot** | Customer commercial promise (sell price, inclusions, what the traveller was sold) |
| **BookingComponent** (= BookingRequirement) | Agency delivery need — what must be fulfilled for the trip |
| **ServiceRequest** | Commercial negotiation between buyer and seller (header: parties, validity, overall status) |
| **ServiceRequestItem** | Line-level negotiated terms, selection, link to hold + reservation |
| **InventoryHold** | Temporary capacity reservation with expiry |
| **StayReservation / MealReservation / …** | Supplier fulfilment commitment and operational status |
| **CommercialDocument** | What one party owes another (legal money demand) |
| **PaymentRecord + PaymentAllocation** | Money moved and how it applies to documents |
| **PartnerSettlement** | Buyer–seller reconciliation of accrued amounts, not a substitute invoice |
| **TripChangeCase / CancellationCase** | Orchestration of multi-record side effects |

## Field ownership (disputed facts)

| Fact | Owner | Others |
|------|-------|--------|
| Service dates / window (needed) | BookingRequirement | SR/Item snapshot requested terms |
| Service dates (committed) | Partner reservation | SR item offeredTerms + confirmation |
| Room / product sold | Reservation (fulfilment) | Item productRef; booking type is requirement only |
| Pax / quantity (need) | BookingRequirement | Item may refine offered qty |
| Supplier cost (agreed) | ServiceRequestItem (selected) | Booking may mirror for agency ops readiness |
| Sell / package price | Quotation snapshot | Never overwrite from live rates |
| Cancellation policy (sold) | Quotation / rate snapshot at accept | —
| Cancellation policy (supplier) | Snapshot on SR confirm / reservation | Live Policy is draft only |
| Confirmation status (supplier) | Reservation | SR status = negotiation; Booking status = agency readiness |
| Inventory available | Resource + Hold ledger | UI must not be sole gate |
| Invoice amount due | CommercialDocument | PaymentAllocation reduces balance |
| Settlement balance | PartnerSettlement | Built from agreed + invoices − payments |

## Propagation rules

- **Live rate/policy change** → does not rewrite confirmed snapshots.
- **Select another supplier** → deselect other items; release their holds; update booking readiness.
- **Reservation cancel** → release inventory; update item/SR; open CancellationCase for money/policy.
- **Quotation accept** → freezes customer promise; later fulfilment drift requires explicit reconciliation.

## Anti-patterns

- Treating Booking status and Reservation status as the same field.
- Storing margin on payloads sent to partners.
- Confirming without rate + policy snapshots.
- One payment linked to many invoices without allocations.
