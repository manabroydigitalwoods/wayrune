import { hasAllPermissions, hasAnyPermission } from '@travel/rbac';
import type {
  AgencyOrgKind,
  ComposedNavItem,
  DisclosureLevel,
  UiCapability,
  WorkspaceNavigationInput,
  WorkspaceNavigationResult,
} from './types';
import { AGENCY_UI_CAPABILITIES, WORKSPACE_NAV_PROFILES } from './uiCapabilities';

function isAgencyOrgKind(kind: string | null | undefined): kind is AgencyOrgKind {
  return !kind || kind === 'travel_agency' || kind === 'dmc';
}

function capabilityPermitted(cap: UiCapability, permissions: readonly string[]): boolean {
  if (cap.requiredAllPermissions?.length) {
    return hasAllPermissions(permissions, cap.requiredAllPermissions);
  }
  if (cap.requiredAnyPermissions?.length) {
    return hasAnyPermission(permissions, cap.requiredAnyPermissions);
  }
  return true;
}

function capabilityAllowedForWorkspace(cap: UiCapability, workspace: string): boolean {
  if (!cap.allowedWorkspaces?.length) return true;
  return cap.allowedWorkspaces.includes(workspace as never);
}

function resolveLabel(cap: UiCapability, workspace: string): string {
  const override = cap.workspaceLabels?.[workspace as keyof typeof cap.workspaceLabels];
  return override ?? cap.label;
}

function toNavItem(cap: UiCapability, workspace: string, level: DisclosureLevel): ComposedNavItem {
  return {
    key: cap.key,
    to: cap.route ?? '/',
    label: resolveLabel(cap, workspace),
    icon: cap.icon ?? 'Circle',
    section: cap.navigationGroup ?? (level === 'advanced' ? 'Manage' : level === 'secondary' ? 'More' : 'Work'),
    disclosureLevel: level,
  };
}

function pickFromProfile(
  keys: readonly string[],
  workspace: string,
  permissions: readonly string[],
  orgKind: AgencyOrgKind,
  level: DisclosureLevel,
  seenKeys: Set<string>,
  seenRoutes: Set<string>,
): ComposedNavItem[] {
  const out: ComposedNavItem[] = [];
  for (const key of keys) {
    const cap = AGENCY_UI_CAPABILITIES.find((c) => c.key === key);
    if (!cap) continue;
    if (cap.showInNavigation === false) continue;
    if (seenKeys.has(key)) continue;
    if (!cap.allowedOrgKinds.includes(orgKind)) continue;
    if (!capabilityAllowedForWorkspace(cap, workspace)) continue;
    if (!capabilityPermitted(cap, permissions)) continue;
    const route = cap.route ?? '/';
    if (seenRoutes.has(route)) continue;
    seenKeys.add(key);
    seenRoutes.add(route);
    out.push(toNavItem(cap, workspace, level));
  }
  return out;
}

/**
 * Assemble role-shaped agency navigation from the UI capability registry.
 * Falls back to permission-filtered capabilities when profile keys are missing.
 */
export function composeAgencyNavigation(
  input: WorkspaceNavigationInput,
): WorkspaceNavigationResult | null {
  const { orgKind, workspace, permissions, showAdvancedNav = false } = input;
  if (!isAgencyOrgKind(orgKind)) return null;

  const profile = WORKSPACE_NAV_PROFILES[workspace];
  const seenKeys = new Set<string>();
  const seenRoutes = new Set<string>();

  const primary = pickFromProfile(
    profile.primary,
    workspace,
    permissions,
    orgKind,
    'primary',
    seenKeys,
    seenRoutes,
  );
  const secondary = pickFromProfile(
    profile.secondary ?? [],
    workspace,
    permissions,
    orgKind,
    'secondary',
    seenKeys,
    seenRoutes,
  );
  const advanced = pickFromProfile(
    profile.advanced ?? [],
    workspace,
    permissions,
    orgKind,
    'advanced',
    seenKeys,
    seenRoutes,
  );

  // Always include advanced items in flat nav under Manage/More — collapsed by section
  // for v1; showAdvancedNav only affects future compact modes.
  const flat = [...primary, ...secondary, ...advanced];

  return { workspace, primary, secondary, advanced, flat };
}

/** Whether the workspace should show the header/sidebar Travel Request CTA. */
export function workspaceShowsTravelRequestIntake(
  workspace: string,
  permissions: readonly string[],
): boolean {
  const cap = AGENCY_UI_CAPABILITIES.find((c) => c.key === 'agency.travel_request.create');
  if (!cap) return false;
  if (!capabilityAllowedForWorkspace(cap, workspace)) return false;
  return capabilityPermitted(cap, permissions);
}
