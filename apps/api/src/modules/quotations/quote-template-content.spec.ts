import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildItineraryDaysFromHotelItems,
  checklistToText,
  contentFromVersionFields,
  isoDayDiff,
  normalizeTemplateFolder,
  normalizeTemplateTags,
  parseIsoDay,
  parseQuoteTemplateContent,
  reanchorItineraryDaysToTripStart,
  remintQuoteItems,
  remintTemplateItineraryDays,
  resolveApplyPax,
  resolveTemplateApplyTravelStart,
  shiftQuoteItemsToTripStart,
  stampApplyPaxOntoQuoteItems,
  templateItemsAnchorDay,
  templateItineraryDays,
} from './quote-template-content';

describe('quote-template-content', () => {
  it('joins legacy checklist arrays', () => {
    expect(checklistToText(['Stay', 'Breakfast'])).toBe('Stay\nBreakfast');
    expect(checklistToText('Stay\nBreakfast')).toBe('Stay\nBreakfast');
    expect(checklistToText([])).toBeNull();
  });

  it('parses seed-style template content', () => {
    const content = parseQuoteTemplateContent({
      inclusions: ['Stay', 'Breakfast', 'Airport transfer'],
      exclusions: ['Flights', 'Personal expenses'],
    });
    expect(checklistToText(content.inclusions)).toContain('Airport transfer');
    expect(checklistToText(content.exclusions)).toContain('Flights');
  });

  it('normalizes template tags', () => {
    expect(normalizeTemplateTags(['hill', ' Hill ', 'family', ''])).toEqual([
      'hill',
      'family',
    ]);
    expect(normalizeTemplateTags('beach, honeymoon')).toEqual(['beach', 'honeymoon']);
    expect(normalizeTemplateTags([])).toBeUndefined();
    expect(
      parseQuoteTemplateContent({ tags: ['hill', 'hill', 'family'] }).tags,
    ).toEqual(['hill', 'family']);
  });

  it('normalizes template folder', () => {
    expect(normalizeTemplateFolder('  Hill   stations ')).toBe('Hill stations');
    expect(normalizeTemplateFolder(' Hill stations / Darjeeling / ')).toBe(
      'Hill stations/Darjeeling',
    );
    expect(normalizeTemplateFolder('')).toBeUndefined();
    expect(parseQuoteTemplateContent({ folder: ' Beach ' }).folder).toBe('Beach');
  });

  it('remints item ids', () => {
    const items = remintQuoteItems([
      {
        id: 'old-1',
        description: 'Hotel',
        quantity: 2,
        unitCost: 1000,
        unitSell: 1200,
        taxPercent: 5,
        pricingUnit: 'per_room',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).not.toBe('old-1');
    expect(items[0].description).toBe('Hotel');
  });

  it('builds content from a quotation version', () => {
    const content = contentFromVersionFields({
      currency: 'INR',
      itemsJson: [
        {
          id: 'line-1',
          description: 'Transfer',
          quantity: 1,
          unitCost: 500,
          unitSell: 800,
          taxPercent: 0,
          pricingUnit: 'per_service',
        },
      ],
      inclusions: 'Stay',
      exclusions: 'Flights',
      terms: 'Pay 50% to confirm',
    });
    expect(content.items).toHaveLength(1);
    expect(content.inclusions).toBe('Stay');
  });

  it('parses ISO days and diffs', () => {
    expect(parseIsoDay('2026-10-05T12:00:00.000Z')).toBe('2026-10-05');
    expect(parseIsoDay('check-in 2pm')).toBeNull();
    expect(addDaysIso('2026-10-05', 3)).toBe('2026-10-08');
    expect(isoDayDiff('2026-10-05', '2026-11-12')).toBe(38);
  });

  it('shifts template stay/service dates onto trip start and clears rate snapshots', () => {
    const items = remintQuoteItems([
      {
        id: 'h1',
        description: 'Hotel',
        quantity: 3,
        unitCost: 4500,
        unitSell: 5400,
        taxPercent: 5,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        rateId: 'rate-old',
        rateProvenance: { rateId: 'rate-old', matchedAt: '2026-01-01T00:00:00.000Z' },
        details: {
          checkIn: '2026-10-05',
          checkOut: '2026-10-08',
          nights: 3,
        },
      },
      {
        id: 't1',
        description: 'Transfer',
        quantity: 1,
        unitCost: 4000,
        unitSell: 4800,
        taxPercent: 5,
        pricingUnit: 'per_service',
        serviceType: 'transfer',
        details: { serviceDate: '2026-10-05' },
      },
      {
        id: 'a1',
        description: 'Activity',
        quantity: 2,
        unitCost: 900,
        unitSell: 1200,
        taxPercent: 5,
        pricingUnit: 'per_person',
        serviceType: 'activity',
        details: { activityDate: '2026-10-06' },
      },
    ]);

    expect(templateItemsAnchorDay(items)).toBe('2026-10-05');

    const { items: shifted, shiftDays } = shiftQuoteItemsToTripStart(
      items,
      '2026-11-12',
    );
    expect(shiftDays).toBe(38);
    expect(shifted[0].details?.checkIn).toBe('2026-11-12');
    expect(shifted[0].details?.checkOut).toBe('2026-11-15');
    expect(shifted[0].rateId).toBeUndefined();
    expect(shifted[0].rateProvenance).toBeUndefined();
    expect(shifted[0].unitCost).toBeNull();
    expect(shifted[0].unitSell).toBeNull();
    expect(shifted[1].details?.serviceDate).toBe('2026-11-12');
    expect(shifted[2].details?.activityDate).toBe('2026-11-13');
  });

  it('preserves per-line childAges when shifting dates', () => {
    const reminted = remintQuoteItems([
      {
        id: 'h1',
        description: 'Hotel',
        quantity: 1,
        unitCost: 1000,
        unitSell: 1200,
        taxPercent: 0,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        rateId: 'r1',
        details: {
          checkIn: '2026-10-05',
          checkOut: '2026-10-07',
          adults: 2,
          children: 2,
          childAges: [5, 14],
        },
      },
      {
        id: 't1',
        description: 'Transfer',
        quantity: 1,
        unitCost: 4000,
        unitSell: 4800,
        taxPercent: 0,
        pricingUnit: 'per_service',
        serviceType: 'transfer',
        details: {
          serviceDate: '2026-10-05',
          adults: 2,
          children: 1,
          childAges: [8],
        },
      },
    ]);
    const { items } = shiftQuoteItemsToTripStart(reminted, '2026-11-12');
    expect(items[0]?.details?.childAges).toEqual([5, 14]);
    expect(items[1]?.details?.childAges).toEqual([8]);
    expect(items[0]?.unitCost).toBeNull();
  });

  it('clears stale prices when trip has no start date or template has no ISO service days', () => {
    const bare = remintQuoteItems([
      {
        id: 'x',
        description: 'Manual line',
        quantity: 1,
        unitCost: 100,
        unitSell: 120,
        taxPercent: 0,
        pricingUnit: 'per_service',
        details: { nights: 2 },
      },
    ]);
    const noAnchor = shiftQuoteItemsToTripStart(bare, '2026-11-12');
    expect(noAnchor.shiftDays).toBe(0);
    expect(noAnchor.items[0]?.unitCost).toBeNull();
    expect(noAnchor.items[0]?.unitSell).toBeNull();
    const noStart = shiftQuoteItemsToTripStart(bare, null);
    expect(noStart.shiftDays).toBe(0);
    expect(noStart.items[0]?.unitCost).toBeNull();
  });

  it('reanchors itinerary days onto trip start by dayNumber', () => {
    const { days, changed } = reanchorItineraryDaysToTripStart(
      [
        { id: 'd1', dayNumber: 1, date: '2026-10-05', title: 'Arrive' },
        { id: 'd2', dayNumber: 2, date: '2026-10-06', title: 'Explore' },
        { id: 'd3', dayNumber: 3, date: null, title: 'Depart' },
      ],
      '2026-11-12',
    );
    expect(changed).toBe(true);
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });

  it('itinerary reanchor no-ops when empty or already aligned', () => {
    expect(reanchorItineraryDaysToTripStart([], '2026-11-12').changed).toBe(false);
    expect(
      reanchorItineraryDaysToTripStart(
        [{ dayNumber: 1, date: '2026-11-12' }],
        '2026-11-12',
      ).changed,
    ).toBe(false);
    expect(
      reanchorItineraryDaysToTripStart(
        [{ dayNumber: 1, date: '2026-10-01' }],
        null,
      ).changed,
    ).toBe(false);
  });

  it('remints template itinerary day and item ids', () => {
    const days = remintTemplateItineraryDays([
      {
        id: 'day-old',
        dayNumber: 1,
        title: 'Arrive',
        items: [{ id: 'item-old', type: 'note', title: 'Welcome' }],
      },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].id).not.toBe('day-old');
    expect((days[0].items as Array<{ id: string }>)[0].id).not.toBe('item-old');
    expect(days[0].title).toBe('Arrive');
  });

  it('parses embedded itinerary on template content', () => {
    const content = parseQuoteTemplateContent({
      currency: 'INR',
      itinerary: {
        days: [{ id: 'd1', dayNumber: 1, title: 'Arrive', items: [] }],
        story: { headline: 'Himalayas' },
      },
    });
    expect(content.itinerary?.days).toHaveLength(1);
    expect(content.itinerary?.story?.headline).toBe('Himalayas');
  });

  it('reads template itinerary days softly', () => {
    expect(
      templateItineraryDays({
        days: [{ id: 'd1', dayNumber: 1 }, null as unknown as Record<string, unknown>],
      }),
    ).toHaveLength(1);
    expect(templateItineraryDays(undefined)).toEqual([]);
  });

  it('builds story days from hotel check-in/out spans', () => {
    const days = buildItineraryDaysFromHotelItems([
      {
        id: 'h1',
        description: 'Heritage Deluxe',
        quantity: 2,
        unitCost: 4000,
        unitSell: 5000,
        taxPercent: 5,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        details: {
          propertyName: 'Heritage Lodge',
          checkIn: '2026-10-05',
          checkOut: '2026-10-08',
        },
      },
      {
        id: 't1',
        description: 'Transfer',
        quantity: 1,
        unitCost: 1000,
        unitSell: 1200,
        taxPercent: 0,
        pricingUnit: 'per_service',
        serviceType: 'transfer',
        details: { serviceDate: '2026-10-05' },
      },
    ]);
    expect(days).toHaveLength(4); // 5→8 inclusive
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
    expect(days[0].title).toContain('Heritage Lodge');
    expect((days[0].items as unknown[]).length).toBe(1);
    expect(days[3].title).toBe('Departure');
    expect((days[3].items as unknown[]).length).toBe(0);
  });

  it('derives checkOut from nights when missing', () => {
    const days = buildItineraryDaysFromHotelItems([
      {
        id: 'h1',
        description: 'Beach villa',
        quantity: 1,
        unitCost: 3000,
        unitSell: 3600,
        taxPercent: 5,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        details: { checkIn: '2026-11-01', nights: 2 },
      },
    ]);
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });

  it('returns empty when no hotel stay dates', () => {
    expect(
      buildItineraryDaysFromHotelItems([
        {
          id: 'x',
          description: 'Manual',
          quantity: 1,
          unitCost: 1,
          unitSell: 1,
          taxPercent: 0,
          pricingUnit: 'per_service',
        },
      ]),
    ).toEqual([]);
  });

  it('resolves template apply travel start (request stamps, trip fallback, or error)', () => {
    expect(
      resolveTemplateApplyTravelStart({
        tripStartDate: null,
        requestedStartDate: '2026-12-01',
      }),
    ).toEqual({ isoDay: '2026-12-01', shouldStampTrip: true });

    expect(
      resolveTemplateApplyTravelStart({
        tripStartDate: '2026-11-01',
        requestedStartDate: '2026-12-01',
      }),
    ).toEqual({ isoDay: '2026-12-01', shouldStampTrip: true });

    expect(
      resolveTemplateApplyTravelStart({
        tripStartDate: '2026-11-01',
        requestedStartDate: '2026-11-01',
      }),
    ).toEqual({ isoDay: '2026-11-01', shouldStampTrip: false });

    expect(
      resolveTemplateApplyTravelStart({
        tripStartDate: '2026-11-01',
      }),
    ).toEqual({ isoDay: '2026-11-01', shouldStampTrip: false });

    expect(() =>
      resolveTemplateApplyTravelStart({ tripStartDate: null }),
    ).toThrow(/Travel start date is required/i);
  });

  it('resolves and stamps apply pax onto hotel/transfer/activity lines', () => {
    expect(resolveApplyPax({})).toBeNull();
    expect(resolveApplyPax({ adults: 3, children: 1 })).toEqual({
      adults: 3,
      children: 1,
      rooms: 2,
      childAges: [8],
    });
    expect(resolveApplyPax({ children: 2 })).toEqual({
      adults: 2,
      children: 2,
      rooms: 1,
      childAges: [8, 8],
    });
    expect(
      resolveApplyPax({
        adults: 2,
        children: 2,
        childAges: [5, 11, 99],
        childrenWithoutBed: 1,
      }),
    ).toEqual({
      adults: 2,
      children: 2,
      rooms: 1,
      childAges: [5, 11],
      childrenWithoutBed: 1,
    });
    expect(resolveApplyPax({ adults: 5, children: 0, rooms: 3 })).toEqual({
      adults: 5,
      children: 0,
      rooms: 3,
    });

    const reminted = remintQuoteItems([
      {
        id: 'h1',
        description: 'Hotel',
        quantity: 1,
        unitCost: 1000,
        unitSell: 1200,
        taxPercent: 0,
        pricingUnit: 'per_room',
        serviceType: 'hotel',
        details: { adults: 2, children: 0, childAges: [8], rooms: 1 },
      },
      {
        id: 't1',
        description: 'Transfer',
        quantity: 1,
        unitCost: 500,
        unitSell: 600,
        taxPercent: 0,
        pricingUnit: 'per_service',
        serviceType: 'transfer',
        details: { adults: 2, children: 0 },
      },
      {
        id: 'c1',
        description: 'Custom',
        quantity: 1,
        unitCost: 100,
        unitSell: 100,
        taxPercent: 0,
        pricingUnit: 'per_service',
        serviceType: 'custom',
      },
    ]);
    const { items, stampedCount } = stampApplyPaxOntoQuoteItems(reminted, {
      adults: 3,
      children: 0,
      rooms: 2,
    });
    expect(stampedCount).toBe(2);
    expect(items[0]?.details?.adults).toBe(3);
    expect(items[0]?.details?.children).toBe(0);
    expect(items[0]?.details?.rooms).toBe(2);
    expect(items[0]?.details?.childAges).toBeUndefined();
    expect(items[1]?.details?.adults).toBe(3);
    expect(items[1]?.details?.rooms).toBeUndefined();
    expect(items[2]?.details?.adults).toBeUndefined();

    const withAges = stampApplyPaxOntoQuoteItems(reminted, {
      adults: 2,
      children: 2,
      rooms: 1,
      childAges: [6, 9],
      childrenWithoutBed: 1,
    });
    expect(withAges.items[0]?.details?.childAges).toEqual([6, 9]);
    expect(withAges.items[0]?.details?.childrenWithoutBed).toBe(1);
    expect(withAges.items[0]?.details?.rooms).toBe(1);
  });
});
