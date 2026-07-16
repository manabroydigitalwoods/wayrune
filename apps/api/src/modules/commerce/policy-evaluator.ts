/**
 * Policy evaluator — derives charges from structured cancellation rules + as-of times.
 * @see docs/commerce-integrity/05-policy-and-cancellation-model.md
 */

export type CancellationRule = {
  beforeHours: number;
  chargeType: 'PERCENTAGE' | 'FIXED' | 'NIGHTS';
  chargeValue: number;
};

export type PolicyRules = {
  rules?: CancellationRule[];
  noShowChargePercentage?: number;
  custom?: Record<string, unknown>;
};

export type PolicyEvaluationInput = {
  rules: PolicyRules | null | undefined;
  baseAmount: number;
  currency: string;
  serviceStartAt: Date;
  asOf?: Date;
  nightCount?: number;
  isNoShow?: boolean;
};

export type PolicyEvaluationResult = {
  applicableRule: CancellationRule | null;
  customerCharge: number;
  supplierPenalty: number;
  refundAmount: number;
  agencyAbsorption: number;
  humanExplanation: string[];
};

function pickRule(rules: CancellationRule[], hoursUntil: number): CancellationRule | null {
  const matching = rules
    .filter((r) => hoursUntil <= r.beforeHours)
    .sort((a, b) => a.beforeHours - b.beforeHours);
  return matching[0] ?? null;
}

function chargeFromRule(
  rule: CancellationRule,
  baseAmount: number,
  nightCount: number,
): number {
  if (rule.chargeType === 'PERCENTAGE') {
    return (baseAmount * rule.chargeValue) / 100;
  }
  if (rule.chargeType === 'FIXED') {
    return rule.chargeValue;
  }
  // NIGHTS — use nightCount unit ≈ baseAmount / nights when possible
  const perNight = nightCount > 0 ? baseAmount / nightCount : baseAmount;
  return perNight * rule.chargeValue;
}

export function evaluateCancellationPolicy(
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  const asOf = input.asOf ?? new Date();
  const hoursUntil =
    (input.serviceStartAt.getTime() - asOf.getTime()) / (1000 * 60 * 60);
  const explanation: string[] = [];

  if (input.isNoShow && input.rules?.noShowChargePercentage != null) {
    const charge = (input.baseAmount * input.rules.noShowChargePercentage) / 100;
    explanation.push(
      `No-show charge ${input.rules.noShowChargePercentage}% of ${input.baseAmount} ${input.currency}`,
    );
    return {
      applicableRule: null,
      customerCharge: charge,
      supplierPenalty: charge,
      refundAmount: Math.max(0, input.baseAmount - charge),
      agencyAbsorption: 0,
      humanExplanation: explanation,
    };
  }

  const rules = input.rules?.rules ?? [];
  if (!rules.length) {
    explanation.push('No structured cancellation rules; zero computed charge');
    return {
      applicableRule: null,
      customerCharge: 0,
      supplierPenalty: 0,
      refundAmount: input.baseAmount,
      agencyAbsorption: 0,
      humanExplanation: explanation,
    };
  }

  const applicable = pickRule(rules, hoursUntil);
  if (!applicable) {
    explanation.push(
      `${hoursUntil.toFixed(1)}h before service — outside charge windows; free cancel`,
    );
    return {
      applicableRule: null,
      customerCharge: 0,
      supplierPenalty: 0,
      refundAmount: input.baseAmount,
      agencyAbsorption: 0,
      humanExplanation: explanation,
    };
  }

  const charge = chargeFromRule(
    applicable,
    input.baseAmount,
    input.nightCount ?? 1,
  );
  explanation.push(
    `Rule ≤${applicable.beforeHours}h: ${applicable.chargeType} ${applicable.chargeValue}`,
  );
  explanation.push(
    `Customer charge ${charge.toFixed(2)} ${input.currency}; refund ${(input.baseAmount - charge).toFixed(2)}`,
  );

  return {
    applicableRule: applicable,
    customerCharge: charge,
    supplierPenalty: charge,
    refundAmount: Math.max(0, input.baseAmount - charge),
    agencyAbsorption: 0,
    humanExplanation: explanation,
  };
}

/** Strip partner-forbidden fields for STAY fulfilment. */
export function stayFulfilmentPayload(input: {
  guestName?: string | null;
  guestCount?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
  roomProductName?: string | null;
  specialRequests?: string | null;
  confirmationRef?: string | null;
}) {
  return {
    serviceType: 'STAY' as const,
    guestName: input.guestName ?? null,
    guestCount: input.guestCount ?? null,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    roomProductName: input.roomProductName ?? null,
    specialRequests: input.specialRequests ?? null,
    confirmationRef: input.confirmationRef ?? null,
  };
}

export function mealFulfilmentPayload(input: {
  guestName?: string | null;
  guestCount?: number | null;
  serviceAt?: string | null;
  dietarySummary?: Record<string, number> | null;
  packageName?: string | null;
  eta?: string | null;
  onSiteContact?: string | null;
}) {
  return {
    serviceType: 'MEAL' as const,
    guestName: input.guestName ?? null,
    guestCount: input.guestCount ?? null,
    serviceAt: input.serviceAt ?? null,
    dietarySummary: input.dietarySummary ?? null,
    packageName: input.packageName ?? null,
    eta: input.eta ?? null,
    onSiteContact: input.onSiteContact ?? null,
  };
}
