import { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FileText,
  LayoutTemplate,
  Navigation,
  Palette,
  PanelBottom,
  PanelTop,
  Settings2,
} from 'lucide-react';
import {
  presenceFontGoogleFamily,
  presenceFontsForRole,
  PRESENCE_CONTENT_MAX_PRESETS,
  PRESENCE_GUTTER_PRESETS,
  PRESENCE_SECTION_GAP_PRESETS,
  parsePresenceSiteLayout,
  presenceContentMaxPx,
  type PresenceFontOption,
  type PresenceSiteLayout,
} from '@wayrune/contracts';
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
  cn,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../../../api';
import { MediaPickerField } from './MediaPicker';
import { MenuBuilder } from './MenuBuilder';
import { PageLinkField } from './PageLinkField';
import type { BuilderPage, FormDef, Identity } from './types';
import { resolveSiteMenus, type PresenceMenuAssignments, type PresenceMenusJson } from './menus';

export type SiteChromeSection =
  | 'colors'
  | 'layout'
  | 'header'
  | 'footer'
  | 'navigation'
  | 'page'
  | 'website';

type SettingsSection = SiteChromeSection;

type ThemeRow = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  tokensJson?: Record<string, unknown> | null;
  schemaJson?: Record<string, unknown> | null;
};

type Draft = {
  themeId: string;
  stylePreset: string;
  tokens: Record<string, string>;
  siteLayout: PresenceSiteLayout;
  header: Record<string, unknown>;
  footer: Record<string, unknown>;
  navigation: Array<Record<string, unknown>>;
  menusJson: PresenceMenusJson;
  menuAssignmentsJson: PresenceMenuAssignments;
  pageTitle: string;
  pagePath: string;
  layoutMode: 'flow' | 'freeform';
  seo: Record<string, unknown>;
};

const SECTIONS: Array<{ id: SettingsSection; label: string; hint: string; icon: typeof Settings2 }> = [
  { id: 'colors', label: 'Colors & type', hint: 'Brand styles', icon: Palette },
  { id: 'layout', label: 'Main layout', hint: 'Column & spacing', icon: LayoutTemplate },
  { id: 'header', label: 'Header', hint: 'Logo & CTA', icon: PanelTop },
  { id: 'footer', label: 'Footer', hint: 'Site footer', icon: PanelBottom },
  { id: 'navigation', label: 'Menus', hint: 'Nav & locations', icon: Navigation },
  { id: 'page', label: 'This page', hint: 'Title & SEO', icon: FileText },
  { id: 'website', label: 'Website', hint: 'Domain & SEO', icon: ExternalLink },
];

function remToPx(value: string, fallback: number) {
  const m = /^(\d+(?:\.\d+)?)rem$/i.exec(value.trim());
  if (m) return Number(m[1]) * 16;
  const px = /^(\d+(?:\.\d+)?)px$/i.exec(value.trim());
  if (px) return Number(px[1]);
  return fallback;
}

/** Mini page schematic so layout changes are visible before save. */
function MainLayoutPreview({ layout }: { layout: PresenceSiteLayout }) {
  const frameW = 260;
  const frameH = 220;
  const viewportRefPx = 1440;
  const scale = frameW / viewportRefPx;
  const contentPx = presenceContentMaxPx(layout.contentMax);
  const gutterPx = remToPx(layout.gutter, 16) * scale;
  const gapPx = Math.max(6, remToPx(layout.sectionGap, 44) * scale * 0.55);
  const columnW =
    contentPx == null
      ? Math.max(40, frameW - gutterPx * 2)
      : Math.min(contentPx * scale, Math.max(40, frameW - gutterPx * 2));
  const label =
    PRESENCE_CONTENT_MAX_PRESETS.find((row) => row.value === layout.contentMax)?.label ||
    layout.contentMax;

  return (
    <div className="flex h-full min-h-[14rem] flex-col rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {label} · {layout.gutter} pad · {layout.sectionGap} gap
        </div>
      </div>
      <div
        className="relative mx-auto flex flex-1 items-stretch justify-center overflow-hidden rounded-md border border-border/70 bg-[linear-gradient(180deg,#f8fafc,#eef2f7)] shadow-inner"
        style={{ width: frameW, minHeight: frameH }}
        aria-hidden
      >
        {/* Side gutters */}
        <div
          className="absolute inset-y-0 left-0 bg-muted/50"
          style={{ width: Math.max(2, gutterPx) }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-muted/50"
          style={{ width: Math.max(2, gutterPx) }}
        />
        <div
          className="relative z-[1] my-3 flex flex-col"
          style={{ width: columnW, gap: gapPx }}
        >
          <div className="h-4 shrink-0 rounded-sm bg-slate-300/90" />
          <div className="h-14 shrink-0 rounded-sm bg-teal-700/80" />
          <div className="h-8 shrink-0 rounded-sm bg-white shadow-sm ring-1 ring-black/5" />
          <div className="grid shrink-0 grid-cols-3 gap-1">
            <div className="h-10 rounded-sm bg-white shadow-sm ring-1 ring-black/5" />
            <div className="h-10 rounded-sm bg-white shadow-sm ring-1 ring-black/5" />
            <div className="h-10 rounded-sm bg-white shadow-sm ring-1 ring-black/5" />
          </div>
          <div className="h-7 shrink-0 rounded-sm bg-white shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Updates live on the canvas behind this dialog
      </p>
    </div>
  );
}

const TOKEN_GROUPS: Array<{
  id: string;
  title: string;
  hint?: string;
  fields: Array<{
    key: string;
    label: string;
    kind: 'color' | 'text' | 'font';
    hint?: string;
    fontRole?: 'display' | 'body';
  }>;
}> = [
  {
    id: 'brand',
    title: 'Brand',
    hint: 'Buttons, links, and accents',
    fields: [
      { key: 'primary', label: 'Primary', kind: 'color' },
      { key: 'accent', label: 'Accent', kind: 'color' },
    ],
  },
  {
    id: 'surfaces',
    title: 'Surfaces',
    hint: 'Page and card backgrounds',
    fields: [
      { key: 'background', label: 'Background', kind: 'color' },
      { key: 'foreground', label: 'Text', kind: 'color' },
      { key: 'muted', label: 'Muted text', kind: 'color' },
      { key: 'surface', label: 'Surface', kind: 'color' },
      { key: 'surfaceMuted', label: 'Surface muted', kind: 'color' },
      { key: 'border', label: 'Border', kind: 'text', hint: 'Color or rgba()' },
    ],
  },
  {
    id: 'shape',
    title: 'Shape',
    fields: [{ key: 'radius', label: 'Corner radius', kind: 'text', hint: 'e.g. 14px' }],
  },
  {
    id: 'hero',
    title: 'Hero gradient',
    hint: 'Used by hero bands and full-bleed headers',
    fields: [
      { key: 'heroFrom', label: 'From', kind: 'color' },
      { key: 'heroTo', label: 'To', kind: 'color' },
    ],
  },
  {
    id: 'type',
    title: 'Typography',
    fields: [
      { key: 'fontDisplay', label: 'Display', kind: 'font', hint: 'Headings', fontRole: 'display' },
      { key: 'fontBody', label: 'Body', kind: 'font', hint: 'Paragraphs & UI', fontRole: 'body' },
    ],
  },
];

const TOKEN_FIELDS = TOKEN_GROUPS.flatMap((group) => group.fields);

const DEFAULT_TOKENS: Record<string, string> = {
  primary: '#0f766e',
  accent: '#0f766e',
  background: '#f8fafc',
  foreground: '#0f172a',
  muted: '#64748b',
  surface: '#ffffff',
  surfaceMuted: '#eef2f7',
  border: 'rgba(15,23,42,.1)',
  radius: '14px',
  heroFrom: '#0f766e',
  heroTo: '#0f172a',
  fontDisplay: 'Georgia, serif',
  fontBody: 'system-ui, sans-serif',
};

function asHexColor(value: string | undefined, fallback = '#0f766e') {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1]!;
    const g = trimmed[2]!;
    const b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tokensFromTheme(tokensJson: Record<string, unknown> | null | undefined): Record<string, string> {
  const src = tokensJson || {};
  const next: Record<string, string> = { ...DEFAULT_TOKENS };
  for (const field of TOKEN_FIELDS) {
    const value = src[field.key];
    if (typeof value === 'string' && value.trim()) next[field.key] = value;
  }
  return next;
}

function draftFromPage(page: BuilderPage): Draft {
  const regions = asRecord(page.site.globalRegionsJson);
  const settings = asRecord(page.site.settingsJson);
  const menus = resolveSiteMenus({
    menusJson: page.site.menusJson,
    menuAssignmentsJson: page.site.menuAssignmentsJson,
    navigationJson: page.site.navigationJson,
  });
  return {
    themeId: page.site.theme?.id || '',
    stylePreset: typeof settings.stylePreset === 'string' ? settings.stylePreset : '',
    tokens: tokensFromTheme(page.site.theme?.tokensJson || undefined),
    siteLayout: parsePresenceSiteLayout(settings),
    header: asRecord(regions.header),
    footer: asRecord(regions.footer),
    navigation: menus.navigationJson,
    menusJson: menus.menusJson,
    menuAssignmentsJson: menus.menuAssignmentsJson,
    pageTitle: page.title,
    pagePath: page.path,
    layoutMode: (page.layoutMode || 'flow') as 'flow' | 'freeform',
    seo: asRecord(page.seoJson),
  };
}

export function BuilderSiteSettingsDialog({
  open,
  onOpenChange,
  page,
  canWrite,
  identity,
  forms = [],
  onApplied,
  onTokensPreview,
  onLayoutPreview,
  onOpenWebsiteSettings,
  initialSection = 'colors',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: BuilderPage;
  canWrite: boolean;
  identity: Identity | null;
  forms?: FormDef[];
  onApplied: (next: BuilderPage) => void;
  /** Live canvas preview while editing Colors & type (cleared on close). */
  onTokensPreview?: (tokens: Record<string, string> | null) => void;
  /** Live canvas preview while editing Main layout (cleared on close). */
  onLayoutPreview?: (layout: PresenceSiteLayout | null) => void;
  /** Opens Website settings (domain, theme pick, SEO, scripts, publish). */
  onOpenWebsiteSettings?: () => void;
  /** Section to show when the dialog opens. */
  initialSection?: SiteChromeSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [draft, setDraft] = useState<Draft>(() => draftFromPage(page));
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [fonts, setFonts] = useState<PresenceFontOption[]>(() => [
    ...presenceFontsForRole('display'),
    ...presenceFontsForRole('body'),
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      onTokensPreview?.(null);
      onLayoutPreview?.(null);
      return;
    }
    setDraft(draftFromPage(page));
    setSection(initialSection);
    void api<ThemeRow[]>('/presence/themes')
      .then((rows) => setThemes(rows || []))
      .catch(() => setThemes([]));
    void api<PresenceFontOption[]>('/presence/fonts')
      .then((rows) => {
        if (Array.isArray(rows) && rows.length) setFonts(rows);
      })
      .catch(() => {
        /* keep catalog fallback */
      });
  }, [open, page, onTokensPreview, onLayoutPreview, initialSection]);

  useEffect(() => {
    if (!open || section !== 'layout') return;
    onLayoutPreview?.(draft.siteLayout);
  }, [open, section, draft.siteLayout, onLayoutPreview]);

  const displayFontOptions = useMemo(() => {
    const rows = fonts.filter((f) => f.role === 'display' || f.role === 'both');
    const list = rows.length ? rows : presenceFontsForRole('display');
    return list.map((f) => ({
      value: f.stack,
      label: f.label,
      description: f.source,
      labelStyle: { fontFamily: f.stack },
    }));
  }, [fonts]);

  const bodyFontOptions = useMemo(() => {
    const rows = fonts.filter((f) => f.role === 'body' || f.role === 'both');
    const list = rows.length ? rows : presenceFontsForRole('body');
    return list.map((f) => ({
      value: f.stack,
      label: f.label,
      description: f.source,
      labelStyle: { fontFamily: f.stack },
    }));
  }, [fonts]);

  /** Load every catalog Google face so dropdown rows render in their own typeface. */
  const googleFontsHref = useMemo(() => {
    const families = fonts
      .map((f) => presenceFontGoogleFamily(f.stack))
      .filter((name): name is string => Boolean(name));
    const unique = [...new Set(families)];
    if (!unique.length) return null;
    const q = unique
      .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`)
      .join('&');
    return `https://fonts.googleapis.com/css2?${q}&display=swap`;
  }, [fonts]);

  useEffect(() => {
    if (!open || !googleFontsHref) return;
    const id = 'presence-font-catalog-preview';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = googleFontsHref;
  }, [open, googleFontsHref]);

  const activeTheme = useMemo(
    () => themes.find((theme) => theme.id === draft.themeId) || null,
    [themes, draft.themeId],
  );

  const stylePresetOptions = useMemo(() => {
    const schema = asRecord(activeTheme?.schemaJson);
    const fromSchema = Array.isArray(schema.stylePresets)
      ? schema.stylePresets.filter((x): x is string => typeof x === 'string')
      : [];
    if (fromSchema.length) return fromSchema;
    const deltas = asRecord(schema.stylePresetDeltas);
    return Object.keys(deltas);
  }, [activeTheme?.schemaJson]);

  const readOnly = !canWrite;

  const patchDraft = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const patchSiteLayout = (patch: Partial<PresenceSiteLayout>) => {
    setDraft((prev) => {
      const siteLayout = { ...prev.siteLayout, ...patch };
      onLayoutPreview?.(siteLayout);
      return { ...prev, siteLayout };
    });
  };
  const applyStylePreset = (preset: string) => {
    const schema = asRecord(activeTheme?.schemaJson);
    const deltas = asRecord(asRecord(schema.stylePresetDeltas)[preset]);
    const nextTokens = { ...draft.tokens };
    for (const [key, value] of Object.entries(deltas)) {
      if (typeof value === 'string' && value.trim()) nextTokens[key] = value;
    }
    patchDraft({ stylePreset: preset, tokens: nextTokens });
    onTokensPreview?.(nextTokens);
  };
  const patchHeader = (key: string, value: unknown) =>
    patchDraft({ header: { ...draft.header, [key]: value } });
  const patchFooter = (key: string, value: unknown) =>
    patchDraft({ footer: { ...draft.footer, [key]: value } });
  const patchToken = (key: string, value: string) => {
    const tokens = { ...draft.tokens, [key]: value };
    patchDraft({ tokens });
    onTokensPreview?.(tokens);
  };
  const patchSeo = (key: string, value: string) =>
    patchDraft({ seo: { ...draft.seo, [key]: value } });

  const handleSave = async () => {
    if (!canWrite) return;
    setSaving(true);
    try {
      let themeId = draft.themeId || page.site.theme?.id || '';
      let themeKey = activeTheme?.key || page.site.theme?.key || '';
      let themeName = activeTheme?.name || page.site.theme?.name || 'Theme';
      let savedTokens = { ...draft.tokens };

      const originalTokens = tokensFromTheme(
        (activeTheme?.tokensJson || page.site.theme?.tokensJson || undefined) as
          | Record<string, unknown>
          | undefined,
      );
      const tokensChanged = TOKEN_FIELDS.some(
        (field) => draft.tokens[field.key] !== originalTokens[field.key],
      );

      if (tokensChanged && themeId) {
        if (activeTheme?.isSystem) {
          const cloned = await api<ThemeRow>(`/presence/themes/${themeId}/clone`, {
            method: 'POST',
            body: JSON.stringify({
              name: `${themeName} (custom)`,
            }),
          });
          themeId = cloned.id;
          themeKey = cloned.key;
          themeName = cloned.name;
        }
        await api('/presence/themes', {
          method: 'PUT',
          body: JSON.stringify({
            key: themeKey,
            name: themeName,
            status: 'published',
            tokensJson: savedTokens,
          }),
        });
      }

      await api(`/presence/sites/${page.site.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(tokensChanged && themeId ? { themeId } : {}),
          navigationJson: draft.navigation,
          menusJson: draft.menusJson,
          menuAssignmentsJson: draft.menuAssignmentsJson,
          globalRegionsJson: {
            ...asRecord(page.site.globalRegionsJson),
            header: draft.header,
            footer: draft.footer,
          },
          settingsJson: {
            ...asRecord(page.site.settingsJson),
            stylePreset: draft.stylePreset || null,
            layout: draft.siteLayout,
          },
        }),
      });

      await api(`/presence/pages/${page.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.pageTitle,
          path: draft.pagePath,
          layoutMode: draft.layoutMode,
          seoJson: draft.seo,
        }),
      });

      const nextPage: BuilderPage = {
        ...page,
        title: draft.pageTitle,
        path: draft.pagePath,
        layoutMode: draft.layoutMode,
        seoJson: draft.seo,
        site: {
          ...page.site,
          navigationJson: draft.navigation,
          menusJson: draft.menusJson,
          menuAssignmentsJson: draft.menuAssignmentsJson,
          settingsJson: {
            ...asRecord(page.site.settingsJson),
            stylePreset: draft.stylePreset || null,
            layout: draft.siteLayout,
          },
          globalRegionsJson: {
            ...asRecord(page.site.globalRegionsJson),
            header: draft.header,
            footer: draft.footer,
          },
          theme: themeId
            ? {
                id: themeId,
                key: themeKey,
                name: themeName,
                tokensJson: savedTokens,
              }
            : page.site.theme,
        },
      };
      onApplied(nextPage);
      toastSuccess('Site chrome saved');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save site chrome');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,760px)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="shrink-0">
          <DialogTitle>Site chrome</DialogTitle>
          <DialogDescription>
            Layout, header, footer, menus, colors, and this page for {page.site.name}.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2 sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-2 sm:py-3">
            {SECTIONS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex min-w-[8.5rem] items-start gap-2 rounded-md px-2.5 py-2 text-left transition sm:min-w-0',
                    active
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <item.icon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{item.label}</span>
                    <span className="hidden text-[10px] opacity-80 sm:block">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            className={cn(
              'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4',
              readOnly && section !== 'website' ? 'pointer-events-none opacity-70' : '',
            )}
          >
            {section === 'colors' ? (
              <>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {activeTheme?.name || page.site.theme?.name || 'Theme styles'}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Live on the canvas as you edit. Change the active theme in Website settings.
                      </p>
                    </div>
                    {onOpenWebsiteSettings ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenWebsiteSettings();
                        }}
                      >
                        Change theme
                      </Button>
                    ) : null}
                  </div>

                  {activeTheme?.isSystem ? (
                    <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
                      You’re editing a system theme. Saving creates an org copy with these colors —
                      the original stays unchanged.
                    </div>
                  ) : null}

                  {stylePresetOptions.length ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Style preset</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {stylePresetOptions.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={readOnly || saving}
                            onClick={() => applyStylePreset(preset)}
                            className={cn(
                              'rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize',
                              draft.stylePreset === preset
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                            )}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="overflow-hidden rounded-lg border"
                    style={{
                      background: draft.tokens.background || DEFAULT_TOKENS.background,
                      color: draft.tokens.foreground || DEFAULT_TOKENS.foreground,
                    }}
                  >
                    <div
                      className="px-3 py-4"
                      style={{
                        background: `linear-gradient(120deg, ${draft.tokens.heroFrom || DEFAULT_TOKENS.heroFrom}, ${draft.tokens.heroTo || DEFAULT_TOKENS.heroTo})`,
                        color: '#fff',
                      }}
                    >
                      <div
                        className="text-sm font-semibold tracking-tight"
                        style={{ fontFamily: draft.tokens.fontDisplay || DEFAULT_TOKENS.fontDisplay }}
                      >
                        Preview heading
                      </div>
                      <p
                        className="mt-0.5 text-[11px] opacity-90"
                        style={{ fontFamily: draft.tokens.fontBody || DEFAULT_TOKENS.fontBody }}
                      >
                        Body copy with your type stack
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <span
                        className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-white"
                        style={{
                          background: draft.tokens.primary || DEFAULT_TOKENS.primary,
                          borderRadius: draft.tokens.radius || DEFAULT_TOKENS.radius,
                        }}
                      >
                        Primary
                      </span>
                      <span
                        className="inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium text-white"
                        style={{
                          background: draft.tokens.accent || DEFAULT_TOKENS.accent,
                          borderRadius: draft.tokens.radius || DEFAULT_TOKENS.radius,
                        }}
                      >
                        Accent
                      </span>
                      <span
                        className="inline-flex h-7 items-center border px-2.5 text-[11px]"
                        style={{
                          background: draft.tokens.surface || DEFAULT_TOKENS.surface,
                          color: draft.tokens.muted || DEFAULT_TOKENS.muted,
                          borderColor: draft.tokens.border || DEFAULT_TOKENS.border,
                          borderRadius: draft.tokens.radius || DEFAULT_TOKENS.radius,
                        }}
                      >
                        Surface
                      </span>
                    </div>
                  </div>
                </div>

                {TOKEN_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-2.5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.title}
                      </div>
                      {group.hint ? (
                        <p className="text-[11px] text-muted-foreground">{group.hint}</p>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'grid gap-2.5',
                        group.fields.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2',
                      )}
                    >
                      {group.fields.map((field) => {
                        const value = draft.tokens[field.key] || '';
                        return (
                          <div key={field.key} className="min-w-0">
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <Label className="text-xs">{field.label}</Label>
                              {field.hint ? (
                                <span className="text-[10px] text-muted-foreground">{field.hint}</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {field.kind === 'color' ? (
                                <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border/80 shadow-sm">
                                  <span
                                    className="absolute inset-0"
                                    style={{ background: asHexColor(value) }}
                                  />
                                  <input
                                    type="color"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    value={asHexColor(value)}
                                    disabled={readOnly}
                                    onChange={(e) => patchToken(field.key, e.target.value)}
                                    aria-label={`${field.label} color`}
                                  />
                                </label>
                              ) : null}
                              {field.kind === 'font' ? (
                                <Combobox
                                  className="h-9 min-w-0 flex-1"
                                  options={
                                    field.fontRole === 'body'
                                      ? bodyFontOptions
                                      : displayFontOptions
                                  }
                                  value={
                                    (
                                      field.fontRole === 'body'
                                        ? bodyFontOptions
                                        : displayFontOptions
                                    ).some((o) => o.value === value)
                                      ? value
                                      : undefined
                                  }
                                  placeholder={value || 'Select a font…'}
                                  searchPlaceholder="Search fonts…"
                                  disabled={readOnly}
                                  onChange={(stack) => patchToken(field.key, stack)}
                                />
                              ) : (
                                <Input
                                  className={cn(
                                    'h-9 min-w-0 flex-1 font-mono text-[12px]',
                                    field.kind === 'text' && 'font-sans text-[13px]',
                                  )}
                                  value={value}
                                  disabled={readOnly}
                                  onChange={(e) => patchToken(field.key, e.target.value)}
                                />
                              )}
                            </div>
                            {field.kind === 'font' && value ? (
                              <p
                                className="mt-1.5 truncate text-sm text-foreground"
                                style={{ fontFamily: value }}
                                title={value}
                              >
                                The quick brown fox — Aa 123
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            ) : null}

            {section === 'layout' ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,17rem)] lg:items-start">
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/15 px-3 py-2.5">
                    <div className="text-sm font-medium">Main layout</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Controls the site content column on every page — live site and builder canvas.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Content width</Label>
                    <Combobox
                      className="mt-1 h-9"
                      disabled={readOnly}
                      value={draft.siteLayout.contentMax}
                      onChange={(value) =>
                        patchSiteLayout({ contentMax: value || '1100px' })
                      }
                      options={PRESENCE_CONTENT_MAX_PRESETS.map((row) => ({
                        value: row.value,
                        label: row.label,
                        description: row.hint,
                      }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Side padding</Label>
                    <Combobox
                      className="mt-1 h-9"
                      disabled={readOnly}
                      value={draft.siteLayout.gutter}
                      onChange={(value) => patchSiteLayout({ gutter: value || '1rem' })}
                      options={PRESENCE_GUTTER_PRESETS.map((row) => ({
                        value: row.value,
                        label: row.label,
                      }))}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Space between the page edge and the content column on smaller screens.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Section spacing</Label>
                    <Combobox
                      className="mt-1 h-9"
                      disabled={readOnly}
                      value={draft.siteLayout.sectionGap}
                      onChange={(value) =>
                        patchSiteLayout({ sectionGap: value || '2.75rem' })
                      }
                      options={PRESENCE_SECTION_GAP_PRESETS.map((row) => ({
                        value: row.value,
                        label: row.label,
                      }))}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Vertical gap between stacked modules on the page.
                    </p>
                  </div>
                </div>
                <MainLayoutPreview layout={draft.siteLayout} />
              </div>
            ) : null}

            {section === 'header' ? (
              <>
                <MediaPickerField
                  label="Logo"
                  value={typeof draft.header.logoUrl === 'string' ? draft.header.logoUrl : ''}
                  dense
                  siteId={page.site.id}
                  identity={identity}
                  site={page.site}
                  disabled={readOnly}
                  onChange={(url) => patchHeader('logoUrl', url)}
                />
                <div>
                  <Label className="text-xs">Tagline</Label>
                  <Input
                    className="mt-1 h-9"
                    value={typeof draft.header.tagline === 'string' ? draft.header.tagline : ''}
                    disabled={readOnly}
                    onChange={(e) => patchHeader('tagline', e.target.value)}
                    placeholder="Optional short line"
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-border/70 px-3 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Header CTA
                  </div>
                  <div>
                    <Label className="text-xs">Button label</Label>
                    <Input
                      className="mt-1 h-9"
                      value={typeof draft.header.ctaLabel === 'string' ? draft.header.ctaLabel : ''}
                      disabled={readOnly}
                      onChange={(e) => patchHeader('ctaLabel', e.target.value)}
                      placeholder="e.g. Contact us"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">CTA action</Label>
                    <Combobox
                      className="mt-1 h-9"
                      disabled={readOnly}
                      value={
                        draft.header.ctaAction === 'form_popup' ||
                        draft.header.ctaAction === 'open_widget'
                          ? String(draft.header.ctaAction)
                          : 'link'
                      }
                      onChange={(value) =>
                        patchHeader(
                          'ctaAction',
                          value === 'form_popup' || value === 'open_widget' ? value : 'link',
                        )
                      }
                      options={[
                        { value: 'link', label: 'Open link', description: 'Go to a page or URL' },
                        {
                          value: 'form_popup',
                          label: 'Open form popup',
                          description: 'Modal with an Agency OS form',
                        },
                        {
                          value: 'open_widget',
                          label: 'Open chat widget',
                          description: 'Opens Conversation widget (Integrations)',
                        },
                      ]}
                    />
                  </div>
                  {draft.header.ctaAction === 'form_popup' ? (
                    <div>
                      <Label className="text-xs">Form</Label>
                      <Combobox
                        className="mt-1 h-9"
                        disabled={readOnly || !forms.length}
                        value={
                          typeof draft.header.ctaFormKey === 'string' && draft.header.ctaFormKey
                            ? draft.header.ctaFormKey
                            : forms[0]?.key || 'contact'
                        }
                        onChange={(value) =>
                          patchHeader('ctaFormKey', value || forms[0]?.key || 'contact')
                        }
                        options={
                          forms.length
                            ? forms.map((form) => ({
                                value: form.key,
                                label: form.name,
                                description: form.key,
                              }))
                            : [
                                {
                                  value: 'contact',
                                  label: 'Contact (default)',
                                  description: 'contact',
                                },
                              ]
                        }
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {forms.length
                          ? 'Opens a modal on the live site. Needs Conversation widget enabled.'
                          : 'Create a form under Digital Presence → Forms first.'}
                      </p>
                    </div>
                  ) : draft.header.ctaAction === 'open_widget' ? (
                    <p className="text-[10px] text-muted-foreground">
                      Opens the floating Conversation widget on click. Enable it under Integrations →
                      Conversation widget.
                    </p>
                  ) : (
                    <PageLinkField
                      label="Button link"
                      siteId={page.site.id}
                      disabled={readOnly}
                      value={typeof draft.header.ctaHref === 'string' ? draft.header.ctaHref : ''}
                      onChange={(href) => patchHeader('ctaHref', href)}
                      placeholder="/contact"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="text-xs font-medium">Show navigation</div>
                    <p className="text-[11px] text-muted-foreground">
                      Display the Primary menu in the header
                    </p>
                  </div>
                  <Switch
                    checked={draft.header.showNav !== false}
                    disabled={readOnly}
                    onCheckedChange={(checked) => patchHeader('showNav', checked)}
                  />
                </div>
              </>
            ) : null}

            {section === 'footer' ? (
              <>
                <div>
                  <Label className="text-xs">Footer note</Label>
                  <Textarea
                    className="mt-1"
                    rows={3}
                    value={typeof draft.footer.note === 'string' ? draft.footer.note : ''}
                    disabled={readOnly}
                    onChange={(e) => patchFooter('note', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Secondary line</Label>
                  <Input
                    className="mt-1 h-9"
                    value={
                      typeof draft.footer.secondaryNote === 'string' ? draft.footer.secondaryNote : ''
                    }
                    disabled={readOnly}
                    onChange={(e) => patchFooter('secondaryNote', e.target.value)}
                    placeholder="Optional second line"
                  />
                </div>
              </>
            ) : null}

            {section === 'navigation' ? (
              <MenuBuilder
                menusJson={draft.menusJson}
                menuAssignmentsJson={draft.menuAssignmentsJson}
                navigationJson={draft.navigation}
                readOnly={readOnly}
                siteId={page.site.id}
                onChange={(next) =>
                  patchDraft({
                    menusJson: next.menusJson,
                    menuAssignmentsJson: next.menuAssignmentsJson,
                    navigation: next.navigationJson,
                  })
                }
              />
            ) : null}

            {section === 'page' ? (
              <>
                <div className="rounded-lg border bg-muted/15 px-3 py-2.5">
                  <div className="text-sm font-medium">This page</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Title, path, freeform, and SEO for the page you are editing. Page style (layout
                    key) is in the right-hand Page inspector. Site content width is under Main
                    layout.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Page title</Label>
                  <Input
                    className="mt-1 h-9"
                    value={draft.pageTitle}
                    disabled={readOnly}
                    onChange={(e) => patchDraft({ pageTitle: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Path</Label>
                  <Input
                    className="mt-1 h-9"
                    value={draft.pagePath}
                    disabled={readOnly}
                    onChange={(e) => patchDraft({ pagePath: e.target.value })}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Unique public URL path on this site.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <div className="text-xs font-medium">Freeform layout</div>
                    <p className="text-[11px] text-muted-foreground">
                      Off = stacked modules. On = place root sections freely on the canvas.
                    </p>
                  </div>
                  <Switch
                    checked={draft.layoutMode === 'freeform'}
                    disabled={readOnly}
                    onCheckedChange={(checked) =>
                      patchDraft({ layoutMode: checked ? 'freeform' : 'flow' })
                    }
                  />
                </div>
                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground">SEO</div>
                  <p className="text-[10px] text-muted-foreground">
                    Page overrides. Site-wide SEO defaults are in Website settings.
                  </p>
                  <div>
                    <Label className="text-xs">Meta description</Label>
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={typeof draft.seo.description === 'string' ? draft.seo.description : ''}
                      disabled={readOnly}
                      onChange={(e) => patchSeo('description', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">OG title</Label>
                    <Input
                      className="mt-1 h-9"
                      value={typeof draft.seo.ogTitle === 'string' ? draft.seo.ogTitle : ''}
                      disabled={readOnly}
                      onChange={(e) => patchSeo('ogTitle', e.target.value)}
                      placeholder={draft.pageTitle}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">OG description</Label>
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={
                        typeof draft.seo.ogDescription === 'string' ? draft.seo.ogDescription : ''
                      }
                      disabled={readOnly}
                      onChange={(e) => patchSeo('ogDescription', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">OG image URL</Label>
                    <Input
                      className="mt-1 h-9"
                      type="url"
                      value={typeof draft.seo.ogImage === 'string' ? draft.seo.ogImage : ''}
                      disabled={readOnly}
                      onChange={(e) => patchSeo('ogImage', e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {section === 'website' ? (
              <div className="space-y-3 rounded-md border px-3 py-3">
                <p className="text-sm text-muted-foreground">
                  Name, domain, active theme, site SEO, scripts, analytics, and publish live in{' '}
                  <span className="font-medium text-foreground">Website settings</span>.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenWebsiteSettings?.();
                  }}
                >
                  Open website settings
                </Button>
              </div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {section !== 'website' ? (
            <Button type="button" disabled={readOnly || saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save chrome'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
