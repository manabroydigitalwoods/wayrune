import { describe, expect, it } from 'vitest';
import {
  activityNameMatches,
  blendedActivityUnitCost,
  classifyActivityPax,
  classifyTransferPax,
  normalizeActivityKey,
  pickBestActivityRate,
  scoreActivityRate,
  type ActivityRateCandidate,
} from './activity-rate-match';

function rate(overrides: Partial<ActivityRateCandidate> = {}): ActivityRateCandidate {
  return {
    id: 'act-1',
    supplierId: 'sup-tiger',
    placeId: 'place-tiger',
    activityName: 'Tiger Hill sunrise',
    activityKey: 'tiger-hill-sunrise',
    privateOrSic: 'private',
    adultUnitCost: 1800,
    childUnitCost: 900,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    updatedAt: new Date('2026-07-01'),
    currency: 'INR',
    ...overrides,
  };
}

describe('normalizeActivityKey', () => {
  it('slugs labels', () => {
    expect(normalizeActivityKey('Tiger Hill sunrise')).toBe('tiger-hill-sunrise');
    expect(normalizeActivityKey('  Sunset Cruise! ')).toBe('sunset-cruise');
  });
});

describe('activityNameMatches', () => {
  it('matches exact and partial keys', () => {
    expect(activityNameMatches(rate(), 'Tiger Hill sunrise')).toBe(true);
    expect(activityNameMatches(rate(), 'tiger hill')).toBe(true);
    expect(activityNameMatches(rate(), 'sunset cruise')).toBe(false);
  });
});

describe('scoreActivityRate / pickBestActivityRate', () => {
  it('prefers supplier + private match', () => {
    const pool = [
      rate({ id: 'sic', privateOrSic: 'sic', adultUnitCost: 950 }),
      rate({ id: 'private', privateOrSic: 'private', adultUnitCost: 1800 }),
      rate({
        id: 'other-sup',
        supplierId: 'other',
        privateOrSic: 'private',
        adultUnitCost: 2000,
      }),
    ];
    const best = pickBestActivityRate(pool, {
      asOf: new Date('2026-10-05'),
      supplierId: 'sup-tiger',
      placeId: 'place-tiger',
      privateOrSic: 'private',
      wantedName: 'Tiger Hill sunrise',
    });
    expect(best?.id).toBe('private');
    expect(scoreActivityRate(pool[0]!, {
      supplierId: 'sup-tiger',
      placeId: 'place-tiger',
      privateOrSic: 'private',
      wantedName: 'Tiger Hill sunrise',
    })).toBe(-1);
  });
});

describe('blendedActivityUnitCost', () => {
  it('blends adult and child into per-person unit', () => {
    const out = blendedActivityUnitCost({
      adultUnitCost: 1800,
      childUnitCost: 900,
      adults: 2,
      children: 1,
    });
    expect(out.quantity).toBe(3);
    expect(out.totalBuy).toBe(4500);
    expect(out.unitCost).toBe(1500);
  });

  it('defaults child to adult when child rate missing', () => {
    const out = blendedActivityUnitCost({
      adultUnitCost: 1000,
      adults: 1,
      children: 1,
    });
    expect(out.totalBuy).toBe(2000);
    expect(out.unitCost).toBe(1000);
  });
});

describe('classifyActivityPax', () => {
  it('uses children count when ages absent', () => {
    const out = classifyActivityPax({
      adults: 2,
      children: 1,
      childAgeMin: 0,
      childAgeMax: 11,
    });
    expect(out).toMatchObject({
      adultHeads: 2,
      childHeads: 1,
      usedChildAges: false,
    });
  });

  it('reclassifies ages outside the child window as adult-rate', () => {
    const out = classifyActivityPax({
      adults: 2,
      children: 2,
      childAges: [8, 14],
      childAgeMin: 0,
      childAgeMax: 11,
    });
    expect(out.adultHeads).toBe(3); // 2 adults + 14yo
    expect(out.childHeads).toBe(1); // 8yo
    expect(out.usedChildAges).toBe(true);
  });
});

describe('classifyTransferPax', () => {
  it('uses declared infants when ages absent', () => {
    const out = classifyTransferPax({
      adults: 2,
      children: 1,
      infants: 1,
      childAgeMin: 2,
      childAgeMax: 11,
    });
    expect(out).toMatchObject({
      adultHeads: 2,
      childHeads: 1,
      infantHeads: 1,
      usedChildAges: false,
    });
  });

  it('splits ages into infant / child / adult bands', () => {
    const out = classifyTransferPax({
      adults: 2,
      children: 3,
      infants: 9, // ignored when ages present
      childAges: [1, 8, 14],
      childAgeMin: 2,
      childAgeMax: 11,
    });
    expect(out.adultHeads).toBe(3); // 2 + 14yo
    expect(out.childHeads).toBe(1); // 8yo
    expect(out.infantHeads).toBe(1); // 1yo
    expect(out.usedChildAges).toBe(true);
  });
});
