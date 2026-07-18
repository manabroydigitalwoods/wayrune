import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { useOrgPath } from './useOrgPath';

/**
 * navigate() that prefixes agency-relative paths with the current org portal ref.
 * Absolute URLs, hashes, and already-scoped paths are left unchanged.
 */
export function useOrgNavigate() {
  const navigate = useNavigate();
  const { toOrgPath, orgRef } = useOrgPath();

  const orgNavigate = useCallback(
    (to: To, options?: NavigateOptions) => {
      if (typeof to !== 'string') {
        navigate(to, options);
        return;
      }
      if (
        !to.startsWith('/') ||
        to.startsWith('//') ||
        to.startsWith('/login') ||
        to.startsWith('/claim') ||
        to.startsWith('/accept') ||
        to.startsWith('/p/') ||
        to.startsWith('/o/')
      ) {
        navigate(to, options);
        return;
      }
      navigate(toOrgPath(to), options);
    },
    [navigate, toOrgPath],
  );

  return { navigate: orgNavigate, toOrgPath, orgRef };
}
