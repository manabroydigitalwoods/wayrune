/** Named accent palettes (VS Code–style theme packs). Values are HSL channels without `hsl()`. */

export type ColorThemeId = 'wayrune' | 'ocean' | 'slate' | 'sand' | 'violet' | 'custom';

export type ColorThemeMeta = {
  id: ColorThemeId;
  label: string;
  description: string;
  /** Swatch preview (light primary). */
  swatch: string;
};

export const COLOR_THEME_OPTIONS: ColorThemeMeta[] = [
  {
    id: 'wayrune',
    label: 'Wayrune',
    description: 'Default CodePoetry teal.',
    swatch: '#0f766e',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool blue for long ops sessions.',
    swatch: '#0369a1',
  },
  {
    id: 'slate',
    label: 'Slate',
    description: 'Neutral graphite chrome.',
    swatch: '#334155',
  },
  {
    id: 'sand',
    label: 'Sand',
    description: 'Warm stone accent.',
    swatch: '#92400e',
  },
  {
    id: 'violet',
    label: 'Violet',
    description: 'Soft violet accent pack.',
    swatch: '#6d28d9',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Pick your own primary accent.',
    swatch: '#64748b',
  },
];

const COLOR_THEME_IDS = new Set<ColorThemeId>(COLOR_THEME_OPTIONS.map((t) => t.id));

export function isColorThemeId(value: string | null | undefined): value is ColorThemeId {
  return COLOR_THEME_IDS.has(value as ColorThemeId);
}

/** Convert `#rrggbb` → `"H S% L%"` channels for CSS vars. */
export function hexToHslChannels(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function tweakLightness(channels: string, delta: number): string {
  const match = channels.match(/^(\d+)\s+(\d+%)\s+(\d+)%$/);
  if (!match) return channels;
  const h = match[1];
  const s = match[2];
  const l = Math.max(4, Math.min(96, Number(match[3]) + delta));
  return `${h} ${s} ${l}%`;
}

/** Apply / clear inline custom accent overrides on `<html>`. */
export function applyCustomAccentVars(root: HTMLElement, hex: string | null | undefined) {
  const channels = hex ? hexToHslChannels(hex) : null;
  if (!channels) {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--ring');
    root.style.removeProperty('--sidebar-accent-foreground');
    root.style.removeProperty('--primary-50');
    root.style.removeProperty('--primary-100');
    root.style.removeProperty('--primary-200');
    root.style.removeProperty('--primary-800');
    root.style.removeProperty('--primary-900');
    return;
  }
  const isDark = root.classList.contains('dark');
  const primary = isDark ? tweakLightness(channels, 18) : channels;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--ring', primary);
  root.style.setProperty('--sidebar-accent-foreground', primary);
  root.style.setProperty('--primary-50', tweakLightness(channels, isDark ? -28 : 42));
  root.style.setProperty('--primary-100', tweakLightness(channels, isDark ? -22 : 36));
  root.style.setProperty('--primary-200', tweakLightness(channels, isDark ? -12 : 24));
  root.style.setProperty('--primary-800', tweakLightness(channels, isDark ? 28 : -12));
  root.style.setProperty('--primary-900', tweakLightness(channels, isDark ? 36 : -18));
}
