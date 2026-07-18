import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { listPagePaths } from '@/lib/site';
import { getLastPath, setLastPath } from '@/storage';

type NavigationContextValue = {
  path: string;
  navigate: (to: string) => void;
  isActive: (to: string) => boolean;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

function normalizePath(raw: string): string {
  if (!raw || raw === '#') return '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return path.split('?')[0] || '/';
}

function readHashPath(): string {
  return normalizePath(window.location.hash.replace(/^#/, '') || '/');
}

function initialPath(): string {
  if (window.location.hash && window.location.hash !== '#') {
    return readHashPath();
  }
  const remembered = getLastPath();
  if (remembered && listPagePaths().includes(remembered)) return remembered;
  return '/';
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(initialPath);

  const navigate = useCallback((to: string) => {
    const next = normalizePath(to);
    window.location.hash = next;
  }, []);

  useEffect(() => {
    const onHash = () => {
      const next = readHashPath();
      setPath(next);
      setLastPath(next);
    };

    if (!window.location.hash || window.location.hash === '#') {
      window.location.replace(`#${path}`);
    } else {
      setLastPath(path);
    }

    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }
      if (href.startsWith('#')) return;
      e.preventDefault();
      navigate(href);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      path,
      navigate,
      isActive: (to) => normalizePath(to) === path,
    }),
    [path, navigate],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
