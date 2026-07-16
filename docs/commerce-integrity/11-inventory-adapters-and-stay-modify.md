# 11 — Inventory adapter contract & stay named-modify ops

Independent OS Phase 1 addendum. Covers the shape every `InventoryAdapter`
must satisfy and the "named modify" surface for in-flight stay
reservations (extend, early departure, move unit, change room product,
occupancy, meal plan, partial cancel), plus front-office day close.

## Inventory adapter contract

`InventoryAdapter` (`apps/api/src/modules/commerce/inventory-adapters.ts`) is
the one seam every resource type (dining, experience slots, stay allotment)
must implement so holds/consume/release/expire behave uniformly regardless of
vertical:

```ts
interface InventoryAdapter {
  readonly resourceType: string;
  getAvailability(tx, ref): Promise<number>;
  createHold(tx, ref): Promise<void>;
  extendHold?(tx, ref): Promise<void>;
  consumeHold(tx, ref): Promise<void>;
  releaseHold(tx, ref): Promise<void>;
  expireHold(tx, ref): Promise<void>;
}
```

Rules every adapter follows:

| Rule | Why |
|------|-----|
| Always runs inside the caller's `tx` (`Prisma.TransactionClient`) | Hold math and the reservation/allocation row must commit atomically |
| Locks the resource row (`SELECT … FOR UPDATE` or equivalent) before reading availability inside `createHold` | Prevents lost-update races when two requests hold the same slot concurrently |
| `getAvailability` never throws — returns `0` for an unknown resource | Callers can always safely branch on a number |
| `createHold` throws a plain `Error` (not a Nest exception) when capacity is insufficient | Adapter code is transport-agnostic; the calling service/controller decides how to surface it (400 vs 409) |
| `releaseHold` and `expireHold` are behaviourally interchangeable unless a vertical needs to distinguish "guest cancelled" vs "hold timed out" | Keeps the common case (`applyInventoryMode`) simple |
| `consumeHold` is idempotent-safe to call on an already-consumed ref where feasible (e.g. `StayAllotmentAdapter` resolves by allocation id first) | Retries after partial failures must not double-book |

`getInventoryAdapter(resourceType)` is the single registry lookup —
adding a new vertical means adding one adapter + one entry, never a new
switch statement scattered through callers. `applyInventoryMode(tx, mode, ref)`
is the thin dispatcher (`hold | confirm | release | expire`) used by
generic hold-lifecycle code (see `09-domain-events-and-idempotency.md`).

Unit coverage: `inventory-adapters.spec.ts` exercises `DiningCapacityAdapter`
and `ExperienceSlotAdapter` against an in-memory fake `tx` (increment/decrement
math + insufficient-capacity errors) without touching a real database.
`StayAllotmentAdapter` is covered indirectly through the stay reservation
integration paths since its availability query spans multiple tables
(`AssetAllotment` + `InventoryAllocation`) that are impractical to fake
faithfully outside Postgres.

## Stay named-modify ops

Once a `StayReservation` is `confirmed` or `checked_in` (the `MODIFIABLE`
set in `stay.service.ts`), front desk can apply a small, explicit set of
named operations instead of freeform PATCH — each one owns its own
inventory/folio side effects:

| Endpoint | Effect |
|----------|--------|
| `POST /stay/reservations/:id/extend` | Push `checkOut` later; extends the inventory allocation window and posts the incremental room charge |
| `POST /stay/reservations/:id/early-departure` | Pull `checkOut` earlier; shrinks the allocation window and posts a negative room-charge adjustment |
| `POST /stay/reservations/:id/change-room-product` | Swap the sold product mid-stay (re-validates availability on the new product for the existing dates) |
| `POST /stay/reservations/:id/move-unit` | Reassign the physical unit without changing product/dates; blocked if the target unit is `ooo` or already occupied for the window |
| `POST /stay/reservations/:id/change-occupancy` | Adjust adults/children; re-prices against the active rate plan and enforces `maxOccupancy` |
| `POST /stay/reservations/:id/change-meal-plan` | Switch meal plan; posts the rate delta × nights as a folio charge |
| `POST /stay/reservations/:id/partial-cancel` | Cancels a single room's reservation as its own `CancellationCase` (scope `stay_room`) while leaving sibling rooms on the same stay untouched |

All seven go through `loadModifiable()`, which re-checks
`MODIFIABLE.has(status)` and `resolveAssetAccess` on every call — there is no
separate "is this reservation editable" endpoint to keep in sync.

### Checkout blockers

`GET /stay/reservations/:id/checkout-blockers` returns
`{ blockers: Blocker[]; warnings: Blocker[] }` (severity `blocker` vs
`warning`). Blockers: **outstanding folio** (Σ FolioCharge − `amountPaid`),
missing room unit, missing guest name, open `blockInventory` maintenance on
the assigned unit. Soft-folio pay-down is
`POST /stay/reservations/:id/payments` (optional invoice via
`POST /stay/reservations/:id/invoice` + PaymentAllocation toward the doc).
The UI (`StayReservationsPanel`) surfaces blockers before calling
`POST /stay/reservations/:id/check-out`, and lets the operator retry with
`{ force: true }` to check out despite blockers (warnings never block).

Create/update with `roomUnitId` run the same overlap + OOO guards as check-in /
`move-unit`, and append `assignmentHistoryJson`.

Homestay/farmstay: when asset `profileJson.homestay.houseRules` is non-empty
(or `requireRulesAck`), check-in requires `houseRulesAck: true` (sets
`houseRulesAckAt`).

### Property day close

`POST /stay/assets/:assetId/day-close { businessDate }` is a one-shot,
idempotent-per-date front-office close-out (`PropertyDayClose` has a unique
`(assetId, businessDate)`):

1. Posts the night's room charge for every `checked_in` reservation spanning
   that date (skipped if already posted for that date — matched by a marker
   string in the folio charge description).
2. Marks confirmed arrivals that never checked in as `no_show` and releases
   their allocation.
3. Records unresolved arrivals (`inquiry` / `tentative` / `held` / `confirmed`)
   and unpaid departures (folio charges − `amountPaid` > 0) for operator
   follow-up. List recent closes via `GET /stay/assets/:assetId/day-closes`.

Calling it twice for the same `businessDate` throws `400` — the UI's "Close
day" button on `StayDashboard` is a single action per business day, not a
toggle.

## Cancellation apply outcome

`resolveCancellationExecutionOutcome()` (`lifecycle-transitions.ts`) is the
pure function behind `CancellationCase.executionStatus` once a cancellation
has been applied across its affected entities:

- No affected entities → `applied`
- Zero of N applied → `failed`
- Some but not all applied → `partially_applied` (retry-eligible; recorded as
  a `WorkflowRecoveryItem` for ops to retry or compensate)
- All applied → `applied`

Extracting this into a pure function (rather than inline `if/else` in
`commerce.service.ts`) makes the four outcome branches independently unit
testable (`lifecycle-transitions.spec.ts`) without a transaction or database.

## See also

- [09 Events & idempotency](./09-domain-events-and-idempotency.md) — `WorkflowRecoveryItem`, retry/compensate
- [03 Reservation & inventory](./03-reservation-and-inventory-contract.md) — capacity equation, hold model
- [02 Commerce lifecycle](./02-commerce-lifecycle.md) — where `lifecycle-transitions.ts` graphs fit end to end
