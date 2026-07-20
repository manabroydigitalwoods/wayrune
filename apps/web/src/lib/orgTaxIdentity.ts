/** Org tax identity cues (mirrors API org-tax-identity — label + display split). */

import {
  formatTaxDisplaySplitLinesUi,
  splitTaxDisplayUi,
  taxDisplaySplitCueUi,
  type TaxDisplaySplitUi,
} from './taxDisplaySplit';

export type DestinationPosSourceUi = 'trip' | 'inferred' | 'org' | 'none';

export type OrgTaxIdentityUi = {
  taxLabel: string;
  gstin: string | null;
  placeOfSupply: string | null;
  destinationPlaceOfSupply: string | null;
  destinationPlaceOfSupplySource: DestinationPosSourceUi;
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

export function resolveDestinationPlaceOfSupplyUi(opts: {
  tripOverride?: string | null;
  inferred?: string | null;
  orgDefault?: string | null;
}): { value: string | null; source: DestinationPosSourceUi } {
  const trip = trimOrNull(opts.tripOverride);
  if (trip) return { value: trip, source: 'trip' };
  const inferred = trimOrNull(opts.inferred);
  if (inferred) return { value: inferred, source: 'inferred' };
  const org = trimOrNull(opts.orgDefault);
  if (org) return { value: org, source: 'org' };
  return { value: null, source: 'none' };
}

export function parseOrgTaxIdentityUi(
  taxLabel: string | null | undefined,
  settingsJson: unknown,
  opts?: {
    destinationPlaceOfSupply?: string | null;
    inferredDestinationPlaceOfSupply?: string | null;
  },
): OrgTaxIdentityUi {
  const business = asRecord(asRecord(settingsJson).business);
  const raw = typeof taxLabel === 'string' ? taxLabel.trim() : '';
  const taxDisplay =
    !raw || raw.toLowerCase() === 'none' ? 'Tax' : raw;
  const orgDest = trimOrNull(business.destinationPlaceOfSupply);
  const dest = resolveDestinationPlaceOfSupplyUi({
    tripOverride: opts?.destinationPlaceOfSupply,
    inferred: opts?.inferredDestinationPlaceOfSupply,
    orgDefault: orgDest,
  });
  return {
    taxLabel: taxDisplay,
    gstin: trimOrNull(business.gstin),
    placeOfSupply: trimOrNull(business.placeOfSupply),
    destinationPlaceOfSupply: dest.value,
    destinationPlaceOfSupplySource: dest.source,
  };
}

export function formatOrgTaxIdentityLinesUi(identity: OrgTaxIdentityUi): string[] {
  const lines: string[] = [];
  if (identity.gstin) lines.push(`GSTIN: ${identity.gstin}`);
  if (identity.placeOfSupply) {
    lines.push(`Place of supply: ${identity.placeOfSupply}`);
  }
  if (identity.destinationPlaceOfSupply) {
    const suffix =
      identity.destinationPlaceOfSupplySource === 'inferred'
        ? ' (suggested from destinations)'
        : '';
    lines.push(
      `Destination POS: ${identity.destinationPlaceOfSupply}${suffix}`,
    );
  }
  return lines;
}

export function orgTaxTotalsLabelUi(identity: OrgTaxIdentityUi): string {
  return identity.taxLabel || 'Tax';
}

export function inferredDestinationPosCueUi(
  identity: OrgTaxIdentityUi,
): string | null {
  if (identity.destinationPlaceOfSupplySource !== 'inferred') return null;
  if (!identity.destinationPlaceOfSupply) return null;
  return `Suggested from destinations: ${identity.destinationPlaceOfSupply} — display only; not saved on the trip`;
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
