import { useCallback, useMemo } from 'react';
import { usePersistentState } from '@wayrune/ui';
import { useAuth } from '../auth';
import { isAgencyKind } from '../lib/orgKind';
import {
  composeAgencyNavigation,
  listResolvedWorkspaces,
  resolveAgencyWorkspace,
  WORKSPACE_LABELS,
  type AgencyWorkspace,
  type WorkspaceNavigationResult,
} from '../lib/progressiveComplexity';

const JOB_WORKSPACE_KEY = 'experience.jobWorkspace';

export function useAgencyWorkspace(): {
  workspace: AgencyWorkspace | null;
  workspaceLabel: string | null;
  navigation: WorkspaceNavigationResult | null;
  roles: readonly string[];
  isAgency: boolean;
  availableWorkspaces: AgencyWorkspace[];
  setJobWorkspace: (workspace: AgencyWorkspace | null) => void;
} {
  const { me } = useAuth();
  const isAgency = isAgencyKind(me?.organization.kind);
  const roles = me?.roles ?? [];
  const permissions = me?.permissions ?? [];

  const availableWorkspaces = useMemo(
    () => (isAgency ? listResolvedWorkspaces(roles) : []),
    [isAgency, roles],
  );

  const [jobOverride, setJobOverride] = usePersistentState<AgencyWorkspace | ''>(
    JOB_WORKSPACE_KEY,
    '',
  );

  const resolvedWorkspace = useMemo(() => {
    if (!isAgency || !me) return null;
    return resolveAgencyWorkspace({
      orgKind: me.organization.kind,
      roles,
      permissions,
    });
  }, [isAgency, me, roles, permissions]);

  const workspace = useMemo(() => {
    if (!resolvedWorkspace) return null;
    if (
      jobOverride &&
      availableWorkspaces.includes(jobOverride as AgencyWorkspace)
    ) {
      return jobOverride as AgencyWorkspace;
    }
    return resolvedWorkspace;
  }, [availableWorkspaces, jobOverride, resolvedWorkspace]);

  const navigation = useMemo(() => {
    if (!workspace || !me) return null;
    return composeAgencyNavigation({
      orgKind: me.organization.kind,
      workspace,
      permissions,
    });
  }, [workspace, me, permissions]);

  const workspaceLabel = workspace ? WORKSPACE_LABELS[workspace] : null;

  const setJobWorkspace = useCallback(
    (next: AgencyWorkspace | null) => {
      setJobOverride(next ?? '');
    },
    [setJobOverride],
  );

  return {
    workspace,
    workspaceLabel,
    navigation,
    roles,
    isAgency,
    availableWorkspaces,
    setJobWorkspace,
  };
}
