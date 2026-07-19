import { describe, expect, it } from 'vitest';
import {
  swapTransferEnds,
  transferReverseCorridorHint,
} from './transferReverseCorridorHint';

describe('transferReverseCorridorHint', () => {
  it('returns null without reverse reject', () => {
    expect(transferReverseCorridorHint(null)).toBeNull();
    expect(
      transferReverseCorridorHint([{ reason: 'blackout on these dates' }]),
    ).toBeNull();
  });

  it('detects reverse / opposite-direction rejects', () => {
    expect(
      transferReverseCorridorHint([
        { reason: 'opposite direction — pick reverse route or swap From/To' },
      ]),
    ).toMatch(/swap From\/To/i);
    expect(
      transferReverseCorridorHint([
        { reason: 'no fare this direction; reverse corridor exists — swap From/To' },
      ]),
    ).toMatch(/other way/i);
  });
});

describe('swapTransferEnds', () => {
  it('swaps from and to place fields', () => {
    expect(
      swapTransferEnds({
        fromPlaceId: 'a',
        fromPlaceName: 'Bagdogra',
        fromCountry: 'IN',
        toPlaceId: 'b',
        toPlaceName: 'Darjeeling',
        toCountry: 'IN',
        vehicles: 1,
      }),
    ).toEqual({
      fromPlaceId: 'b',
      fromPlaceName: 'Darjeeling',
      fromCountry: 'IN',
      toPlaceId: 'a',
      toPlaceName: 'Bagdogra',
      toCountry: 'IN',
      vehicles: 1,
    });
  });
});
