/**
 * Contract cancellation policy summaries for hotel Match rate.
 * Reuses commerce PolicyRules / evaluateCancellationPolicy — does not run CancellationCase.
 */

import {
  evaluateCancellationPolicy,
  type CancellationRule,
  type PolicyRules,
} from '../commerce/policy-evaluator';

export type ContractCancellationPolicy = PolicyRules & {
  /** Guest-facing prose (mirrors / supplements cancellationTerms). */
  text?: string;
};

export type CancellationMatchSummary = {
  policy: ContractCancellationPolicy;
  accepted: string[];
  humanText: string;
  /** Snapshot safe to stamp on rateMeta.calculation */
  snapshot: {
    rules: CancellationRule[];
    noShowChargePercentage?: number;
    text?: string;
    freeCancelBeforeHours: number | null;
  };
};

function asNonNegNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    const n = Number(value);
    return n >= 0 ? n : null;
  }
  return null;
}

function parseRule(raw: unknown): CancellationRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const beforeHours = asNonNegNumber(o.beforeHours);
  const chargeValue = asNonNegNumber(o.chargeValue);
  const chargeType = o.chargeType;
  if (beforeHours == null || chargeValue == null) return null;
  if (
    chargeType !== 'PERCENTAGE' &&
    chargeType !== 'FIXED' &&
    chargeType !== 'NIGHTS'
  ) {
    return null;
  }
  return {
    beforeHours: Math.floor(beforeHours),
    chargeType,
    chargeValue,
  };
}

export function parseContractCancellationPolicy(
  raw: unknown,
): ContractCancellationPolicy | null {
  if (!raw) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith('{')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          obj = parsed as Record<string, unknown>;
        }
      } catch {
        return { text: t.slice(0, 500) };
      }
    } else {
      return { text: t.slice(0, 500) };
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;

  const rules: CancellationRule[] = [];
  if (Array.isArray(obj.rules)) {
    for (const row of obj.rules) {
      const rule = parseRule(row);
      if (rule) rules.push(rule);
    }
  }
  const noShow = asNonNegNumber(obj.noShowChargePercentage);
  const text =
    typeof obj.text === 'string' && obj.text.trim()
      ? obj.text.trim().slice(0, 500)
      : undefined;

  if (!rules.length && noShow == null && !text) return null;

  return {
    ...(rules.length ? { rules: rules.slice(0, 8) } : {}),
    ...(noShow != null ? { noShowChargePercentage: Math.min(100, noShow) } : {}),
    ...(text ? { text } : {}),
  };
}

/** Normalize for Prisma JSON storage; null clears. */
export function cancellationPolicyToJson(
  value: ContractCancellationPolicy | null | undefined,
): ContractCancellationPolicy | null {
  if (value == null) return null;
  return parseContractCancellationPolicy(value);
}

function formatRuleLine(rule: CancellationRule): string {
  const days =
    rule.beforeHours >= 24 && rule.beforeHours % 24 === 0
      ? `${rule.beforeHours / 24}d`
      : `${rule.beforeHours}h`;
  if (rule.chargeType === 'PERCENTAGE') {
    if (rule.chargeValue === 0) return `Free cancel until ${days} before check-in`;
    return `${rule.chargeValue}% charge within ${days}`;
  }
  if (rule.chargeType === 'NIGHTS') {
    return `${rule.chargeValue} night${rule.chargeValue === 1 ? '' : 's'} within ${days}`;
  }
  return `₹${Math.round(rule.chargeValue).toLocaleString('en-IN')} within ${days}`;
}

/**
 * Free-cancel threshold = largest beforeHours among 0% rules, else null.
 */
export function freeCancelBeforeHours(
  policy: ContractCancellationPolicy,
): number | null {
  const zeros = (policy.rules ?? []).filter(
    (r) => r.chargeType === 'PERCENTAGE' && r.chargeValue === 0,
  );
  if (!zeros.length) return null;
  return Math.max(...zeros.map((r) => r.beforeHours));
}

export function summarizeCancellationForMatch(
  raw: unknown,
): CancellationMatchSummary | null {
  const policy = parseContractCancellationPolicy(raw);
  if (!policy) return null;

  const accepted: string[] = [];
  const sorted = [...(policy.rules ?? [])].sort(
    (a, b) => b.beforeHours - a.beforeHours,
  );
  for (const rule of sorted.slice(0, 4)) {
    accepted.push(formatRuleLine(rule));
  }
  if (sorted.length > 4) {
    accepted.push(`+${sorted.length - 4} more cancel tiers`);
  }
  if (policy.noShowChargePercentage != null) {
    accepted.push(`No-show ${policy.noShowChargePercentage}%`);
  }
  if (!accepted.length && policy.text) {
    accepted.push(
      policy.text.length > 80 ? `${policy.text.slice(0, 77)}…` : policy.text,
    );
  }

  const freeH = freeCancelBeforeHours(policy);
  const humanText =
    policy.text?.trim() ||
    (freeH != null
      ? `Free cancellation until ${
          freeH >= 24 && freeH % 24 === 0 ? `${freeH / 24} days` : `${freeH} hours`
        } before check-in; thereafter per contract tiers.`
      : sorted.map(formatRuleLine).join('; ') || 'Contract cancellation terms apply.');

  return {
    policy,
    accepted,
    humanText,
    snapshot: {
      rules: policy.rules ?? [],
      ...(policy.noShowChargePercentage != null
        ? { noShowChargePercentage: policy.noShowChargePercentage }
        : {}),
      ...(policy.text ? { text: policy.text } : {}),
      freeCancelBeforeHours: freeH,
    },
  };
}

/** Preview charge at check-in as-of (for specs / future cancel UX). */
export function previewCancellationCharge(input: {
  policy: ContractCancellationPolicy;
  baseAmount: number;
  currency?: string;
  serviceStartAt: Date;
  asOf?: Date;
  nightCount?: number;
}) {
  return evaluateCancellationPolicy({
    rules: input.policy,
    baseAmount: input.baseAmount,
    currency: input.currency || 'INR',
    serviceStartAt: input.serviceStartAt,
    asOf: input.asOf,
    nightCount: input.nightCount,
  });
}
