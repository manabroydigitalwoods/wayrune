import { describe, expect, it } from 'vitest';
import { AGENCY_ROUTES, isAgencyNavActive } from './agencyRoutes';

const tripPath = '/10001/trips/cmrkdvs6z0079vjvntfdyng9t';

describe('isAgencyNavActive — trip workspace tabs', () => {
  it('highlights only Quotations for ?tab=quotations', () => {
    const search = '?tab=quotations';
    expect(isAgencyNavActive(AGENCY_ROUTES.workQuotations, tripPath, search)).toBe(true);
    expect(isAgencyNavActive(AGENCY_ROUTES.trips, tripPath, search)).toBe(false);
    expect(isAgencyNavActive(AGENCY_ROUTES.operations, tripPath, search)).toBe(false);
    expect(isAgencyNavActive(AGENCY_ROUTES.finance, tripPath, search)).toBe(false);
  });

  it('highlights only Operations for ?tab=operations', () => {
    const search = '?tab=operations';
    expect(isAgencyNavActive(AGENCY_ROUTES.operations, tripPath, search)).toBe(true);
    expect(isAgencyNavActive(AGENCY_ROUTES.trips, tripPath, search)).toBe(false);
    expect(isAgencyNavActive(AGENCY_ROUTES.workQuotations, tripPath, search)).toBe(false);
    expect(isAgencyNavActive(AGENCY_ROUTES.finance, tripPath, search)).toBe(false);
  });

  it('highlights only Finance for ?tab=finance', () => {
    const search = '?tab=finance';
    expect(isAgencyNavActive(AGENCY_ROUTES.finance, tripPath, search)).toBe(true);
    expect(isAgencyNavActive(AGENCY_ROUTES.trips, tripPath, search)).toBe(false);
    expect(isAgencyNavActive(AGENCY_ROUTES.operations, tripPath, search)).toBe(false);
  });

  it('highlights only Trips for overview / itinerary / no tab', () => {
    for (const search of ['', '?tab=overview', '?tab=itinerary', '?tab=travellers']) {
      expect(isAgencyNavActive(AGENCY_ROUTES.trips, tripPath, search)).toBe(true);
      expect(isAgencyNavActive(AGENCY_ROUTES.workQuotations, tripPath, search)).toBe(false);
      expect(isAgencyNavActive(AGENCY_ROUTES.operations, tripPath, search)).toBe(false);
      expect(isAgencyNavActive(AGENCY_ROUTES.finance, tripPath, search)).toBe(false);
    }
  });
});
