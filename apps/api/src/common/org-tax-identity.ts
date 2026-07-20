/** Org tax identity for proposals (label + GSTIN + place of supply — not regimes). */

import {
  formatTaxDisplaySplitLines,
  splitTaxDisplay,
  taxDisplaySplitCue,
  type TaxDisplaySplit,
} from './tax-display-split';

export type OrgTaxIdentity = {
  /** Display label for totals, e.g. GST / VAT. Never empty. */
  taxLabel: string;
  gstin: string | null;
  placeOfSupply: string | null;
  /** Destination POS for display CGST/SGST/IGST split (not filing). */
  destinationPlaceOfSupply: string | null;
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

/**
 * Resolve display tax identity from org `taxLabel` + `settingsJson.business`.
 * `None` tax label still shows "Tax" on money rows.
 */
export function parseOrgTaxIdentity(
  taxLabel: string | null | undefined,
  settingsJson: unknown,
): OrgTaxIdentity {
  const business = asRecord(asRecord(settingsJson).business);
  const raw = typeof taxLabel === 'string' ? taxLabel.trim() : '';
  const taxDisplay =
    !raw || raw.toLowerCase() === 'none' ? 'Tax' : raw;
  return {
    taxLabel: taxDisplay,
    gstin: trimOrNull(business.gstin),
    placeOfSupply: trimOrNull(business.placeOfSupply),
    destinationPlaceOfSupply: trimOrNull(business.destinationPlaceOfSupply),
  };
}

/** Footer / meta lines when GSTIN or place of supply is set. */
export function formatOrgTaxIdentityLines(identity: OrgTaxIdentity): string[] {
  const lines: string[] = [];
  if (identity.gstin) lines.push(`GSTIN: ${identity.gstin}`);
  if (identity.placeOfSupply) {
    lines.push(`Place of supply: ${identity.placeOfSupply}`);
  }
  if (identity.destinationPlaceOfSupply) {
    lines.push(`Destination POS: ${identity.destinationPlaceOfSupply}`);
  }
  return lines;
}

export function orgTaxTotalsLabel(identity: OrgTaxIdentity): string {
  return identity.taxLabel || 'Tax';
}

/** Display-only CGST/SGST/IGST from org + destination POS. */
export function orgTaxDisplaySplit(
  identity: OrgTaxIdentity,
  taxTotal: number,
): TaxDisplaySplit {
  return splitTaxDisplay({
    orgPlaceOfSupply: identity.placeOfSupply,
    destinationPlaceOfSupply: identity.destinationPlaceOfSupply,
    taxTotal,
  });
}

export function formatOrgTaxDisplaySplitLines(
  identity: OrgTaxIdentity,
  taxTotal: number,
  opts?: { formatAmount?: (n: number) => string },
): string[] {
  return formatTaxDisplaySplitLines(orgTaxDisplaySplit(identity, taxTotal), opts);
}

export function orgTaxDisplaySplitCue(
  identity: OrgTaxIdentity,
  taxTotal: number,
): string | null {
  return taxDisplaySplitCue(orgTaxDisplaySplit(identity, taxTotal));
}

export type { TaxDisplaySplit };
