import type { AgencyWorkspace, CanonicalCreateKind } from './types';

/**
 * Progressive Complexity — which prominent create actions to show per workspace.
 * Canonical routes remain reachable via direct URL when permitted.
 */
export function shouldShowCanonicalCreate(
  workspace: AgencyWorkspace,
  kind: CanonicalCreateKind,
): boolean {
  switch (workspace) {
    case 'sales_executive':
      // New lead is the CRM entry point for sales; inquiry create stays gated.
      return kind === 'lead';
    case 'sales_manager':
    case 'owner':
      return kind !== 'party' || workspace === 'owner';
    case 'travel_consultant':
      return kind === 'trip';
    case 'operations':
    case 'finance':
    case 'auditor':
      return false;
    default:
      return true;
  }
}

export function shouldShowTravelRequestIntake(workspace: AgencyWorkspace): boolean {
  return (
    workspace === 'owner' ||
    workspace === 'sales_manager' ||
    workspace === 'sales_executive' ||
    workspace === 'travel_consultant'
  );
}
