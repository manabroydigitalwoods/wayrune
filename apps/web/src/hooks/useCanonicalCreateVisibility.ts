import { useAgencyWorkspace } from './useAgencyWorkspace';
import {
  shouldShowCanonicalCreate,
  type CanonicalCreateKind,
} from '../lib/progressiveComplexity';

/** Whether a prominent canonical create action should appear for the active workspace. */
export function useCanonicalCreateVisibility(kind: CanonicalCreateKind): boolean {
  const { workspace, isAgency } = useAgencyWorkspace();
  if (!isAgency || !workspace) return true;
  return shouldShowCanonicalCreate(workspace, kind);
}
