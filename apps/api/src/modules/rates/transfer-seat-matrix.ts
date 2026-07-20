/**
 * TransferFare optional seat matrix (beyond partyBands) + multi-vehicle party split.
 */

import {
  pickTransferPartyBand,
  type TransferPartyBand,
} from './transfer-party-bands';

/** Max seat-matrix rows kept on parse / contract. */
export const TRANSFER_SEAT_MATRIX_MAX = 8;

export type TransferSeatMatrixRow = {
  /** Vehicle / cab seat capacity for this tier (1–20). */
  seats: number;
  unitCost: number;
  childAddOn?: number;
  infantAddOn?: number;
};

export type MultiVehicleSplit = {
  vehicles: number;
  seatsPerVehicle: number;
  partyPerVehicle: number[];
  unitCosts: number[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseTransferSeatMatrix(raw: unknown): TransferSeatMatrixRow[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const rows = (raw as { seatMatrix?: unknown }).seatMatrix;
  if (!Array.isArray(rows)) return [];
  const out: TransferSeatMatrixRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const seats = Math.round(Number(r.seats ?? r.partySize));
    const unitCost = Number(r.unitCost);
    if (
      !Number.isFinite(seats) ||
      seats < 1 ||
      seats > 20 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      continue;
    }
    const childRaw = r.childAddOn ?? r.childUnitCost;
    const infantRaw = r.infantAddOn ?? r.infantUnitCost;
    const childAddOn =
      childRaw != null &&
      Number.isFinite(Number(childRaw)) &&
      Number(childRaw) >= 0
        ? Number(childRaw)
        : undefined;
    const infantAddOn =
      infantRaw != null &&
      Number.isFinite(Number(infantRaw)) &&
      Number(infantRaw) >= 0
        ? Number(infantRaw)
        : undefined;
    out.push({
      seats,
      unitCost,
      ...(childAddOn != null ? { childAddOn } : {}),
      ...(infantAddOn != null ? { infantAddOn } : {}),
    });
  }
  out.sort((a, b) => a.seats - b.seats);
  if (out.length <= TRANSFER_SEAT_MATRIX_MAX) return out;
  return out.slice(-TRANSFER_SEAT_MATRIX_MAX);
}

/**
 * Optional CSV cols `seatMatrix4/6/7/12UnitCost` → `pricingJson.seatMatrix`.
 * Blank / missing cols → null.
 */
export function buildSeatMatrixFromTransferCsvRow(row: {
  seatMatrix4UnitCost?: number | null;
  seatMatrix6UnitCost?: number | null;
  seatMatrix7UnitCost?: number | null;
  seatMatrix12UnitCost?: number | null;
}): TransferSeatMatrixRow[] | null {
  const candidates: Array<{ seats: number; raw: number | null | undefined }> = [
    { seats: 4, raw: row.seatMatrix4UnitCost },
    { seats: 6, raw: row.seatMatrix6UnitCost },
    { seats: 7, raw: row.seatMatrix7UnitCost },
    { seats: 12, raw: row.seatMatrix12UnitCost },
  ];
  const matrix: TransferSeatMatrixRow[] = [];
  for (const c of candidates) {
    if (c.raw == null || !Number.isFinite(c.raw) || c.raw < 0) continue;
    matrix.push({
      seats: c.seats,
      unitCost: round2(c.raw),
    });
  }
  return matrix.length ? matrix : null;
}

/**
 * Pick row where seats ≥ need, preferring closest (smallest) seats.
 * Fallback: largest row when need exceeds all; null if empty.
 */
export function pickTransferSeatMatrixRow(opts: {
  rows: TransferSeatMatrixRow[];
  /** Party size or vehicle seats to cover. */
  seatsNeeded: number;
}): TransferSeatMatrixRow | null {
  const rows = opts.rows;
  if (!rows.length) return null;
  const need = Math.max(0, Math.floor(opts.seatsNeeded) || 0);
  let best: TransferSeatMatrixRow | null = null;
  for (const row of rows) {
    if (row.seats < need) continue;
    if (!best || row.seats < best.seats) best = row;
  }
  return best ?? rows[rows.length - 1] ?? null;
}

export function transferSeatMatrixMatchAccepted(
  row: TransferSeatMatrixRow,
): string {
  return `Seat matrix ${row.seats} seats · ₹${Math.round(row.unitCost)}`;
}

/**
 * Cab unit for one vehicle given party (or seats needed): seat matrix first,
 * else party bands, else chart fallback.
 */
export function resolveTransferVehicleUnitCost(opts: {
  seatsNeeded: number;
  seatMatrix: TransferSeatMatrixRow[];
  partyBands: TransferPartyBand[];
  chartUnitCost: number;
}): {
  unitCost: number;
  matrixRow: TransferSeatMatrixRow | null;
  partyBand: TransferPartyBand | null;
} {
  const chart = Math.max(0, Number(opts.chartUnitCost) || 0);
  if (opts.seatMatrix.length > 0) {
    const matrixRow = pickTransferSeatMatrixRow({
      rows: opts.seatMatrix,
      seatsNeeded: opts.seatsNeeded,
    });
    return {
      unitCost: matrixRow?.unitCost ?? chart,
      matrixRow,
      partyBand: null,
    };
  }
  if (opts.partyBands.length > 0) {
    const partyBand = pickTransferPartyBand({
      bands: opts.partyBands,
      party: opts.seatsNeeded,
    });
    return {
      unitCost: partyBand?.unitCost ?? chart,
      matrixRow: null,
      partyBand,
    };
  }
  return { unitCost: chart, matrixRow: null, partyBand: null };
}

/** Split party across vehicles evenly; remainder on the last vehicle. */
export function splitPartyAcrossVehicles(
  party: number,
  vehicles: number,
): number[] {
  const v = Math.max(1, Math.floor(vehicles) || 1);
  const p = Math.max(0, Math.floor(party) || 0);
  if (v === 1) return [p];
  const base = Math.floor(p / v);
  const rem = p % v;
  return Array.from({ length: v }, (_, i) =>
    i === v - 1 ? base + rem : base,
  );
}

/**
 * When party > seats and vehicles > 1, allocate party across vehicles and
 * price each cab. Null when split does not apply.
 */
export function composeMultiVehicleTransferSplit(opts: {
  party: number;
  seatsPerVehicle: number;
  /** Raised vehicle count (ceil or user). */
  vehicles: number;
  resolveUnitCost: (partyForVehicle: number) => number;
}): MultiVehicleSplit | null {
  const seats = Math.floor(Number(opts.seatsPerVehicle) || 0);
  const party = Math.max(0, Math.floor(opts.party) || 0);
  const vehicles = Math.max(1, Math.floor(opts.vehicles) || 1);
  if (!Number.isFinite(seats) || seats <= 0) return null;
  if (party <= seats || vehicles <= 1) return null;
  const partyPerVehicle = splitPartyAcrossVehicles(party, vehicles);
  const unitCosts = partyPerVehicle.map((p) =>
    round2(opts.resolveUnitCost(p)),
  );
  return {
    vehicles,
    seatsPerVehicle: seats,
    partyPerVehicle,
    unitCosts,
  };
}

export function transferMultiVehicleSplitAccepted(
  split: MultiVehicleSplit,
): string {
  const total = round2(split.unitCosts.reduce((s, n) => s + n, 0));
  const parts = split.partyPerVehicle
    .map((p, i) => `${p}pax ₹${Math.round(split.unitCosts[i] ?? 0)}`)
    .join(' + ');
  return `Multi-vehicle ${split.vehicles}×${split.seatsPerVehicle} · ${parts} · ₹${Math.round(total)}`;
}

export function multiVehicleSplitTotalBuy(split: MultiVehicleSplit): number {
  return round2(split.unitCosts.reduce((s, n) => s + n, 0));
}
