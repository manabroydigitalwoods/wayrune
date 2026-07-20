/** Org tax identity for proposals (label + GSTIN + place of supply — not regimes). */

import {
  formatTaxDisplaySplitLines,
  splitTaxDisplay,
  taxDisplaySplitCue,
  type TaxDisplaySplit,
} from './tax-display-split';

export type DestinationPosSource = 'trip' | 'inferred' | 'org' | 'none';

export type OrgTaxIdentity = {
  /** Display label for totals, e.g. GST / VAT. Never empty. */
  taxLabel: string;
  gstin: string | null;
  placeOfSupply: string | null;
  /** Destination POS for display CGST/SGST/IGST split (not filing). */
  destinationPlaceOfSupply: string | null;
  /** How destination POS was chosen (trip override → infer → org). */
  destinationPlaceOfSupplySource: DestinationPosSource;
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

export function resolveDestinationPlaceOfSupply(opts: {
  tripOverride?: string | null;
  inferred?: string | null;
  orgDefault?: string | null;
}): { value: string | null; source: DestinationPosSource } {
  const trip = trimOrNull(opts.tripOverride);
  if (trip) return { value: trip, source: 'trip' };
  const inferred = trimOrNull(opts.inferred);
  if (inferred) return { value: inferred, source: 'inferred' };
  const org = trimOrNull(opts.orgDefault);
  if (org) return { value: org, source: 'org' };
  return { value: null, source: 'none' };
}

/**
 * Resolve display tax identity from org `taxLabel` + `settingsJson.business`.
 * `None` tax label still shows "Tax" on money rows.
 * Destination POS: trip override ?? inferred from destinations ?? org default.
 */
export function parseOrgTaxIdentity(
  taxLabel: string | null | undefined,
  settingsJson: unknown,
  opts?: {
    destinationPlaceOfSupply?: string | null;
    inferredDestinationPlaceOfSupply?: string | null;
  },
): OrgTaxIdentity {
  const business = asRecord(asRecord(settingsJson).business);
  const raw = typeof taxLabel === 'string' ? taxLabel.trim() : '';
  const taxDisplay =
    !raw || raw.toLowerCase() === 'none' ? 'Tax' : raw;
  const orgDest = trimOrNull(business.destinationPlaceOfSupply);
  const dest = resolveDestinationPlaceOfSupply({
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

/** Footer / meta lines when GSTIN or place of supply is set. */
export function formatOrgTaxIdentityLines(identity: OrgTaxIdentity): string[] {
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

export function orgTaxTotalsLabel(identity: OrgTaxIdentity): string {
  return identity.taxLabel || 'Tax';
}

/** Soft cue when destination POS came from place labels (not persisted). */
export function inferredDestinationPosCue(
  identity: OrgTaxIdentity,
): string | null {
  if (identity.destinationPlaceOfSupplySource !== 'inferred') return null;
  if (!identity.destinationPlaceOfSupply) return null;
  return `Suggested from destinations: ${identity.destinationPlaceOfSupply} — display only; not saved on the trip`;
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
