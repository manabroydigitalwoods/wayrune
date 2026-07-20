/** TransferFare optional party-size bands (thin multi-band grid). */

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
  // Keep ≤3 bands (highest sizes if more).
  if (out.length <= 3) return out;
  return out.slice(-3);
}

/**
 * Optional CSV cols `partyBand2/4/6UnitCost` → `pricingJson.partyBands`.
 * Blank / missing cols → null (chart-only row unchanged).
 */
export function buildPartyBandsFromTransferCsvRow(row: {
  partyBand2UnitCost?: number | null;
  partyBand4UnitCost?: number | null;
  partyBand6UnitCost?: number | null;
}): TransferPartyBand[] | null {
  const candidates: Array<{ partySize: number; raw: number | null | undefined }> =
    [
      { partySize: 2, raw: row.partyBand2UnitCost },
      { partySize: 4, raw: row.partyBand4UnitCost },
      { partySize: 6, raw: row.partyBand6UnitCost },
    ];
  const bands: TransferPartyBand[] = [];
  for (const c of candidates) {
    if (c.raw == null || !Number.isFinite(c.raw) || c.raw < 0) continue;
    bands.push({ partySize: c.partySize, unitCost: Math.round(c.raw * 100) / 100 });
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
