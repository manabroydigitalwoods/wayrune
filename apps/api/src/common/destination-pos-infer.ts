/**
 * Infer destination place of supply from place / destination labels.
 * Display-only soft suggestion — never persist onto Trip.
 */

import { matchKnownPlaceOfSupply } from './tax-display-split';

/**
 * First known POS code found in label order (destination → ancestors).
 * Empty / city-only labels → null.
 */
export function inferDestinationPlaceOfSupplyFromLabels(
  labels: Iterable<string | null | undefined>,
): string | null {
  for (const label of labels) {
    const code = matchKnownPlaceOfSupply(label);
    if (code) return code;
  }
  return null;
}
