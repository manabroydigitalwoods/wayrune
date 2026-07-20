/** Party CSV import commit guardrails (mirrors rates import fail-closed). */

export function partyImportCommitError(input: {
  imported: number;
  skipped: number;
}): string | null {
  if (input.imported > 0) return null;
  if (input.skipped > 0) {
    return 'No clients imported — fix skip reasons and try again';
  }
  return 'Nothing to import — add at least one valid row';
}

export function firstPartyImportSkipReason(
  results: Array<{ status: 'created' | 'skipped'; reason?: string }>,
): string | null {
  for (const r of results) {
    if (r.status === 'skipped' && r.reason?.trim()) return r.reason.trim();
  }
  return null;
}

export function formatPartyImportSkipReason(reason: string): string {
  switch (reason) {
    case 'email_exists':
      return 'duplicate email';
    default:
      return reason.replace(/_/g, ' ');
  }
}
