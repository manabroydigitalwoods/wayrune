import { describe, expect, it } from 'vitest';
import {
  activityAutoDescription,
  activityBaseCost,
  activityUnitSellFromSuggestedTotal,
  shouldReplaceActivityDescription,
  suggestedSellFromMarkup,
  validateActivityV1,
} from './quoteServiceDetails';

describe('validateActivityV1', () => {
  it('requires name and date', () => {
    const result = validateActivityV1({});
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['Enter an activity name', 'Select activity date']),
    );
  });

  it('passes with name, date and travellers', () => {
    const result = validateActivityV1({
      propertyName: 'Tiger Hill sunrise',
      activityDate: '2026-12-02',
      privateOrSic: 'private',
      adults: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('blocks activity date outside trip unless overridden', () => {
    const blocked = validateActivityV1(
      { propertyName: 'Trek', activityDate: '2026-11-01' },
      { tripStartDate: '2026-12-01', tripEndDate: '2026-12-06' },
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.requiresServiceDateOverride).toBe(true);

    const ok = validateActivityV1(
      {
        propertyName: 'Trek',
        activityDate: '2026-11-01',
        serviceDateOutsideTripOverride: true,
      },
      { tripStartDate: '2026-12-01', tripEndDate: '2026-12-06' },
    );
    expect(ok.ok).toBe(true);
    expect(ok.requiresServiceDateOverride).toBe(false);
  });

  it('rejects sell below buy', () => {
    const result = validateActivityV1(
      { propertyName: 'Trek', activityDate: '2026-12-02' },
      { buyUnit: 1000, sellUnit: 800 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/below buy/);
  });
});

describe('activity pricing helpers', () => {
  it('computes base cost and unit sell from markup', () => {
    const details = { adults: 2, children: 1 };
    expect(activityBaseCost(1000, details)).toBe(3000);
    const suggested = suggestedSellFromMarkup(3000, 'percent', 20);
    expect(suggested).toBe(3600);
    expect(activityUnitSellFromSuggestedTotal(suggested, details)).toBe(1200);
  });

  it('builds and replaces auto descriptions', () => {
    const details = {
      propertyName: 'Tiger Hill sunrise',
      privateOrSic: 'private' as const,
      adults: 2,
      activityDate: '2026-12-02',
    };
    const auto = activityAutoDescription(details);
    expect(auto).toContain('Tiger Hill sunrise');
    expect(auto).toContain('Private');
    expect(shouldReplaceActivityDescription('New service', details)).toBe(true);
    expect(shouldReplaceActivityDescription(auto!, details)).toBe(false);
  });
});
