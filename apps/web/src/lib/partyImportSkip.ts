/** Human-readable party CSV skip reasons (mirrors API party-import). */

export function formatPartyImportSkipReason(reason: string): string {
  switch (reason) {
    case 'email_exists':
      return 'duplicate email';
    default:
      return reason.replace(/_/g, ' ');
  }
}
