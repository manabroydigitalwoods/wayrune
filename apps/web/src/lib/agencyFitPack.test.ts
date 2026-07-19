import { describe, expect, it } from 'vitest';
import {
  agencyFitPackWalkthroughPath,
  formatAgencyFitPackToast,
  tripsEmptyShowInstallPack,
} from './agencyFitPack';

describe('formatAgencyFitPackToast', () => {
  it('summarises created templates and trips', () => {
    expect(
      formatAgencyFitPackToast({
        created: { templates: ['a', 'b'], trips: ['t1'] },
        skipped: { templates: ['c'] },
      }),
    ).toBe('Installed 2 templates + 1 demo trip · 1 template(s) already present');
  });

  it('reports already installed when only skipped', () => {
    expect(
      formatAgencyFitPackToast({
        skipped: { templates: ['a'], trips: ['t1'] },
      }),
    ).toBe('Sample FIT pack already installed');
  });

  it('handles empty response', () => {
    expect(formatAgencyFitPackToast({})).toBe('No pack items installed');
  });
});

describe('agencyFitPackWalkthroughPath / tripsEmptyShowInstallPack', () => {
  it('prefers walkthroughHref then tripId', () => {
    expect(
      agencyFitPackWalkthroughPath({
        walkthroughHref: '/trips/t1?tab=quotations',
      }),
    ).toBe('/trips/t1?tab=quotations');
    expect(agencyFitPackWalkthroughPath({ tripId: 't2' })).toBe(
      '/trips/t2?tab=quotations',
    );
    expect(agencyFitPackWalkthroughPath({})).toBeNull();
  });

  it('shows install only on planning empty with no templates', () => {
    expect(
      tripsEmptyShowInstallPack({ templateCount: 0 }),
    ).toBe(true);
    expect(
      tripsEmptyShowInstallPack({ templateCount: 2 }),
    ).toBe(false);
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
