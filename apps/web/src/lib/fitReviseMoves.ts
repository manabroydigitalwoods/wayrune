import type { QuoteAttentionReason } from './quoteAttentionLines';
import { firstAttentionLineForReasons, FIT_MATCH_BLOCK_REASONS } from './fitQuoteProgress';

/** One-click revise moves after unlock / clone / date rewrite. */
export type FitReviseMoveId =
  | 'revise_draft'
  | 'edit_dates'
  | 'rematch_all'
  | 'rematch_drift'
  | 'open_unmatched'
  | 'swap_hotel'
  | 'apply_inquiry_pax';

export type FitReviseMove = {
  id: FitReviseMoveId;
  label: string;
  hint: string;
  /** Emphasize primary next move. */
  primary?: boolean;
};

export type FitReviseMovesMode = 'idle' | 'locked' | 'post_revise';

export type BuildFitReviseMovesInput = {
  mode: FitReviseMovesMode;
  itemCount: number;
  rateDriftCount: number;
  firstUnmatchedLineId: string | null;
  firstHotelLineId: string | null;
  /** Inquiry adults/children/rooms when known enough to stamp. */
  inquiryPax: { adults: number; children: number; rooms: number } | null;
  canTripWrite: boolean;
  canQuoteWrite: boolean;
  /** Accepted → reviseFromAccepted; otherwise revise as new version. */
  quoteAccepted?: boolean;
};

export type FitReviseMoves = {
  visible: boolean;
  title: string;
  subtitle: string;
  actions: FitReviseMove[];
};

export function firstHotelLineId(
  items: Array<{ id: string; serviceType?: string; rateKind?: string }>,
): string | null {
  const hit = items.find(
    (l) => l.serviceType === 'hotel' || l.rateKind === 'hotel',
  );
  return hit?.id ?? null;
}

export function firstUnmatchedLineIdFromAttention(
  rows: Array<{ id: string; reasons: QuoteAttentionReason[] }>,
): string | null {
  return firstAttentionLineForReasons(rows, FIT_MATCH_BLOCK_REASONS);
}

/**
 * Compact revise-move chips for locked quotes or freshly unlocked drafts.
 * Reuses existing Travel dates / rematch / Match sheet — no new APIs.
 */
export function buildFitReviseMoves(
  input: BuildFitReviseMovesInput,
): FitReviseMoves {
  if (!input.canQuoteWrite) {
    return { visible: false, title: '', subtitle: '', actions: [] };
  }

  if (input.mode === 'locked') {
    const actions: FitReviseMove[] = [
      {
        id: 'revise_draft',
        label: input.quoteAccepted
          ? 'Revise from accepted'
          : 'Revise as new draft',
        hint: 'Open an editable draft from this version',
        primary: true,
      },
    ];
    if (input.canTripWrite) {
      actions.push({
        id: 'edit_dates',
        label: 'Edit travel dates',
        hint: 'Shift stay window (creates a draft when this version is locked)',
      });
    }
    return {
      visible: true,
      title: 'Revise moves',
      subtitle: 'Unlock a draft, then rematch or swap hotels in two clicks.',
      actions,
    };
  }

  if (input.mode !== 'post_revise') {
    return { visible: false, title: '', subtitle: '', actions: [] };
  }

  if (input.itemCount <= 0) {
    return { visible: false, title: '', subtitle: '', actions: [] };
  }

  const actions: FitReviseMove[] = [];
  if (input.canTripWrite) {
    actions.push({
      id: 'edit_dates',
      label: 'Edit travel dates',
      hint: 'Shift dates and rematch rates',
      primary: true,
    });
  }
  actions.push({
    id: 'rematch_all',
    label: 'Rematch all rates',
    hint: 'Re-run Match on hotel, transfer, and activity lines',
    primary: !input.canTripWrite,
  });
  if (input.rateDriftCount > 0) {
    actions.push({
      id: 'rematch_drift',
      label: `Rematch drifted (${input.rateDriftCount})`,
      hint: 'Only lines whose rate chart changed',
    });
  }
  if (input.firstUnmatchedLineId) {
    actions.push({
      id: 'open_unmatched',
      label: 'Fix unmatched',
      hint: 'Open the first line that needs Match',
    });
  }
  if (input.firstHotelLineId) {
    actions.push({
      id: 'swap_hotel',
      label: 'Swap hotel',
      hint: 'Open hotel line — change supplier, then Match rate',
    });
  }
  if (input.inquiryPax) {
    actions.push({
      id: 'apply_inquiry_pax',
      label: `Apply ${input.inquiryPax.adults}A+${input.inquiryPax.children}C · ${input.inquiryPax.rooms}R`,
      hint: 'Stamp inquiry party + hotel rooms onto lines, then rematch',
    });
  }

  return {
    visible: actions.length > 0,
    title: 'Revise moves',
    subtitle: 'Date shift, rematch, or swap a hotel without rebuilding the quote.',
    actions,
  };
}
