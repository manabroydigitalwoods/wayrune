import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@wayrune/ui';
import { useAuth } from '../auth';
import { orgPath, orgPortalRef } from '../lib/agencyRoutes';
import { isPlatformKind } from '../lib/orgKind';

/**
 * Layout for `/:orgRef/*` portal routes (agency + partner).
 * Keeps JWT org aligned with the portal id in the URL.
 * Expects an outer shell (auth + AppShell) already wrapping this route.
 */
export function OrgScopedLayout() {
  const { orgRef } = useParams<{ orgRef: string }>();
  const { me, loading, switchOrganization } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (loading || !me || !orgRef) return;
    if (isPlatformKind(me.organization.kind)) return;

    const activeRef = orgPortalRef(me.organization);
    const activeId = me.organization.id;
    const matchesActive = orgRef === activeRef || orgRef === activeId;

    if (matchesActive) {
      setSyncError('');
      if (orgRef !== activeRef && activeRef !== activeId) {
        const rest = location.pathname.slice(`/${orgRef}`.length) || '';
        navigate(`/${activeRef}${rest}${location.search}`, { replace: true });
      }
      return;
    }

    const membership = (me.memberships ?? []).find(
      (m) =>
        m.organizationId === orgRef ||
        (m.publicCode != null && String(m.publicCode) === orgRef),
    );

    if (!membership) {
      setSyncError('You do not have access to this organization.');
      return;
    }

    setSyncing(true);
    setSyncError('');
    void switchOrganization(membership.organizationId, { redirectTo: false })
      .then(() => {
        const ref = orgPortalRef({
          id: membership.organizationId,
          publicCode: membership.publicCode,
        });
        if (ref !== orgRef) {
          const rest = location.pathname.slice(`/${orgRef}`.length) || '';
          navigate(`/${ref}${rest}${location.search}`, { replace: true });
        }
      })
      .catch((e) =>
        setSyncError(e instanceof Error ? e.message : 'Could not switch organization'),
      )
      .finally(() => setSyncing(false));
  }, [
    loading,
    me?.organization.id,
    me?.organization.publicCode,
    me?.organization.kind,
    me?.memberships,
    orgRef,
    location.pathname,
    location.search,
    navigate,
    switchOrganization,
  ]);

  if (loading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (isPlatformKind(me.organization.kind)) {
    return <Navigate to="/" replace />;
  }
  if (syncError) {
    return (
      <div className="p-10">
        <EmptyState
          title="Organization access"
          description={syncError}
          action={
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => navigate(orgPath(orgPortalRef(me.organization), '/'))}
            >
              Go to your workspace
            </button>
          }
        />
      </div>
    );
  }
  if (syncing) {
    return <div className="p-10 text-muted-foreground">Switching organization…</div>;
  }

  return <Outlet />;
}
