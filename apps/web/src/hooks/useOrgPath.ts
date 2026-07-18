import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { orgPath, orgPortalRef } from '../lib/agencyRoutes';

/**
 * Build org-prefixed paths for the active agency portal.
 * Prefer URL `:orgRef` when present; fall back to the JWT org.
 */
export function useOrgPath() {
  const { me } = useAuth();
  const { orgRef: paramOrgRef } = useParams<{ orgRef?: string }>();

  const orgRef = useMemo(() => {
    if (paramOrgRef) return paramOrgRef;
    if (me?.organization) return orgPortalRef(me.organization);
    return '';
  }, [paramOrgRef, me?.organization]);

  const toOrgPath = useCallback(
    (path = '/') => {
      if (!orgRef) return path.startsWith('/') ? path : `/${path}`;
      return orgPath(orgRef, path);
    },
    [orgRef],
  );

  return { orgRef, toOrgPath, orgPath: toOrgPath };
}
