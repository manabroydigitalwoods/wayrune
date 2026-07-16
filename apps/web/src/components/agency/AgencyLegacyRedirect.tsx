import { Navigate, useLocation } from 'react-router-dom';
import { LEGACY_AGENCY_REDIRECTS } from '../../lib/agencyRoutes';

/** Redirects legacy `?query` bookmark URLs to first-class agency routes. */
export function AgencyLegacyRedirect() {
  const { pathname, search } = useLocation();
  const target = LEGACY_AGENCY_REDIRECTS[`${pathname}${search}`];
  if (!target) return <Navigate to="/" replace />;
  return <Navigate to={target} replace />;
}
