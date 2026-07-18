/**
 * Curated Presence typography catalog.
 * Seeded into `presence_fonts` for DB management; UI/API can read either source.
 */
export type PresenceFontRole = 'display' | 'body' | 'both';
export type PresenceFontSource = 'google' | 'system';

export type PresenceFontOption = {
  /** Stable id / DB key */
  key: string;
  label: string;
  /** CSS font-family stack stored on theme tokens */
  stack: string;
  role: PresenceFontRole;
  source: PresenceFontSource;
  sortOrder: number;
};

/** High-quality Google + system stacks used across travel / hospitality sites. */
export const PRESENCE_FONT_CATALOG: PresenceFontOption[] = [
  // —— System ——
  {
    key: 'system_ui',
    label: 'System UI',
    stack: 'system-ui, sans-serif',
    role: 'both',
    source: 'system',
    sortOrder: 10,
  },
  {
    key: 'georgia',
    label: 'Georgia',
    stack: 'Georgia, serif',
    role: 'display',
    source: 'system',
    sortOrder: 20,
  },
  // —— Display / headings ——
  {
    key: 'fraunces',
    label: 'Fraunces',
    stack: 'Fraunces, Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 100,
  },
  {
    key: 'playfair_display',
    label: 'Playfair Display',
    stack: '"Playfair Display", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 110,
  },
  {
    key: 'cormorant_garamond',
    label: 'Cormorant Garamond',
    stack: '"Cormorant Garamond", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 120,
  },
  {
    key: 'libre_baskerville',
    label: 'Libre Baskerville',
    stack: '"Libre Baskerville", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 130,
  },
  {
    key: 'source_serif_4',
    label: 'Source Serif 4',
    stack: '"Source Serif 4", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 140,
  },
  {
    key: 'lora',
    label: 'Lora',
    stack: 'Lora, Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 150,
  },
  {
    key: 'merriweather',
    label: 'Merriweather',
    stack: 'Merriweather, Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 160,
  },
  {
    key: 'dm_serif_display',
    label: 'DM Serif Display',
    stack: '"DM Serif Display", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 170,
  },
  {
    key: 'instrument_serif',
    label: 'Instrument Serif',
    stack: '"Instrument Serif", Georgia, serif',
    role: 'display',
    source: 'google',
    sortOrder: 180,
  },
  {
    key: 'barlow_condensed',
    label: 'Barlow Condensed',
    stack: '"Barlow Condensed", system-ui, sans-serif',
    role: 'display',
    source: 'google',
    sortOrder: 190,
  },
  // —— Body / UI ——
  {
    key: 'dm_sans',
    label: 'DM Sans',
    stack: '"DM Sans", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 200,
  },
  {
    key: 'inter',
    label: 'Inter',
    stack: 'Inter, system-ui, sans-serif',
    role: 'both',
    source: 'google',
    sortOrder: 210,
  },
  {
    key: 'source_sans_3',
    label: 'Source Sans 3',
    stack: '"Source Sans 3", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 220,
  },
  {
    key: 'nunito_sans',
    label: 'Nunito Sans',
    stack: '"Nunito Sans", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 230,
  },
  {
    key: 'libre_franklin',
    label: 'Libre Franklin',
    stack: '"Libre Franklin", system-ui, sans-serif',
    role: 'both',
    source: 'google',
    sortOrder: 240,
  },
  {
    key: 'outfit',
    label: 'Outfit',
    stack: 'Outfit, system-ui, sans-serif',
    role: 'both',
    source: 'google',
    sortOrder: 250,
  },
  {
    key: 'manrope',
    label: 'Manrope',
    stack: 'Manrope, system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 260,
  },
  {
    key: 'plus_jakarta_sans',
    label: 'Plus Jakarta Sans',
    stack: '"Plus Jakarta Sans", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 270,
  },
  {
    key: 'ibm_plex_sans',
    label: 'IBM Plex Sans',
    stack: '"IBM Plex Sans", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 280,
  },
  {
    key: 'work_sans',
    label: 'Work Sans',
    stack: '"Work Sans", system-ui, sans-serif',
    role: 'body',
    source: 'google',
    sortOrder: 290,
  },
];

export function presenceFontsForRole(role: 'display' | 'body'): PresenceFontOption[] {
  return PRESENCE_FONT_CATALOG.filter((f) => f.role === role || f.role === 'both').sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

export function matchPresenceFontStack(stack: string | null | undefined): PresenceFontOption | null {
  const raw = (stack || '').trim();
  if (!raw) return null;
  const norm = raw.replace(/\s+/g, ' ');
  return (
    PRESENCE_FONT_CATALOG.find((f) => f.stack === raw || f.stack === norm) ||
    PRESENCE_FONT_CATALOG.find((f) => f.stack.toLowerCase() === norm.toLowerCase()) ||
    null
  );
}

/** Google Fonts CSS2 family query fragment for a stack’s primary face. */
export function presenceFontGoogleFamily(stack: string): string | null {
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || '';
  if (!first || /^(Georgia|system-ui|serif|sans-serif|monospace)$/i.test(first)) return null;
  return first;
}
