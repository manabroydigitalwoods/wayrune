/**
 * Cheap Match-alternative buy previews (est. stay / line buy).
 * Single-tip only — no pax-split / cross-tip child / multi-cab re-resolve.
 */

import { hotelStayCalculation } from './rate-resolve-guards';
import {
  applyOccupancyPricing,
  classifyHotelOccupancyPax,
  parseOccupancyPricing,
  pickAdultBand,
} from './occupancy-pricing';
import {
  applyDateSupplements,
  parseDateSupplements,
} from './date-supplements';
import {
  parseTransferSeatMatrix,
  resolveTransferVehicleUnitCost,
} from './transfer-seat-matrix';
import { parseTransferPartyBands } from './transfer-party-bands';
import {
  blendedActivityUnitCost,
  classifyActivityPax,
} from './activity-rate-match';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type HotelStayPreviewInput = {
  unitCost: number;
  weekendUnitCost?: number | null;
  occupancyPricingJson?: unknown;
  stayNights: Date[];
  stayNightIsos: string[];
  rooms: number;
  adults: number;
  children: number;
  childrenWithoutBed?: number;
  childAges?: number[];
};

/**
 * Est. stay buy for one hotel chart tip: band stay + flat occupancy extras + gala.
 * Returns null when stay nights are missing.
 */
export function previewHotelStayBuy(input: HotelStayPreviewInput): number | null {
  if (!input.stayNights.length) return null;
  const rooms = Math.max(1, Math.floor(input.rooms) || 1);
  const occupancy = parseOccupancyPricing(input.occupancyPricingJson);
  const pax = classifyHotelOccupancyPax({
    adults: input.adults,
    children: input.children,
    childAges: input.childAges,
    childAgeMax: occupancy?.childAgeMax,
  });
  const chartUnit = Number(input.unitCost) || 0;
  const chartWeekend =
    input.weekendUnitCost != null && Number.isFinite(Number(input.weekendUnitCost))
      ? Number(input.weekendUnitCost)
      : null;
  const adultBand = pickAdultBand({
    bands: occupancy?.adultBands ?? [],
    adults: pax.adults,
    rooms,
    chartUnitCost: chartUnit,
    chartWeekendUnitCost: chartWeekend,
  });
  const rateForStay = adultBand
    ? {
        unitCost: adultBand.unitCostPerNight,
        weekendUnitCost: adultBand.weekendUnitCostPerNight,
      }
    : {
        unitCost: chartUnit,
        weekendUnitCost: chartWeekend,
      };
  const base = hotelStayCalculation(rateForStay, input.stayNights, rooms);
  const withExtras = applyOccupancyPricing(base.totalBuy, occupancy, {
    rooms,
    nights: Math.max(1, input.stayNights.length),
    adults: pax.adults,
    children: pax.children,
    childrenWithoutBed: input.childrenWithoutBed,
  });
  const gala = applyDateSupplements(
    withExtras.totalBuy,
    parseDateSupplements(input.occupancyPricingJson),
    input.stayNightIsos,
    rooms,
  );
  return round2(gala.totalBuy);
}

export type TransferLinePreviewInput = {
  unitCost: number;
  childUnitCost?: number | null;
  infantUnitCost?: number | null;
  pricingMode?: string | null;
  pricingJson?: unknown;
  vehicleSeats?: number | null;
  adults: number;
  children: number;
  infants?: number;
  vehicles: number;
  childFareFactor?: number;
  infantFareFactor?: number;
};

/** Est. line buy for one transfer chart (single cab / flat per-adult). */
export function previewTransferLineBuy(
  input: TransferLinePreviewInput,
): number | null {
  const adults = Math.max(0, Math.round(input.adults));
  const children = Math.max(0, Math.round(input.children));
  const infants = Math.max(0, Math.round(input.infants ?? 0));
  const vehicles = Math.max(1, Math.round(input.vehicles) || 1);
  const mode = (input.pricingMode || 'per_vehicle').trim() || 'per_vehicle';
  const chart = Number(input.unitCost);
  if (!Number.isFinite(chart)) return null;

  if (mode === 'per_adult') {
    const childFactor =
      input.childFareFactor != null && Number.isFinite(input.childFareFactor)
        ? input.childFareFactor
        : 0.7;
    const infantFactor =
      input.infantFareFactor != null && Number.isFinite(input.infantFareFactor)
        ? input.infantFareFactor
        : 0;
    const child =
      input.childUnitCost != null && Number.isFinite(Number(input.childUnitCost))
        ? Number(input.childUnitCost)
        : round2(chart * childFactor);
    const infant =
      input.infantUnitCost != null && Number.isFinite(Number(input.infantUnitCost))
        ? Number(input.infantUnitCost)
        : round2(chart * infantFactor);
    const heads = adults + children + infants;
    if (heads <= 0) return round2(chart);
    return round2(adults * chart + children * child + infants * infant);
  }

  const party = adults + children;
  const seats = input.vehicleSeats;
  const seatsNeeded =
    party > 0
      ? party
      : seats != null && seats > 0
        ? seats
        : party;
  const resolved = resolveTransferVehicleUnitCost({
    seatsNeeded,
    seatMatrix: parseTransferSeatMatrix(input.pricingJson),
    partyBands: parseTransferPartyBands(input.pricingJson),
    chartUnitCost: chart,
  });
  return round2(resolved.unitCost * vehicles);
}

export type ActivityLinePreviewInput = {
  adultUnitCost: number;
  childUnitCost?: number | null;
  childAgeMin?: number | null;
  childAgeMax?: number | null;
  adults: number;
  children: number;
  childAges?: number[];
};

/** Est. line buy for one activity chart tip. */
export function previewActivityLineBuy(
  input: ActivityLinePreviewInput,
): number | null {
  const adult = Number(input.adultUnitCost);
  if (!Number.isFinite(adult)) return null;
  const pax = classifyActivityPax({
    adults: input.adults,
    children: input.children,
    childAges: input.childAges,
    childAgeMin: input.childAgeMin,
    childAgeMax: input.childAgeMax,
  });
  return blendedActivityUnitCost({
    adultUnitCost: adult,
    childUnitCost: input.childUnitCost,
    adults: pax.adultHeads,
    children: pax.childHeads,
  }).totalBuy;
}
