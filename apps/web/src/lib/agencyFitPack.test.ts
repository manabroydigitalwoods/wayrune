import { describe, expect, it } from 'vitest';
import {
  agencyFitPackWalkthroughPath,
  formatAgencyFitPackDemoIncludes,
  formatAgencyFitPackToast,
  tripsEmptyShowInstallPack,
} from './agencyFitPack';

describe('formatAgencyFitPackToast', () => {
  it('summarises created templates and named demo trip', () => {
    expect(
      formatAgencyFitPackToast({
        created: { templates: ['a', 'b'], trips: ['t1'] },
        skipped: { templates: ['c'] },
        demoTrip: {
          tripId: 'tid',
          title: 'Darjeeling classic FIT — demo',
        },
      }),
    ).toBe(
      'Installed 2 templates + demo trip “Darjeeling classic FIT — demo” · 1 template(s) already present · Open demo trip',
    );
  });

  it('reports already installed with open cue', () => {
    expect(
      formatAgencyFitPackToast({
        skipped: { templates: ['a'], trips: ['t1'] },
        demoTrip: { tripId: 'tid', title: 'Darjeeling classic FIT — demo' },
      }),
    ).toBe(
      'Sample FIT pack already installed · Open “Darjeeling classic FIT — demo”',
    );
  });

  it('handles empty response', () => {
    expect(formatAgencyFitPackToast({})).toBe('No pack items installed');
  });
});

describe('formatAgencyFitPackDemoIncludes', () => {
  it('joins include bullets', () => {
    expect(
      formatAgencyFitPackDemoIncludes({
        tripId: 't',
        includes: ['Draft quote', 'Sample guest'],
      }),
    ).toBe('Draft quote · Sample guest');
    expect(formatAgencyFitPackDemoIncludes(null)).toBeNull();
  });
});

describe('agencyFitPackWalkthroughPath / tripsEmptyShowInstallPack', () => {
  it('prefers walkthroughHref then demoTrip.tripId', () => {
    expect(
      agencyFitPackWalkthroughPath({
        walkthroughHref: '/trips/t1?tab=quotations',
      }),
    ).toBe('/trips/t1?tab=quotations');
    expect(
      agencyFitPackWalkthroughPath({
        demoTrip: { tripId: 't2' },
      }),
    ).toBe('/trips/t2?tab=quotations');
    expect(agencyFitPackWalkthroughPath({})).toBeNull();
  });

  it('shows install only on planning empty with no templates', () => {
    expect(tripsEmptyShowInstallPack({ templateCount: 0 })).toBe(true);
    expect(tripsEmptyShowInstallPack({ templateCount: 2 })).toBe(false);
    expect(
      tripsEmptyShowInstallPack({ opsMode: true, templateCount: 0 }),
    ).toBe(false);
    expect(
      tripsEmptyShowInstallPack({
        templateCount: 0,
        templatesLoading: true,
      }),
    ).toBe(false);
  });
});
