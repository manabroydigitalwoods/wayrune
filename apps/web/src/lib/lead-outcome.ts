export type LeadOutcome = {
  markedWon: boolean;
  skippedReason?: string;
};

export function leadOutcomeMessage(
  outcome: LeadOutcome | undefined,
  successPrefix: string,
): string {
  if (!outcome) return successPrefix;
  if (outcome.markedWon) return `${successPrefix} · Lead marked Won`;
  if (outcome.skippedReason === 'already_won') {
    return `${successPrefix} · Lead already Won`;
  }
  if (outcome.skippedReason === 'already_lost') {
    return `${successPrefix} · Lead left as Lost`;
  }
  if (outcome.skippedReason === 'no_lead') {
    return successPrefix;
  }
  return successPrefix;
}
