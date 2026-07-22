import type { AgencyWorkspace, ResolveAgencyWorkspaceInput } from './types';

/** RBAC role key → primary job workspace. */
const ROLE_TO_WORKSPACE: Record<string, AgencyWorkspace> = {
  owner: 'owner',
  admin: 'owner',
  sales_manager: 'sales_manager',
  sales_executive: 'sales_executive',
  travel_consultant: 'travel_consultant',
  operations: 'operations',
  finance: 'finance',
  auditor: 'auditor',
};

/**
 * When a user holds multiple roles, pick the highest-priority workspace.
 * Owner/admin can still reach all areas via secondary/advanced navigation.
 */
export const WORKSPACE_PRIORITY: readonly AgencyWorkspace[] = [
  'owner',
  'sales_manager',
  'operations',
  'finance',
  'travel_consultant',
  'sales_executive',
  'auditor',
] as const;

const WORKSPACE_PRIORITY_INDEX = new Map(
  WORKSPACE_PRIORITY.map((ws, i) => [ws, i]),
);

/** Human label for workspace switcher / shell chrome. */
export const WORKSPACE_LABELS: Record<AgencyWorkspace, string> = {
  owner: 'Dashboard',
  sales_manager: 'Sales management',
  sales_executive: 'Sales',
  travel_consultant: 'Planning',
  operations: 'Operations',
  finance: 'Finance',
  auditor: 'Audit',
};

function permissionFallbackWorkspace(permissions: readonly string[]): AgencyWorkspace {
  const set = new Set(permissions);
  if (set.has('user.manage') || set.has('org.settings.write')) return 'owner';
  if (set.has('report.sales.read') && set.has('lead.assign')) return 'sales_manager';
  if (set.has('ops.write') && set.has('incident.manage')) return 'operations';
  if (set.has('finance.payment.manage') || set.has('finance.settlement.manage')) return 'finance';
  if (set.has('audit.read') && !set.has('lead.write')) return 'auditor';
  if (set.has('itinerary.edit') && !set.has('lead.read') && !set.has('lead.read.own')) {
    return 'travel_consultant';
  }
  if (set.has('lead.read.own') || set.has('lead.write')) return 'sales_executive';
  return 'sales_executive';
}

function isAgencyOrgKind(orgKind: string | null | undefined): boolean {
  return !orgKind || orgKind === 'travel_agency' || orgKind === 'dmc';
}

/**
 * Resolve the user's primary agency workspace from membership roles.
 * Permissions are used only as a fallback when no recognized role is present.
 */
export function resolveAgencyWorkspace(input: ResolveAgencyWorkspaceInput): AgencyWorkspace {
  const { orgKind, roles, permissions } = input;
  if (!isAgencyOrgKind(orgKind)) {
    return 'owner';
  }

  const mapped = roles
    .map((r) => ROLE_TO_WORKSPACE[r])
    .filter((ws): ws is AgencyWorkspace => Boolean(ws));

  if (mapped.length === 0) {
    return permissionFallbackWorkspace(permissions);
  }

  let best: AgencyWorkspace = mapped[0]!;
  let bestIdx = WORKSPACE_PRIORITY_INDEX.get(best) ?? Number.MAX_SAFE_INTEGER;

  for (const ws of mapped.slice(1)) {
    const idx = WORKSPACE_PRIORITY_INDEX.get(ws) ?? Number.MAX_SAFE_INTEGER;
    if (idx < bestIdx) {
      best = ws;
      bestIdx = idx;
    }
  }

  return best;
}

export function listResolvedWorkspaces(roles: readonly string[]): AgencyWorkspace[] {
  const seen = new Set<AgencyWorkspace>();
  const out: AgencyWorkspace[] = [];
  for (const role of roles) {
    const ws = ROLE_TO_WORKSPACE[role];
    if (ws && !seen.has(ws)) {
      seen.add(ws);
      out.push(ws);
    }
  }
  return out.sort(
    (a, b) =>
      (WORKSPACE_PRIORITY_INDEX.get(a) ?? 99) - (WORKSPACE_PRIORITY_INDEX.get(b) ?? 99),
  );
}
