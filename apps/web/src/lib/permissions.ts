import { useAuth } from '../auth';
// Single source of truth for the `.own`/implication logic. Browser-safe: the
// `@travel/rbac` package has zero Node deps (unlike `@travel/config`/`@travel/auth`).
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@travel/rbac';

export { hasPermission, hasAnyPermission, hasAllPermissions };

/** Permission helpers bound to the current user, tolerant of `me` still loading. */
export function usePermissions() {
  const { me } = useAuth();
  const permissions = me?.permissions ?? [];
  return {
    permissions,
    has: (required: string) => hasPermission(permissions, required),
    hasAny: (required: readonly string[]) => hasAnyPermission(permissions, required),
    all: (required: readonly string[]) => hasAllPermissions(permissions, required),
  };
}
