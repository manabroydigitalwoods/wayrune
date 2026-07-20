import {
  dueDateFromPaymentTerms,
  formatPaymentTermsDueDate,
  parsePaymentTermsNetDays,
} from './payment-terms';

export type InstalmentScheduleStepInput = {
  label: string;
  percent: number;
};

export type CustomerInstalmentPlanRow = {
  label: string;
  percent: number;
  amount: number;
  dueAt: string | null;
};

export type BuildCustomerInstalmentPlanInput = {
  sellTotal: number;
  /** Story or terms-derived % steps. When empty, defaults to Advance 50 / Balance 50. */
  steps?: InstalmentScheduleStepInput[] | null;
  partyPaymentTerms?: string | null;
  tripStartDate?: string | Date | null;
  /** Anchor for first instalment due (usually today). */
  fromDate?: Date;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function asLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return null;
}

/** Normalize % steps that sum to ~100; otherwise return null. */
export function normalizeInstalmentPercentSteps(
  steps: InstalmentScheduleStepInput[] | null | undefined,
): InstalmentScheduleStepInput[] | null {
  if (!steps?.length) return null;
  const cleaned = steps
    .map((s) => ({
      label: String(s.label || '').trim() || 'Instalment',
      percent: Number(s.percent),
    }))
    .filter((s) => Number.isFinite(s.percent) && s.percent > 0);
  if (!cleaned.length) return null;
  const sum = cleaned.reduce((a, s) => a + s.percent, 0);
  if (sum < 99.5 || sum > 100.5) return null;
  if (Math.abs(sum - 100) > 0.001) {
    const last = cleaned[cleaned.length - 1]!;
    last.percent = round2(last.percent + (100 - sum));
  }
  return cleaned;
}

export function defaultInstalmentPercentSteps(): InstalmentScheduleStepInput[] {
  return [
    { label: 'Advance', percent: 50 },
    { label: 'Balance', percent: 50 },
  ];
}

/**
 * Light parse of quote terms like "40% to confirm; balance before travel"
 * (mirrors proposal resolvePaymentSchedule percent path).
 */
export function percentStepsFromTermsText(
  terms: string | null | undefined,
): InstalmentScheduleStepInput[] | null {
  if (!terms?.trim()) return null;
  const pctMatches = [...terms.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
  if (pctMatches.length >= 2) {
    return normalizeInstalmentPercentSteps([
      { label: 'Advance', percent: pctMatches[0]! },
      { label: 'Balance', percent: pctMatches[1]! },
    ]);
  }
  if (pctMatches.length === 1) {
    const first = pctMatches[0]!;
    const rest = Math.max(0, 100 - first);
    return normalizeInstalmentPercentSteps([
      { label: 'Advance', percent: first },
      ...(rest > 0 ? [{ label: 'Balance', percent: rest }] : []),
    ]);
  }
  return null;
}

/** Balance due: Net N from trip start, else trip start, else fromDate + Net N, else fromDate. */
export function balanceDueDateFromTerms(input: {
  partyPaymentTerms?: string | null;
  tripStartDate?: string | Date | null;
  fromDate?: Date;
}): string | null {
  const from = input.fromDate ?? new Date();
  const tripStart = asLocalDate(input.tripStartDate);
  const anchor = tripStart ?? from;
  const netDays = parsePaymentTermsNetDays(input.partyPaymentTerms);
  if (netDays != null) {
    return formatPaymentTermsDueDate(input.partyPaymentTerms, anchor);
  }
  if (tripStart) return formatLocalDate(tripStart);
  return formatLocalDate(
    new Date(from.getFullYear(), from.getMonth(), from.getDate()),
  );
}

/**
 * Build customer receivable rows from % steps + party Net terms.
 * Amounts are tax-inclusive sell split; last row absorbs rounding residue.
 */
export function buildCustomerInstalmentPlan(
  input: BuildCustomerInstalmentPlanInput,
): CustomerInstalmentPlanRow[] {
  const sell = round2(Number(input.sellTotal));
  if (!(sell > 0)) return [];

  const steps =
    normalizeInstalmentPercentSteps(input.steps) ||
    defaultInstalmentPercentSteps();

  const from = input.fromDate ?? new Date();
  const firstDue = formatLocalDate(
    new Date(from.getFullYear(), from.getMonth(), from.getDate()),
  );
  const balanceDue = balanceDueDateFromTerms({
    partyPaymentTerms: input.partyPaymentTerms,
    tripStartDate: input.tripStartDate,
    fromDate: from,
  });

  const rows: CustomerInstalmentPlanRow[] = [];
  let allocated = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const isLast = i === steps.length - 1;
    const amount = isLast
      ? round2(sell - allocated)
      : round2((sell * step.percent) / 100);
    allocated = round2(allocated + amount);

    let dueAt: string | null = firstDue;
    if (steps.length === 1) {
      dueAt = balanceDue;
    } else if (i === 0) {
      dueAt = firstDue;
    } else if (isLast) {
      dueAt = balanceDue;
    } else {
      // Intermediate: midway between first and balance (calendar days).
      const a = asLocalDate(firstDue)!;
      const b = asLocalDate(balanceDue) ?? a;
      const mid = new Date(
        a.getTime() + Math.floor((b.getTime() - a.getTime()) / 2),
      );
      dueAt = formatLocalDate(mid);
    }

    rows.push({
      label: step.label,
      percent: step.percent,
      amount,
      dueAt,
    });
  }
  return rows.filter((r) => r.amount > 0);
}

export function instalmentScheduleSourceLabel(input: {
  usedStorySteps: boolean;
  usedTermsPercents: boolean;
  partyPaymentTerms?: string | null;
}): string {
  const dueHint =
    parsePaymentTermsNetDays(input.partyPaymentTerms) != null
      ? `balance due per ${input.partyPaymentTerms?.trim()}`
      : 'balance due on trip start';
  if (input.usedStorySteps) return `From proposal payment schedule · ${dueHint}`;
  if (input.usedTermsPercents) return `From quote terms % · ${dueHint}`;
  return `Default Advance 50% / Balance 50% · ${dueHint}`;
}

/** Re-export for callers that only need due math. */
export { dueDateFromPaymentTerms };
