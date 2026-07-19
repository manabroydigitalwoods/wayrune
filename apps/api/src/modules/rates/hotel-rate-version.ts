/** Plan hotel rate new-version / history chain (thin rate-version OS). */

import {
  orderRateVersionChain,
  planRateNewVersion,
  rateVersionLabel,
  type RateNewVersionPlan,
  type RateVersionRef,
} from './rate-version-chain';

export type HotelRateVersionRef = RateVersionRef & {
  unitCost?: number | string;
  mealPlan?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  updatedAt?: string | Date | null;
  weekendUnitCost?: number | string | null;
  roomType?: string | null;
  occupancyPricingJson?: unknown;
};

export type HotelRateNewVersionPlan = RateNewVersionPlan;

export function planHotelRateNewVersion(source: {
  id: string;
  versionNumber: number;
}): HotelRateNewVersionPlan {
  return planRateNewVersion(source);
}

export function orderHotelRateVersionChain(
  tip: HotelRateVersionRef,
  byId: Map<string, HotelRateVersionRef>,
): HotelRateVersionRef[] {
  return orderRateVersionChain(tip, byId);
}

export function hotelRateVersionLabel(versionNumber: number): string {
  return rateVersionLabel(versionNumber);
}
