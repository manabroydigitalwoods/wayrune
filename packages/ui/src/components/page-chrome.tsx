import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import type { BreadcrumbItem } from './breadcrumbs';

export type PageChromeState = {
  title?: string;
  /** Small inline text after the title (e.g. phone on lead detail). */
  titleMeta?: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  /** Shown under the title in the AppShell top bar (detail pages). */
  breadcrumbs?: BreadcrumbItem[];
};

type PageChromeContextValue = {
  chrome: PageChromeState;
  setChrome: (next: PageChromeState) => void;
};

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<PageChromeState>({});
  const value = useMemo(() => ({ chrome, setChrome }), [chrome]);
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function usePageChromeState() {
  return useContext(PageChromeContext)?.chrome ?? {};
}

/**
 * Publishes the active page title/subtitle/breadcrumbs into the AppShell top nav bar.
 * Clears on unmount so the next route does not inherit stale chrome.
 */
export function usePageChrome(chrome: PageChromeState) {
  const setChrome = useContext(PageChromeContext)?.setChrome;
  const title = chrome.title;
  const titleMeta = chrome.titleMeta;
  const icon = chrome.icon;
  const subtitle = chrome.subtitle;
  const breadcrumbs = chrome.breadcrumbs;
  const breadcrumbKey = breadcrumbs?.map((b) => b.label).join('\0') ?? '';
  const breadcrumbsRef = useRef(breadcrumbs);
  breadcrumbsRef.current = breadcrumbs;

  useLayoutEffect(() => {
    if (!setChrome) return;
    setChrome({
      title,
      titleMeta,
      icon,
      subtitle,
      breadcrumbs: breadcrumbsRef.current,
    });
    return () => setChrome({});
  }, [setChrome, title, titleMeta, icon, subtitle, breadcrumbKey]);
}
