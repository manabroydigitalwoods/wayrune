# 03 — Reservation and inventory contract

## Capacity equation

```text
Sellable capacity
− confirmed
− active holds
− blocked / OOO
+ released
= available
```

## Every inventory adapter must answer

| Question | Required |
|----------|----------|
| What is the resource? | room product date, dining slot, experience slot, vehicle unit, driver time |
| Capacity unit? | rooms, guests, seats, vehicles, exclusive time |
| Booking window? | nights, datetime range, slot |
| What creates a hold? | InventoryHold row + adapter decrement |
| Hold expiry? | `expiresAt` + idempotent expiry job |
| What consumes? | Confirm converts hold → reserved |
| What releases? | reject, cancel, expire |
| Overbooking allowed? | Explicit org/product flag only |
| Concurrency? | Transaction + row version / `SELECT FOR UPDATE` |

## Hold model

`InventoryHold`: resourceType/Id, quantity, window, expiresAt, sourceServiceRequestItemId, status (`active|confirmed|released|expired`), idempotencyKey.

Behaviour: create → capacity reduced → reminder (future) → confirm converts → reject/cancel releases → timeout expires and releases (idempotent).

## Verticals

| Vertical | Resource | Window |
|----------|----------|--------|
| Stay | Product allotment (+ optional unit) | Night dates |
| Restaurant | DiningCapacity | Slot datetime |
| Activity | ExperienceSlot | Slot |
| Vehicle | Unit / category | Time range |
| Driver | Driver calendar | Time range |

## Reservation structure

Prefer **header conventions** on vertical tables (StayReservation, MealReservation) over one nullable mega-Reservation:

Shared: organization, party/guest, source, status, service window, currency, commercial + policy snapshot, paymentState, external ref, serviceRequestItemId.
