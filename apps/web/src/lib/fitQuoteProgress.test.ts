import { describe, expect, it } from 'vitest';
import {
  buildFitQuoteProgress,
  countAttentionForReasons,
  firstAttentionLineForReasons,
  FIT_MATCH_BLOCK_REASONS,
} from './fitQuoteProgress';

describe('fitQuoteProgress', () => {
  it('finds first attention line for match blockers', () => {
    expect(
      firstAttentionLineForReasons(
        [
          { id: 'a', reasons: ['below_margin'] },
          { id: 'b', reasons: ['no_rate', 'no_sell'] },
          { id: 'c', reasons: ['stop_sell'] },
        ],
        FIT_MATCH_BLOCK_REASONS,
      ),
    ).toBe('b');
    expect(
      countAttentionForReasons(
        [
          { id: 'a', reasons: ['no_rate'] },
          { id: 'b', reasons: ['blackout'] },
          { id: 'c', reasons: ['no_sell'] },
        ],
        FIT_MATCH_BLOCK_REASONS,
      ),
    ).toBe(2);
  });

  it('starts on Package when empty', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 0,
      attentionRows: [],
      marginGateCount: 0,
      canViewCost: true,
      canSend: false,
    });
    expect(progress.visible).toBe(true);
    expect(progress.allDone).toBe(false);
    expect(progress.currentStepId).toBe('package');
    expect(progress.steps.map((s) => s.status)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(progress.steps[0]?.action).toBe('use_template');
  });

  it('moves to Lines matched when package exists but rates missing', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 2,
      attentionRows: [
        { id: 'h1', reasons: ['no_rate', 'no_buy'] },
        { id: 't1', reasons: ['no_sell'] },
      ],
      marginGateCount: 0,
      canViewCost: true,
      canSend: false,
    });
    expect(progress.currentStepId).toBe('lines_matched');
    expect(progress.steps[0]?.status).toBe('done');
    expect(progress.steps[1]?.status).toBe('current');
    expect(progress.steps[1]?.fixTargetLineId).toBe('h1');
    expect(progress.steps[1]?.action).toBe('open_line');
    expect(progress.steps[1]?.hint).toBe('1 need Match');
  });

  it('moves to Margin OK after match blockers clear', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 2,
      attentionRows: [{ id: 'h1', reasons: ['below_margin'] }],
      marginGateCount: 1,
      canViewCost: true,
      canSend: false,
    });
    expect(progress.currentStepId).toBe('margin_ok');
    expect(progress.steps[1]?.status).toBe('done');
    expect(progress.steps[2]?.status).toBe('current');
    expect(progress.steps[2]?.action).toBe('margin');
    expect(progress.steps[2]?.fixTargetLineId).toBe('h1');
  });

  it('skips margin step when cost is hidden', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 1,
      attentionRows: [],
      marginGateCount: 0,
      canViewCost: false,
      canSend: false,
    });
    expect(progress.currentStepId).toBe('ready_to_send');
    expect(progress.steps[2]?.status).toBe('done');
    expect(progress.steps[2]?.hint).toBe('Cost hidden');
    expect(progress.steps[2]?.action).toBeNull();
    expect(progress.steps[3]?.action).toBe('send_readiness');
  });

  it('hides when ready to send (all done)', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 3,
      attentionRows: [],
      marginGateCount: 0,
      canViewCost: true,
      canSend: true,
    });
    expect(progress.allDone).toBe(true);
    expect(progress.visible).toBe(false);
    expect(progress.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('hides when quote is locked', () => {
    const progress = buildFitQuoteProgress({
      itemCount: 0,
      attentionRows: [],
      marginGateCount: 0,
      canViewCost: true,
      canSend: false,
      quoteLocked: true,
    });
    expect(progress.visible).toBe(false);
    expect(progress.steps).toEqual([]);
  });
});
