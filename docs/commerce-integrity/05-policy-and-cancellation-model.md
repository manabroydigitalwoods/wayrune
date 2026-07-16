# 05 — Policy and cancellation model

## Policy storage

- Live `Policy` + `PolicyAttachment` = editable drafts.
- On quote accept / SR confirm / reservation confirm: **immutable snapshot** (`policySnapshotJson`).

## Policy evaluator

Input: snapshot rules, as-of timestamps (booked at, cancel/change at, service start), amounts.

Output:

```text
applicableRule
customerCharge
supplierPenalty
refundAmount
agencyAbsorption
humanExplanation[]
```

Structured JSON is not enough — cancel/change **must** call the evaluator.

## CancellationCase

Orchestrates multi-record cancel (not independent buttons):

```text
scope, requestedBy, reason
affectedEntities[]
applicablePolicySnapshot
calculatedCharges, expectedRefund, supplierPenalty
approvalStatus, executionStatus
```

Execute idempotent steps: release holds, update SR/items, cancel reservations, adjust documents, notify (when notification engine exists). Mark applied only when required steps succeed or are explicitly compensated.

## Change cases

[`TripChangeCase`](../../prisma/schema.prisma) continues with stronger impact plan:

`old → new`, price delta, policy penalty, inventory release + new hold, supplier reconfirm, customer approval, payment/refund.

Lifecycle: Draft → Impact assessed → Awaiting customer → Awaiting supplier → Approved → Applying → Applied | Partially applied | Failed | Rejected.
