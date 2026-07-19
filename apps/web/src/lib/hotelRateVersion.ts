/** Hotel rate version labels (mirrors API hotel-rate-version). */

import {
  formatHotelRateTipDiffCue,
  formatRateVersionHistoryLine,
  rateVersionLabel,
  type RateVersionListItem,
} from './rateVersion';

export const hotelRateVersionLabel = rateVersionLabel;

export type HotelRateVersionListItem = RateVersionListItem;

export function formatHotelRateVersionHistoryLine(
  row: HotelRateVersionListItem,
  opts?: { formatAmount?: (n: number) => string },
): string {
  return formatRateVersionHistoryLine(row, { kind: 'hotel', ...opts });
}

export { formatHotelRateTipDiffCue };
