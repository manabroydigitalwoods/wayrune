/** TransferFare optional party-size bands (thin multi-band grid). */

/** Max party bands kept on parse / contract (dense thin path). */
export const TRANSFER_PARTY_BANDS_MAX = 6;

export type TransferPartyBand = {
  /** Max party size covered by this band (1–12). */
  partySize: number;
  unitCost: number;
};

export function parseTransferPartyBands(raw: unknown): TransferPartyBand[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const bands = (raw as { partyBands?: unknown }).partyBands;
  if (!Array.isArray(bands)) return [];
  const out: TransferPartyBand[] = [];
  for (const row of bands) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const partySize = Math.round(Number(r.partySize ?? r.adults));
    const unitCost = Number(r.unitCost);
    if (
      !Number.isFinite(partySize) ||
      partySize < 1 ||
      partySize > 12 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      continue;
    }
    out.push({ partySize, unitCost });
  }
  out.sort((a, b) => a.partySize - b.partySize);
  // Keep ≤MAX bands (highest sizes if more).
  if (out.length <= TRANSFER_PARTY_BANDS_MAX) return out;
  return out.slice(-TRANSFER_PARTY_BANDS_MAX);
}

/**
 * Optional CSV cols `partyBand2/4/6/8/10/12UnitCost` → `pricingJson.partyBands`.
 * Blank / missing cols → null (chart-only row unchanged).
 */
export function buildPartyBandsFromTransferCsvRow(row: {
  partyBand2UnitCost?: number | null;
  partyBand4UnitCost?: number | null;
  partyBand6UnitCost?: number | null;
  partyBand8UnitCost?: number | null;
  partyBand10UnitCost?: number | null;
  partyBand12UnitCost?: number | null;
}): TransferPartyBand[] | null {
  const candidates: Array<{ partySize: number; raw: number | null | undefined }> =
    [
      { partySize: 2, raw: row.partyBand2UnitCost },
      { partySize: 4, raw: row.partyBand4UnitCost },
      { partySize: 6, raw: row.partyBand6UnitCost },
      { partySize: 8, raw: row.partyBand8UnitCost },
      { partySize: 10, raw: row.partyBand10UnitCost },
      { partySize: 12, raw: row.partyBand12UnitCost },
    ];
  const bands: TransferPartyBand[] = [];
  for (const c of candidates) {
    if (c.raw == null || !Number.isFinite(c.raw) || c.raw < 0) continue;
    bands.push({
      partySize: c.partySize,
      unitCost: Math.round(c.raw * 100) / 100,
    });
  }
  return bands.length ? bands : null;
}

/** Highest band with partySize ≤ party; else lowest band; null if empty. */
export function pickTransferPartyBand(opts: {
  bands: TransferPartyBand[];
  party: number;
}): TransferPartyBand | null {
  const bands = opts.bands;
  if (!bands.length) return null;
  const party = Math.max(0, Math.floor(opts.party) || 0);
  let best: TransferPartyBand | null = null;
  for (const b of bands) {
    if (b.partySize <= party) best = b;
  }
  return best ?? bands[0] ?? null;
}

export function transferPartyBandMatchAccepted(band: TransferPartyBand): string {
  return `Party band ≤${band.partySize} · ₹${Math.round(band.unitCost)}`;
}

/**
 * Per-vehicle child/infant add-ons: only when chart sets explicit unit costs.
 * Factor-derived child costs are ignored (cab-only pricing stays default).
 */
export function applyPerVehicleChildExtras(opts: {
  vehicleUnitCost: number;
  childUnitCost: number | null | undefined;
  infantUnitCost: number | null | undefined;
  childHeads: number;
  infantHeads: number;
}): {
  unitCost: number;
  childExtras: number;
  infantExtras: number;
  childrenCharged: number;
  infantsCharged: number;
} {
  const vehicle = Math.max(0, Number(opts.vehicleUnitCost) || 0);
  const children = Math.max(0, Math.floor(opts.childHeads) || 0);
  const infants = Math.max(0, Math.floor(opts.infantHeads) || 0);
  const childUnit =
    opts.childUnitCost != null &&
    Number.isFinite(Number(opts.childUnitCost)) &&
    Number(opts.childUnitCost) >= 0
      ? Number(opts.childUnitCost)
      : null;
  const infantUnit =
    opts.infantUnitCost != null &&
    Number.isFinite(Number(opts.infantUnitCost)) &&
    Number(opts.infantUnitCost) >= 0
      ? Number(opts.infantUnitCost)
      : null;
  const childExtras =
    childUnit != null && children > 0
      ? Math.round(childUnit * children * 100) / 100
      : 0;
  const infantExtras =
    infantUnit != null && infants > 0
      ? Math.round(infantUnit * infants * 100) / 100
      : 0;
  return {
    unitCost: Math.round((vehicle + childExtras + infantExtras) * 100) / 100,
    childExtras,
    infantExtras,
    childrenCharged: childExtras > 0 ? children : 0,
    infantsCharged: infantExtras > 0 ? infants : 0,
  };
}

export function transferPerVehicleChildExtrasAccepted(opts: {
  childrenCharged: number;
  infantsCharged: number;
  childExtras: number;
  infantExtras: number;
}): string | null {
  const parts: string[] = [];
  if (opts.childrenCharged > 0 && opts.childExtras > 0) {
    parts.push(
      `+${opts.childrenCharged} child · ₹${Math.round(opts.childExtras)}`,
    );
  }
  if (opts.infantsCharged > 0 && opts.infantExtras > 0) {
    parts.push(
      `+${opts.infantsCharged} infant · ₹${Math.round(opts.infantExtras)}`,
    );
  }
  return parts.length ? parts.join(' · ') : null;
}
