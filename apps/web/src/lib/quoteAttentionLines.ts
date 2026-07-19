import { lineMarginPolicyViolation } from './quoteMargin';
import { lineNeedsRateDriftAck } from './quoteServiceDetails';
import { hotelAllotmentBlocksSend } from './hotelAllotmentNote';
import { transferCapacityBlocksSend } from './transferCapacityNote';
import { formatHotelOccupancyExtraNote } from './hotelOccupancyExtraNote';
import { formatHotelDateSupplementNote } from './hotelDateSupplementNote';
import { formatHotelWeekendNightNote } from './hotelWeekendNightNote';
import { formatHotelCancellationNote } from './hotelCancellationNote';
import {
  activityChildAgeCalcFromProvenance,
  formatActivityChildAgeNote,
} from './activityChildAgeNote';

export type QuoteAttentionLineInput = {
  id: string;
  description: string;
  serviceType?: string;
  rateKind?: string;
  unitCost: number | null;
  unitSell: number | null;
  rateUnmatched?: boolean;
  rateBlockReason?: 'blackout' | 'stop_sell' | string | null;
  marginOverride?: { reason?: string | null } | null;
  rateId?: string | null;
  rateProvenance?: {
    rateId?: string | null;
    matchedAt?: string | null;
    rateUpdatedAt?: string | null;
    rateDriftAckForUpdatedAt?: string | null;
    rateDriftAckReason?: string | null;
    allotmentNote?: string | null;
    allotmentWarn?: boolean | null;
    allotmentRiskAckForNote?: string | null;
    allotmentRiskAckReason?: string | null;
    capacityNote?: string | null;
    capacityWarn?: boolean | null;
    capacityRiskAckForNote?: string | null;
    capacityRiskAckReason?: string | null;
    calculation?: {
      occupancyExtraTotal?: number | null;
      extraAdultCount?: number | null;
      childWithBedCount?: number | null;
      childWithoutBedCount?: number | null;
      dateSupplementTotal?: number | null;
      dateSupplements?: Array<{
        night?: string | null;
        label?: string | null;
        amount?: number | null;
      }> | null;
      weekendNights?: number | null;
      weekendUnit?: number | null;
      rooms?: number | null;
      cancellationSummary?: string | null;
      adults?: number | null;
      children?: number | null;
      partyAdults?: number | null;
      partyChildren?: number | null;
      adultsCharged?: number | null;
      childrenCharged?: number | null;
      childAgeMin?: number | null;
      childAgeMax?: number | null;
    } | null;
  } | null;
  /** Live chart updatedAt from /rates/chart-freshness. */
  chartUpdatedAt?: string | null;
};

export type QuoteAttentionReason =
  | 'no_sell'
  | 'no_buy'
  | 'no_rate'
  | 'blackout'
  | 'stop_sell'
  | 'below_margin'
  | 'rate_drift'
  | 'allotment_risk'
  | 'capacity_risk'
  | 'occupancy_extra'
  | 'gala'
  | 'weekend'
  | 'cancel_policy'
  | 'ages_as_adult';

export type QuoteAttentionRow = {
  id: string;
  description: string;
  serviceType?: string;
  reasons: QuoteAttentionReason[];
};

export function quoteAttentionReasonLabel(reason: QuoteAttentionReason): string {
  switch (reason) {
    case 'no_sell':
      return 'No sell';
    case 'no_buy':
      return 'No buy';
    case 'no_rate':
      return 'No rate';
    case 'blackout':
      return 'Blackout';
    case 'stop_sell':
      return 'Stop-sell';
    case 'below_margin':
      return 'Below margin';
    case 'rate_drift':
      return 'Rate drift';
    case 'allotment_risk':
      return 'Allotment';
    case 'capacity_risk':
      return 'Capacity';
    case 'occupancy_extra':
      return 'Occupancy';
    case 'gala':
      return 'Gala';
    case 'weekend':
      return 'Weekend';
    case 'cancel_policy':
      return 'Cancel';
    case 'ages_as_adult':
      return 'Ages';
    default:
      return reason;
  }
}

/** Classify why a quote line needs attention (priority order for chips). */
export function quoteAttentionReasons(
  line: QuoteAttentionLineInput,
  opts: { canViewCost: boolean; minMarginPercent: number },
): QuoteAttentionReason[] {
  const reasons: QuoteAttentionReason[] = [];
  if (line.rateBlockReason === 'blackout') reasons.push('blackout');
  else if (line.rateBlockReason === 'stop_sell') reasons.push('stop_sell');
  else if (line.rateUnmatched) reasons.push('no_rate');
  if (
    lineNeedsRateDriftAck({
      matchedAt: line.rateProvenance?.matchedAt,
      rateUpdatedAtAtMatch: line.rateProvenance?.rateUpdatedAt,
      currentUpdatedAt: line.chartUpdatedAt,
      ackForUpdatedAt: line.rateProvenance?.rateDriftAckForUpdatedAt,
      ackReason: line.rateProvenance?.rateDriftAckReason,
    })
  ) {
    reasons.push('rate_drift');
  }
  if (hotelAllotmentBlocksSend(line.rateProvenance)) {
    reasons.push('allotment_risk');
  }
  if (transferCapacityBlocksSend(line.rateProvenance)) {
    reasons.push('capacity_risk');
  }

  const calc = line.rateProvenance?.calculation;
  if (formatHotelOccupancyExtraNote(calc)) reasons.push('occupancy_extra');
  if (formatHotelDateSupplementNote(calc)) reasons.push('gala');
  if (formatHotelWeekendNightNote(calc)) reasons.push('weekend');
  if (formatHotelCancellationNote(calc?.cancellationSummary)) {
    reasons.push('cancel_policy');
  }
  if (
    formatActivityChildAgeNote(
      activityChildAgeCalcFromProvenance({ calculation: calc }),
    )
  ) {
    reasons.push('ages_as_adult');
  }

  if (line.unitSell == null) reasons.push('no_sell');
  if (opts.canViewCost && line.unitCost == null) reasons.push('no_buy');
  if (
    opts.canViewCost &&
    lineMarginPolicyViolation(line.unitCost, line.unitSell, opts.minMarginPercent) &&
    !line.marginOverride?.reason?.trim()
  ) {
    reasons.push('below_margin');
  }

  // Cancel policy is stamped on most contracted hotels — only surface as a
  // compose chip when the line already needs attention for another reason.
  if (
    reasons.includes('cancel_policy') &&
    reasons.every((r) => r === 'cancel_policy')
  ) {
    return [];
  }

  return reasons;
}

export function listQuoteAttentionLines(
  items: QuoteAttentionLineInput[],
  opts: { canViewCost: boolean; minMarginPercent: number },
): QuoteAttentionRow[] {
  const rows: QuoteAttentionRow[] = [];
  for (const line of items) {
    const reasons = quoteAttentionReasons(line, opts);
    if (!reasons.length) continue;
    rows.push({
      id: line.id,
      description: line.description,
      serviceType: line.serviceType || line.rateKind,
      reasons,
    });
  }
  return rows;
}

/** Line ids that carry a specific attention reason (e.g. rematch only rate_drift). */
export function attentionLineIdsForReason(
  rows: QuoteAttentionRow[],
  reason: QuoteAttentionReason,
): string[] {
  return rows.filter((r) => r.reasons.includes(reason)).map((r) => r.id);
}

/**
 * Next attention line after `currentId` in table order.
 * No wrap. If current is missing from the list (already fixed), returns the first remaining.
 */
export function nextQuoteAttentionLineId(
  attentionIds: string[],
  currentId: string | null | undefined,
): string | null {
  if (!attentionIds.length) return null;
  if (!currentId) return attentionIds[0] ?? null;
  const idx = attentionIds.indexOf(currentId);
  if (idx < 0) return attentionIds[0] ?? null;
  return attentionIds[idx + 1] ?? null;
}

export function quoteAttentionQueueMeta(
  attentionIds: string[],
  currentId: string | null | undefined,
): { index: number; total: number; nextId: string | null } | null {
  if (!attentionIds.length || !currentId) return null;
  const idx = attentionIds.indexOf(currentId);
  if (idx < 0) return null;
  return {
    index: idx + 1,
    total: attentionIds.length,
    nextId: attentionIds[idx + 1] ?? null,
  };
}
