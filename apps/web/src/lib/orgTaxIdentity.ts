/** Org tax identity cues (mirrors API org-tax-identity — label + display split). */

import {
  formatTaxDisplaySplitLinesUi,
  splitTaxDisplayUi,
  taxDisplaySplitCueUi,
  type TaxDisplaySplitUi,
} from './taxDisplaySplit';

export type OrgTaxIdentityUi = {
  taxLabel: string;
  gstin: string | null;
  placeOfSupply: string | null;
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

export function parseOrgTaxIdentityUi(
  taxLabel: string | null | undefined,
  settingsJson: unknown,
): OrgTaxIdentityUi {
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

export function formatOrgTaxIdentityLinesUi(identity: OrgTaxIdentityUi): string[] {
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

export function orgTaxTotalsLabelUi(identity: OrgTaxIdentityUi): string {
  return identity.taxLabel || 'Tax';
}

export function orgTaxDisplaySplitUi(
  identity: OrgTaxIdentityUi,
  taxTotal: number,
): TaxDisplaySplitUi {
  return splitTaxDisplayUi({
    orgPlaceOfSupply: identity.placeOfSupply,
    destinationPlaceOfSupply: identity.destinationPlaceOfSupply,
    taxTotal,
  });
}

export function formatOrgTaxDisplaySplitLinesUi(
  identity: OrgTaxIdentityUi,
  taxTotal: number,
  opts?: { formatAmount?: (n: number) => string },
): string[] {
  return formatTaxDisplaySplitLinesUi(
    orgTaxDisplaySplitUi(identity, taxTotal),
    opts,
  );
}

export function orgTaxDisplaySplitCueUi(
  identity: OrgTaxIdentityUi,
  taxTotal: number,
): string | null {
  return taxDisplaySplitCueUi(orgTaxDisplaySplitUi(identity, taxTotal));
}

export type { TaxDisplaySplitUi };
