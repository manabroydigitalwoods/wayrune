import type { PermissionKey } from '@travel/rbac';

/** How much complexity the interface exposes at a moment in time. */
export type DisclosureLevel = 'primary' | 'secondary' | 'advanced';

/**
 * Job-shaped experience surface for agency users. Distinct from RBAC role keys
 * (admin maps to owner; custom roles resolve via permission fallback).
 */
export type AgencyWorkspace =
  | 'owner'
  | 'sales_manager'
  | 'sales_executive'
  | 'travel_consultant'
  | 'operations'
  | 'finance'
  | 'auditor';

export type AgencyOrgKind = 'travel_agency' | 'dmc';

/** Sentinel route — intercepted by App shell to open Travel Request intake. */
export const NEW_TRAVEL_REQUEST_ROUTE = '#new-travel-request';

/**
 * Progressive Complexity 1.0 — presentation registry entry.
 *
 * Permissions gate access; disclosure level and workspace profile gate visibility.
 * Never use a UI-only permission — always reference real business permissions.
 */
export interface UiCapability {
  key: string;
  label: string;
  /** Route path or sentinel (e.g. #new-travel-request). */
  route?: string;
  /** Lucide icon component name — resolved in the navigation composer. */
  icon?: string;

  allowedOrgKinds: readonly AgencyOrgKind[];
  /** When omitted, any workspace with sufficient permissions may see the item. */
  allowedWorkspaces?: readonly AgencyWorkspace[];

  /** OR semantics — at least one required. */
  requiredAnyPermissions?: readonly PermissionKey[];
  /** AND semantics — all required. Takes precedence over requiredAnyPermissions. */
  requiredAllPermissions?: readonly PermissionKey[];

  disclosureLevel: DisclosureLevel;
  /** Sidebar section heading (e.g. Sales, More, Manage). */
  navigationGroup?: string;

  isCreateAction?: boolean;
  /** When false, capability is used for permissions/CTAs but omitted from sidebar nav. */
  showInNavigation?: boolean;
  /** Lower sorts earlier within the same disclosure band. */
  priority?: number;

  /** Per-workspace label override without duplicating capability rows. */
  workspaceLabels?: Partial<Record<AgencyWorkspace, string>>;
}

export interface WorkspaceNavigationInput {
  orgKind: string | null | undefined;
  workspace: AgencyWorkspace;
  permissions: readonly string[];
  /** Future: user preference to expand advanced nav by default. */
  showAdvancedNav?: boolean;
}

export interface ComposedNavItem {
  key: string;
  to: string;
  label: string;
  icon: string;
  section: string;
  disclosureLevel: DisclosureLevel;
}

export interface WorkspaceNavigationResult {
  workspace: AgencyWorkspace;
  primary: ComposedNavItem[];
  secondary: ComposedNavItem[];
  advanced: ComposedNavItem[];
  /** Flat list for AppShell — primary, then secondary, then advanced (when expanded). */
  flat: ComposedNavItem[];
}

export interface ResolveAgencyWorkspaceInput {
  orgKind: string | null | undefined;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface WorkspaceWidget {
  key: string;
  title: string;
  requiredAnyPermissions?: readonly PermissionKey[];
  allowedWorkspaces: readonly AgencyWorkspace[];
  priority: number;
}

export type CanonicalCreateKind = 'lead' | 'inquiry' | 'trip' | 'party';

export type ExperienceAnalyticsEvent =
  | 'travel_request_started'
  | 'travel_request_completed'
  | 'travel_request_abandoned'
  | 'travel_request_source'
  | 'time_to_capture'
  | 'follow_up_created'
  | 'continue_planning_selected'
  | 'canonical_create_used'
  | 'workspace_navigation_used'
  | 'advanced_section_opened';
