# Permission policy matrix (RBAC Integrity 1.0 — P0 audit)

This file records the audit of every multi-argument `@RequirePermissions(...)`
guard in `apps/api/src/modules/**/*.controller.ts`, classifying each as **ANY**
(true alternatives — OR) or **ALL** (combined authority — AND).

Guard forms available (see `apps/api/src/common/helpers.ts`):

| Decorator | Semantics | Metadata key |
| --- | --- | --- |
| `@RequirePermissions(...perms)` | **ANY** — caller needs any one | `permissions` |
| `@RequireAllPermissions(...perms)` | **ALL** — caller needs every one | `allPermissions` |
| `@RequirePermissionPolicy({ anyOf, allOf })` | `(anyOf?hasAny:true) && (allOf?hasAll:true)` | `permissionPolicy` |

All three are typed to `PermissionKey` (from `@wayrune/rbac`), so a phantom or
misspelled permission fails the build. The guard (`auth.guard.ts`) evaluates all
three keys via the shared `hasAnyPermission`/`hasAllPermissions` helpers.

## Audit result

**Every multi-arg guard in the codebase is a set of true alternatives (ANY).**
The permission model is intentionally coarse today: a route lists the different
roles that may perform the action (e.g. an agency network user *or* a partner ops
user), never two permissions that must be held *together*. Accordingly, **no P0
route was converted to ALL/policy** — doing so would remove access from roles that
legitimately hold only one of the listed permissions (a behavior regression),
which P0 explicitly avoids.

The typed decorators + CI integrity suite now make combined-authority routes
*possible and safe* to add in P1 (granular finance/reservation/approval
permissions), where requester≠approver separation becomes meaningful.

### Representative alternatives (ANY) — unchanged

| Action (example route) | Required (any of) | Why ANY |
| --- | --- | --- |
| Stay invoice / record payment (`stay` `issueInvoice`,`recordPayment`) | `network.write`, `ops.write`, `finance.payment.manage` | Partner front-desk/ops **or** finance staff may settle a folio |
| Guest-services guest-check (`guest-services` `guestCheck`) | `ops.write`, `reservations.create`, `finance.cost.read` | Any on-floor role that opens a check |
| Guest-services pay-intent/confirm | `ops.write`, `reservations.create`, `finance.payment.manage` | Ops or finance may take payment |
| Restaurant quote/charge/invoice/pay | `ops.write`, `finance.payment.manage` | Ops or finance |
| Inventory availability (`inventory` `availability`) | `ops.read`, `network.read`, `trip.read` | Partner ops, supplier, or agency itinerary builder |
| Commerce settlement create (`commerce` L593) | `finance.payment.manage`, `network.write` | Finance or network manager |
| Leads list/detail (`leads` L33/41/54) | `lead.read`, `lead.read.own` | Broad reader **or** own-scope reader (own is the narrower alternative) |
| AI itinerary draft (`ai` L17) | `itinerary.edit`, `trip.write`, `trip.read` | Any trip/itinerary contributor |

The full route list lives in the controllers; the CI integrity suite
(`apps/api/src/modules/auth/permission-integrity.spec.ts`) enforces going forward
that:

- no guard references a permission outside `PERMISSIONS` (the phantom-permission class of bug);
- no guard lists the **same** permission twice (exact duplicate);
- no policy lists a permission in both `anyOf` and `allOf` (contradiction).

## Phantom permissions removed in this pass

| Route | Was (phantom) | Now (real) |
| --- | --- | --- |
| stay `issueInvoice`, `recordPayment` | `finance.write` | `finance.payment.manage` |
| guest-services `payIntent`, `payConfirm` | `finance.write` | `finance.payment.manage` |
| guest-services `guestCheck` | `finance.read` | `finance.cost.read` |
| restaurant `quoteInquiry`, `addCharge`, `invoice`, `pay` | `finance.cost.write` | `finance.payment.manage` |
| inventory `availability` | `itinerary.read` | `trip.read` |

Under the old OR guard these phantom strings could never be granted, so each route
silently degraded to its co-listed real permission. They are now real keys and,
because the decorators are typed, can never silently reappear.
