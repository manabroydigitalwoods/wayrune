/**
 * Pilot Day-0 readiness — Quote / Operate / Evidence tracks.
 * Never derives market_proven. Demo operate pack alone ≠ Operate-ready for pilot.
 */

export type PilotProgramMode = 'none' | 'proxy' | 'named';

export type PilotReadinessStatus =
  | 'not_ready'
  | 'quote_ready'
  | 'operate_ready'
  | 'proxy_tested'
  | 'named_pilot_active'
  | 'pilot_evidence_complete';

export type PilotReadinessItem = {
  key: string;
  label: string;
  /** Why it matters when incomplete. */
  detail: string;
  done: boolean;
  href: string;
  track: 'quote' | 'operate' | 'evidence';
};

export type PilotTrackStatus = {
  items: PilotReadinessItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  scorePercent: number;
};

export type PilotProgramSettings = {
  mode: PilotProgramMode;
  evidenceComplete: boolean;
  startedAt?: string;
  replayPrivacyConfirmed?: boolean;
};

export type BuildPilotReadinessInput = {
  orgSlug: string;
  /** Shared demo seed org — not valid as clean staging. */
  isSharedDemoSeed: boolean;
  hasOrgProfile: boolean;
  hasBranding: boolean;
  hasSalesUser: boolean;
  hasTravellerIntake: boolean;
  hasQuotePath: boolean;
  hasMarkupOrTaxConfigured: boolean;
  hasProposalPreview: boolean;
  /** Any supplier present (may be demo). */
  hasSuppliers: boolean;
  hotelSupplierContactOk: boolean;
  transferSupplierContactOk: boolean;
  activitySupplierContactOk: boolean;
  hotelRateActive: boolean;
  transferRateActive: boolean;
  activityRateActive: boolean;
  hasSupplierEnquiry: boolean;
  hasSupplierConfirm: boolean;
  hasPayable: boolean;
  hasVoucher: boolean;
  demoOperatePackActive: boolean;
  /** At least one non-demo / post-replace supplier signal. */
  hasNonDemoSupplier: boolean;
  hasTestRoles: boolean;
  fitDemoSamplesExcludedUnderstood: true;
};

function scoreTrack(items: PilotReadinessItem[]): PilotTrackStatus {
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const scorePercent = total ? Math.round((doneCount / total) * 100) : 0;
  return {
    items,
    doneCount,
    total,
    complete: total > 0 && doneCount === total,
    scorePercent,
  };
}

export function parsePilotProgramSettings(settingsJson: unknown): PilotProgramSettings {
  const root =
    settingsJson && typeof settingsJson === 'object' && !Array.isArray(settingsJson)
      ? (settingsJson as Record<string, unknown>)
      : {};
  const raw = root.pilotProgram;
  const pp =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const modeRaw = typeof pp.mode === 'string' ? pp.mode : 'none';
  const mode: PilotProgramMode =
    modeRaw === 'proxy' || modeRaw === 'named' || modeRaw === 'none'
      ? modeRaw
      : 'none';
  return {
    mode,
    evidenceComplete: pp.evidenceComplete === true,
    startedAt: typeof pp.startedAt === 'string' ? pp.startedAt : undefined,
    replayPrivacyConfirmed:
      pp.replayPrivacyConfirmed === true
        ? true
        : pp.replayPrivacyConfirmed === false
          ? false
          : undefined,
  };
}

/**
 * Operate-ready for pilot status requires operate track complete AND
 * not solely via an active demo operate pack (unless replaced / non-demo suppliers).
 */
export function operateReadyForPilot(input: {
  operateComplete: boolean;
  demoOperatePackActive: boolean;
  hasNonDemoSupplier: boolean;
}): boolean {
  if (!input.operateComplete) return false;
  if (input.demoOperatePackActive && !input.hasNonDemoSupplier) return false;
  return true;
}

export function derivePilotReadinessStatus(input: {
  quoteComplete: boolean;
  operateReadyForPilot: boolean;
  evidenceCompleteTrack: boolean;
  settings: PilotProgramSettings;
}): PilotReadinessStatus {
  const { settings } = input;
  if (settings.evidenceComplete && settings.mode !== 'none') {
    return 'pilot_evidence_complete';
  }
  if (settings.mode === 'named') return 'named_pilot_active';
  if (settings.mode === 'proxy') return 'proxy_tested';
  if (input.operateReadyForPilot) return 'operate_ready';
  if (input.quoteComplete) return 'quote_ready';
  return 'not_ready';
}

export function buildPilotReadinessTracks(input: BuildPilotReadinessInput): {
  quote: PilotTrackStatus;
  operate: PilotTrackStatus;
  evidence: PilotTrackStatus;
  demoOperatePackActive: boolean;
  operateReadyFromDemoOnly: boolean;
} {
  const quoteItems: PilotReadinessItem[] = [
    {
      key: 'org_profile',
      label: 'Organization profile complete',
      detail: 'Legal/business identity builds trust on proposals and invoices.',
      done: input.hasOrgProfile,
      href: '/settings?section=business',
      track: 'quote',
    },
    {
      key: 'branding',
      label: 'Branding configured',
      detail: 'Logo or brand colour so proposals look like your agency.',
      done: input.hasBranding,
      href: '/settings?section=branding',
      track: 'quote',
    },
    {
      key: 'sales_user',
      label: 'Sales user available',
      detail: 'A sales role must open inquiries and send quotes during the pilot.',
      done: input.hasSalesUser,
      href: '/settings?section=members',
      track: 'quote',
    },
    {
      key: 'traveller_intake',
      label: 'Traveller intake usable',
      detail: 'Qualified enquiry needs travellers/rooms before a timed FIT Send.',
      done: input.hasTravellerIntake,
      href: '/inquiries',
      track: 'quote',
    },
    {
      key: 'quote_path',
      label: 'Package or blank quote path available',
      detail: 'Operator needs a template or blank trip to start Day 1.',
      done: input.hasQuotePath,
      href: '/work/quotation-drafts',
      track: 'quote',
    },
    {
      key: 'markup_tax',
      label: 'Markup and tax display configured',
      detail: 'Default markup/tax avoid calculator escapes on every line.',
      done: input.hasMarkupOrTaxConfigured,
      href: '/settings?section=commercial',
      track: 'quote',
    },
    {
      key: 'proposal_preview',
      label: 'Proposal preview successful',
      detail: 'Customer-facing doc must render before Send is trustworthy.',
      done: input.hasProposalPreview,
      href: '/work/quotations',
      track: 'quote',
    },
  ];

  const suppliersOk =
    input.hasSuppliers &&
    (input.hasNonDemoSupplier || input.demoOperatePackActive);

  const operateItems: PilotReadinessItem[] = [
    {
      key: 'suppliers_available',
      label: 'Real or labelled demo suppliers available',
      detail:
        'Operate needs buy-side partners. FIT pack alone is not enough — install operate demo or import real suppliers.',
      done: suppliersOk,
      href: '/suppliers',
      track: 'operate',
    },
    {
      key: 'supplier_contacts',
      label: 'Supplier contacts complete (H/T/A)',
      detail: 'Enquiry WhatsApp/email needs a contact on hotel, transfer, and activity.',
      done:
        input.hotelSupplierContactOk &&
        input.transferSupplierContactOk &&
        input.activitySupplierContactOk,
      href: '/suppliers',
      track: 'operate',
    },
    {
      key: 'rates_active',
      label: 'Hotel / transfer / activity rates activated',
      detail: 'Match and book need active rate tips — not drafts only.',
      done:
        input.hotelRateActive &&
        input.transferRateActive &&
        input.activityRateActive,
      href: '/rates',
      track: 'operate',
    },
    {
      key: 'enquiry_path',
      label: 'Supplier enquiry path tested',
      detail: 'Ops must request hold/confirm without leaving the trip workspace.',
      done: input.hasSupplierEnquiry,
      href: '/trips',
      track: 'operate',
    },
    {
      key: 'confirm_path',
      label: 'Confirmation path tested',
      detail: 'Confirmed status is the gate before voucher and payables.',
      done: input.hasSupplierConfirm,
      href: '/trips',
      track: 'operate',
    },
    {
      key: 'payable_path',
      label: 'Payable generation tested',
      detail: 'Accounts needs a supplier payable without Excel reconstruction.',
      done: input.hasPayable,
      href: '/trips',
      track: 'operate',
    },
    {
      key: 'voucher_path',
      label: 'Voucher generation tested',
      detail: 'Guest/ops voucher closes the operate-through loop.',
      done: input.hasVoucher,
      href: '/trips',
      track: 'operate',
    },
  ];

  const evidenceItems: PilotReadinessItem[] = [
    {
      key: 'posthog_hint',
      label: 'PostHog enabled for staging build',
      detail:
        'Session replay needs VITE_POSTHOG_KEY on the pilot deploy. Client confirms this in the UI.',
      done: false, // client overlays
      href: '/settings?section=about',
      track: 'evidence',
    },
    {
      key: 'replay_privacy',
      label: 'Session replay privacy masking confirmed',
      detail: 'PII must stay masked — see PostHog pilot doc before inviting operators.',
      done: false, // owner checkbox via mode is separate; link for awareness
      href: '/docs#what-we-claim',
      track: 'evidence',
    },
    {
      key: 'test_roles',
      label: 'Test user roles created',
      detail: 'Sales (+ ops) memberships must exist before Day 1.',
      done: input.hasTestRoles,
      href: '/settings?section=members',
      track: 'evidence',
    },
    {
      key: 'clean_staging',
      label: 'Clean staging organization confirmed',
      detail: 'Do not run named pilot on shared demo-travel seed as the primary org.',
      done: !input.isSharedDemoSeed,
      href: '/settings',
      track: 'evidence',
    },
    {
      key: 'evidence_folder',
      label: 'Evidence pack linked',
      detail: 'Fill market-proof-evidence-pack.md as the week runs.',
      done: true, // static link always available
      href: '/settings?section=about',
      track: 'evidence',
    },
    {
      key: 'friction_log',
      label: 'Friction log linked',
      detail: 'Log escapes in the pilot operations pack templates.',
      done: true,
      href: '/settings?section=about',
      track: 'evidence',
    },
    {
      key: 'claim_status',
      label: 'Claim status visible (Testing)',
      detail: 'Marketing claim gates stay Testing until product sign-off.',
      done: true,
      href: '/settings?section=about',
      track: 'evidence',
    },
    {
      key: 'demo_excluded',
      label: 'Demo runs excluded from FIT proof',
      detail: 'Demo-seed timings never count toward publicClaimAllowed.',
      done: input.fitDemoSamplesExcludedUnderstood,
      href: '/settings?section=about',
      track: 'evidence',
    },
  ];

  const quote = scoreTrack(quoteItems);
  const operate = scoreTrack(operateItems);
  const evidence = scoreTrack(evidenceItems);

  const operateReadyFromDemoOnly =
    operate.complete &&
    input.demoOperatePackActive &&
    !input.hasNonDemoSupplier;

  return {
    quote,
    operate,
    evidence,
    demoOperatePackActive: input.demoOperatePackActive,
    operateReadyFromDemoOnly,
  };
}

export function buildPilotReadinessPayload(
  input: BuildPilotReadinessInput,
  settings: PilotProgramSettings,
  evidenceClientOverrides?: {
    posthogEnabled?: boolean;
    replayPrivacyConfirmed?: boolean;
  },
) {
  const tracks = buildPilotReadinessTracks(input);
  const evidenceItems = tracks.evidence.items.map((item) => {
    if (item.key === 'posthog_hint' && evidenceClientOverrides?.posthogEnabled !== undefined) {
      return { ...item, done: evidenceClientOverrides.posthogEnabled };
    }
    if (item.key === 'replay_privacy') {
      const confirmed =
        evidenceClientOverrides?.replayPrivacyConfirmed ??
        settings.replayPrivacyConfirmed === true;
      return { ...item, done: confirmed };
    }
    return item;
  });
  const evidence = scoreTrack(evidenceItems);

  const forPilot = operateReadyForPilot({
    operateComplete: tracks.operate.complete,
    demoOperatePackActive: tracks.demoOperatePackActive,
    hasNonDemoSupplier: input.hasNonDemoSupplier,
  });

  const status = derivePilotReadinessStatus({
    quoteComplete: tracks.quote.complete,
    operateReadyForPilot: forPilot,
    evidenceCompleteTrack: evidence.complete,
    settings,
  });

  return {
    status,
    quote: tracks.quote,
    operate: tracks.operate,
    evidence,
    demoOperatePackActive: tracks.demoOperatePackActive,
    operateReadyFromDemoOnly: tracks.operateReadyFromDemoOnly,
    settings,
    /** Explicit: never returned as an achievable auto status. */
    marketProvenAuto: false as const,
  };
}

export const PILOT_READINESS_STATUS_LABELS: Record<PilotReadinessStatus, string> = {
  not_ready: 'Not ready',
  quote_ready: 'Quote-ready',
  operate_ready: 'Operate-ready',
  proxy_tested: 'Proxy-tested',
  named_pilot_active: 'Named pilot active',
  pilot_evidence_complete: 'Pilot evidence complete',
};
