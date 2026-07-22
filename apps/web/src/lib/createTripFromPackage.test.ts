import { describe, expect, it } from 'vitest';
import {
  formatCreateTripFromPackageToast,
  fromPackageRequestBody,
  planCreateTripFromPackage,
  sortQuoteTemplatesForPicker,
  templateDestinationMatchScore,
} from './createTripFromPackage';

describe('planCreateTripFromPackage', () => {
  it('plans blank create without package', () => {
    const plan = planCreateTripFromPackage({
      title: 'Goa FIT',
      startDate: '2026-12-10',
      endDate: '2026-12-14',
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.createBody.title).toBe('Goa FIT');
      expect(plan.apply).toBeUndefined();
    }
  });

  it('requires travel start when package selected', () => {
    const bad = planCreateTripFromPackage({
      title: 'Goa FIT',
      templateId: 'tmpl-1',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.toLowerCase()).toContain('travel start');
    }
  });

  it('plans create + apply when package + start set', () => {
    const plan = planCreateTripFromPackage({
      title: 'Goa FIT',
      templateId: 'tmpl-1',
      startDate: '2026-12-10',
      endDate: '2026-12-14',
      adults: 3,
      children: 1,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.apply).toEqual({
        templateId: 'tmpl-1',
        startDate: '2026-12-10',
        adults: 3,
        children: 1,
        rooms: 2,
      });
      expect(plan.createBody.startDate).toBe('2026-12-10');
      expect(fromPackageRequestBody(plan)).toEqual({
        title: 'Goa FIT',
        startDate: '2026-12-10',
        endDate: '2026-12-14',
        templateId: 'tmpl-1',
        adults: 3,
        children: 1,
        rooms: 2,
      });
    }
  });

  it('forwards explicit rooms on apply', () => {
    const plan = planCreateTripFromPackage({
      title: 'Goa FIT',
      templateId: 'tmpl-1',
      startDate: '2026-12-10',
      adults: 4,
      children: 0,
      rooms: 3,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.apply?.rooms).toBe(3);
    }
  });

  it('forwards child ages and without-bed on apply', () => {
    const plan = planCreateTripFromPackage({
      title: 'Goa FIT',
      templateId: 'tmpl-1',
      startDate: '2026-12-10',
      adults: 2,
      children: 2,
      childAges: [5, 11],
      childrenWithoutBed: 1,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.apply?.childAges).toEqual([5, 11]);
      expect(plan.apply?.childrenWithoutBed).toBe(1);
    }
  });

  it('rejects end before start', () => {
    const bad = planCreateTripFromPackage({
      title: 'Goa FIT',
      startDate: '2026-12-14',
      endDate: '2026-12-10',
    });
    expect(bad.ok).toBe(false);
  });
});

describe('formatCreateTripFromPackageToast', () => {
  it('formats package success', () => {
    expect(
      formatCreateTripFromPackageToast({
        appliedPackage: true,
        quoteNumber: 'QT-12',
        packageName: 'Goa 4N',
      }),
    ).toBe('Trip created · QT-12 from Goa 4N');
  });

  it('includes rematch counts when present', () => {
    expect(
      formatCreateTripFromPackageToast({
        appliedPackage: true,
        quoteNumber: 'QT-12',
        packageName: 'Goa 4N',
        rematchMatched: 3,
        rematchUnmatched: 1,
      }),
    ).toBe('Trip created · QT-12 from Goa 4N · 3 rate-matched · 1 need rates');
  });
});

describe('sortQuoteTemplatesForPicker', () => {
  it('prefers destination hint matches', () => {
    const sorted = sortQuoteTemplatesForPicker(
      [
        { name: 'Goa 4N', content: { destinationHint: 'Goa' } },
        { name: 'Darjeeling', content: { destinationHint: 'Darjeeling' } },
      ],
      'Darjeeling',
    );
    expect(sorted[0]?.name).toBe('Darjeeling');
  });

  it('valid equal Place IDs outrank substring-only hints', () => {
    const sorted = sortQuoteTemplatesForPicker(
      [
        {
          name: 'Substring bait',
          content: { destinationHint: 'North Darjeeling Hills' },
        },
        {
          name: 'ID match',
          content: {
            destinationHint: 'Other',
            destinationPlaceId: 'place_darj',
          },
        },
      ],
      { placeId: 'place_darj', name: 'Darjeeling' },
    );
    expect(sorted[0]?.name).toBe('ID match');
  });

  it('different valid IDs with same name do not both get strong match', () => {
    const scoreA = templateDestinationMatchScore(
      { destinationHint: 'Darjeeling', destinationPlaceId: 'id_a' },
      { placeId: 'id_b', name: 'Darjeeling' },
    );
    const scoreB = templateDestinationMatchScore(
      { destinationHint: 'Darjeeling', destinationPlaceId: 'id_b' },
      { placeId: 'id_b', name: 'Darjeeling' },
    );
    expect(scoreA).toBe(60);
    expect(scoreB).toBe(100);
  });

  it('inaccessible template Place ID falls back to hint name', () => {
    const score = templateDestinationMatchScore(
      { destinationHint: 'Darjeeling', destinationPlaceId: 'stale' },
      { placeId: 'stale', name: 'Darjeeling' },
      { templatePlaceIdVisible: false },
    );
    expect(score).toBe(60);
  });

  it('legacy hint-only and unresolved trip dest still score by name', () => {
    expect(
      templateDestinationMatchScore(
        { destinationHint: 'Goa' },
        { placeId: null, name: 'Goa' },
      ),
    ).toBe(60);
    expect(
      templateDestinationMatchScore(
        { destinationHint: 'Private island near Phuket', destinationPlaceId: null },
        { name: 'Phuket' },
      ),
    ).toBe(30);
    expect(templateDestinationMatchScore({ destinationHint: 'Goa' }, null)).toBe(0);
  });
});
