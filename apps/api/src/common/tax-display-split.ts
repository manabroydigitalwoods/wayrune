/**
 * Display-only CGST / SGST / IGST split from place-of-supply labels.
 * Does not change line tax %, ledger, or filing — never claim compliance.
 */

export type TaxDisplayRegime = 'intra' | 'inter' | 'unknown';

export type TaxDisplaySplit = {
  regime: TaxDisplayRegime;
  /** Agency / supplier place of supply (normalized). */
  orgPlaceOfSupply: string | null;
  /** Destination / supply place of supply (normalized). */
  destinationPlaceOfSupply: string | null;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Common India GST state/UT aliases → ISO-ish codes used on proposals. */
const POS_ALIASES: Record<string, string> = {
  KA: 'KA',
  KARNATAKA: 'KA',
  MH: 'MH',
  MAHARASHTRA: 'MH',
  DL: 'DL',
  DELHI: 'DL',
  NCT: 'DL',
  'NCT OF DELHI': 'DL',
  TN: 'TN',
  'TAMIL NADU': 'TN',
  TAMILNADU: 'TN',
  KL: 'KL',
  KERALA: 'KL',
  GJ: 'GJ',
  GUJARAT: 'GJ',
  RJ: 'RJ',
  RAJASTHAN: 'RJ',
  UP: 'UP',
  'UTTAR PRADESH': 'UP',
  WB: 'WB',
  'WEST BENGAL': 'WB',
  WESTBENGAL: 'WB',
  TS: 'TS',
  TELANGANA: 'TS',
  AP: 'AP',
  'ANDHRA PRADESH': 'AP',
  GOA: 'GA',
  GA: 'GA',
  HR: 'HR',
  HARYANA: 'HR',
  PB: 'PB',
  PUNJAB: 'PB',
};

/** Normalize place-of-supply label for comparison (display split only). */
export function normalizePlaceOfSupply(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!t) return null;
  return POS_ALIASES[t] || t;
}

/**
 * Split a single tax total into CGST+SGST (intra) or IGST (inter).
 * Missing either POS → unknown (hide breakdown). Tax total unchanged.
 */
export function splitTaxDisplay(opts: {
  orgPlaceOfSupply: string | null | undefined;
  destinationPlaceOfSupply: string | null | undefined;
  taxTotal: number;
}): TaxDisplaySplit {
  const org = normalizePlaceOfSupply(opts.orgPlaceOfSupply);
  const dest = normalizePlaceOfSupply(opts.destinationPlaceOfSupply);
  const tax =
    Number.isFinite(opts.taxTotal) && opts.taxTotal > 0
      ? round2(opts.taxTotal)
      : 0;

  if (!org || !dest || tax <= 0) {
    return {
      regime: 'unknown',
      orgPlaceOfSupply: org,
      destinationPlaceOfSupply: dest,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxTotal: tax,
    };
  }

  if (org === dest) {
    const half = round2(tax / 2);
    const cgst = round2(tax - half);
    return {
      regime: 'intra',
      orgPlaceOfSupply: org,
      destinationPlaceOfSupply: dest,
      cgst,
      sgst: half,
      igst: 0,
      taxTotal: tax,
    };
  }

  return {
    regime: 'inter',
    orgPlaceOfSupply: org,
    destinationPlaceOfSupply: dest,
    cgst: 0,
    sgst: 0,
    igst: tax,
    taxTotal: tax,
  };
}

/** Compact rows for UI / PDF / email (empty when unknown). */
export function formatTaxDisplaySplitLines(
  split: TaxDisplaySplit,
  opts?: { formatAmount?: (n: number) => string },
): string[] {
  if (split.regime === 'unknown' || split.taxTotal <= 0) return [];
  const fmt =
    opts?.formatAmount ??
    ((n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`);
  if (split.regime === 'intra') {
    return [`CGST ${fmt(split.cgst)}`, `SGST ${fmt(split.sgst)}`];
  }
  return [`IGST ${fmt(split.igst)}`];
}

export function taxDisplaySplitCue(split: TaxDisplaySplit): string | null {
  if (split.regime === 'unknown') return null;
  if (split.regime === 'intra') {
    return `Display split · intra-state (${split.orgPlaceOfSupply}) — not a GST invoice claim`;
  }
  return `Display split · inter-state (${split.orgPlaceOfSupply} → ${split.destinationPlaceOfSupply}) — not a GST invoice claim`;
}
