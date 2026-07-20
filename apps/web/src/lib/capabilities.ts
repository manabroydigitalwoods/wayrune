import type { PermissionKey } from '@wayrune/rbac';

/**
 * Central registry: UI capability -> permission(s) required to use it.
 *
 * Each value lists the permissions that satisfy the capability (OR semantics,
 * matching the backend guard `required.some(...)`). Use with `<Can anyOf={...}>`
 * or `usePermissions().hasAny(...)`.
 *
 * Every value MUST match the backend `@RequirePermissions(...)` on the endpoint
 * the control calls. Values are typed as `PermissionKey` (from the shared
 * browser-safe `@wayrune/rbac` core) so typos/drift fail the build, and a unit
 * test cross-checks against the backend permission list.
 */
export const CAP = {
  // --- Views / secondary panels ---
  dashboardOps: ['ops.read'],
  dashboardFinanceDocs: ['finance.cost.read'],
  leadTasks: ['task.read'],
  tripIncidents: ['ops.read', 'incident.manage'],
  careHistory: ['ops.read'],
  supplierContracts: ['ops.read'],

  // --- Agency actions ---
  leadWrite: ['lead.write'],
  leadAssign: ['lead.assign'],
  inquiryWrite: ['inquiry.write'],
  inquiryConvertTrip: ['inquiry.write', 'trip.write'],
  tripWrite: ['trip.write'],
  incidentWrite: ['incident.manage', 'ops.write'],
  itineraryEdit: ['itinerary.edit'],
  quoteWrite: ['quote.write'],
  quoteApprove: ['quote.approve'],
  /** Authorise allotment / capacity shortfall send-anyway on quote lines. */
  inventoryRiskApprove: ['inventory_risk.approve'],
  /** Authorise Keep-buy when rate chart drifted since match. */
  rateDriftApprove: ['rate_drift.approve'],
  /** Activate pending hotel rate tip (contracting dual-control). */
  ratesApprove: ['rates.approve'],
  /** Authorise below-cost / below-floor margin overrides on quote lines. */
  belowMarginApprove: ['below_margin.approve'],
  partyWrite: ['party.write'],
  networkWrite: ['network.write'],
  supplierWrite: ['trip.write', 'network.write'],
  supplierInventory: ['ops.write', 'network.write'],
  settlementCreate: ['finance.payment.manage', 'network.write'],
  refundExecute: ['finance.refund.execute', 'finance.payment.manage'],
  creditLimitOverride: ['finance.credit_limit.override'],
  ratesWrite: ['quote.write'],
  taskWrite: ['task.write'],
  userManage: ['user.manage'],
  orgSettingsWrite: ['org.settings.write'],
  orgProfileWrite: ['org.settings.write', 'profile.publish'],
  policyManage: ['policy.manage'],

  // --- Partner / ops actions ---
  reservationsCreate: ['reservations.create'],
  reservationsConfirm: ['reservations.confirm'],
  reservationsCancel: ['reservations.cancel'],
  inventoryManage: ['inventory.manage'],
  ratesManage: ['rates.manage'],
  opsWrite: ['ops.write'],
  profilePublish: ['profile.publish'],
  /** Stay/inventory writes: rooms, units, allotments, rates, day-close, fleet, calendar, offers. */
  partnerInventoryWrite: ['ops.write', 'network.write'],
  /** Create a reservation/booking/job (stay/restaurant/mobility/driver/experience/guest). */
  reservationCreate: ['reservations.create', 'ops.write'],
  /** Confirm a reservation. */
  reservationConfirm: ['reservations.confirm', 'ops.write'],
  /** Cancel a reservation / mark no-show. */
  reservationCancel: ['reservations.cancel', 'ops.write'],
  /** Folio charges, payments, invoices on partner reservations. */
  partnerFinanceWrite: ['finance.payment.manage', 'ops.write'],
  /** Meal package catalog writes. */
  mealPackageWrite: ['inventory.manage', 'rates.manage'],
  /** Mobility rate plans. */
  mobilityRatesWrite: ['ops.write', 'rates.manage'],
  /** Guest Companion staff writes (menu, locations, sessions, orders). */
  guestServicesWrite: ['ops.write', 'reservations.create'],
  /** Partner network profile + inbound booking confirmation. */
  networkProfileWrite: ['network.write'],
  /** Partner asset create/edit. */
  partnerAssetWrite: ['network.write', 'org.settings.write'],

  // --- Platform ---
  platformCatalogWrite: ['platform.catalog.write'],
} as const satisfies Record<string, readonly PermissionKey[]>;

export type CapabilityKey = keyof typeof CAP;

/**
 * ALL-of permissions (AND, not OR like `CAP`) for the unified Travel Request
 * entry point — must match `TravelRequestsController`'s
 * `@RequireAllPermissions('party.write','lead.write','inquiry.write')`.
 * Use with `hasAllPermissions`, not `<Can anyOf>`.
 */
export const TRAVEL_REQUEST_PERMISSIONS = [
  'party.write',
  'lead.write',
  'inquiry.write',
] as const satisfies readonly PermissionKey[];
