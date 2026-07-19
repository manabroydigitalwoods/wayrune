/**
 * Booking cancel fee preview for Ops CancellationCase thin slice.
 * Prefers quote-line stamped policy, then live supplier contract.
 */

import {
  parseContractCancellationPolicy,
  previewCancellationCharge,
  type ContractCancellationPolicy,
} from '../rates/cancellation-policy';

export type BookingCancelPolicySource = 'quote_line' | 'supplier_contract' | 'none';

export type BookingCancellationPreview = {
  bookingId: string;
  tripId: string;
  title: string;
  policySource: BookingCancelPolicySource;
  applicablePolicySnapshotJson: ContractCancellationPolicy | null;
  baseAmount: number;
  currency: string;
  serviceStartAt: string | null;
  nightCount: number;
  evaluation: {
    applicableRule: {
      beforeHours: number;
      chargeType: string;
      chargeValue: number;
    } | null;
    customerCharge: number;
    expectedRefund: number;
    supplierPenalty: number;
    agencyAbsorption: number;
    humanExplanation: string[];
  };
};

function asAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    const n = Number(value);
    return n >= 0 ? n : 0;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const n = Number(String((value as { toString: () => string }).toString()));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

/** Pull PolicyRules snapshot from quote rateProvenance.calculation.cancellationPolicy. */
export function policyFromQuoteProvenance(rateProvenance: unknown): unknown | null {
  if (!rateProvenance || typeof rateProvenance !== 'object' || Array.isArray(rateProvenance)) {
    return null;
  }
  const calc = (rateProvenance as Record<string, unknown>).calculation;
  if (!calc || typeof calc !== 'object' || Array.isArray(calc)) return null;
  const policy = (calc as Record<string, unknown>).cancellationPolicy;
  return policy ?? null;
}

export function nightCountFromStay(
  startAt: Date | null | undefined,
  endAt: Date | null | undefined,
): number {
  if (!startAt || !endAt) return 1;
  const ms = endAt.getTime() - startAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export function pickBookingBaseAmount(booking: {
  confirmedAmount?: unknown;
  quotedAmount?: unknown;
  costAmount?: unknown;
}): number {
  const confirmed = asAmount(booking.confirmedAmount);
  if (confirmed > 0) return confirmed;
  const quoted = asAmount(booking.quotedAmount);
  if (quoted > 0) return quoted;
  return asAmount(booking.costAmount);
}

export function buildBookingCancellationPreview(input: {
  bookingId: string;
  tripId: string;
  title: string;
  baseAmount: number;
  currency?: string;
  serviceStartAt: Date | null;
  endAt?: Date | null;
  quoteLinePolicy: unknown | null;
  contractPolicy: unknown | null;
  asOf?: Date;
}): BookingCancellationPreview {
  const currency = (input.currency || 'INR').slice(0, 3).toUpperCase();
  const nightCount = nightCountFromStay(input.serviceStartAt, input.endAt ?? null);

  let policySource: BookingCancelPolicySource = 'none';
  let parsed: ContractCancellationPolicy | null = null;

  const fromQuote = parseContractCancellationPolicy(input.quoteLinePolicy);
  if (fromQuote && ((fromQuote.rules?.length ?? 0) > 0 || fromQuote.text || fromQuote.noShowChargePercentage != null)) {
    parsed = fromQuote;
    policySource = 'quote_line';
  } else {
    const fromContract = parseContractCancellationPolicy(input.contractPolicy);
    if (
      fromContract &&
      ((fromContract.rules?.length ?? 0) > 0 ||
        fromContract.text ||
        fromContract.noShowChargePercentage != null)
    ) {
      parsed = fromContract;
      policySource = 'supplier_contract';
    }
  }

  const serviceStartAt = input.serviceStartAt ?? new Date();
  const evaluation = previewCancellationCharge({
    policy: parsed ?? { rules: [] },
    baseAmount: Math.max(0, input.baseAmount),
    currency,
    serviceStartAt,
    asOf: input.asOf,
    nightCount,
  });

  if (policySource === 'none') {
    evaluation.humanExplanation = [
      'No cancellation policy on quote line or supplier contract — fee computed as zero',
      ...evaluation.humanExplanation,
    ];
  }

  return {
    bookingId: input.bookingId,
    tripId: input.tripId,
    title: input.title,
    policySource,
    applicablePolicySnapshotJson: parsed,
    baseAmount: Math.max(0, input.baseAmount),
    currency,
    serviceStartAt: input.serviceStartAt
      ? input.serviceStartAt.toISOString()
      : null,
    nightCount,
    evaluation: {
      applicableRule: evaluation.applicableRule
        ? {
            beforeHours: evaluation.applicableRule.beforeHours,
            chargeType: evaluation.applicableRule.chargeType,
            chargeValue: evaluation.applicableRule.chargeValue,
          }
        : null,
      customerCharge: evaluation.customerCharge,
      expectedRefund: evaluation.refundAmount,
      supplierPenalty: evaluation.supplierPenalty,
      agencyAbsorption: evaluation.agencyAbsorption,
      humanExplanation: evaluation.humanExplanation,
    },
  };
}
