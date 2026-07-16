import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@travel/rbac';
import { TRAVEL_REQUEST_PERMISSIONS } from '../capabilities';
import {
  AGENCY_UI_CAPABILITIES,
  composeAgencyNavigation,
  resolveAgencyWorkspace,
  shouldShowCanonicalCreate,
  WORKSPACE_NAV_PROFILES,
} from './index';

const VALID = new Set<string>(PERMISSIONS);

describe('Progressive Complexity 1.0 contract', () => {
  it('registers capabilities with valid permission keys only', () => {
    const bad: string[] = [];
    for (const cap of AGENCY_UI_CAPABILITIES) {
      for (const perm of cap.requiredAllPermissions ?? []) {
        if (!VALID.has(perm)) bad.push(`${cap.key} all -> ${perm}`);
      }
      for (const perm of cap.requiredAnyPermissions ?? []) {
        if (!VALID.has(perm)) bad.push(`${cap.key} any -> ${perm}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('travel request capability requires the atomic intake permission set', () => {
    const cap = AGENCY_UI_CAPABILITIES.find((c) => c.key === 'agency.travel_request.create');
    expect(cap?.requiredAllPermissions).toEqual([...TRAVEL_REQUEST_PERMISSIONS]);
  });

  it('every workspace profile references registered capabilities', () => {
    const keys = new Set(AGENCY_UI_CAPABILITIES.map((c) => c.key));
    const missing: string[] = [];
    for (const [ws, profile] of Object.entries(WORKSPACE_NAV_PROFILES)) {
      for (const band of ['primary', 'secondary', 'advanced'] as const) {
        for (const key of profile[band] ?? []) {
          if (!keys.has(key)) missing.push(`${ws}.${band}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('resolves highest-priority workspace when multiple roles are present', () => {
    expect(
      resolveAgencyWorkspace({
        orgKind: 'travel_agency',
        roles: ['sales_executive', 'sales_manager'],
        permissions: [],
      }),
    ).toBe('sales_manager');
    expect(
      resolveAgencyWorkspace({
        orgKind: 'travel_agency',
        roles: ['finance', 'operations'],
        permissions: [],
      }),
    ).toBe('operations');
  });

  it('maps admin to owner workspace', () => {
    expect(
      resolveAgencyWorkspace({
        orgKind: 'travel_agency',
        roles: ['admin'],
        permissions: [],
      }),
    ).toBe('owner');
  });

  it('composes sales executive nav with Inbox in primary and Leads in More', () => {
    const nav = composeAgencyNavigation({
      orgKind: 'travel_agency',
      workspace: 'sales_executive',
      permissions: [
        'party.read',
        'party.write',
        'lead.read.own',
        'lead.write',
        'inquiry.read',
        'inquiry.write',
        'trip.read',
        'quote.read',
        'task.read',
      ],
    });
    expect(nav).not.toBeNull();
    const primaryKeys = nav!.primary.map((i) => i.key);
    expect(primaryKeys).not.toContain('agency.travel_request.create');
    expect(primaryKeys).toContain('agency.requests.mine');
    expect(primaryKeys).toContain('agency.inbox');
    expect(primaryKeys).not.toContain('agency.leads');
    expect(nav!.secondary.map((i) => i.key)).toContain('agency.leads');
  });

  it('hides parallel create actions for sales executive', () => {
    expect(shouldShowCanonicalCreate('sales_executive', 'lead')).toBe(false);
    expect(shouldShowCanonicalCreate('sales_executive', 'inquiry')).toBe(false);
    expect(shouldShowCanonicalCreate('sales_manager', 'lead')).toBe(true);
  });

  it('operations workspace omits travel request from primary nav when not permitted', () => {
    const nav = composeAgencyNavigation({
      orgKind: 'travel_agency',
      workspace: 'operations',
      permissions: ['trip.read', 'ops.read', 'party.read'],
    });
    const keys = nav!.flat.map((i) => i.key);
    expect(keys).not.toContain('agency.travel_request.create');
    expect(keys).toContain('agency.operations_centre');
  });

  it('composed nav has no duplicate routes per workspace', () => {
    const allPerms = [...PERMISSIONS];
    const workspaces = Object.keys(WORKSPACE_NAV_PROFILES) as Array<
      keyof typeof WORKSPACE_NAV_PROFILES
    >;
    const duplicates: string[] = [];
    for (const workspace of workspaces) {
      const nav = composeAgencyNavigation({
        orgKind: 'travel_agency',
        workspace,
        permissions: allPerms,
      });
      if (!nav) continue;
      const seen = new Set<string>();
      for (const item of nav.flat) {
        if (seen.has(item.to)) {
          duplicates.push(`${workspace}: ${item.to} (${item.key})`);
        }
        seen.add(item.to);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('sales manager team follow-ups route differs from tasks', () => {
    const nav = composeAgencyNavigation({
      orgKind: 'travel_agency',
      workspace: 'sales_manager',
      permissions: ['task.read', 'lead.read', 'inquiry.read', 'party.read', 'quote.read'],
    });
    const followups = nav!.flat.find((i) => i.key === 'agency.team_followups');
    const tasks = nav!.flat.find((i) => i.key === 'agency.tasks');
    expect(followups?.to).not.toBe(tasks?.to);
    expect(followups?.to).toContain('follow');
  });

  it('auditor finance nav items use distinct document and payment routes', () => {
    const nav = composeAgencyNavigation({
      orgKind: 'travel_agency',
      workspace: 'auditor',
      permissions: ['trip.read', 'quote.read', 'finance.cost.read', 'audit.read'],
    });
    const documents = nav!.flat.find((i) => i.key === 'agency.audit_documents');
    const payments = nav!.flat.find((i) => i.key === 'agency.audit_payments');
    expect(documents?.to).toBe('/finance/documents');
    expect(payments?.to).toBe('/finance/payments');
    expect(documents?.to).not.toBe(payments?.to);
  });
});
