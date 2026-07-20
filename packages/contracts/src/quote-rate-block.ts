/** Hard stop-sale on quote lines — blocks send/approve even when buy/sell are set manually. */

export function lineHasStopSaleBlock(opts: {
  rateBlockReason?: string | null;
}): boolean {
  return opts.rateBlockReason === 'stop_sell';
}
