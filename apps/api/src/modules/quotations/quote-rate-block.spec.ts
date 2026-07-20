import { describe, expect, it } from 'vitest';
import { lineHasStopSaleBlock } from '@wayrune/contracts';

describe('lineHasStopSaleBlock', () => {
  it('blocks only hard stop-sale (not soft blackout)', () => {
    expect(lineHasStopSaleBlock({ rateBlockReason: 'stop_sell' })).toBe(true);
    expect(lineHasStopSaleBlock({ rateBlockReason: 'blackout' })).toBe(false);
    expect(lineHasStopSaleBlock({ rateBlockReason: null })).toBe(false);
    expect(lineHasStopSaleBlock({})).toBe(false);
  });
});
