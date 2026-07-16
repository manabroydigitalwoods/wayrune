# 04 — Rate and pricing contract

A rate answers: **what**, **for whom**, **when**, **how much**, **under which conditions**, **with which tax mode**, **who may use it**, **how long valid**.

## Audience

`public_direct | walk_in | agency_specific | corporate | contracted_partner | internal_cost | network_only`

## Basis

`per_room | per_room_night | per_person | per_meal | per_group | per_vehicle | per_km | per_transfer | per_slot | per_day`

## Eligibility (examples)

Min/max pax, occupancy, lead time, travel period, day of week, meal plan, relationship id.

## Tax mode

`inclusive | exclusive | exempt | compound | location_dependent`

## Deterministic price result

```ts
PricedResult {
  currency: string
  unitAmount: number
  quantity: number
  subtotal: number
  taxAmount: number
  total: number
  basis: string
  audience: string
  rateSourceId?: string
  explanation: string[]
}
```

Verticals call a shared pricing helper; they do not invent incompatible totals. Live rates never rewrite confirmed snapshots.
