import {
  Check,
  Moon,
  Menu,
  PanelLeft,
  PanelLeftClose,
  LogOut,
  Plus,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { useTheme } from '../theme/theme-provider';
import { localStorageKit } from '../storage/create-storage';
import { StorageKeys } from '../storage/keys';
import { cn } from '../lib/utils';

export type AppShellNavItem = {
  /** Stable id for bookmarks — falls back to `to` when omitted. */
  id?: string;
  to: string;
  label: string;
  active?: boolean;
  icon?: LucideIcon;
  /** Optional section heading, e.g. "Sales" → shown uppercase; collapsed shows first letter */
  section?: string;
};

export type AppShellWorkspace = {
  id: string;
  name: string;
  kindLabel: string;
};

type NavSection = {
  key: string;
  label: string;
  items: AppShellNavItem[];
};

/** Canonical sidebar group order — unknown groups sort last. */
const NAV_SECTION_ORDER = [
  'bookmarks',
  'work',
  'business',
  'planning',
  'operations',
  'finance',
  'sales',
  'dmc',
  'acquire',
  'partners',
  'audit',
  'more',
  'manage',
  'system',
  'travel os',
  'menu',
] as const;

function navItemId(item: AppShellNavItem): string {
  return item.id ?? item.to;
}

function groupNav(nav: AppShellNavItem[]): NavSection[] {
  const sections: NavSection[] = [];
  const index = new Map<string, number>();
  for (const item of nav) {
    const label = item.section?.trim() || 'Menu';
    const key = label.toLowerCase();
    let i = index.get(key);
    if (i === undefined) {
      i = sections.length;
      index.set(key, i);
      sections.push({ key, label, items: [] });
    }
    sections[i]!.items.push(item);
  }
  return sections.sort((a, b) => {
    const ai = NAV_SECTION_ORDER.indexOf(a.key as (typeof NAV_SECTION_ORDER)[number]);
    const bi = NAV_SECTION_ORDER.indexOf(b.key as (typeof NAV_SECTION_ORDER)[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Persist sidebar scroll in a ref + debounced storage — no re-renders while scrolling. */
function useSidebarScroll(storageKey: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(
    (() => {
      const stored = localStorageKit.getJson<number>(storageKey, { version: 1 });
      return typeof stored === 'number' && stored >= 0 ? stored : 0;
    })(),
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const persistScroll = useCallback(() => {
    localStorageKit.setJson(storageKey, scrollTopRef.current, { version: 1 });
  }, [storageKey]);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    if (node) node.scrollTop = scrollTopRef.current;
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(hideTimerRef.current);
      clearTimeout(persistTimerRef.current);
      persistScroll();
    };
  }, [persistScroll]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    scrollTopRef.current = el.scrollTop;

    // Toggle class directly — never React state (re-renders break hover).
    el.classList.add('scrollbar-active');
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      el.classList.remove('scrollbar-active');
    }, 850);

    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistScroll, 400);
  }, [persistScroll]);

  return { scrollRef, onScroll };
}

export function AppShell({
  brandTitle = 'CodePoetry',
  brandSubtitle = 'Travel Agency ERP',
  nav,
  user,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onAddWorkspace,
  onNavigate,
  onLogout,
  headerActions,
  children,
}: {
  brandTitle?: string;
  brandSubtitle?: string;
  nav: AppShellNavItem[];
  user?: { name?: string; org?: string; role?: string };
  /** Organizations the signed-in user can switch between. */
  workspaces?: AppShellWorkspace[];
  activeWorkspaceId?: string;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onAddWorkspace?: () => void;
  onNavigate: (to: string) => void;
  onLogout?: () => void | Promise<void>;
  /** Optional top-bar actions (search, notifications). */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const { resolved, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorageKit.getJson<boolean>(StorageKeys.ui.sidebarCollapsed, { version: 1 });
    return stored ?? false;
  });
  const setCollapsedPersistent = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setCollapsed((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      localStorageKit.setJson(StorageKeys.ui.sidebarCollapsed, resolved, { version: 1 });
      return resolved;
    });
  }, []);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    const stored = localStorageKit.getJson<string[]>(StorageKeys.ui.navBookmarks, { version: 1 });
    return stored ?? [];
  });
  const setBookmarksPersistent = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    setBookmarks((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      localStorageKit.setJson(StorageKeys.ui.navBookmarks, resolved, { version: 1 });
      return resolved;
    });
  }, []);
  const dark = resolved === 'dark';
  const activeWorkspace =
    workspaces?.find((w) => w.id === activeWorkspaceId) || workspaces?.[0];
  const canSwitch = Boolean(workspaces?.length && onSwitchWorkspace);

  const navById = useMemo(() => {
    const map = new Map<string, AppShellNavItem>();
    for (const item of nav) {
      map.set(navItemId(item), item);
    }
    return map;
  }, [nav]);

  const validBookmarks = useMemo(
    () => bookmarks.filter((id) => navById.has(id)),
    [bookmarks, navById],
  );

  const bookmarkItems = useMemo(
    () =>
      validBookmarks
        .map((id) => navById.get(id))
        .filter((item): item is AppShellNavItem => Boolean(item)),
    [navById, validBookmarks],
  );

  const toggleBookmark = useCallback(
    (id: string) => {
      setBookmarksPersistent((prev) => {
        const set = new Set(prev.filter((entry) => navById.has(entry)));
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return [...set];
      });
    },
    [navById, setBookmarksPersistent],
  );

  const sections = useMemo(() => {
    const grouped = groupNav(nav);
    if (bookmarkItems.length === 0) return grouped;
    return [{ key: 'bookmarks', label: 'Bookmarks', items: bookmarkItems }, ...grouped];
  }, [bookmarkItems, nav]);

  const desktopScroll = useSidebarScroll(StorageKeys.ui.sidebarScrollTop);
  const mobileScroll = useSidebarScroll(`${StorageKeys.ui.sidebarScrollTop}.mobile`);

  const NavItemButton = ({
    item,
    compact,
    onPick,
    showBookmarkToggle = true,
  }: {
    item: AppShellNavItem;
    compact?: boolean;
    onPick?: () => void;
    showBookmarkToggle?: boolean;
  }) => {
    const ItemIcon = item.icon;
    const id = navItemId(item);
    const bookmarked = validBookmarks.includes(id);

    const button = (
      <div className="group/nav relative">
        <button
          type="button"
          title={compact ? item.label : undefined}
          aria-label={item.label}
          aria-current={item.active ? 'page' : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onNavigate(item.to);
            onPick?.();
          }}
          className={cn(
            'flex w-full items-center rounded-xl text-left text-sm font-medium transition-colors',
            compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
            showBookmarkToggle && !compact ? 'pr-9' : '',
            item.active
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/75 hover:bg-primary/5 hover:text-foreground',
          )}
        >
          {ItemIcon ? (
            <ItemIcon
              className={cn('size-[18px] shrink-0', item.active ? 'text-primary' : 'opacity-80')}
            />
          ) : null}
          {!compact ? <span className="truncate">{item.label}</span> : null}
        </button>
        {showBookmarkToggle ? (
          <button
            type="button"
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            onClick={(e) => {
              e.stopPropagation();
              toggleBookmark(id);
            }}
            className={cn(
              'absolute rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              compact ? 'right-0 top-1/2 -translate-y-1/2' : 'right-1.5 top-1/2 -translate-y-1/2',
              bookmarked
                ? 'text-amber-500 opacity-100 hover:text-amber-500'
                : 'pointer-events-none opacity-0 group-hover/nav:pointer-events-auto group-hover/nav:opacity-100',
            )}
          >
            <Star className={cn('size-3.5', bookmarked && 'fill-current')} />
          </button>
        ) : null}
      </div>
    );

    if (!compact) return button;

    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const SidebarToggle = ({ compact }: { compact?: boolean }) => {
    const label = compact ? 'Expand sidebar' : 'Collapse sidebar';
    const Icon = compact ? PanelLeft : PanelLeftClose;
    const button = (
      <button
        type="button"
        aria-label={label}
        aria-expanded={!compact}
        onClick={() => setCollapsedPersistent((prev) => !prev)}
        className={cn(
          'flex w-full items-center rounded-xl text-sm font-medium text-foreground/70 transition-colors',
          'hover:bg-primary/5 hover:text-foreground',
          compact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
        )}
      >
        <Icon className="size-[18px] shrink-0 opacity-80" />
        {!compact ? <span>Collapse</span> : null}
      </button>
    );

    if (!compact) return button;

    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const UserMenu = ({ compact }: { compact?: boolean }) => {
    if (!user) return null;

    const avatar = (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {(user.name || '?').slice(0, 1).toUpperCase()}
      </div>
    );

    const trigger = compact ? (
      <button
        type="button"
        className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-offset-background hover:ring-2 hover:ring-primary/30"
        aria-label="Account menu"
      >
        {(user.name || '?').slice(0, 1).toUpperCase()}
      </button>
    ) : (
      <button
        type="button"
        className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left transition-colors hover:bg-muted/50"
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {activeWorkspace
              ? `${activeWorkspace.name} · ${activeWorkspace.kindLabel}`
              : user.role || user.org}
          </div>
        </div>
      </button>
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          side={compact ? 'right' : 'top'}
          align={compact ? 'end' : 'start'}
          className="w-56"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {activeWorkspace
                ? `${activeWorkspace.name} · ${activeWorkspace.kindLabel}`
                : user.role || user.org}
            </div>
          </DropdownMenuLabel>
          {canSwitch ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Switch workspace
              </DropdownMenuLabel>
              {workspaces!.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => {
                    if (w.id !== activeWorkspaceId) onSwitchWorkspace?.(w.id);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {w.name}
                    <span className="ml-1 text-xs text-muted-foreground">· {w.kindLabel}</span>
                  </span>
                  {w.id === activeWorkspaceId ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {onAddWorkspace ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAddWorkspace}>
                <Plus className="size-3.5" />
                Add workspace
              </DropdownMenuItem>
            </>
          ) : null}
          {onLogout ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-3.5" />
                Log out
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const SidebarChrome = ({
    compact,
    onPick,
    scroll,
  }: {
    compact?: boolean;
    onPick?: () => void;
    scroll: ReturnType<typeof useSidebarScroll>;
  }) => {
    const { scrollRef: navScrollRef, onScroll } = scroll;

    return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          'mb-4 flex shrink-0',
          compact ? 'flex-col items-center gap-2' : 'items-center gap-2.5',
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {brandTitle.slice(0, 1)}
        </div>
        {!compact ? (
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-bold tracking-tight text-foreground">
              {brandTitle}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{brandSubtitle}</div>
          </div>
        ) : null}
      </div>

      <div
        ref={navScrollRef}
        onScroll={onScroll}
        className="sidebar-nav-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      >
        {sections.map((section, sectionIndex) => {
          const isSystem = section.key === 'system';
          const isBookmarks = section.key === 'bookmarks';
          return (
            <div
              key={section.key}
              className={cn(
                sectionIndex > 0 && 'border-t border-border/50 pt-4',
                isBookmarks && 'rounded-xl border border-amber-500/20 bg-amber-500/5 p-2 pt-3',
              )}
            >
              {compact ? (
                <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {isBookmarks ? '★' : section.label.charAt(0)}
                </div>
              ) : (
                <div
                  className={cn(
                    'mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em]',
                    isBookmarks ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {section.label}
                </div>
              )}
              <div className="grid gap-0.5">
                {section.items.map((item) => (
                  <NavItemButton
                    key={navItemId(item)}
                    item={item}
                    compact={compact}
                    onPick={onPick}
                  />
                ))}
                {isSystem ? (
                  <div
                    className={cn(
                      'flex items-center rounded-xl',
                      compact ? 'justify-center px-2 py-2' : 'justify-between gap-2 px-3 py-2',
                    )}
                  >
                    {!compact ? (
                      <span className="flex items-center gap-3 text-sm font-medium text-foreground/75">
                        <Moon className="size-[18px] opacity-80" />
                        Dark mode
                      </span>
                    ) : null}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={dark}
                      aria-label="Toggle dark mode"
                      onClick={toggle}
                      className={cn(
                        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                        dark ? 'bg-primary' : 'bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-5 rounded-full bg-card shadow transition-transform',
                          dark ? 'left-[22px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {!sections.some((s) => s.key === 'system') ? (
          <div className="border-t border-border/50 pt-4">
            {compact ? (
              <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                S
              </div>
            ) : (
              <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                System
              </div>
            )}
            <div
              className={cn(
                'flex items-center rounded-xl',
                compact ? 'justify-center px-2 py-2' : 'justify-between gap-2 px-3 py-2',
              )}
            >
              {!compact ? (
                <span className="flex items-center gap-3 text-sm font-medium text-foreground/75">
                  <Moon className="size-[18px] opacity-80" />
                  Dark mode
                </span>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={dark}
                aria-label="Toggle dark mode"
                onClick={toggle}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                  dark ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-full bg-card shadow transition-transform',
                    dark ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 shrink-0 space-y-1 border-t border-border/70 pt-3">
        <SidebarToggle compact={compact} />
        <UserMenu compact={compact} />
      </div>
    </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="relative flex h-svh overflow-hidden bg-transparent">
        <aside
          className={cn(
            'relative z-10 hidden h-svh min-h-0 shrink-0 flex-col overflow-hidden border-r text-foreground transition-[width] duration-200 ease-out md:flex glass-panel',
            collapsed ? 'w-[76px] px-2.5 py-4' : 'w-[260px] px-4 py-5',
          )}
        >
          <SidebarChrome compact={collapsed} scroll={desktopScroll} />
        </aside>

        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="absolute left-3 top-3 z-30 border-border/60 glass md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>

          {headerActions ? (
            <div className="relative z-20 flex shrink-0 items-center justify-end gap-2 border-b border-border/50 px-4 pb-2 pt-14 md:px-7 md:pt-4">
              {headerActions}
            </div>
          ) : null}

          <main
            className={cn(
              'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-10 md:p-7 md:pb-12',
              headerActions ? 'pt-4 md:pt-5' : 'pt-14 md:pt-7',
            )}
          >
            {children}
          </main>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] border-0 p-5 text-foreground sm:max-w-[280px]">
            <SheetHeader className="sr-only border-0 p-0">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <SidebarChrome onPick={() => setMobileOpen(false)} scroll={mobileScroll} />
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
