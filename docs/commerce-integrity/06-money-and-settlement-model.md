# 06 — Money and settlement model

## Document kinds (not interchangeable)

| Kind | Meaning |
|------|---------|
| Trip finance estimate | Planning; not a tax invoice |
| Agency customer invoice | What client owes agency |
| Supplier invoice | What agency owes supplier |
| Guest folio / restaurant bill | Operational charges on shared line primitives |
| Buyer–seller settlement | Accrual reconciliation across transactions |

Reuse `CommercialDocument` / lines / `PaymentRecord` / **PaymentAllocation**; do not invent parallel HotelPayment tables.

## PaymentAllocation

```text
PaymentAllocation { paymentId, commercialDocumentId, amount, allocatedAt }
```

Supports: unallocated remainder, partial allocation, overpayment, refund allocation, credit-note application.

Balance of a document = amount − sum(allocations) − credit notes (as modeled).

## Settlement lifecycle

`accrued → pending_review → approved → partially_settled → settled | disputed | adjusted | cancelled`

Reconcile: agreed amount, supplier invoice, adjustments, commission, tax, payments, credit notes, outstanding.

## Legal context (minimum)

Supplier/buyer legal identity, place of supply, tax registration, inclusive/exclusive, numbering series — captured on org profile + document fields. Full GL is out of scope.
