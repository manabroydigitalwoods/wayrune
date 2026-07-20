import { describe, expect, it } from 'vitest';
import { sumChildExtrasByNationality } from './child-nationality-extras';

describe('child-nationality-extras', () => {
  it('sums per-child tip extras by nationality', () => {
    const result = sumChildExtrasByNationality({
      nights: 2,
      billableChildren: 2,
      childrenWithoutBed: 1,
      childNationalities: ['IN', 'US'],
      pickPricing: (code) =>
        code === 'IN'
          ? { childWithBedPerNight: 1000, childWithoutBedPerNight: 500 }
          : { childWithBedPerNight: 1500, childWithoutBedPerNight: 800 },
    });
    expect(result).not.toBeNull();
    expect(result!.childWithoutBedCount).toBe(1);
    expect(result!.childWithBedCount).toBe(1);
    // IN without bed 500×2 + US with bed 1500×2
    expect(result!.childWithoutBedTotal).toBe(1000);
    expect(result!.childWithBedTotal).toBe(3000);
    expect(result!.occupancyExtraTotal).toBe(4000);
    expect(result!.shares).toEqual([
      expect.objectContaining({ nationality: 'IN', withBed: false }),
      expect.objectContaining({ nationality: 'US', withBed: true }),
    ]);
  });

  it('returns null without nationalities or billable children', () => {
    expect(
      sumChildExtrasByNationality({
        nights: 1,
        billableChildren: 0,
        childrenWithoutBed: 0,
        childNationalities: ['IN'],
        pickPricing: () => ({ childWithBedPerNight: 100 }),
      }),
    ).toBeNull();
    expect(
      sumChildExtrasByNationality({
        nights: 1,
        billableChildren: 1,
        childrenWithoutBed: 0,
        childNationalities: [],
        pickPricing: () => ({ childWithBedPerNight: 100 }),
      }),
    ).toBeNull();
  });
});
