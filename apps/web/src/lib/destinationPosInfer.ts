/**
 * Infer destination place of supply from place / destination labels.
 * Display-only soft suggestion — never persist onto Trip.
 */

import { matchKnownPlaceOfSupplyUi } from './taxDisplaySplit';

export function inferDestinationPlaceOfSupplyFromLabelsUi(
  labels: Iterable<string | null | undefined>,
): string | null {
  for (const label of labels) {
    const code = matchKnownPlaceOfSupplyUi(label);
    if (code) return code;
  }
  return null;
}
