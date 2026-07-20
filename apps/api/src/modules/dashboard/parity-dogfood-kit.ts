/**
 * Sembark parity track — Phase 0 ops kits (FIT claim + pilot smoke + operate-through).
 * Pure helpers; no DB. Surfaced on Settings → About claim gates.
 */

export type OperateThroughStep = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

export type ParityDogfoodKit = {
  fitCaptureSteps: string[];
  pilotSmokeSteps: string[];
  /** @deprecated Prefer operateThroughInteractive — kept for string lists. */
  operateThroughSteps: string[];
  operateThroughInteractive: OperateThroughStep[];
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
 * Interactive operate-through path with deep-links.
 * FIT pack alone is Quote-ready only — Operate-ready needs suppliers/rates (or Install operate demo).
 */
export function operateThroughInteractiveSteps(): OperateThroughStep[] {
  return [
    {
      id: 'import',
      label: 'Import suppliers + rates',
      detail:
        'CSV/XLSX suppliers and rates, or Install operate demo (labeled demo — not for live booking). FIT pack alone does not unlock enquiry→voucher.',
      href: '/docs#bring-your-data',
    },
    {
      id: 'quote',
      label: 'Quote',
      detail: 'Match lines on a trip Quotations tab, then Send.',
      href: '/work/quotation-drafts',
    },
    {
      id: 'accept',
      label: 'Accept',
      detail:
        'Guest or staff accept — workspace jumps toward Operations when lines have suppliers.',
      href: '/work/quotations',
    },
    {
      id: 'enquiry',
      label: 'Supplier enquiry',
      detail: 'Open Operations and send/log supplier enquiry on a booking.',
      href: '/trips',
    },
    {
      id: 'confirm',
      label: 'Confirmation',
      detail: 'Confirm the supplier booking when they accept.',
      href: '/trips',
    },
    {
      id: 'payable',
      label: 'Payable',
      detail: 'Record or schedule supplier payable on the booking / Finance.',
      href: '/finance/payables',
    },
    {
      id: 'voucher',
      label: 'Voucher',
      detail: 'Issue voucher note once confirmed.',
      href: '/trips',
    },
    {
      id: 'collection',
      label: 'Collection',
      detail:
        'When no receivables exist, Next action → Schedule instalments (Finance → Schedule from terms).',
      href: '/finance',
    },
    {
      id: 'movement',
      label: 'Movement / operations',
      detail: 'Assign driver/fleet on the movement board before depart.',
      href: '/operations/movement',
    },
  ];
}

/** String form for kits / tests — mirrors interactive steps. */
export function operateThroughDogfoodSteps(): string[] {
  return operateThroughInteractiveSteps().map(
    (s) => `${s.label}: ${s.detail}`,
  );
}

export function buildParityDogfoodKit(): ParityDogfoodKit {
  const operateThroughInteractive = operateThroughInteractiveSteps();
  return {
    fitCaptureSteps: fitCaptureDogfoodSteps(),
    pilotSmokeSteps: pilotSmokeDogfoodSteps(),
    operateThroughSteps: operateThroughDogfoodSteps(),
    operateThroughInteractive,
    scaleReminder:
      'Public scale strip stays gated — do not invent agency/trip counts until GET /platform/scale minima clear and snapshot is published.',
  };
}
