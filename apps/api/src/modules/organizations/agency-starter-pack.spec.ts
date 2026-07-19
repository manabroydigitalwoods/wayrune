import { describe, expect, it } from 'vitest';
import {
  DEMO_TRIP_SPEC,
  demoTripDateRange,
  FIT_TEMPLATE_SPECS,
  FIT_TEMPLATES_PACK_ID,
  listStarterPackCatalog,
  resolveStarterPackTemplates,
  summarizeStarterPackInstall,
} from './agency-starter-pack';

describe('agency starter pack', () => {
  it('catalogues the FIT templates pack with demo trip', () => {
    const catalog = listStarterPackCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe(FIT_TEMPLATES_PACK_ID);
    expect(catalog[0]?.creates.quoteTemplates).toEqual(
      FIT_TEMPLATE_SPECS.map((s) => s.name),
    );
    expect(catalog[0]?.creates.demoTrips).toEqual([DEMO_TRIP_SPEC.tripNumber]);
  });

  it('resolves priced Darjeeling and Goa templates', () => {
    const specs = resolveStarterPackTemplates(FIT_TEMPLATES_PACK_ID);
    expect(specs).toHaveLength(2);
    expect(specs?.[0]?.name).toMatch(/Darjeeling/i);
    expect(Array.isArray((specs?.[0]?.contentJson.items as unknown[]) || [])).toBe(
      true,
    );
    expect(((specs?.[0]?.contentJson.items as unknown[]) || []).length).toBeGreaterThan(
      0,
    );
    expect(resolveStarterPackTemplates('unknown')).toBeNull();
  });

  it('computes demo trip dates from today', () => {
    const { startDate, endDate } = demoTripDateRange(
      DEMO_TRIP_SPEC,
      new Date(2026, 6, 19),
    );
    expect(startDate).toBe('2026-09-02');
    expect(endDate).toBe('2026-09-07');
  });

  it('summarises install results including trips', () => {
    expect(
      summarizeStarterPackInstall({
        createdNames: ['Darjeeling classic FIT'],
        skippedNames: ['Goa beach FIT'],
        createdTrips: ['TRP-DEMO-01'],
        skippedTrips: [],
      }),
    ).toEqual({
      installed: true,
      created: {
        templates: ['Darjeeling classic FIT'],
        trips: ['TRP-DEMO-01'],
      },
      skipped: { templates: ['Goa beach FIT'], trips: [] },
    });

    expect(
      summarizeStarterPackInstall({
        createdNames: [],
        skippedNames: ['Darjeeling classic FIT'],
        createdTrips: [],
        skippedTrips: ['TRP-DEMO-01'],
      }),
    ).toEqual({
      installed: false,
      created: { templates: [], trips: [] },
      skipped: {
        templates: ['Darjeeling classic FIT'],
        trips: ['TRP-DEMO-01'],
      },
    });
  });
});
