import { describe, expect, it } from 'vitest';
import { withSanitizedDestinationPlaceId } from './quote-template-content';

describe('withSanitizedDestinationPlaceId', () => {
  it('keeps visible Place ID', () => {
    expect(
      withSanitizedDestinationPlaceId(
        { destinationHint: 'Darjeeling', destinationPlaceId: 'p1' },
        'p1',
      ),
    ).toEqual({
      destinationHint: 'Darjeeling',
      destinationPlaceId: 'p1',
    });
  });

  it('clears inaccessible ID but keeps portable hint', () => {
    expect(
      withSanitizedDestinationPlaceId(
        {
          destinationHint: 'Private island near Phuket',
          destinationPlaceId: 'missing',
        },
        null,
      ),
    ).toEqual({
      destinationHint: 'Private island near Phuket',
      destinationPlaceId: null,
    });
  });
});
