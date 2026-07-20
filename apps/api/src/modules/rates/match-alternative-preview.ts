/**
 * Cheap Match-alternative buy previews (est. stay / line buy).
 * Prefers real Match helpers for pax-split, multi-cab, and child extras
 * (age×nationality columns + cross-tip nationality pick) when inputs allow.
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
  composeMultiVehicleTransferSplit,
  multiVehicleSplitTotalBuy,
  parseTransferSeatMatrix,
  pickTransferSeatMatrixRow,
  resolveTransferVehicleUnitCost,
} from './transfer-seat-matrix';
import {
  applyPerVehicleChildExtras,
  parseTransferPartyBands,
} from './transfer-party-bands';
import {
  blendedActivityUnitCost,
  classifyActivityPax,
} from './activity-rate-match';
import {
  tryHotelPaxBuySplit,
  type HotelPaxBuySplitTip,
} from './hotel-pax-buy-split';
import { sumChildExtrasByAgeNationality } from './child-age-nationality-rates';
import {
  sumChildExtrasByNationality,
  type ChildOccupancyRatePick,
} from './child-nationality-extras';
import { guestNationalitiesAreMixed } from './hotel-nationality';

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
  /** Child market codes (aligned with billable children when mixed). */
  childNationalities?: Array<string | null | undefined>;
  /**
   * Cross-tip child occupancy pick (exact → INTL via caller filters).
   * Used when tip has no age×nationality columns.
   */
  pickChildPricing?: (nationality: string) => ChildOccupancyRatePick | null;
  /** Mixed-nationality guest codes — enables per-pax split when splitTips present. */
  guestCodes?: Array<string | null | undefined>;
  /** Same room/meal tip pool Match uses for tryHotelPaxBuySplit. */
  splitTips?: HotelPaxBuySplitTip[];
  pickBestTip?: (pool: HotelPaxBuySplitTip[]) => HotelPaxBuySplitTip | undefined;
};

/**
 * Est. stay buy for one hotel chart tip: band/pax-split stay + occupancy extras
 * (flat → age×nat columns → cross-tip nationality) + gala.
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
  const nights = Math.max(1, input.stayNights.length);

  let baseTotal: number | null = null;
  let occPricingForExtras = occupancy;
  if (
    input.guestCodes?.length &&
    input.splitTips?.length &&
    input.pickBestTip
  ) {
    const split = tryHotelPaxBuySplit({
      guestCodes: input.guestCodes,
      adults: input.adults,
      children: input.children,
      rooms,
      stayDates: input.stayNights,
      candidatePool: input.splitTips,
      pickBest: input.pickBestTip,
    });
    if (split) {
      baseTotal = split.totalBuy;
      occPricingForExtras = occupancy
        ? { ...occupancy, baseAdults: split.bandAdults }
        : { baseAdults: split.bandAdults, baseChildren: 0 };
    }
  }

  if (baseTotal == null) {
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
    baseTotal = base.totalBuy;
    if (adultBand) {
      occPricingForExtras = occupancy
        ? { ...occupancy, baseAdults: adultBand.adults }
        : { baseAdults: adultBand.adults, baseChildren: 0 };
    }
  }

  const withExtras = applyOccupancyPricing(baseTotal, occPricingForExtras, {
    rooms,
    nights,
    adults: pax.adults,
    children: pax.children,
    childrenWithoutBed: input.childrenWithoutBed,
  });

  let occFinal = withExtras;
  const billableChildren =
    withExtras.childWithBedCount + withExtras.childWithoutBedCount;
  const ageNatRates = occPricingForExtras?.childAgeNationalityRates ?? [];
  if (ageNatRates.length > 0 && pax.children > 0 && billableChildren > 0) {
    const agePart = sumChildExtrasByAgeNationality({
      nights,
      billableChildren,
      childrenWithoutBed: withExtras.childWithoutBedCount,
      childAges: input.childAges,
      childNationalities: input.childNationalities,
      rates: ageNatRates,
      flatWithBed: occPricingForExtras?.childWithBedPerNight ?? null,
      flatWithoutBed: occPricingForExtras?.childWithoutBedPerNight ?? null,
    });
    if (agePart) {
      const occupancyExtraTotal = round2(
        withExtras.extraAdultTotal + agePart.occupancyExtraTotal,
      );
      occFinal = {
        ...withExtras,
        childWithBedCount: agePart.childWithBedCount,
        childWithoutBedCount: agePart.childWithoutBedCount,
        childWithBedTotal: agePart.childWithBedTotal,
        childWithoutBedTotal: agePart.childWithoutBedTotal,
        occupancyExtraTotal,
        totalBuy: round2(withExtras.baseTotal + occupancyExtraTotal),
      };
    }
  } else if (
    input.pickChildPricing &&
    guestNationalitiesAreMixed(input.childNationalities) &&
    pax.children > 0 &&
    billableChildren > 0
  ) {
    const childPart = sumChildExtrasByNationality({
      nights,
      billableChildren,
      childrenWithoutBed: withExtras.childWithoutBedCount,
      childNationalities: input.childNationalities,
      pickPricing: input.pickChildPricing,
    });
    if (childPart) {
      const occupancyExtraTotal = round2(
        withExtras.extraAdultTotal + childPart.occupancyExtraTotal,
      );
      occFinal = {
        ...withExtras,
        childWithBedCount: childPart.childWithBedCount,
        childWithoutBedCount: childPart.childWithoutBedCount,
        childWithBedTotal: childPart.childWithBedTotal,
        childWithoutBedTotal: childPart.childWithoutBedTotal,
        occupancyExtraTotal,
        totalBuy: round2(withExtras.baseTotal + occupancyExtraTotal),
      };
    }
  }

  const gala = applyDateSupplements(
    occFinal.totalBuy,
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

/**
 * Est. line buy for one transfer chart.
 * Per-vehicle: capacity bump + multi-cab split + explicit child/infant add-ons
 * (parity with Match stamp; factor-derived child costs ignored on per_vehicle).
 */
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
  const seats =
    input.vehicleSeats != null &&
    Number.isFinite(Number(input.vehicleSeats)) &&
    Number(input.vehicleSeats) > 0
      ? Math.round(Number(input.vehicleSeats))
      : null;
  const minVehicles =
    seats != null && party > 0 ? Math.max(1, Math.ceil(party / seats)) : 1;
  const vehiclesForSplit = Math.max(vehicles, minVehicles);
  const seatMatrix = parseTransferSeatMatrix(input.pricingJson);
  const partyBands = parseTransferPartyBands(input.pricingJson);
  const resolveUnit = (seatsNeeded: number) =>
    resolveTransferVehicleUnitCost({
      seatsNeeded,
      seatMatrix,
      partyBands,
      chartUnitCost: chart,
    }).unitCost;

  const multiSplit =
    seats != null
      ? composeMultiVehicleTransferSplit({
          party,
          seatsPerVehicle: seats,
          vehicles: vehiclesForSplit,
          resolveUnitCost: resolveUnit,
        })
      : null;

  const seatsNeededForExtras =
    party > 0 ? party : seats != null ? seats : party;
  const pickedMatrix = pickTransferSeatMatrixRow({
    rows: seatMatrix,
    seatsNeeded: seatsNeededForExtras > 0 ? seatsNeededForExtras : 1,
  });
  const childUnitForExtras =
    pickedMatrix?.childAddOn != null
      ? pickedMatrix.childAddOn
      : input.childUnitCost != null && Number.isFinite(Number(input.childUnitCost))
        ? Number(input.childUnitCost)
        : null;
  const infantUnitForExtras =
    pickedMatrix?.infantAddOn != null
      ? pickedMatrix.infantAddOn
      : input.infantUnitCost != null &&
          Number.isFinite(Number(input.infantUnitCost))
        ? Number(input.infantUnitCost)
        : null;

  if (multiSplit) {
    const cabTotal = multiVehicleSplitTotalBuy(multiSplit);
    const avgCab = round2(cabTotal / multiSplit.vehicles);
    const extras = applyPerVehicleChildExtras({
      vehicleUnitCost: avgCab,
      childUnitCost: childUnitForExtras,
      infantUnitCost: infantUnitForExtras,
      childHeads: children,
      infantHeads: infants,
    });
    return round2(cabTotal + extras.childExtras + extras.infantExtras);
  }

  const seatsNeeded =
    party > 0 ? party : seats != null ? seats : party;
  const resolved = resolveUnit(
    seatsNeeded > 0 ? seatsNeeded : seats != null ? seats : 1,
  );
  const extras = applyPerVehicleChildExtras({
    vehicleUnitCost: resolved,
    childUnitCost: childUnitForExtras,
    infantUnitCost: infantUnitForExtras,
    childHeads: children,
    infantHeads: infants,
  });
  return round2(extras.unitCost * vehiclesForSplit);
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
