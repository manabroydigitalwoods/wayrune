/**
 * Measured platform scale protocol for public /docs.
 * Never invent vanity numbers — publicScaleAllowed only when all minima clear.
 */

export const PUBLIC_SCALE_WINDOW_DAYS = 90;

export const PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS = 10;
export const PUBLIC_SCALE_MIN_TRIPS_ACCEPTED = 50;
export const PUBLIC_SCALE_MIN_QUOTES_SENT = 100;

export const PUBLIC_SCALE_PROTOCOL_DEFINITION =
  'activeAgencyOrgs = travel_agency orgs with ≥1 quotation sent in 90d; ' +
  'tripsWithAcceptedQuote = trips with ≥1 accepted quotation in 90d; ' +
  'quotesSent90d = quotation versions with status sent|accepted updated in 90d; ' +
  `publicScaleAllowed when agencies≥${PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS}, ` +
  `trips≥${PUBLIC_SCALE_MIN_TRIPS_ACCEPTED}, quotes≥${PUBLIC_SCALE_MIN_QUOTES_SENT}.`;

export type PublicScaleCounts = {
  activeAgencyOrgs: number;
  tripsWithAcceptedQuote: number;
  quotesSent90d: number;
};

export type PublicScaleProtocol = PublicScaleCounts & {
  definition: string;
  windowDays: number;
  asOf: string;
  publicScaleAllowed: boolean;
  claimStatus: 'testing' | 'ready';
  minima: {
    activeAgencyOrgs: number;
    tripsWithAcceptedQuote: number;
    quotesSent90d: number;
  };
};

export function buildPublicScaleProtocol(
  counts: PublicScaleCounts,
  opts?: { asOf?: Date | string | null },
): PublicScaleProtocol {
  const activeAgencyOrgs = Math.max(0, Math.floor(Number(counts.activeAgencyOrgs) || 0));
  const tripsWithAcceptedQuote = Math.max(
    0,
    Math.floor(Number(counts.tripsWithAcceptedQuote) || 0),
  );
  const quotesSent90d = Math.max(0, Math.floor(Number(counts.quotesSent90d) || 0));
  const publicScaleAllowed =
    activeAgencyOrgs >= PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS &&
    tripsWithAcceptedQuote >= PUBLIC_SCALE_MIN_TRIPS_ACCEPTED &&
    quotesSent90d >= PUBLIC_SCALE_MIN_QUOTES_SENT;
  const asOfRaw = opts?.asOf ?? new Date();
  const asOf =
    typeof asOfRaw === 'string'
      ? asOfRaw.slice(0, 10)
      : asOfRaw.toISOString().slice(0, 10);
  return {
    definition: PUBLIC_SCALE_PROTOCOL_DEFINITION,
    windowDays: PUBLIC_SCALE_WINDOW_DAYS,
    asOf,
    activeAgencyOrgs,
    tripsWithAcceptedQuote,
    quotesSent90d,
    publicScaleAllowed,
    claimStatus: publicScaleAllowed ? 'ready' : 'testing',
    minima: {
      activeAgencyOrgs: PUBLIC_SCALE_MIN_ACTIVE_AGENCY_ORGS,
      tripsWithAcceptedQuote: PUBLIC_SCALE_MIN_TRIPS_ACCEPTED,
      quotesSent90d: PUBLIC_SCALE_MIN_QUOTES_SENT,
    },
  };
}

/** Snapshot shape published into the web app for login-free /docs. */
export type PublicScaleSnapshot = {
  asOf: string | null;
  publicScaleAllowed: boolean;
  activeAgencyOrgs: number | null;
  tripsWithAcceptedQuote: number | null;
  quotesSent90d: number | null;
  measured: true;
};

export function snapshotFromProtocol(
  protocol: PublicScaleProtocol,
): PublicScaleSnapshot {
  if (!protocol.publicScaleAllowed) {
    return {
      asOf: protocol.asOf,
      publicScaleAllowed: false,
      activeAgencyOrgs: null,
      tripsWithAcceptedQuote: null,
      quotesSent90d: null,
      measured: true,
    };
  }
  return {
    asOf: protocol.asOf,
    publicScaleAllowed: true,
    activeAgencyOrgs: protocol.activeAgencyOrgs,
    tripsWithAcceptedQuote: protocol.tripsWithAcceptedQuote,
    quotesSent90d: protocol.quotesSent90d,
    measured: true,
  };
}
