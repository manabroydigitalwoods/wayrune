/**
 * Sembark parity track — Phase 0 ops kits (FIT claim + pilot smoke + operate-through).
 * Pure helpers; no DB. Surfaced on Settings → About claim gates.
 */

export type ParityDogfoodKit = {
  fitCaptureSteps: string[];
  pilotSmokeSteps: string[];
  operateThroughSteps: string[];
  scaleReminder: string;
};

/** How to grow real FIT timings toward publicClaimAllowed (demo seed excluded). */
export function fitCaptureDogfoodSteps(): string[] {
  return [
    'Use a non-demo agency org (not demo-travel seed-only timings).',
    'Open a trip workspace, build an INR FIT quote (package or Match), then Send — timing posts workspace-open → first successful send.',
    'Repeat until Settings → About shows ≥20 real samples and median ≤3 minutes (demo seed never counts toward the public gate).',
    'When the technical gate clears, keep marketing registry on Testing until product sign-off — then flip Proven and website copy.',
  ];
}

/** Pilot smoke checklist for Stage A finish surfaces before depth ladders. */
export function pilotSmokeDogfoodSteps(): string[] {
  return [
    'Finance: request a write-off on a trip instalment; confirm Receivables/Overdue awaiting strip deep-links to Finance.',
    'Rates: contract a transfer with party bands (up to 6) and per-vehicle child/infant add-on; Match and confirm stamp.',
    'Packages: reorder siblings with Up/Down in New-trip or Use-template folder tree; order persists after reload.',
    'Ops: assign driver/fleet on movement board; confirm DriverJob sync / unit calendar block on a transfer booking.',
  ];
}

/**
 * Self-serve operate-through path (import → quote → accept → collect → ops → cancel).
 * Claim-safe process only — does not prove agency adoption.
 */
export function operateThroughDogfoodSteps(): string[] {
  return [
    'Import: bring rates/clients via CSV/XLSX or Install the sample FIT pack (/docs#bring-your-data).',
    'Quote: Match lines on a trip Quotations tab, then Send.',
    'Accept: guest or staff accept — workspace jumps toward Operations; Next action ranks the open step.',
    'Collect: when no receivables exist, Next action → Schedule instalments (Finance → Schedule from terms).',
    'Ops: enquiry → Confirm → voucher note; Next action focuses the booking when known.',
    'Depart: complete the Operations readiness checklist before travel.',
    'Cancel/refund: Commerce → Changes & incidents (credit note → settle) when needed.',
  ];
}

export function buildParityDogfoodKit(): ParityDogfoodKit {
  return {
    fitCaptureSteps: fitCaptureDogfoodSteps(),
    pilotSmokeSteps: pilotSmokeDogfoodSteps(),
    operateThroughSteps: operateThroughDogfoodSteps(),
    scaleReminder:
      'Public scale strip stays gated — do not invent agency/trip counts until GET /platform/scale minima clear and snapshot is published.',
  };
}
