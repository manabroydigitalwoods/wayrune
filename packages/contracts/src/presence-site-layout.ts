/** Site-level main layout (content column) — shared by builder canvas and public runtime. */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const PRESENCE_CONTENT_MAX_PRESETS = [
  { value: '960px', label: 'Compact', hint: '960px — focused reading width' },
  { value: '1100px', label: 'Standard', hint: '1100px — default site column' },
  { value: '1280px', label: 'Wide', hint: '1280px — more room for grids' },
  { value: '1440px', label: 'Extra wide', hint: '1440px — large desktops' },
  { value: '100%', label: 'Full bleed', hint: 'Edge to edge; modules still use their own box width' },
] as const;

export const PRESENCE_GUTTER_PRESETS = [
  { value: '0.75rem', label: 'Tight' },
  { value: '1rem', label: 'Default' },
  { value: '1.5rem', label: 'Comfortable' },
  { value: '2rem', label: 'Spacious' },
] as const;

export const PRESENCE_SECTION_GAP_PRESETS = [
  { value: '1.75rem', label: 'Compact' },
  { value: '2.75rem', label: 'Default' },
  { value: '3.5rem', label: 'Relaxed' },
  { value: '4.5rem', label: 'Airy' },
] as const;

export type PresenceSiteLayout = {
  /** CSS length for the main content column (`--max`). */
  contentMax: string;
  /** Horizontal inset from the viewport edge (`--gutter`). */
  gutter: string;
  /** Vertical space between root sections (`--section-gap`). */
  sectionGap: string;
};

export const DEFAULT_PRESENCE_SITE_LAYOUT: PresenceSiteLayout = {
  contentMax: '1100px',
  gutter: '1rem',
  sectionGap: '2.75rem',
};

const CONTENT_MAX_VALUES = new Set(PRESENCE_CONTENT_MAX_PRESETS.map((p) => p.value));
const GUTTER_VALUES = new Set(PRESENCE_GUTTER_PRESETS.map((p) => p.value));
const SECTION_GAP_VALUES = new Set(PRESENCE_SECTION_GAP_PRESETS.map((p) => p.value));

function pickPreset(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

/** Read `settingsJson.layout` with safe defaults. */
export function parsePresenceSiteLayout(settingsJson: unknown): PresenceSiteLayout {
  const layout = asRecord(asRecord(settingsJson).layout);
  return {
    contentMax: pickPreset(
      layout.contentMax,
      CONTENT_MAX_VALUES,
      DEFAULT_PRESENCE_SITE_LAYOUT.contentMax,
    ),
    gutter: pickPreset(layout.gutter, GUTTER_VALUES, DEFAULT_PRESENCE_SITE_LAYOUT.gutter),
    sectionGap: pickPreset(
      layout.sectionGap,
      SECTION_GAP_VALUES,
      DEFAULT_PRESENCE_SITE_LAYOUT.sectionGap,
    ),
  };
}

/** Parse a `Npx` content max into a number, or null for fluid widths. */
export function presenceContentMaxPx(contentMax: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/i.exec(contentMax.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
