# Commerce Integrity docs

PR review should reference these before schema sprawl.

| Doc | Topic |
|-----|--------|
| [01 Domain ownership](./01-domain-ownership.md) | One lifecycle owner per fact |
| [02 Commerce lifecycle](./02-commerce-lifecycle.md) | Requirement → SR → Item → Hold → Reservation → Money |
| [03 Reservation & inventory](./03-reservation-and-inventory-contract.md) | Capacity equation, holds, concurrency |
| [04 Rate & pricing](./04-rate-and-pricing-contract.md) | Audience, basis, tax, PricedResult |
| [05 Policy & cancellation](./05-policy-and-cancellation-model.md) | Evaluator + CancellationCase |
| [06 Money & settlement](./06-money-and-settlement-model.md) | Document kinds, PaymentAllocation |
| [07 Cross-tenant sharing](./07-cross-tenant-data-sharing.md) | Fulfilment payloads, snapshots |
| [08 Kind capability matrix](./08-organization-kind-capability-matrix.md) | Offline OS per kind |
| [09 Events & idempotency](./09-domain-events-and-idempotency.md) | Outbox, keys, recovery |
| [10 Data governance & AI](./10-data-governance-and-ai-readiness.md) | Classification, AI eligibility |
| [11 Inventory adapters & stay modify](./11-inventory-adapters-and-stay-modify.md) | Adapter contract, named modify ops, day close, cancel outcome |
| [12 Deferred schema & search follow-ups](./12-schema-index-followups.md) | Evidence-triggered deferred index/search work |
