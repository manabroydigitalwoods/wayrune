/**
 * @wayrune/rbac — the single, browser-safe source of truth for the platform's
 * role/permission model.
 *
 * This package has ZERO Node dependencies (no `fs`/`path`) so it can be consumed
 * unchanged by the API, the worker, `packages/auth`, and the Vite web bundle.
 * `@wayrune/config` re-exports everything here for backwards compatibility.
 *
 * P1 (RBAC Integrity 1.0) upgrades this from a flat string list to a permission
 * *registry* with metadata (group/description/allowedOrgKinds/risk/scope), a
 * granular action taxonomy, a canonical implication map, and scope-aware
 * evaluation. Everything stays additive: broad legacy permissions imply the new
 * granular ones, so existing roles/guards keep working unchanged.
 */

/* ------------------------------------------------------------------ *
 * Organization kinds
 * ------------------------------------------------------------------ */

export const ORG_KINDS = [
  'travel_agency',
  'dmc',
  'hotel',
  'homestay',
  'farmstay',
  'car_rental',
  'driver',
  'restaurant',
  'other',
  'platform',
] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

// Reusable org-kind groupings for permission metadata.
const AGENCY: readonly OrgKind[] = ['travel_agency', 'dmc'];
const STAY: readonly OrgKind[] = ['hotel', 'homestay', 'farmstay'];
const FOOD: readonly OrgKind[] = ['restaurant'];
const MOBILITY: readonly OrgKind[] = ['car_rental', 'driver'];
const PARTNER: readonly OrgKind[] = [...STAY, ...FOOD, ...MOBILITY, 'other'];
const TENANT: readonly OrgKind[] = [...AGENCY, ...PARTNER];
const ALL: readonly OrgKind[] = [...TENANT, 'platform'];
const PLATFORM: readonly OrgKind[] = ['platform'];
/** Stay + food orgs that run the Guest Companion (QR/table ordering) surface. */
const HOSPITALITY: readonly OrgKind[] = [...STAY, ...FOOD];

/* ------------------------------------------------------------------ *
 * Permission registry
 * ------------------------------------------------------------------ */

export type PermissionRisk = 'low' | 'medium' | 'high' | 'critical';
export type PermissionScope = 'org' | 'property' | 'team' | 'assigned' | 'own' | 'record';

export interface PermissionDefinition {
  key: string;
  group: string;
  description: string;
  /** Deny-by-default: org kinds this permission is valid in. */
  allowedOrgKinds: readonly OrgKind[];
  risk: PermissionRisk;
  scope: PermissionScope;
  deprecated?: boolean;
  replacement?: string;
}

/** Literal-preserving definition builder (keeps the `key` union precise). */
function def<K extends string>(
  key: K,
  group: string,
  description: string,
  allowedOrgKinds: readonly OrgKind[],
  risk: PermissionRisk,
  scope: PermissionScope = 'org',
  extra?: { deprecated?: boolean; replacement?: string },
): PermissionDefinition & { key: K } {
  return { key, group, description, allowedOrgKinds, risk, scope, ...extra };
}

export const PERMISSION_DEFS = [
  // ── Organization / identity ──────────────────────────────────────
  def('org.settings.read', 'org', 'View organization settings', ALL, 'low'),
  def('org.settings.write', 'org', 'Edit organization settings', ALL, 'high'),
  def('user.manage', 'org', 'Manage members and roles', ALL, 'high'),

  // ── CRM: parties / clients ───────────────────────────────────────
  def('party.read', 'party', 'View clients/parties', TENANT, 'low'),
  def('party.write', 'party', 'Create/edit clients/parties', TENANT, 'medium'),

  // ── CRM: leads / inquiries (agency) ──────────────────────────────
  def('lead.read', 'lead', 'View all leads', AGENCY, 'low'),
  def('lead.read.own', 'lead', 'View own leads only', AGENCY, 'low', 'own'),
  def('lead.write', 'lead', 'Create/edit leads', AGENCY, 'medium'),
  def('lead.assign', 'lead', 'Assign lead ownership', AGENCY, 'medium'),
  def('inquiry.read', 'inquiry', 'View inquiries', AGENCY, 'low'),
  def('inquiry.write', 'inquiry', 'Create/edit inquiries', AGENCY, 'medium'),

  // ── CRM: trips / itineraries / quotes (agency) ───────────────────
  def('trip.read', 'trip', 'View trips', AGENCY, 'low'),
  def('trip.write', 'trip', 'Create/edit trips', AGENCY, 'medium'),
  def('itinerary.edit', 'trip', 'Edit itineraries', AGENCY, 'medium'),
  def('quote.read', 'quote', 'View quotations', AGENCY, 'low'),
  def('quote.write', 'quote', 'Create/edit quotations', AGENCY, 'medium'),
  def('quote.view_cost', 'quote', 'View quotation cost/margin', AGENCY, 'medium'),
  def('quote.approve', 'quote', 'Approve quotations', AGENCY, 'high'),
  def('traveller.passport.read', 'trip', 'View traveller passport/identity', AGENCY, 'high', 'record'),

  // ── Tasks / documents / audit ────────────────────────────────────
  def('task.read', 'task', 'View tasks', TENANT, 'low'),
  def('task.write', 'task', 'Create/edit tasks', TENANT, 'medium'),
  def('document.read', 'document', 'View documents', TENANT, 'low'),
  def('document.write', 'document', 'Upload/edit documents', TENANT, 'medium'),
  def('audit.read', 'audit', 'View audit log', ALL, 'low'),
  def('report.sales.read', 'report', 'View sales reports', AGENCY, 'low'),

  // ── Network / suppliers ──────────────────────────────────────────
  def('network.read', 'network', 'View network/suppliers', TENANT, 'low'),
  def('network.write', 'network', 'Manage network/suppliers', TENANT, 'medium'),

  // ── Operations / inventory / commerce foundation ─────────────────
  def('ops.read', 'ops', 'View operations', TENANT, 'low'),
  def('ops.write', 'ops', 'Perform operations', TENANT, 'medium'),
  def('inventory.read', 'inventory', 'View inventory', TENANT, 'low'),
  def('inventory.manage', 'inventory', 'Manage inventory', TENANT, 'medium'),
  def('rates.manage', 'rates', 'Manage rates', TENANT, 'medium'),
  def('reservations.create', 'reservation', 'Create reservations', TENANT, 'medium'),
  def('reservations.confirm', 'reservation', 'Confirm reservations', TENANT, 'medium'),
  def('reservations.cancel', 'reservation', 'Cancel reservations', TENANT, 'high'),
  def('finance.cost.read', 'finance', 'View costs', TENANT, 'medium'),
  def('finance.payment.manage', 'finance', 'Manage folio payments/invoices', TENANT, 'high'),
  def('operations.assign', 'ops', 'Assign operational tasks', TENANT, 'medium'),
  def('profile.publish', 'profile', 'Publish public profile', TENANT, 'medium'),
  def('policy.manage', 'policy', 'Manage policies', TENANT, 'high'),
  def('incident.manage', 'incident', 'Manage incidents', TENANT, 'medium'),

  // ── Travel OS platform catalog ───────────────────────────────────
  def('platform.catalog.read', 'platform', 'View platform catalog', PLATFORM, 'low'),
  def('platform.catalog.write', 'platform', 'Edit platform catalog', PLATFORM, 'high'),
  def('platform.catalog.moderate', 'platform', 'Moderate/curate catalog submissions', PLATFORM, 'high'),

  // ── P2 platform administration split (support / security / break-glass) ──
  def('platform.org.read', 'platform', 'View tenant organizations', PLATFORM, 'medium'),
  def('platform.user.read', 'platform', 'View platform users', PLATFORM, 'medium'),
  def('platform.health.read', 'platform', 'View platform/service health', PLATFORM, 'low'),
  def('platform.workflow_recovery.read', 'platform', 'View stuck workflows for recovery', PLATFORM, 'medium'),
  def('platform.support_session.create', 'platform', 'Start a scoped tenant support session', PLATFORM, 'high'),
  def('platform.security.read', 'platform', 'View platform security posture', PLATFORM, 'medium'),
  def('platform.membership.manage', 'platform', 'Manage tenant memberships (cross-org)', PLATFORM, 'critical'),
  def('platform.access.revoke', 'platform', 'Revoke tenant access/sessions', PLATFORM, 'critical'),
  def('platform.audit.export', 'platform', 'Export cross-tenant audit log', PLATFORM, 'high'),
  def('platform.super', 'platform', 'Break-glass unrestricted platform access', PLATFORM, 'critical'),

  // ── P1 granular finance taxonomy ─────────────────────────────────
  def('finance.margin.read', 'finance', 'View margin', TENANT, 'medium', 'record'),
  def('finance.settlement.read', 'finance', 'View settlements', TENANT, 'low'),
  def('finance.settlement.manage', 'finance', 'Manage settlements', TENANT, 'high'),
  def('finance.invoice.create', 'finance', 'Create invoices', TENANT, 'medium'),
  def('finance.invoice.issue', 'finance', 'Issue invoices', TENANT, 'high'),
  def('finance.credit_note.create', 'finance', 'Create credit notes', TENANT, 'high'),
  def('finance.payment.record', 'finance', 'Record payments', TENANT, 'medium'),
  def('finance.payment.allocate', 'finance', 'Allocate payments', TENANT, 'medium'),
  def('finance.payment.reverse', 'finance', 'Reverse payments', TENANT, 'high'),
  def('finance.refund.request', 'finance', 'Request refunds', TENANT, 'medium'),
  def('finance.refund.approve', 'finance', 'Approve refunds', TENANT, 'critical'),
  def('finance.refund.execute', 'finance', 'Execute refunds', TENANT, 'critical'),
  def('finance.write_off.request', 'finance', 'Request write-offs', TENANT, 'medium'),
  def('finance.write_off.approve', 'finance', 'Approve write-offs', TENANT, 'critical'),

  // ── P1 granular reservation taxonomy ─────────────────────────────
  def('reservation.modify', 'reservation', 'Modify a reservation', TENANT, 'medium'),
  def('reservation.assign_unit', 'reservation', 'Assign room/unit', STAY, 'medium', 'property'),
  def('reservation.check_in', 'reservation', 'Check guest in', STAY, 'medium', 'property'),
  def('reservation.check_out', 'reservation', 'Check guest out', STAY, 'medium', 'property'),
  def('reservation.force_checkout', 'reservation', 'Force checkout', STAY, 'high', 'property'),
  def('reservation.no_show', 'reservation', 'Mark no-show', TENANT, 'medium'),
  def('reservation.override_inventory', 'reservation', 'Override inventory limits', TENANT, 'high'),

  // ── P1 operations / incident taxonomy ────────────────────────────
  def('operations.override', 'ops', 'Override operational guardrails', TENANT, 'high'),
  def('incident.compensate', 'incident', 'Issue incident compensation', TENANT, 'high'),

  // ── P1 Guest Companion (QR / table ordering) ─────────────────────
  def('guest_location.read', 'guest', 'View guest locations/tables', HOSPITALITY, 'low', 'property'),
  def('guest_location.manage', 'guest', 'Manage guest locations/tables', HOSPITALITY, 'medium', 'property'),
  def('guest_qr.generate', 'guest', 'Generate guest QR codes', HOSPITALITY, 'medium', 'property'),
  def('guest_qr.rotate', 'guest', 'Rotate guest QR tokens', HOSPITALITY, 'high', 'property'),
  def('guest_qr.disable', 'guest', 'Disable guest QR codes', HOSPITALITY, 'high', 'property'),
  def('guest_session.read', 'guest', 'View guest sessions', HOSPITALITY, 'low', 'property'),
  def('guest_session.open', 'guest', 'Open guest sessions', HOSPITALITY, 'medium', 'property'),
  def('guest_session.close', 'guest', 'Close guest sessions', HOSPITALITY, 'medium', 'property'),
  def('guest_order.read', 'guest', 'View guest orders', HOSPITALITY, 'low', 'property'),
  def('guest_order.accept', 'guest', 'Accept guest orders', HOSPITALITY, 'medium', 'property'),
  def('guest_order.reject', 'guest', 'Reject guest orders', HOSPITALITY, 'medium', 'property'),
  def('guest_order.prepare', 'guest', 'Mark orders in prep', HOSPITALITY, 'low', 'property'),
  def('guest_order.ready', 'guest', 'Mark orders ready', HOSPITALITY, 'low', 'property'),
  def('guest_order.serve', 'guest', 'Serve guest orders', HOSPITALITY, 'low', 'property'),
  def('guest_order.cancel', 'guest', 'Cancel guest orders', HOSPITALITY, 'medium', 'property'),
  def('guest_request.read', 'guest', 'View guest requests', HOSPITALITY, 'low', 'property'),
  def('guest_request.assign', 'guest', 'Assign guest requests', HOSPITALITY, 'medium', 'property'),
  def('guest_request.complete', 'guest', 'Complete guest requests', HOSPITALITY, 'low', 'property'),
  def('guest_bill.read', 'guest', 'View guest bills', HOSPITALITY, 'low', 'property'),
  def('guest_bill.issue', 'guest', 'Issue guest bills', HOSPITALITY, 'medium', 'property'),
  def('guest_bill.adjust', 'guest', 'Adjust guest bills', HOSPITALITY, 'high', 'property'),

  // ── P1 Menu domain (restaurant + stay room service) ──────────────
  def('menu.read', 'menu', 'View menu', HOSPITALITY, 'low'),
  def('menu.write', 'menu', 'Edit menu', HOSPITALITY, 'medium'),
  def('menu.publish', 'menu', 'Publish menu', HOSPITALITY, 'high'),
  def('menu.availability.update', 'menu', 'Update menu availability', HOSPITALITY, 'low'),
  def('menu.category.manage', 'menu', 'Manage menu categories', HOSPITALITY, 'medium'),
  def('menu.modifier.manage', 'menu', 'Manage menu modifiers', HOSPITALITY, 'medium'),
  def('menu.special.manage', 'menu', 'Manage menu specials', HOSPITALITY, 'medium'),
  def('menu.combo.manage', 'menu', 'Manage menu combos', HOSPITALITY, 'medium'),

  // ── P1 high-risk data operations ─────────────────────────────────
  def('party.import', 'data', 'Import parties', TENANT, 'high'),
  def('party.export', 'data', 'Export parties', TENANT, 'high'),
  def('party.merge', 'data', 'Merge parties', TENANT, 'high'),
  def('party.archive', 'data', 'Archive parties', TENANT, 'medium'),
  def('party.delete', 'data', 'Delete parties', TENANT, 'critical'),
  def('lead.import', 'data', 'Import leads', AGENCY, 'high'),
  def('lead.export', 'data', 'Export leads', AGENCY, 'high'),
  def('lead.merge', 'data', 'Merge leads', AGENCY, 'high'),
  def('lead.archive', 'data', 'Archive leads', AGENCY, 'medium'),
  def('lead.delete', 'data', 'Delete leads', AGENCY, 'critical'),
  def('rate.import', 'data', 'Import rates', TENANT, 'medium'),
  def('rate.export', 'data', 'Export rates', TENANT, 'medium'),
  def('reservation.import', 'data', 'Import reservations', TENANT, 'medium'),
  def('reservation.export', 'data', 'Export reservations', TENANT, 'medium'),
  def('document.download', 'data', 'Download a document', TENANT, 'low'),
  def('document.bulk_download', 'data', 'Bulk-download documents', TENANT, 'high'),
  def('report.export', 'data', 'Export reports', AGENCY, 'medium'),
  def('audit.export', 'data', 'Export audit log', ALL, 'high'),
  def('bulk.update', 'data', 'Bulk update records', TENANT, 'high'),
  def('bulk.delete', 'data', 'Bulk delete records', TENANT, 'critical'),

  // ── P1 approval permissions (separation of duties) ───────────────
  def('discount.approve', 'approval', 'Approve discounts', AGENCY, 'high'),
  def('below_margin.approve', 'approval', 'Approve below-margin sale', AGENCY, 'high'),
  def('credit_note.approve', 'approval', 'Approve credit notes', TENANT, 'critical'),
  def('incident.compensation.approve', 'approval', 'Approve incident compensation', TENANT, 'high'),
  def('inventory.overbook.approve', 'approval', 'Approve overbooking', STAY, 'high'),
  def('force_checkout.approve', 'approval', 'Approve forced checkout', STAY, 'high'),
  def('cancellation.override.approve', 'approval', 'Approve cancellation override', TENANT, 'high'),
] as const;

export type PermissionKey = (typeof PERMISSION_DEFS)[number]['key'];

/** All permission keys (derived from the registry). */
export const PERMISSIONS = PERMISSION_DEFS.map((d) => d.key) as readonly PermissionKey[];

/** Fast membership test. */
export const PERMISSION_SET: ReadonlySet<PermissionKey> = new Set(PERMISSIONS);

export const PERMISSION_DEF_BY_KEY: Readonly<Record<PermissionKey, PermissionDefinition>> =
  Object.fromEntries(PERMISSION_DEFS.map((d) => [d.key, d])) as Record<PermissionKey, PermissionDefinition>;

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_SET as ReadonlySet<string>).has(value);
}

export function getPermissionDefinition(key: string): PermissionDefinition | undefined {
  return PERMISSION_DEF_BY_KEY[key as PermissionKey];
}

/** Deny-by-default: is this permission valid for the given org kind? */
export function permissionAllowedForOrgKind(key: string, orgKind: string): boolean {
  const d = getPermissionDefinition(key);
  if (!d) return false;
  return (d.allowedOrgKinds as readonly string[]).includes(orgKind);
}

/** Every permission valid for an org kind (used for the deny-by-default clamp). */
export function permissionsForOrgKind(orgKind: string): PermissionKey[] {
  return PERMISSION_DEFS.filter((d) => (d.allowedOrgKinds as readonly string[]).includes(orgKind)).map(
    (d) => d.key,
  );
}

/* ------------------------------------------------------------------ *
 * Implication map + scope-aware evaluation
 * ------------------------------------------------------------------ */

/**
 * Canonical permission implication map: a held (broader) permission grants the
 * listed (narrower) permissions. This is the ONE place implications live so the
 * API guard and web UI can never drift.
 *
 * Note: destructive/approval permissions are intentionally NOT implied by their
 * broad `*.manage`/`*.write` counterparts (separation of duties) — they are only
 * granted explicitly (e.g. via the `owner`/`admin` superset).
 */
const IMPLIES_RAW: Array<[PermissionKey, PermissionKey[]]> = [
  ['lead.read', ['lead.read.own']],
  ['quote.view_cost', ['finance.margin.read']],
  ['finance.cost.read', ['finance.settlement.read']],
  [
    'finance.payment.manage',
    [
      'finance.invoice.create',
      'finance.invoice.issue',
      'finance.credit_note.create',
      'finance.payment.record',
      'finance.payment.allocate',
      'finance.payment.reverse',
      'finance.refund.request',
      'finance.write_off.request',
      'finance.settlement.manage',
    ],
  ],
  ['reservations.create', ['reservation.modify', 'reservation.assign_unit']],
  ['reservations.confirm', ['reservation.check_in', 'reservation.check_out']],
  ['reservations.cancel', ['reservation.no_show']],
  ['incident.manage', ['incident.compensate']],
  ['document.read', ['document.download']],
  ['report.sales.read', ['report.export']],
  [
    'ops.write',
    [
      'guest_location.manage',
      'guest_qr.generate',
      'guest_session.open',
      'guest_session.close',
      'guest_order.accept',
      'guest_order.reject',
      'guest_order.prepare',
      'guest_order.ready',
      'guest_order.serve',
      'guest_order.cancel',
      'guest_request.assign',
      'guest_request.complete',
      'guest_bill.issue',
    ],
  ],
  [
    'ops.read',
    [
      'guest_location.read',
      'guest_session.read',
      'guest_order.read',
      'guest_request.read',
      'guest_bill.read',
    ],
  ],
  ['inventory.manage', ['menu.write', 'menu.availability.update', 'menu.category.manage', 'menu.modifier.manage', 'menu.special.manage', 'menu.combo.manage']],
  ['inventory.read', ['menu.read']],
];

export const PERMISSION_IMPLIES: Readonly<Partial<Record<PermissionKey, readonly PermissionKey[]>>> =
  Object.fromEntries(IMPLIES_RAW);

/** Scope suffixes, broadest → narrowest. A broader grant satisfies a narrower request. */
const SCOPE_RANK: Record<string, number> = { all: 0, property: 1, team: 1, assigned: 2, own: 3 };

function splitScope(perm: string): { base: string; scope?: string } {
  const idx = perm.lastIndexOf('.');
  if (idx === -1) return { base: perm };
  const last = perm.slice(idx + 1);
  if (last in SCOPE_RANK) return { base: perm.slice(0, idx), scope: last };
  return { base: perm };
}

/** Expand a permission into itself + everything it implies (transitively). */
function expandImplications(perm: string, acc: Set<string>): void {
  if (acc.has(perm)) return;
  acc.add(perm);
  const implied = (PERMISSION_IMPLIES as Record<string, readonly string[]>)[perm];
  if (implied) {
    for (const next of implied) expandImplications(next, acc);
  }
}

/**
 * True when `permissions` satisfies `required`, honouring implications and the
 * scope hierarchy (`all` > `team`/`property` > `assigned` > `own`; an unscoped
 * grant satisfies any scope). `permissions` are raw claim strings.
 */
export function hasPermission(permissions: readonly string[], required: string): boolean {
  // Effective set = everything held, plus everything those imply.
  const effective = new Set<string>();
  for (const held of permissions) expandImplications(held, effective);

  if (effective.has(required)) return true;

  const { base, scope } = splitScope(required);
  if (scope === undefined) return false;

  // Unscoped broad grant satisfies any scoped request.
  if (effective.has(base)) return true;

  // A broader-or-equal scope grant satisfies a narrower scoped request.
  const need = SCOPE_RANK[scope];
  for (const held of effective) {
    const h = splitScope(held);
    if (h.base === base && h.scope !== undefined && SCOPE_RANK[h.scope] <= need) return true;
  }
  return false;
}

/** OR semantics: satisfied when the user has any one of `required`. */
export function hasAnyPermission(permissions: readonly string[], required: readonly string[]): boolean {
  return required.some((r) => hasPermission(permissions, r));
}

/** AND semantics: satisfied only when the user has every one of `required`. */
export function hasAllPermissions(permissions: readonly string[], required: readonly string[]): boolean {
  return required.every((r) => hasPermission(permissions, r));
}

/* ------------------------------------------------------------------ *
 * Record / property scope evaluation (P1-3)
 * ------------------------------------------------------------------ */

export type RecordScopeContext = {
  /** The acting user's id (claim `sub`). */
  userId: string;
  /** Property/asset ids the user is scoped to (claim `propertyScopes`). */
  propertyScopes?: readonly string[];
  /** The record's owner user id, if any. */
  ownerId?: string | null;
  /** The record's property/asset id, if any. */
  propertyId?: string | null;
  /** User ids assigned to the record, if any. */
  assignedUserIds?: readonly string[];
  /** Team member user ids (for `team` scope), if any. */
  teamUserIds?: readonly string[];
};

/**
 * Given the *effective scope* a user holds for an action (the narrowest scope
 * suffix they satisfy, or undefined for org-wide), decide whether they may act
 * on a specific record. Services resolve the effective scope with
 * {@link effectiveScope} and pass record context here.
 */
export function canAccessRecord(scope: PermissionScope | undefined, ctx: RecordScopeContext): boolean {
  switch (scope) {
    case undefined:
    case 'org':
    case 'record':
      return true;
    case 'own':
      return !!ctx.ownerId && ctx.ownerId === ctx.userId;
    case 'assigned':
      return (ctx.assignedUserIds ?? []).includes(ctx.userId) || ctx.ownerId === ctx.userId;
    case 'team':
      return (ctx.teamUserIds ?? []).includes(ctx.userId) || ctx.ownerId === ctx.userId;
    case 'property':
      return !!ctx.propertyId && (ctx.propertyScopes ?? []).includes(ctx.propertyId);
    default:
      return false;
  }
}

/**
 * The narrowest scope a user effectively holds for a base action, or `undefined`
 * when they hold it org-wide (unscoped or `.all`). Returns `null` when they do
 * not hold the action at all.
 */
export function effectiveScope(
  permissions: readonly string[],
  base: string,
): PermissionScope | undefined | null {
  const effective = new Set<string>();
  for (const held of permissions) expandImplications(held, effective);
  if (effective.has(base)) return undefined; // org-wide
  let best: { scope: PermissionScope; rank: number } | null = null;
  for (const held of effective) {
    const h = splitScope(held);
    if (h.base !== base || h.scope === undefined) continue;
    if (h.scope === 'all') return undefined; // org-wide
    const rank = SCOPE_RANK[h.scope];
    if (!best || rank < best.rank) best = { scope: h.scope as PermissionScope, rank };
  }
  return best ? best.scope : null;
}

/* ------------------------------------------------------------------ *
 * Field-level redaction (P1-5)
 * ------------------------------------------------------------------ */

export interface Ability {
  /** OR-of-one: satisfied when the caller holds `required`. */
  can(required: string): boolean;
  /** OR semantics. */
  canAny(required: readonly string[]): boolean;
  /** AND semantics. */
  canAll(required: readonly string[]): boolean;
}

/** Bind the permission helpers to a fixed permission set. */
export function buildAbility(permissions: readonly string[]): Ability {
  return {
    can: (r) => hasPermission(permissions, r),
    canAny: (r) => hasAnyPermission(permissions, r),
    canAll: (r) => hasAllPermissions(permissions, r),
  };
}

/**
 * A map of sensitive field -> permission(s) required to view it. When the value
 * is an array it uses OR semantics (any grants visibility).
 */
export type RedactionRules<T> = Partial<Record<keyof T, string | readonly string[]>>;

/**
 * Return a shallow copy of `obj` with fields the caller cannot see removed
 * (deleted, not nulled, so they never serialize). This is the single place
 * field-level authorization lives so the API can redact instead of relying on
 * the UI hiding columns.
 */
export function redactFields<T extends Record<string, unknown>>(
  obj: T,
  ability: Ability,
  rules: RedactionRules<T>,
): Partial<T> {
  const out: Record<string, unknown> = { ...obj };
  for (const field of Object.keys(rules) as Array<keyof T>) {
    const required = rules[field];
    if (required === undefined) continue;
    const ok = Array.isArray(required)
      ? ability.canAny(required)
      : ability.can(required as string);
    if (!ok) delete out[field as string];
  }
  return out as Partial<T>;
}

/* ------------------------------------------------------------------ *
 * Administration maturity helpers (P2)
 *  - custom-role guardrails (no privilege escalation, org-kind clamp)
 *  - effective-permission expansion + permission diffing (audit / preview)
 * ------------------------------------------------------------------ */

const isRealKey = (k: string): k is PermissionKey =>
  (PERMISSION_SET as ReadonlySet<string>).has(k);

/** Platform-only permission keys (valid solely in a `platform` org). */
export const PLATFORM_PERMISSIONS: readonly PermissionKey[] = PERMISSIONS.filter((p) =>
  p.startsWith('platform.'),
);
const PLATFORM_PERMISSION_SET: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS);

export function isPlatformPermission(key: string): boolean {
  return PLATFORM_PERMISSION_SET.has(key);
}

/**
 * Expand held permissions into the full *effective* set: every key held plus
 * everything it implies (transitively), filtered to real keys and sorted for
 * stable output. Powers the "test this role"/effective-access viewer.
 */
export function effectivePermissions(permissions: readonly string[]): PermissionKey[] {
  const acc = new Set<string>();
  for (const p of permissions) expandImplications(p, acc);
  return [...acc].filter(isRealKey).sort();
}

export type PermissionDiff = {
  added: PermissionKey[];
  removed: PermissionKey[];
  unchanged: PermissionKey[];
};

/** Compare two permission lists (raw keys, not expanded) for audit/preview. */
export function diffPermissions(
  before: readonly string[],
  after: readonly string[],
): PermissionDiff {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: [...a].filter((k) => !b.has(k)).filter(isRealKey).sort(),
    removed: [...b].filter((k) => !a.has(k)).filter(isRealKey).sort(),
    unchanged: [...a].filter((k) => b.has(k)).filter(isRealKey).sort(),
  };
}

/**
 * The permissions an actor may grant when creating/editing a custom role in an
 * org of `orgKind`. Two guardrails compose here:
 *   1. deny-by-default org-kind validity ({@link permissionsForOrgKind}), which
 *      naturally excludes platform.* perms from tenant orgs; and
 *   2. no privilege escalation — the actor can only grant what they effectively
 *      hold (implications honoured).
 */
export function assignablePermissions(
  actorPermissions: readonly string[],
  orgKind: string,
): PermissionKey[] {
  const actorEffective = new Set<string>(effectivePermissions(actorPermissions));
  return permissionsForOrgKind(orgKind).filter((k) => actorEffective.has(k));
}

/** Single-permission guardrail form of {@link assignablePermissions}. */
export function canGrantPermission(
  actorPermissions: readonly string[],
  orgKind: string,
  permission: string,
): boolean {
  if (!permissionAllowedForOrgKind(permission, orgKind)) return false;
  return hasPermission(actorPermissions, permission);
}

/** Group permission definitions by their `group`, optionally clamped to an org kind. */
export function permissionGroups(orgKind?: string): Record<string, PermissionDefinition[]> {
  const defs = orgKind
    ? PERMISSION_DEFS.filter((d) => (d.allowedOrgKinds as readonly string[]).includes(orgKind))
    : (PERMISSION_DEFS as readonly PermissionDefinition[]);
  const out: Record<string, PermissionDefinition[]> = {};
  for (const d of defs) (out[d.group] ??= []).push(d);
  return out;
}

/* ------------------------------------------------------------------ *
 * Role keys + availability by org kind
 * ------------------------------------------------------------------ */

export const AGENCY_ROLE_KEYS = [
  'owner',
  'admin',
  'sales_manager',
  'sales_executive',
  'travel_consultant',
  'finance',
  'operations',
  'auditor',
] as const;

export const PARTNER_ROLE_KEYS = [
  'owner',
  'admin',
  'front_desk',
  'housekeeping',
  'housekeeping_supervisor',
  'maintenance',
  'front_office_manager',
  'night_auditor',
  'property_manager',
  'reservation_manager',
  'accountant',
  'restaurant_manager',
  'host',
  'waiter',
  'kitchen_staff',
  'cashier',
  'menu_manager',
  'fleet_manager',
  'rental_agent',
  'driver_operator',
  'experience_manager',
  'experience_guide',
] as const;

export const PLATFORM_ROLE_KEYS = [
  'platform_admin',
  'platform_catalog_admin',
  'platform_support_admin',
  'platform_security_admin',
  'platform_super_admin',
] as const;

export type AgencyRoleKey = (typeof AGENCY_ROLE_KEYS)[number];
export type PartnerRoleKey = (typeof PARTNER_ROLE_KEYS)[number];
export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];
export type RoleKey = AgencyRoleKey | PartnerRoleKey | PlatformRoleKey;

/**
 * Which org kinds each role is available in (deny-by-default). Roles absent from
 * this map are treated as available in every org kind of their family.
 */
export const ROLE_ALLOWED_ORG_KINDS: Readonly<Record<string, readonly OrgKind[]>> = {
  // Stay operations roles
  front_desk: STAY,
  housekeeping: STAY,
  housekeeping_supervisor: STAY,
  maintenance: STAY,
  front_office_manager: STAY,
  night_auditor: STAY,
  property_manager: STAY,
  reservation_manager: [...STAY, ...FOOD],
  // Food service roles
  restaurant_manager: FOOD,
  host: FOOD,
  waiter: FOOD,
  kitchen_staff: [...FOOD, ...STAY],
  cashier: [...FOOD, ...STAY],
  menu_manager: [...FOOD, ...STAY],
  // Mobility roles
  fleet_manager: MOBILITY,
  rental_agent: ['car_rental'],
  driver_operator: MOBILITY,
  // Experience roles
  experience_manager: ['other'],
  experience_guide: ['other'],
  // Shared roles (owner/admin exist in every org; accountant is partner-only).
  accountant: PARTNER,
  owner: ALL,
  admin: ALL,
  // Platform administration roles (platform org only).
  platform_admin: PLATFORM,
  platform_catalog_admin: PLATFORM,
  platform_support_admin: PLATFORM,
  platform_security_admin: PLATFORM,
  platform_super_admin: PLATFORM,
};

/** Whether a role key may be assigned within an org of the given kind. */
export function roleAllowedForOrgKind(roleKey: string, orgKind: string): boolean {
  const allowed = ROLE_ALLOWED_ORG_KINDS[roleKey];
  if (!allowed) return true;
  return (allowed as readonly string[]).includes(orgKind);
}

/* ------------------------------------------------------------------ *
 * Role → permission maps
 * ------------------------------------------------------------------ */

const nonPlatform = PERMISSIONS.filter((p) => !p.startsWith('platform.'));

/** Agency / partner roles (never includes platform.*). */
export const ROLE_PERMISSION_MAP: Record<string, PermissionKey[]> = {
  owner: [...nonPlatform],
  admin: [...nonPlatform],
  sales_manager: [
    'party.read',
    'party.write',
    'lead.read',
    'lead.write',
    'lead.assign',
    'inquiry.read',
    'inquiry.write',
    'trip.read',
    'trip.write',
    'itinerary.edit',
    'quote.read',
    'quote.write',
    'quote.view_cost',
    'quote.approve',
    'discount.approve',
    'below_margin.approve',
    'traveller.passport.read',
    'task.read',
    'task.write',
    'document.read',
    'document.write',
    'report.sales.read',
    'network.read',
    'network.write',
  ],
  sales_executive: [
    'party.read',
    'party.write',
    'lead.read.own',
    'lead.write',
    'inquiry.read',
    'inquiry.write',
    'trip.read',
    'trip.write',
    'itinerary.edit',
    'quote.read',
    'quote.write',
    'task.read',
    'task.write',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
  ],
  travel_consultant: [
    'party.read',
    'inquiry.read',
    'inquiry.write',
    'trip.read',
    'trip.write',
    'itinerary.edit',
    'quote.read',
    'quote.write',
    'quote.view_cost',
    'traveller.passport.read',
    'task.read',
    'task.write',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
  ],
  finance: [
    'party.read',
    'trip.read',
    'quote.read',
    'quote.view_cost',
    'document.read',
    'audit.read',
    'network.read',
    'finance.cost.read',
    'finance.margin.read',
    'finance.payment.manage',
    'finance.settlement.read',
    'finance.settlement.manage',
    'ops.read',
  ],
  operations: [
    'party.read',
    'trip.read',
    'trip.write',
    'task.read',
    'task.write',
    'document.read',
    'document.write',
    'ops.read',
    'ops.write',
    'operations.assign',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'incident.manage',
    'network.read',
    'network.write',
  ],
  auditor: [
    'party.read',
    'lead.read',
    'inquiry.read',
    'trip.read',
    'quote.read',
    'audit.read',
    'network.read',
    'finance.cost.read',
    'finance.settlement.read',
  ],
};

/**
 * Roles only for the Travel OS platform organization.
 *
 * P2 splits the monolithic `platform_admin` into least-privilege duties:
 *  - catalog admin: curate the shared catalog only;
 *  - support admin: read-only tenant/health visibility + scoped support sessions;
 *  - security admin: membership/access control + audit export;
 *  - super admin: break-glass, unrestricted (not a daily-use role).
 * `platform_admin` is retained (back-compat) as a broad catalog+settings admin.
 */
const PLATFORM_CATALOG_PERMS: PermissionKey[] = [
  'platform.catalog.read',
  'platform.catalog.write',
  'platform.catalog.moderate',
  'audit.read',
];
const PLATFORM_SUPPORT_PERMS: PermissionKey[] = [
  'platform.org.read',
  'platform.user.read',
  'platform.health.read',
  'platform.workflow_recovery.read',
  'platform.support_session.create',
  'audit.read',
];
const PLATFORM_SECURITY_PERMS: PermissionKey[] = [
  'platform.security.read',
  'platform.membership.manage',
  'platform.access.revoke',
  'platform.audit.export',
  'platform.org.read',
  'platform.user.read',
  'audit.read',
];

export const PLATFORM_ROLE_PERMISSION_MAP: Record<string, PermissionKey[]> = {
  platform_admin: [
    'platform.catalog.read',
    'platform.catalog.write',
    'org.settings.read',
    'org.settings.write',
    'user.manage',
    'audit.read',
  ],
  platform_catalog_admin: [...PLATFORM_CATALOG_PERMS],
  platform_support_admin: [...PLATFORM_SUPPORT_PERMS],
  platform_security_admin: [...PLATFORM_SECURITY_PERMS],
  // Break-glass: every platform capability plus org/user admin + audit export.
  platform_super_admin: [
    ...new Set<PermissionKey>([
      ...PLATFORM_CATALOG_PERMS,
      ...PLATFORM_SUPPORT_PERMS,
      ...PLATFORM_SECURITY_PERMS,
      'platform.super',
      'org.settings.read',
      'org.settings.write',
      'user.manage',
      'audit.read',
      'audit.export',
    ]),
  ],
};

// Reusable partner permission bundles.
const STAY_FRONT_DESK: PermissionKey[] = [
  'ops.read',
  'ops.write',
  'reservations.create',
  'reservations.confirm',
  'reservations.cancel',
  'reservation.modify',
  'reservation.assign_unit',
  'reservation.check_in',
  'reservation.check_out',
  'reservation.no_show',
  'inventory.read',
  'party.read',
  'party.write',
  'document.read',
  'document.write',
  'task.read',
  'task.write',
  'network.read',
  'incident.manage',
  'guest_session.read',
  'guest_request.read',
  'guest_request.complete',
];

/** Partner org roles — no agency CRM keys (leads/trips/quotes). */
export const PARTNER_ROLE_PERMISSION_MAP: Record<string, PermissionKey[]> = {
  owner: [
    'org.settings.read',
    'org.settings.write',
    'user.manage',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
    'party.read',
    'party.write',
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'reservation.assign_unit',
    'reservation.check_in',
    'reservation.check_out',
    'reservation.force_checkout',
    'reservation.no_show',
    'reservation.override_inventory',
    'finance.cost.read',
    'finance.margin.read',
    'finance.payment.manage',
    'finance.settlement.read',
    'finance.settlement.manage',
    'finance.refund.approve',
    'finance.credit_note.create',
    'credit_note.approve',
    'operations.assign',
    'operations.override',
    'profile.publish',
    'policy.manage',
    'incident.manage',
    'incident.compensate',
    'incident.compensation.approve',
    'inventory.overbook.approve',
    'force_checkout.approve',
    'cancellation.override.approve',
    'task.read',
    'task.write',
    'menu.read',
    'menu.write',
    'menu.publish',
    'menu.availability.update',
    'menu.category.manage',
    'menu.modifier.manage',
    'menu.special.manage',
    'menu.combo.manage',
    'guest_location.read',
    'guest_location.manage',
    'guest_qr.generate',
    'guest_qr.rotate',
    'guest_qr.disable',
    'guest_session.read',
    'guest_session.open',
    'guest_session.close',
    'guest_order.read',
    'guest_order.accept',
    'guest_order.reject',
    'guest_order.prepare',
    'guest_order.ready',
    'guest_order.serve',
    'guest_order.cancel',
    'guest_request.read',
    'guest_request.assign',
    'guest_request.complete',
    'guest_bill.read',
    'guest_bill.issue',
    'guest_bill.adjust',
  ],
  admin: [
    'org.settings.read',
    'org.settings.write',
    'user.manage',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
    'party.read',
    'party.write',
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'reservation.assign_unit',
    'reservation.check_in',
    'reservation.check_out',
    'reservation.no_show',
    'finance.cost.read',
    'finance.margin.read',
    'finance.payment.manage',
    'finance.settlement.read',
    'finance.settlement.manage',
    'profile.publish',
    'policy.manage',
    'incident.manage',
    'incident.compensate',
    'task.read',
    'task.write',
    'menu.read',
    'menu.write',
    'menu.publish',
    'menu.availability.update',
    'menu.category.manage',
    'menu.modifier.manage',
    'menu.special.manage',
    'menu.combo.manage',
    'guest_location.read',
    'guest_location.manage',
    'guest_qr.generate',
    'guest_qr.rotate',
    'guest_qr.disable',
    'guest_session.read',
    'guest_session.open',
    'guest_session.close',
    'guest_order.read',
    'guest_order.accept',
    'guest_order.reject',
    'guest_order.prepare',
    'guest_order.ready',
    'guest_order.serve',
    'guest_order.cancel',
    'guest_request.read',
    'guest_request.assign',
    'guest_request.complete',
    'guest_bill.read',
    'guest_bill.issue',
    'guest_bill.adjust',
  ],
  front_desk: STAY_FRONT_DESK,
  housekeeping: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'operations.assign',
    'task.read',
    'task.write',
  ],
  housekeeping_supervisor: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'operations.assign',
    'operations.override',
    'task.read',
    'task.write',
    'incident.manage',
  ],
  maintenance: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'task.read',
    'task.write',
  ],
  front_office_manager: [
    ...STAY_FRONT_DESK,
    'reservation.force_checkout',
    'reservation.override_inventory',
    'operations.override',
    'inventory.manage',
    'rates.manage',
    'force_checkout.approve',
    'cancellation.override.approve',
    'inventory.overbook.approve',
    'finance.cost.read',
    'finance.payment.manage',
  ],
  night_auditor: [
    'ops.read',
    'ops.write',
    'reservations.confirm',
    'reservation.check_in',
    'reservation.check_out',
    'finance.cost.read',
    'finance.settlement.read',
    'finance.settlement.manage',
    'document.read',
    'audit.read',
  ],
  property_manager: [
    'org.settings.read',
    'ops.read',
    'ops.write',
    'operations.assign',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'reservation.assign_unit',
    'reservation.check_in',
    'reservation.check_out',
    'reservation.force_checkout',
    'party.read',
    'party.write',
    'finance.cost.read',
    'finance.payment.manage',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
    'incident.manage',
    'incident.compensate',
    'profile.publish',
    'task.read',
    'task.write',
  ],
  reservation_manager: [
    'ops.read',
    'ops.write',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'reservation.assign_unit',
    'reservation.no_show',
    'reservation.override_inventory',
    'rates.manage',
    'inventory.read',
    'inventory.manage',
    'party.read',
    'party.write',
    'finance.payment.manage',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
    'incident.manage',
  ],
  accountant: [
    'finance.cost.read',
    'finance.margin.read',
    'finance.payment.manage',
    'finance.settlement.read',
    'finance.settlement.manage',
    'finance.invoice.create',
    'finance.invoice.issue',
    'finance.credit_note.create',
    'document.read',
    'document.write',
    'ops.read',
    'audit.read',
  ],
  restaurant_manager: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'party.read',
    'party.write',
    'finance.cost.read',
    'finance.payment.manage',
    'incident.manage',
    'task.read',
    'task.write',
    'document.read',
    'menu.read',
    'menu.write',
    'menu.publish',
    'menu.availability.update',
    'menu.category.manage',
    'menu.modifier.manage',
    'menu.special.manage',
    'menu.combo.manage',
    'guest_location.read',
    'guest_location.manage',
    'guest_qr.generate',
    'guest_qr.rotate',
    'guest_qr.disable',
    'guest_session.read',
    'guest_session.open',
    'guest_session.close',
    'guest_order.read',
    'guest_order.accept',
    'guest_order.reject',
    'guest_order.cancel',
    'guest_request.read',
    'guest_request.assign',
    'guest_request.complete',
    'guest_bill.read',
    'guest_bill.issue',
    'guest_bill.adjust',
  ],
  host: [
    'ops.read',
    'reservations.create',
    'reservation.modify',
    'party.read',
    'guest_location.read',
    'guest_location.manage',
    'guest_session.read',
    'guest_session.open',
    'guest_session.close',
    'guest_request.read',
  ],
  waiter: [
    'ops.read',
    'guest_location.read',
    'guest_session.read',
    'guest_order.read',
    'guest_order.serve',
    'guest_request.read',
    'guest_request.complete',
    'guest_bill.read',
  ],
  kitchen_staff: [
    'ops.read',
    'guest_order.read',
    'guest_order.accept',
    'guest_order.prepare',
    'guest_order.ready',
    'menu.read',
    'menu.availability.update',
  ],
  cashier: [
    'ops.read',
    'finance.cost.read',
    'finance.payment.manage',
    'finance.payment.record',
    'guest_bill.read',
    'guest_bill.issue',
    'guest_session.read',
    'guest_session.close',
  ],
  menu_manager: [
    'ops.read',
    'inventory.read',
    'menu.read',
    'menu.write',
    'menu.publish',
    'menu.availability.update',
    'menu.category.manage',
    'menu.modifier.manage',
    'menu.special.manage',
    'menu.combo.manage',
  ],
  fleet_manager: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'party.read',
    'party.write',
    'finance.cost.read',
    'finance.payment.manage',
    'operations.assign',
    'incident.manage',
    'document.read',
    'document.write',
    'network.read',
    'task.read',
    'task.write',
  ],
  rental_agent: [
    'ops.read',
    'ops.write',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'reservation.modify',
    'inventory.read',
    'party.read',
    'party.write',
    'finance.cost.read',
    'finance.payment.manage',
    'document.read',
    'task.read',
  ],
  driver_operator: [
    'ops.read',
    'ops.write',
    'reservations.confirm',
    'reservation.modify',
    'task.read',
    'task.write',
  ],
  experience_manager: [
    'ops.read',
    'ops.write',
    'inventory.read',
    'inventory.manage',
    'rates.manage',
    'reservations.create',
    'reservations.confirm',
    'reservations.cancel',
    'party.read',
    'party.write',
    'finance.cost.read',
    'finance.payment.manage',
    'operations.assign',
    'incident.manage',
    'profile.publish',
    'document.read',
    'document.write',
    'network.read',
    'network.write',
    'task.read',
    'task.write',
  ],
  experience_guide: [
    'ops.read',
    'ops.write',
    'reservations.confirm',
    'operations.assign',
    'task.read',
    'task.write',
  ],
};

/** Permissions a partner-organization token is ever allowed to carry. */
export const PARTNER_ALLOWED_PERMISSIONS = new Set<PermissionKey>(
  Object.values(PARTNER_ROLE_PERMISSION_MAP).flat(),
);
