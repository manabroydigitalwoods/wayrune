# 02 — Commerce lifecycle

Chain (availability negotiation separate from fulfilment):

```text
BookingRequirement (BookingComponent)
  → ServiceRequest (1..N suppliers / one bundled request)
    → ServiceRequestItem
      → InventoryHold (optional)
        → Partner Reservation (Stay | Meal | …)
          → CommercialDocument
            → PaymentRecord → PaymentAllocation
              → PartnerSettlement (optional network)
```

## Separate status dimensions

Do not collapse into one enum:

| Dimension | Example | Owner |
|-----------|---------|--------|
| Planning | draft → approved | Trip / quotation |
| Availability | available → held → reserved | Hold + resource |
| Negotiation | drafted → sent → held → confirmed | ServiceRequest / Item |
| Reservation | requested → confirmed → completed | Partner reservation |
| Agency delivery | required → requested → confirmed | BookingComponent |
| Payment | scheduled → partial → paid | Documents + allocations |
| Operations | not_started → in_progress → completed | Ops / trip / HK |

## Multiplicity

- One requirement → many ServiceRequests (RFQ to Hotel A/B/C).
- One ServiceRequest → many Items (DMC bundle).
- Exactly one selected Item should back fulfilment for a simple stay requirement (others rejected/expired).
- One Item → at most one active Hold → at most one fulfilment reservation (or explicit multi-unit items).

## Confirm path

1. Item has offered terms + agreed amount.
2. Rate + policy snapshots attached.
3. Transaction: consume hold or capacity → create/link reservation → mark item selected → reject sibling RFQs → update booking readiness.
4. Emit domain event IDs via outbox (idempotent).
