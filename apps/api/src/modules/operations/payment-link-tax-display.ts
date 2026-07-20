/**
 * Display-only tax share on a public instalment payment link.
 * Pro-rates quote tax onto the instalment amount; never invents ledger rows.
 */

import type { OrgTaxIdentity } from '../../common/org-tax-identity';
import {
  formatTaxDisplaySplitLines,
  splitTaxDisplay,
  taxDisplaySplitCue,
  type TaxDisplaySplit,
} from '../../common/tax-display-split';

export type PublicPaymentTaxDisplay = {
  taxIdentity: OrgTaxIdentity;
  /** Accepted-quote tax total (context). */
  quoteTaxTotal: number;
  quoteSellTotal: number;
  /** Tax share attributed to this instalment (tax-inclusive amount × ratio). */
  instalmentTaxShare: number;
  instalmentSellExTax: number;
  split: TaxDisplaySplit;
  splitLines: string[];
  splitCue: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * When the accepted quote has tax, attribute a proportional share to the
 * instalment amount (assumed tax-inclusive, same currency as quote sell).
 */
export function composePublicPaymentTaxDisplay(opts: {
  instalmentAmount: number;
  quoteSellTotal: number;
  quoteTaxTotal: number;
  taxIdentity: OrgTaxIdentity | null | undefined;
}): PublicPaymentTaxDisplay | null {
  const identity = opts.taxIdentity;
  if (!identity) return null;

  const sell = Number(opts.quoteSellTotal);
  const tax = Number(opts.quoteTaxTotal);
  const amount = Number(opts.instalmentAmount);
  if (
    !Number.isFinite(sell) ||
    sell <= 0 ||
    !Number.isFinite(tax) ||
    tax <= 0 ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  const ratio = Math.min(1, tax / sell);
  const instalmentTaxShare = round2(amount * ratio);
  if (instalmentTaxShare <= 0) return null;

  const instalmentSellExTax = round2(Math.max(0, amount - instalmentTaxShare));
  const split = splitTaxDisplay({
    orgPlaceOfSupply: identity.placeOfSupply,
    destinationPlaceOfSupply: identity.destinationPlaceOfSupply,
    taxTotal: instalmentTaxShare,
  });

  return {
    taxIdentity: identity,
    quoteTaxTotal: round2(tax),
    quoteSellTotal: round2(sell),
    instalmentTaxShare,
    instalmentSellExTax,
    split,
    splitLines: formatTaxDisplaySplitLines(split),
    splitCue: taxDisplaySplitCue(split),
  };
}
