/** Site menu helpers: named menus, one-level children, navigationJson compatibility. */

import { isPresenceMenuIconKey, presenceMenuIconHtml } from '@wayrune/contracts';

export type PresenceMenuItem = {
  id: string;
  label: string;
  path: string;
  type?: 'page' | 'custom';
  pageId?: string;
  openInNewTab?: boolean;
  /** Curated SVG icon key from PRESENCE_MENU_ICONS. */
  icon?: string;
  children?: PresenceMenuItem[];
};

export type PresenceMenu = {
  id: string;
  name: string;
  items: PresenceMenuItem[];
};

export type PresenceMenusJson = Record<string, PresenceMenu>;
export type PresenceMenuAssignments = Record<string, string>;

export const DEFAULT_MENU_ASSIGNMENTS: PresenceMenuAssignments = {
  primary: 'primary',
  footer: 'footer',
};

export const DEFAULT_MENU_LOCATIONS = [
  { key: 'primary', label: 'Primary', description: 'Header nav' },
  { key: 'footer', label: 'Footer', description: 'Footer links' },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Prefer `path`; accept legacy `href` from sample packages / props. */
export function normalizeMenuPath(entry: Record<string, unknown>): string {
  const path = entry.path ?? entry.href;
  if (typeof path === 'string' && path.trim()) return path.trim();
  return '/';
}

export function normalizeMenuItem(raw: unknown, index = 0): PresenceMenuItem | null {
  const row = asRecord(raw);
  const label =
    (typeof row.label === 'string' && row.label.trim()) ||
    (typeof row.title === 'string' && row.title.trim()) ||
    '';
  if (!label) return null;
  const path = normalizeMenuPath(row);
  const id =
    typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newId(`mi${index}`);
  const type = row.type === 'page' || row.type === 'custom' ? row.type : undefined;
  const pageId = typeof row.pageId === 'string' && row.pageId ? row.pageId : undefined;
  const openInNewTab = row.openInNewTab === true ? true : undefined;
  const icon = isPresenceMenuIconKey(row.icon) ? row.icon : undefined;
  const childrenRaw = Array.isArray(row.children) ? row.children : [];
  const children = childrenRaw
    .map((child, i) => normalizeMenuItem(child, i))
    .filter((c): c is PresenceMenuItem => Boolean(c))
    .map((c) => {
      // v1: flatten grandchildren into the child (no deeper nesting).
      const { children: _nested, ...leaf } = c;
      return leaf;
    })
    .slice(0, 20);
  return {
    id,
    label,
    path,
    ...(type ? { type } : {}),
    ...(pageId ? { pageId } : {}),
    ...(openInNewTab ? { openInNewTab } : {}),
    ...(icon ? { icon } : {}),
    ...(children.length ? { children } : {}),
  };
}

export function flattenMenuItemsToNav(
  items: PresenceMenuItem[],
): Array<{ label: string; path: string }> {
  const out: Array<{ label: string; path: string }> = [];
  for (const item of items) {
    out.push({ label: item.label, path: item.path });
    if (item.children?.length) {
      for (const child of item.children) {
        out.push({ label: child.label, path: child.path });
      }
    }
  }
  return out;
}

/** Flat nav for publish snapshots / older clients — Primary menu top-level only. */
export function primaryNavFromMenus(
  menus: PresenceMenusJson,
  assignments: PresenceMenuAssignments = DEFAULT_MENU_ASSIGNMENTS,
): Array<{ label: string; path: string }> {
  const menuKey = assignments.primary || 'primary';
  const menu = menus[menuKey] || menus.primary;
  if (!menu?.items?.length) return [];
  return menu.items.map((item) => ({ label: item.label, path: item.path }));
}

export function menusFromNavigation(
  navigation: unknown,
  opts?: { footerNav?: unknown },
): { menusJson: PresenceMenusJson; menuAssignmentsJson: PresenceMenuAssignments } {
  const navItems = (Array.isArray(navigation) ? navigation : [])
    .map((row, i) => normalizeMenuItem(row, i))
    .filter((row): row is PresenceMenuItem => Boolean(row));

  const footerItems = (Array.isArray(opts?.footerNav) ? opts!.footerNav : [])
    .map((row, i) => normalizeMenuItem(row, i))
    .filter((row): row is PresenceMenuItem => Boolean(row));

  const menusJson: PresenceMenusJson = {
    primary: {
      id: 'primary',
      name: 'Primary',
      items: navItems.length ? navItems : [{ id: 'mi_home', label: 'Home', path: '/' }],
    },
    footer: {
      id: 'footer',
      name: 'Footer',
      items: footerItems,
    },
  };

  return {
    menusJson,
    menuAssignmentsJson: { ...DEFAULT_MENU_ASSIGNMENTS },
  };
}

export function normalizeMenusJson(raw: unknown): PresenceMenusJson | null {
  const record = asRecord(raw);
  const keys = Object.keys(record);
  if (!keys.length) return null;
  const out: PresenceMenusJson = {};
  for (const key of keys) {
    const menu = asRecord(record[key]);
    const items = (Array.isArray(menu.items) ? menu.items : [])
      .map((row, i) => normalizeMenuItem(row, i))
      .filter((row): row is PresenceMenuItem => Boolean(row));
    out[key] = {
      id: typeof menu.id === 'string' && menu.id ? menu.id : key,
      name: typeof menu.name === 'string' && menu.name.trim() ? menu.name.trim() : key,
      items,
    };
  }
  return out;
}

export function normalizeAssignments(raw: unknown): PresenceMenuAssignments | null {
  const record = asRecord(raw);
  const keys = Object.keys(record);
  if (!keys.length) return null;
  const out: PresenceMenuAssignments = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Resolve menus for a site row. Derives from navigationJson when menusJson is empty.
 */
export function resolveSiteMenus(site: {
  navigationJson?: unknown;
  menusJson?: unknown;
  menuAssignmentsJson?: unknown;
}): {
  menusJson: PresenceMenusJson;
  menuAssignmentsJson: PresenceMenuAssignments;
  navigationJson: Array<{ label: string; path: string }>;
  derived: boolean;
} {
  const existingMenus = normalizeMenusJson(site.menusJson);
  const existingAssignments = normalizeAssignments(site.menuAssignmentsJson);

  if (existingMenus && Object.keys(existingMenus).length) {
    const menusJson = {
      ...(!existingMenus.primary
        ? {
            primary: {
              id: 'primary',
              name: 'Primary',
              items: (Array.isArray(site.navigationJson) ? site.navigationJson : [])
                .map((row, i) => normalizeMenuItem(row, i))
                .filter((row): row is PresenceMenuItem => Boolean(row)),
            },
          }
        : {}),
      ...(!existingMenus.footer
        ? { footer: { id: 'footer', name: 'Footer', items: [] as PresenceMenuItem[] } }
        : {}),
      ...existingMenus,
    };
    const menuAssignmentsJson = {
      ...DEFAULT_MENU_ASSIGNMENTS,
      ...(existingAssignments || {}),
    };
    return {
      menusJson,
      menuAssignmentsJson,
      navigationJson: primaryNavFromMenus(menusJson, menuAssignmentsJson),
      derived: false,
    };
  }

  const built = menusFromNavigation(site.navigationJson);
  return {
    ...built,
    navigationJson: primaryNavFromMenus(built.menusJson, built.menuAssignmentsJson),
    derived: true,
  };
}

/** Seed menus (+ flat nav) from structure.json / template structure. */
export function menusFromStructure(structure: Record<string, unknown>): {
  menusJson: PresenceMenusJson;
  menuAssignmentsJson: PresenceMenuAssignments;
  navigationJson: Array<{ label: string; path: string }>;
} {
  const explicitMenus = normalizeMenusJson(structure.menus);
  const explicitAssignments = normalizeAssignments(structure.menuAssignments);
  if (explicitMenus) {
    const menuAssignmentsJson = {
      ...DEFAULT_MENU_ASSIGNMENTS,
      ...(explicitAssignments || {}),
    };
    const menusJson = {
      footer: { id: 'footer', name: 'Footer', items: [] as PresenceMenuItem[] },
      ...explicitMenus,
    };
    return {
      menusJson,
      menuAssignmentsJson,
      navigationJson: primaryNavFromMenus(menusJson, menuAssignmentsJson),
    };
  }

  const navigation = Array.isArray(structure.navigation) ? structure.navigation : [];
  // Normalize legacy href → path on flat navigation entries.
  const normalizedNav = navigation.map((row) => {
    const r = asRecord(row);
    return {
      ...r,
      path: normalizeMenuPath(r),
      label: r.label || r.title || 'Link',
    };
  });
  const footerNav = Array.isArray(structure.footerNavigation)
    ? structure.footerNavigation
    : Array.isArray(asRecord(structure.globalRegions).footerLinks)
      ? asRecord(structure.globalRegions).footerLinks
      : [];
  const built = menusFromNavigation(normalizedNav, { footerNav });
  return {
    ...built,
    navigationJson: primaryNavFromMenus(built.menusJson, built.menuAssignmentsJson),
  };
}

export function resolveMenuForLocation(
  menus: PresenceMenusJson,
  assignments: PresenceMenuAssignments,
  locationKey: string,
): PresenceMenuItem[] {
  const menuKey = assignments[locationKey];
  if (!menuKey) return [];
  return menus[menuKey]?.items || [];
}

export function renderMenuNavHtml(
  items: PresenceMenuItem[],
  activePath: string,
  escapeHtml: (s: string) => string,
  normalizePath: (s: string) => string,
): string {
  return items
    .map((item) => {
      const href = item.path || '/';
      const active = normalizePath(href) === activePath ? ' is-active' : '';
      const target = item.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const icon = presenceMenuIconHtml(item.icon);
      const label = `${icon}${escapeHtml(item.label)}`;
      const children = item.children?.length
        ? `<ul class="nav-dropdown">${item.children
            .map((child) => {
              const childHref = child.path || '/';
              const childActive = normalizePath(childHref) === activePath ? ' is-active' : '';
              const childTarget = child.openInNewTab
                ? ' target="_blank" rel="noopener noreferrer"'
                : '';
              const childIcon = presenceMenuIconHtml(child.icon);
              return `<li><a class="nav-link nav-link--child${childActive}" href="${escapeHtml(childHref)}"${childTarget}>${childIcon}${escapeHtml(child.label)}</a></li>`;
            })
            .join('')}</ul>`
        : '';
      if (children) {
        return `<div class="nav-item has-children"><a class="nav-link${active}" href="${escapeHtml(href)}"${target}>${label}</a>${children}</div>`;
      }
      return `<a class="nav-link${active}" href="${escapeHtml(href)}"${target}>${label}</a>`;
    })
    .join('');
}

export function renderFooterMenuHtml(
  items: PresenceMenuItem[],
  escapeHtml: (s: string) => string,
): string {
  if (!items.length) return '';
  const links = items
    .flatMap((item) => [item, ...(item.children || [])])
    .map((item) => {
      const target = item.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const icon = presenceMenuIconHtml(item.icon);
      return `<a class="footer-nav-link" href="${escapeHtml(item.path || '/')}"${target}>${icon}${escapeHtml(item.label)}</a>`;
    })
    .join('');
  return `<nav class="site-footer-nav">${links}</nav>`;
}
