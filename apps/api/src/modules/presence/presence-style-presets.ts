/**
 * Style-preset token deltas layered on a theme family's base tokens.
 * Applied at render time via site.settingsJson.stylePreset (and builder preview).
 */

export type StylePresetDelta = Record<string, string>;

export const HORIZON_STYLE_PRESETS: Record<string, StylePresetDelta> = {
  ocean: {
    primary: '#0f766e',
    secondary: '#134e4a',
    accent: '#0ea5a4',
    background: '#f4faf9',
    foreground: '#0b1f1c',
    muted: '#5b736e',
    surface: '#ffffff',
    surfaceMuted: '#e7f3f1',
    border: 'rgba(15, 118, 110, 0.14)',
    heroFrom: '#0f766e',
    heroTo: '#134e4a',
  },
  sunset: {
    primary: '#c2410c',
    secondary: '#9a3412',
    accent: '#f59e0b',
    background: '#fff7ed',
    foreground: '#1c1917',
    muted: '#78716c',
    surface: '#ffffff',
    surfaceMuted: '#ffedd5',
    border: 'rgba(194, 65, 12, 0.16)',
    heroFrom: '#ea580c',
    heroTo: '#9a3412',
  },
  forest: {
    primary: '#166534',
    secondary: '#14532d',
    accent: '#84cc16',
    background: '#f7faf5',
    foreground: '#14532d',
    muted: '#4d7c0f',
    surface: '#ffffff',
    surfaceMuted: '#ecfdf3',
    border: 'rgba(22, 101, 52, 0.16)',
    heroFrom: '#166534',
    heroTo: '#14532d',
  },
  urban: {
    primary: '#0f172a',
    secondary: '#1e293b',
    accent: '#38bdf8',
    background: '#f8fafc',
    foreground: '#0f172a',
    muted: '#64748b',
    surface: '#ffffff',
    surfaceMuted: '#e2e8f0',
    border: 'rgba(15, 23, 42, 0.12)',
    heroFrom: '#0f172a',
    heroTo: '#1e293b',
  },
};

export const ATELIER_STYLE_PRESETS: Record<string, StylePresetDelta> = {
  ivory: {
    primary: '#1c1917',
    secondary: '#44403c',
    accent: '#a8a29e',
    background: '#faf9f6',
    foreground: '#1c1917',
    muted: '#78716c',
    surface: '#ffffff',
    surfaceMuted: '#f0ebe3',
    border: 'rgba(28, 25, 23, 0.1)',
    heroFrom: '#1c1917',
    heroTo: '#44403c',
  },
  ink: {
    primary: '#0c0a09',
    secondary: '#1c1917',
    accent: '#d6d3d1',
    background: '#0c0a09',
    foreground: '#fafaf9',
    muted: '#a8a29e',
    surface: '#1c1917',
    surfaceMuted: '#292524',
    border: 'rgba(250, 250, 249, 0.12)',
    heroFrom: '#0c0a09',
    heroTo: '#292524',
  },
  champagne: {
    primary: '#78716c',
    secondary: '#57534e',
    accent: '#d6b27c',
    background: '#faf7f2',
    foreground: '#292524',
    muted: '#78716c',
    surface: '#ffffff',
    surfaceMuted: '#f5efe6',
    border: 'rgba(120, 113, 108, 0.18)',
    heroFrom: '#57534e',
    heroTo: '#292524',
  },
  slate: {
    primary: '#334155',
    secondary: '#1e293b',
    accent: '#94a3b8',
    background: '#f8fafc',
    foreground: '#0f172a',
    muted: '#64748b',
    surface: '#ffffff',
    surfaceMuted: '#e2e8f0',
    border: 'rgba(51, 65, 85, 0.14)',
    heroFrom: '#334155',
    heroTo: '#0f172a',
  },
};

export const THEME_STYLE_PRESETS: Record<string, Record<string, StylePresetDelta>> = {
  horizon: HORIZON_STYLE_PRESETS,
  atelier: ATELIER_STYLE_PRESETS,
};

export function applyStylePreset(
  themeKey: string,
  baseTokens: Record<string, unknown>,
  stylePreset: string | null | undefined,
): Record<string, unknown> {
  if (!stylePreset) return baseTokens;
  const family = THEME_STYLE_PRESETS[themeKey];
  const delta = family?.[stylePreset];
  if (!delta) return baseTokens;
  return { ...baseTokens, ...delta };
}

export function listStylePresets(themeKey: string): string[] {
  return Object.keys(THEME_STYLE_PRESETS[themeKey] || {});
}
