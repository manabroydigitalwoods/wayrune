# 09 — Domain events and idempotency

## Principles

- Emit **IDs**, not full entity blobs, via `OutboxEvent`.
- Consumers are idempotent on `(eventType, aggregateId, idempotencyKey)`.
- Retries safe: confirm, payment, hold expiry, network confirm.

## Core event types (catalog)

`ServiceRequested`, `ServiceRequestHeld`, `ServiceRequestConfirmed`, `ServiceRequestRejected`, `HoldCreated`, `HoldExpired`, `HoldReleased`, `ReservationConfirmed`, `ReservationCancelled`, `PaymentReceived`, `PaymentAllocated`, `CancellationRequested`, `CancellationApplied`, `TripChangeApplied`, `SettlementUpdated`.

## Idempotency keys

Required on: SR confirm, hold create/expire, payment create, network inbound confirm.

Store key on aggregate or side table; duplicate request returns prior result.

## Failure recovery

If reservation fails after SR confirmed: compensation workflow (release inventory, revert item, flag DataQualityIssue). Dead-letter via outbox `failed` + ops review.
