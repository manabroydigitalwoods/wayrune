/**
 * Curated SVG icons for Presence menu items.
 * Stroke icons use `currentColor` so they follow theme link / nav colors.
 */

export type PresenceMenuIconCategory = 'travel' | 'contact' | 'general';

export type PresenceMenuIconDef = {
  key: string;
  label: string;
  category: PresenceMenuIconCategory;
  /** Inner path markup for a 24×24 viewBox. */
  paths: string;
};

/** Travel-agency–friendly stroke set (Lucide-style, 24×24). */
export const PRESENCE_MENU_ICONS: readonly PresenceMenuIconDef[] = [
  // Travel
  {
    key: 'home',
    label: 'Home',
    category: 'travel',
    paths: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  },
  {
    key: 'map',
    label: 'Map',
    category: 'travel',
    paths: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  },
  {
    key: 'map-pin',
    label: 'Pin',
    category: 'travel',
    paths: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  },
  {
    key: 'compass',
    label: 'Compass',
    category: 'travel',
    paths: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  },
  {
    key: 'plane',
    label: 'Plane',
    category: 'travel',
    paths: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  },
  {
    key: 'globe',
    label: 'Globe',
    category: 'travel',
    paths: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  },
  {
    key: 'suitcase',
    label: 'Suitcase',
    category: 'travel',
    paths: '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect width="20" height="14" x="2" y="6" rx="2"/><path d="M2 13h20"/>',
  },
  {
    key: 'mountain',
    label: 'Mountain',
    category: 'travel',
    paths: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  },
  {
    key: 'camera',
    label: 'Camera',
    category: 'travel',
    paths: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  },
  {
    key: 'car',
    label: 'Car',
    category: 'travel',
    paths: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  },
  {
    key: 'ship',
    label: 'Ship',
    category: 'travel',
    paths: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.7 5.4 1.62 6"/><path d="M12 2v8"/><path d="M12 10 5 7"/><path d="m12 10 7-3"/>',
  },
  {
    key: 'train',
    label: 'Train',
    category: 'travel',
    paths: '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h0"/><path d="M16 15h0"/>',
  },
  {
    key: 'tent',
    label: 'Tent',
    category: 'travel',
    paths: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  },
  // Contact
  {
    key: 'phone',
    label: 'Phone',
    category: 'contact',
    paths: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  },
  {
    key: 'mail',
    label: 'Mail',
    category: 'contact',
    paths: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  },
  {
    key: 'chat',
    label: 'Chat',
    category: 'contact',
    paths: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    category: 'contact',
    paths: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  },
  {
    key: 'clock',
    label: 'Clock',
    category: 'contact',
    paths: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
  {
    key: 'users',
    label: 'People',
    category: 'contact',
    paths: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  },
  // General
  {
    key: 'info',
    label: 'Info',
    category: 'general',
    paths: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
  {
    key: 'help',
    label: 'Help',
    category: 'general',
    paths: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  },
  {
    key: 'star',
    label: 'Star',
    category: 'general',
    paths: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  },
  {
    key: 'heart',
    label: 'Heart',
    category: 'general',
    paths: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  },
  {
    key: 'bookmark',
    label: 'Bookmark',
    category: 'general',
    paths: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  },
  {
    key: 'link',
    label: 'Link',
    category: 'general',
    paths: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  },
  {
    key: 'search',
    label: 'Search',
    category: 'general',
    paths: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  },
  {
    key: 'check',
    label: 'Check',
    category: 'general',
    paths: '<path d="M20 6 9 17l-5-5"/>',
  },
  {
    key: 'sparkles',
    label: 'Sparkles',
    category: 'general',
    paths: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  },
  {
    key: 'building',
    label: 'Building',
    category: 'general',
    paths: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  },
  {
    key: 'gift',
    label: 'Gift',
    category: 'general',
    paths: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  },
  {
    key: 'file',
    label: 'File',
    category: 'general',
    paths: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  },
] as const;

export type PresenceMenuIconKey = (typeof PRESENCE_MENU_ICONS)[number]['key'];

const BY_KEY = new Map(PRESENCE_MENU_ICONS.map((icon) => [icon.key, icon]));

export function isPresenceMenuIconKey(value: unknown): value is PresenceMenuIconKey {
  return typeof value === 'string' && BY_KEY.has(value);
}

export function presenceMenuIconDef(key: string | null | undefined): PresenceMenuIconDef | null {
  if (!key) return null;
  return BY_KEY.get(key) || null;
}

/** Inline SVG markup (theme-safe via currentColor). */
export function presenceMenuIconSvg(
  key: string | null | undefined,
  opts?: { className?: string },
): string {
  const def = presenceMenuIconDef(key);
  if (!def) return '';
  const cls = opts?.className ? ` class="${opts.className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls}>${def.paths}</svg>`;
}

/** Public-nav wrapper span for menu / footer links. */
export function presenceMenuIconHtml(key: string | null | undefined): string {
  const svg = presenceMenuIconSvg(key, { className: 'nav-icon__svg' });
  if (!svg) return '';
  return `<span class="nav-icon" aria-hidden="true">${svg}</span>`;
}

export const PRESENCE_MENU_ICON_CATEGORIES: Array<{
  id: PresenceMenuIconCategory;
  label: string;
}> = [
  { id: 'travel', label: 'Travel' },
  { id: 'contact', label: 'Contact' },
  { id: 'general', label: 'General' },
];
