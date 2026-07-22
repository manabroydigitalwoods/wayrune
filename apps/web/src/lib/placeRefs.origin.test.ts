import { describe, expect, it } from 'vitest';
import { originRefFromInquiry, placeName } from './placeRefs';

describe('originRefFromInquiry', () => {
  it('reads canonical originJson', () => {
    expect(
      placeName(
        originRefFromInquiry({
          originJson: { placeId: 'p1', name: 'Bengaluru' },
          origin: 'Legacy',
        }),
      ),
    ).toBe('Bengaluru');
  });

  it('falls back to legacy string', () => {
    expect(
      originRefFromInquiry({
        origin: 'Chennai',
        originPlaceId: 'p2',
      }),
    ).toEqual({ placeId: 'p2', name: 'Chennai' });
  });
});
