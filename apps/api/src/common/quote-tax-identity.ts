/** Write-once tax identity freeze on QuotationVersion (FX-lock style). */

import type { OrgTaxIdentity } from './org-tax-identity';

export type QuoteTaxIdentityLock = OrgTaxIdentity & {
  lockedAt: string;
  lockSource: 'send' | 'pdf';
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/** Parse stamped tax identity; invalid / incomplete → null (use live resolve). */
export function parseQuoteTaxIdentity(value: unknown): QuoteTaxIdentityLock | null {
  const root = asRecord(value);
  const taxLabel = trimOrNull(root.taxLabel);
  if (!taxLabel) return null;
  const lockSource =
    root.lockSource === 'send' || root.lockSource === 'pdf'
      ? root.lockSource
      : null;
  if (!lockSource) return null;
  const lockedAt =
    typeof root.lockedAt === 'string' && root.lockedAt.trim()
      ? root.lockedAt.trim()
      : new Date(0).toISOString();
  const sourceRaw = root.destinationPlaceOfSupplySource;
  const destinationPlaceOfSupplySource =
    sourceRaw === 'trip' ||
    sourceRaw === 'inferred' ||
    sourceRaw === 'org' ||
    sourceRaw === 'none'
      ? sourceRaw
      : 'trip';
  return {
    taxLabel,
    gstin: trimOrNull(root.gstin),
    placeOfSupply: trimOrNull(root.placeOfSupply),
    destinationPlaceOfSupply: trimOrNull(root.destinationPlaceOfSupply),
    destinationPlaceOfSupplySource,
    lockedAt,
    lockSource,
  };
}

export function quoteTaxIdentityToJson(
  identity: OrgTaxIdentity,
  lockSource: 'send' | 'pdf',
  lockedAt = new Date().toISOString(),
): QuoteTaxIdentityLock {
  return {
    taxLabel: identity.taxLabel,
    gstin: identity.gstin,
    placeOfSupply: identity.placeOfSupply,
    destinationPlaceOfSupply: identity.destinationPlaceOfSupply,
    destinationPlaceOfSupplySource: identity.destinationPlaceOfSupplySource,
    lockedAt,
    lockSource,
  };
}
