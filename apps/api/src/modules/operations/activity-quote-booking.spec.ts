import { describe, expect, it } from 'vitest';
import {
  activityBookingTitle,
  activityLinesFromQuoteItems,
  activityLinesMissingSupplier,
  activityServiceWindow,
} from './activity-quote-booking';

describe('activity-quote-booking', () => {
  it('filters activity/sightseeing lines with supplier + id', () => {
    const lines = activityLinesFromQuoteItems([
      { id: 'a1', serviceType: 'activity', details: { supplierId: 's1' } },
      { id: 'a2', serviceType: 'sightseeing', details: { supplierId: 's1' } },
      { id: 'a3', serviceType: 'activity', details: {} },
      { id: 'h1', serviceType: 'hotel', details: { supplierId: 's1' } },
    ]);
    expect(lines.map((l) => l.id)).toEqual(['a1', 'a2']);
  });

  it('lists activity lines missing supplier for accept warnings', () => {
    const missing = activityLinesMissingSupplier([
      {
        id: 'a3',
        serviceType: 'activity',
        description: 'Sunrise walk',
        details: {},
      },
      {
        id: 'a4',
        serviceType: 'sightseeing',
        details: {},
      },
      { id: 'a1', serviceType: 'activity', details: { supplierId: 's1' } },
    ]);
    expect(missing.map((l) => l.id)).toEqual(['a3', 'a4']);
  });

  it('builds title with private/SIC', () => {
    expect(
      activityBookingTitle({
        details: { activityName: 'Tiger Hill sunrise', privateOrSic: 'private' },
      }),
    ).toBe('Tiger Hill sunrise · PRIVATE');
  });

  it('parses service date window', () => {
    const w = activityServiceWindow({ serviceDate: '2026-10-06' });
    expect(w.startAt?.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(w.endAt?.toISOString()).toBe('2026-10-06T04:00:00.000Z');
  });
});
