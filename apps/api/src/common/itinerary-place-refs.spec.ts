import { describe, expect, it } from 'vitest';
import {
  assignSeedDestinationRefs,
  destinationDisplayLabel,
  destinationRefFromDay,
  locationDisplayLabel,
  locationRefFromItem,
  normalizeItineraryContentForWrite,
  normalizeItineraryDaysForRead,
  withCanonicalItemLocation,
} from '@wayrune/contracts';

describe('itinerary place refs', () => {
  it('prefers locationRef over legacy location', () => {
    expect(
      locationRefFromItem({
        location: 'Old text',
        locationRef: { placeId: 'p_2', name: 'Gangtok' },
      }),
    ).toEqual({ placeId: 'p_2', name: 'Gangtok' });
  });

  it('coerces legacy string destination without inventing placeId', () => {
    expect(destinationRefFromDay({ destination: 'Darjeeling' })).toEqual({
      placeId: null,
      name: 'Darjeeling',
    });
  });

  it('coerces legacy PlaceRef location', () => {
    expect(
      locationRefFromItem({
        location: { placeId: 'p_1', name: 'Tiger Hill' },
      }),
    ).toEqual({ placeId: 'p_1', name: 'Tiger Hill' });
  });

  it('display label precedence: custom label wins', () => {
    expect(
      locationDisplayLabel({
        locationLabel: 'MG Marg area',
        locationRef: { placeId: 'p_2', name: 'Gangtok' },
      }),
    ).toBe('MG Marg area');
  });

  it('write normalizer omits legacy keys and preserves unknown fields', () => {
    const out = normalizeItineraryContentForWrite({
      story: { tagline: 'keep me' },
      days: [
        {
          id: 'd1',
          dayNumber: 1,
          title: 'Arrival',
          destination: 'Darjeeling',
          customFlag: true,
          items: [
            {
              id: 'i1',
              type: 'sightseeing',
              title: 'Tiger Hill',
              location: { placeId: 'p_1', name: 'Tiger Hill' },
              extra: { nested: 1 },
            },
          ],
        },
      ],
    });
    expect(out.story).toEqual({ tagline: 'keep me' });
    const day = out.days[0]!;
    expect(day.destination).toBeUndefined();
    expect(day.destinationRef).toEqual({ placeId: null, name: 'Darjeeling' });
    expect(day.customFlag).toBe(true);
    const item = (day.items as Record<string, unknown>[])[0]!;
    expect(item.location).toBeUndefined();
    expect(item.locationRef).toEqual({ placeId: 'p_1', name: 'Tiger Hill' });
    expect(item.extra).toEqual({ nested: 1 });
  });

  it('read normalize fills Ref without dropping legacy', () => {
    const days = normalizeItineraryDaysForRead([
      { id: 'd1', destination: 'Darjeeling', items: [] },
    ]);
    expect(days[0]!.destination).toBe('Darjeeling');
    expect(days[0]!.destinationRef).toEqual({ placeId: null, name: 'Darjeeling' });
  });

  it('withCanonicalItemLocation clears both on null', () => {
    const next = withCanonicalItemLocation(
      {
        id: 'i1',
        location: 'x',
        locationRef: { placeId: 'p', name: 'x' },
        locationLabel: 'y',
      },
      null,
    );
    expect(next.location).toBeUndefined();
    expect(next.locationRef).toBeUndefined();
    expect(next.locationLabel).toBeUndefined();
  });

  it('multi-stop seed: first/last only', () => {
    const dests = [
      { placeId: 'a', name: 'Darjeeling' },
      { placeId: 'b', name: 'Gangtok' },
    ];
    expect(assignSeedDestinationRefs(4, 1, dests)?.placeId).toBe('a');
    expect(assignSeedDestinationRefs(4, 2, dests)).toBeNull();
    expect(assignSeedDestinationRefs(4, 4, dests)?.placeId).toBe('b');
  });

  it('single destination seeds every day', () => {
    const dests = [{ placeId: 'a', name: 'Darjeeling' }];
    expect(assignSeedDestinationRefs(3, 2, dests)?.name).toBe('Darjeeling');
  });

  it('destination display falls back to ref name', () => {
    expect(
      destinationDisplayLabel({
        destinationRef: { placeId: null, name: 'Sikkim' },
      }),
    ).toBe('Sikkim');
  });
});
