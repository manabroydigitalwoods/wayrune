# 07 — Cross-tenant data sharing

Each org owns its Party records. Transactions carry **ParticipantSnapshot**; partners may create local Party copies. No automatic global merge.

## ParticipantSnapshot

```text
sourcePartyId?, name, contact, ageCategory, dietaryNeeds,
documentRequirements, sharedFields, consentReference
```

## Field-level fulfilment payloads

Share only what fulfilment needs.

### STAY

Share: guest names, occupancy, arrival/departure, special requests, room product, confirmation refs.  
Do **not** share: package sell price, agency margin, other suppliers, CRM notes, full ID docs (unless consented).

### MEAL

Share: group name/headcount, dietary aggregates, ETA, package, on-site contacts.  
Do **not** share: agency margin, unrelated trip finance.

### TRANSFER / ACTIVITY

Share: pickup window, pax, luggage/notes, contact for service day only.

## Conversation visibility

`internal | buyer_seller | customer` — never mix internal notes into partner-visible threads without explicit visibility.
