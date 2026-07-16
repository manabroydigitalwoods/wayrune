import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import type { AccessClaims } from '@travel/auth';
import {
  canAccessRecord,
  type PermissionKey,
  type PermissionScope,
  type RecordScopeContext,
} from '@travel/rbac';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * ANY semantics (OR): the handler is allowed when the caller holds *any one* of
 * the listed permissions. Typed to {@link PermissionKey} so phantom/typo strings
 * (e.g. the old `finance.write`) fail the build instead of silently degrading.
 */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * ALL semantics (AND): the handler is allowed only when the caller holds *every*
 * listed permission. Use for combined-authority actions (e.g. an action that
 * needs both reservation *and* finance authority).
 */
export const ALL_PERMISSIONS_KEY = 'allPermissions';
export const RequireAllPermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(ALL_PERMISSIONS_KEY, permissions);

export type PermissionPolicy = {
  /** Caller must hold at least one of these (OR). */
  anyOf?: PermissionKey[];
  /** Caller must hold all of these (AND). */
  allOf?: PermissionKey[];
};

/**
 * Combined policy: evaluated as `(anyOf ? hasAny : true) && (allOf ? hasAll : true)`.
 * Lets a route require, e.g., `allOf: ['reservations.cancel']` plus
 * `anyOf: ['finance.payment.manage', 'ops.write']`.
 */
export const PERMISSION_POLICY_KEY = 'permissionPolicy';
export const RequirePermissionPolicy = (policy: PermissionPolicy) =>
  SetMetadata(PERMISSION_POLICY_KEY, policy);

/** Restrict handler/controller to travel_agency organizations */
export const AGENCY_ONLY_KEY = 'agencyOnly';
export const RequireAgencyOrg = () => SetMetadata(AGENCY_ONLY_KEY, true);

/** Restrict handler/controller to the Travel OS platform organization */
export const PLATFORM_ONLY_KEY = 'platformOnly';
export const RequirePlatformOrg = () => SetMetadata(PLATFORM_ONLY_KEY, true);

export type AuthUser = AccessClaims;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

/**
 * Property/branch scope filter (RBAC Integrity 1.0 / P1-3). Returns a Prisma
 * `where`-fragment that limits a list query to the membership's assigned
 * PartnerAsset(s). An empty scope (no assignments) means org-wide, so this
 * returns `{}` (no restriction) — property scoping only bites once explicit
 * assignments exist, keeping single-property partners and legacy tokens working.
 */
export function propertyScopeWhere(
  user: AuthUser,
  field = 'partnerAssetId',
): Record<string, unknown> {
  const scopes = user.propertyScopes ?? [];
  if (!scopes.length) return {};
  return { [field]: { in: scopes } };
}

/**
 * Assert record-level access for a scoped action. Services resolve the caller's
 * effective scope (via `effectiveScope` from `@travel/rbac`) and pass the record
 * context here; throws 403 when the caller may not act on the record.
 */
export function assertRecordAccess(
  scope: PermissionScope | undefined,
  ctx: RecordScopeContext,
): void {
  if (!canAccessRecord(scope, ctx)) {
    throw new ForbiddenException('You do not have access to this record');
  }
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export function computeMissingInquiryFields(data: {
  destinations?: unknown;
  startDate?: unknown;
  adults?: number;
  budgetAmount?: unknown;
  travelType?: unknown;
  domesticOrIntl?: string | null;
}) {
  const missing: string[] = [];
  if (!data.destinations || (Array.isArray(data.destinations) && data.destinations.length === 0)) {
    missing.push('destinations');
  }
  if (data.domesticOrIntl === 'international' && !data.startDate) {
    missing.push('startDate');
  }
  if (!data.adults) missing.push('adults');
  if (data.budgetAmount == null) missing.push('budgetAmount');
  if (!data.travelType) missing.push('travelType');
  return missing;
}

export function calcQuoteTotals(items: Array<{ quantity: number; unitCost: number; unitSell: number; taxPercent: number }>, discountTotal = 0) {
  let costTotal = 0;
  let sellSubtotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const lineCost = item.quantity * item.unitCost;
    const lineSell = item.quantity * item.unitSell;
    costTotal += lineCost;
    sellSubtotal += lineSell;
    taxTotal += (lineSell * item.taxPercent) / 100;
  }
  const sellTotal = sellSubtotal + taxTotal - discountTotal;
  const marginAmount = sellSubtotal - costTotal - discountTotal;
  const marginPercent = sellSubtotal === 0 ? 0 : (marginAmount / sellSubtotal) * 100;
  return {
    costTotal: round2(costTotal),
    sellTotal: round2(sellTotal),
    taxTotal: round2(taxTotal),
    discountTotal: round2(discountTotal),
    marginAmount: round2(marginAmount),
    marginPercent: round2(marginPercent),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human-readable currency (Indian grouping). Safe for HTML email/PDF. */
export function formatCurrency(
  amount: number | string | { toString(): string } | null | undefined,
  currency = 'INR',
): string {
  const n =
    amount == null
      ? null
      : typeof amount === 'object'
        ? Number(amount.toString())
        : typeof amount === 'string'
          ? Number(amount)
          : amount;
  if (n == null || Number.isNaN(Number(n))) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${currency} ${Number(n).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}`;
  }
}
