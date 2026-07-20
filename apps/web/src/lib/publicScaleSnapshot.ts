/**
 * Stamped public scale snapshot for login-free /docs.
 * Numbers only appear when publicScaleAllowed — never invent vanity counts in TS.
 */

import snapshotJson from './public-scale-snapshot.json';

export type PublicScaleSnapshot = {
  asOf: string | null;
  publicScaleAllowed: boolean;
  activeAgencyOrgs: number | null;
  tripsWithAcceptedQuote: number | null;
  quotesSent90d: number | null;
  measured: true;
};

export const PUBLIC_SCALE_SNAPSHOT: PublicScaleSnapshot =
  snapshotJson as PublicScaleSnapshot;

export function publicScaleStripVisible(
  snap: PublicScaleSnapshot = PUBLIC_SCALE_SNAPSHOT,
): boolean {
  return (
    snap.publicScaleAllowed === true &&
    snap.measured === true &&
    snap.activeAgencyOrgs != null &&
    snap.tripsWithAcceptedQuote != null &&
    snap.quotesSent90d != null
  );
}
