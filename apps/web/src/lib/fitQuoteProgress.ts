import type { QuoteAttentionReason } from './quoteAttentionLines';

/** Compact Guided FIT steps on the quotations tab. */
export type FitQuoteProgressStepId =
  | 'package'
  | 'lines_matched'
  | 'margin_ok'
  | 'ready_to_send';

export type FitQuoteProgressStatus = 'done' | 'current' | 'upcoming';

export type FitQuoteProgressAction =
  | 'use_template'
  | 'open_line'
  | 'margin'
  | 'send_readiness';

export type FitQuoteProgressStep = {
  id: FitQuoteProgressStepId;
  label: string;
  status: FitQuoteProgressStatus;
  hint: string;
  action: FitQuoteProgressAction | null;
  fixTargetLineId: string | null;
};

export type FitQuoteProgressAttentionRow = {
  id: string;
  reasons: QuoteAttentionReason[];
};

/** Match blockers that keep the FIT rail on “Lines matched”. */
export const FIT_MATCH_BLOCK_REASONS: ReadonlyArray<QuoteAttentionReason> = [
  'no_rate',
  'blackout',
  'stop_sell',
];

export function firstAttentionLineForReasons(
  rows: FitQuoteProgressAttentionRow[],
  reasons: ReadonlyArray<QuoteAttentionReason>,
): string | null {
  for (const row of rows) {
    if (row.reasons.some((r) => reasons.includes(r))) return row.id;
  }
  return null;
}

export function countAttentionForReasons(
  rows: FitQuoteProgressAttentionRow[],
  reasons: ReadonlyArray<QuoteAttentionReason>,
): number {
  return rows.filter((row) => row.reasons.some((r) => reasons.includes(r))).length;
}

export type BuildFitQuoteProgressInput = {
  itemCount: number;
  attentionRows: FitQuoteProgressAttentionRow[];
  marginGateCount: number;
  canViewCost: boolean;
  /** True when send is unblocked (mirrors quoteSendBlockedReason === ''). */
  canSend: boolean;
  /** Locked / accepted versions — hide the rail. */
  quoteLocked?: boolean;
};

export type FitQuoteProgress = {
  steps: FitQuoteProgressStep[];
  currentStepId: FitQuoteProgressStepId | null;
  allDone: boolean;
  /** Show the strip while guiding; hide when locked or fully ready. */
  visible: boolean;
};

function stepStatus(
  done: boolean,
  currentAssigned: boolean,
): { status: FitQuoteProgressStatus; becomesCurrent: boolean } {
  if (done) return { status: 'done', becomesCurrent: false };
  if (!currentAssigned) return { status: 'current', becomesCurrent: true };
  return { status: 'upcoming', becomesCurrent: false };
}

/**
 * Four-step Guided FIT progress for the quotations tab.
 * Does not change send semantics — composes existing attention / margin / canSend signals.
 */
export function buildFitQuoteProgress(
  input: BuildFitQuoteProgressInput,
): FitQuoteProgress {
  if (input.quoteLocked) {
    return {
      steps: [],
      currentStepId: null,
      allDone: false,
      visible: false,
    };
  }

  const matchBlockCount = countAttentionForReasons(
    input.attentionRows,
    FIT_MATCH_BLOCK_REASONS,
  );
  const packageDone = input.itemCount > 0;
  const linesMatchedDone = packageDone && matchBlockCount === 0;
  const marginOkDone =
    packageDone && (!input.canViewCost || input.marginGateCount === 0);
  const readyDone = input.canSend;

  let currentAssigned = false;
  const steps: FitQuoteProgressStep[] = [];

  {
    const { status, becomesCurrent } = stepStatus(packageDone, currentAssigned);
    if (becomesCurrent) currentAssigned = true;
    steps.push({
      id: 'package',
      label: 'Package',
      status,
      hint: packageDone
        ? `${input.itemCount} service${input.itemCount === 1 ? '' : 's'}`
        : 'Use a template or add services',
      action: packageDone ? null : 'use_template',
      fixTargetLineId: null,
    });
  }

  {
    const { status, becomesCurrent } = stepStatus(linesMatchedDone, currentAssigned);
    if (becomesCurrent) currentAssigned = true;
    const fixId = firstAttentionLineForReasons(
      input.attentionRows,
      FIT_MATCH_BLOCK_REASONS,
    );
    steps.push({
      id: 'lines_matched',
      label: 'Lines matched',
      status,
      hint: !packageDone
        ? 'After package'
        : linesMatchedDone
          ? 'Rates OK'
          : `${matchBlockCount} need Match`,
      action: linesMatchedDone || !packageDone ? null : 'open_line',
      fixTargetLineId: fixId,
    });
  }

  {
    const { status, becomesCurrent } = stepStatus(marginOkDone, currentAssigned);
    if (becomesCurrent) currentAssigned = true;
    const fixId = firstAttentionLineForReasons(input.attentionRows, ['below_margin']);
    steps.push({
      id: 'margin_ok',
      label: 'Margin OK',
      status,
      hint: !input.canViewCost
        ? 'Cost hidden'
        : !packageDone
          ? 'After match'
          : marginOkDone
            ? 'Policy met'
            : `${input.marginGateCount} below floor`,
      action:
        !input.canViewCost || marginOkDone || !packageDone ? null : 'margin',
      fixTargetLineId: input.canViewCost ? fixId : null,
    });
  }

  {
    const { status, becomesCurrent } = stepStatus(readyDone, currentAssigned);
    if (becomesCurrent) currentAssigned = true;
    steps.push({
      id: 'ready_to_send',
      label: 'Ready to send',
      status,
      hint: readyDone
        ? 'Send when the client is ready'
        : 'Validity, travellers, or remaining gates',
      action: readyDone ? null : 'send_readiness',
      fixTargetLineId: null,
    });
  }

  const currentStepId =
    steps.find((s) => s.status === 'current')?.id ??
    (readyDone ? null : steps[steps.length - 1]?.id ?? null);
  const allDone = readyDone && packageDone && linesMatchedDone && marginOkDone;

  return {
    steps,
    currentStepId,
    allDone,
    // Quiet when fully ready — sidebar checklist + badge already say “Ready to send”.
    visible: !allDone,
  };
}
