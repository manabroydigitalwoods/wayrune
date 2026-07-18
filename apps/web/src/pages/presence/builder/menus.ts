/** Client-side menu helpers (mirrors API presence-menus). */

import { isPresenceMenuIconKey } from '@wayrune/contracts';

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

export function primaryNavFromMenus(
  menus: PresenceMenusJson,
  assignments: PresenceMenuAssignments = DEFAULT_MENU_ASSIGNMENTS,
): Array<{ label: string; path: string }> {
  const menuKey = assignments.primary || 'primary';
  const menu = menus[menuKey] || menus.primary;
  if (!menu?.items?.length) return [];
  return menu.items.map((item) => ({ label: item.label, path: item.path }));
}

export function resolveSiteMenus(site: {
  navigationJson?: unknown;
  menusJson?: unknown;
  menuAssignmentsJson?: unknown;
}): {
  menusJson: PresenceMenusJson;
  menuAssignmentsJson: PresenceMenuAssignments;
  navigationJson: Array<{ label: string; path: string }>;
} {
  const record = asRecord(site.menusJson);
  const keys = Object.keys(record);
  if (keys.length) {
    const menusJson: PresenceMenusJson = {};
    for (const key of keys) {
      const menu = asRecord(record[key]);
      const items = (Array.isArray(menu.items) ? menu.items : [])
        .map((row, i) => normalizeMenuItem(row, i))
        .filter((row): row is PresenceMenuItem => Boolean(row));
      menusJson[key] = {
        id: typeof menu.id === 'string' && menu.id ? menu.id : key,
        name: typeof menu.name === 'string' && menu.name.trim() ? menu.name.trim() : key,
        items,
      };
    }
    if (!menusJson.primary) {
      menusJson.primary = {
        id: 'primary',
        name: 'Primary',
        items: (Array.isArray(site.navigationJson) ? site.navigationJson : [])
          .map((row, i) => normalizeMenuItem(row, i))
          .filter((row): row is PresenceMenuItem => Boolean(row)),
      };
    }
    if (!menusJson.footer) {
      menusJson.footer = { id: 'footer', name: 'Footer', items: [] };
    }
    const assignmentsRaw = asRecord(site.menuAssignmentsJson);
    const menuAssignmentsJson: PresenceMenuAssignments = { ...DEFAULT_MENU_ASSIGNMENTS };
    for (const key of Object.keys(assignmentsRaw)) {
      const value = assignmentsRaw[key];
      if (typeof value === 'string' && value.trim()) menuAssignmentsJson[key] = value.trim();
    }
    return {
      menusJson,
      menuAssignmentsJson,
      navigationJson: primaryNavFromMenus(menusJson, menuAssignmentsJson),
    };
  }

  const navItems = (Array.isArray(site.navigationJson) ? site.navigationJson : [])
    .map((row, i) => normalizeMenuItem(row, i))
    .filter((row): row is PresenceMenuItem => Boolean(row));
  const menusJson: PresenceMenusJson = {
    primary: {
      id: 'primary',
      name: 'Primary',
      items: navItems.length ? navItems : [{ id: 'mi_home', label: 'Home', path: '/' }],
    },
    footer: { id: 'footer', name: 'Footer', items: [] },
  };
  return {
    menusJson,
    menuAssignmentsJson: { ...DEFAULT_MENU_ASSIGNMENTS },
    navigationJson: primaryNavFromMenus(menusJson),
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

export function menuKeySlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || newId('menu');
}
