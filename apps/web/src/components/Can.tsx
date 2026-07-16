import type { ReactNode } from 'react';
import { usePermissions } from '../lib/permissions';

type CanProps = {
  /** Single permission the user must hold (supports `.own` implication). */
  perm?: string;
  /** User must hold at least one of these. */
  anyOf?: readonly string[];
  /** User must hold every one of these. */
  allOf?: readonly string[];
  /** Rendered when the check fails (defaults to nothing — hide entirely). */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Render-gate: shows `children` only when the current role satisfies the
 * permission check, otherwise `fallback` (nothing by default). Hide-by-default
 * is intentional — users only see controls they can actually use.
 */
export function Can({ perm, anyOf, allOf, fallback = null, children }: CanProps) {
  const { has, hasAny, all } = usePermissions();
  let ok = true;
  if (perm) ok = ok && has(perm);
  if (anyOf && anyOf.length) ok = ok && hasAny([...anyOf]);
  if (allOf && allOf.length) ok = ok && all([...allOf]);
  return <>{ok ? children : fallback}</>;
}
