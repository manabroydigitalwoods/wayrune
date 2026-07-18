import { useEffect, useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Globe,
  Home,
  LayoutTemplate,
  Menu,
  PanelRightClose,
  Settings2,
} from 'lucide-react';
import {
  BrandTooltip,
  Button,
  Combobox,
  DatePicker,
  Input,
  Label,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TimePicker,
  cn,
} from '@wayrune/ui';
import { api } from '../../../api';
import {
  ancestorChain,
  asSchemaFields,
  clearResponsiveDevice,
  componentRefOf,
  effectiveStyleProps,
  freeformFrameOf,
  freeformFrameStored,
  writeFreeformFrameForDevice,
  prettyJson,
  setStylePropForDevice,
  previewRendererUrl,
} from './helpers';
import { ModuleFieldEditors } from './moduleFieldEditors';
import { StyleDesignPanel } from './StyleDesignPanel';
import type { BuilderPage, DeviceMode, FormDef, Identity, ModuleDef, Section } from './types';
import type { SiteChromeSection } from './BuilderSiteSettingsDialog';
import { MediaPickerField } from './MediaPicker';
import { MenuBuilder } from './MenuBuilder';
import { PageLinkField } from './PageLinkField';
import {
  asModuleVariations,
  categoryLabel,
  defaultVariation,
  mergeVariationProps,
} from '../catalogMeta';

const PAGE_LAYOUT_OPTIONS = [
  {
    value: 'default',
    label: 'Default',
    description: 'Standard page spacing and chrome',
  },
  {
    value: 'marketing',
    label: 'Marketing',
    description: 'Campaign pages — theme CSS hook',
  },
  {
    value: 'landing',
    label: 'Landing',
    description: 'Extra top padding for hero-first pages',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Lean chrome styling hook',
  },
] as const;
const BUILTIN_VARIABLES = [
  'organization.name',
  'organization.logo',
  'phone',
  'whatsapp',
  'email',
  'site.name',
  'site.url',
  'currency',
  'timezone',
] as const;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isoToDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isoToTimeHHmm(iso?: string): string | undefined {
  const d = isoToDate(iso);
  if (!d) return undefined;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function mergeDateAndTime(date: Date | undefined, time?: string | null): string | undefined {
  if (!date) return undefined;
  const [hRaw, mRaw] = String(time || '00:00').split(':');
  const next = new Date(date);
  next.setHours(Number(hRaw) || 0, Number(mRaw) || 0, 0, 0);
  return next.toISOString();
}

function ScheduleDateTimeFields({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  onChange: (iso: string | undefined) => void;
}) {
  const date = isoToDate(value);
  const time = isoToTimeHHmm(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-2 gap-1.5">
        <DatePicker
          value={date}
          disabled={disabled}
          className="h-8"
          onChange={(next) => onChange(mergeDateAndTime(next, time))}
        />
        <TimePicker
          value={time}
          disabled={disabled || !date}
          className="h-8"
          onChange={(next) => onChange(mergeDateAndTime(date, next))}
        />
      </div>
    </div>
  );
}

/** Content-schema keys that belong on the Styles tab (layout / presentation). */
const PRESENTATION_FIELD_KEYS = new Set([
  'variant',
  'columns',
  'direction',
  'gap',
  'align',
  'justify',
  'wrap',
  'layout',
]);

export function BuilderInspector({
  page,
  section,
  selectedModule,
  forms,
  canWrite = true,
  chromeRegion,
  device = 'desktop',
  onDelete,
  onPropChange,
  onPropsJsonChange,
  onSeoChange,
  onTitleChange,
  onPathChange,
  onLayoutKeyChange,
  onLayoutModeChange,
  onNavigationChange,
  onMenusChange,
  onFooterNoteChange,
  onFooterRegionChange,
  onCollapse,
  onSelectSection,
  onSaveAsComponent,
  onUpdateComponent,
  onResetFromComponent,
  onHeaderRegionChange,
  onSaveGlobalSlot,
  identity = null,
  onOpenSiteChrome,
  onOpenWebsiteSettings,
}: {
  page: BuilderPage;
  section: Section | null;
  selectedModule: ModuleDef | null;
  forms: FormDef[];
  canWrite?: boolean;
  chromeRegion?: 'header' | 'footer' | 'announcement' | 'cookie' | 'sticky_cta' | null;
  device?: DeviceMode;
  onDelete: () => void;
  onPropChange: (key: string, value: unknown) => void;
  onPropsJsonChange: (props: Record<string, unknown>) => void;
  onSeoChange: (seo: Record<string, unknown>) => void;
  onTitleChange?: (title: string) => void;
  onPathChange?: (path: string) => void;
  onLayoutKeyChange?: (layoutKey: string) => void;
  onLayoutModeChange?: (mode: 'flow' | 'freeform') => void;
  onNavigationChange?: (entries: Array<Record<string, unknown>>) => void;
  onMenusChange?: (next: {
    menusJson: Record<string, unknown>;
    menuAssignmentsJson: Record<string, unknown>;
    navigationJson: Array<{ label: string; path: string }>;
  }) => void;
  onFooterNoteChange?: (note: string) => void;
  onFooterRegionChange?: (patch: Record<string, unknown>) => void;
  onCollapse?: () => void;
  onSelectSection?: (clientId: string) => void;
  onSaveAsComponent?: () => void;
  onUpdateComponent?: () => void;
  onResetFromComponent?: () => void;
  onHeaderRegionChange?: (patch: Record<string, unknown>) => void;
  onSaveGlobalSlot?: (
    slotKey: string,
    name: string,
    propsJson: Record<string, unknown>,
  ) => void | Promise<void>;
  identity?: Identity | null;
  onOpenSiteChrome?: (section?: SiteChromeSection) => void;
  /** Optional tab deep-link (e.g. `widget`). */
  onOpenWebsiteSettings?: (tab?: 'widget' | 'general' | 'seo') => void;
}) {
  const [inspectorTab, setInspectorTab] = useState<'content' | 'data' | 'styles'>('content');
  const [dataSources, setDataSources] = useState<Array<{ id: string; label: string; description?: string }>>(
    [],
  );
  useEffect(() => {
    setInspectorTab('content');
  }, [section?.clientId, chromeRegion]);

  useEffect(() => {
    if (!page.site.id) return;
    api<{ sources: Array<{ id: string; label: string; description?: string }> }>(
      `/presence/sites/${page.site.id}/data-sources`,
    )
      .then((res) => setDataSources(res.sources || []))
      .catch(() =>
        setDataSources([
          { id: 'trips', label: 'Trips' },
          { id: 'quotations', label: 'Quotations' },
        ]),
      );
  }, [page.site.id]);

  const fields = asSchemaFields(selectedModule?.schemaJson);
  const variants = asModuleVariations(selectedModule?.variantsJson);
  const fieldsWithVariants =
    variants.length > 0
      ? fields.map((field) => {
          if (field.key !== 'variant') return field;
          return {
            ...field,
            options: variants.map((v) => ({ value: v.key, label: v.name })),
          };
        })
      : fields;
  const contentFields = fieldsWithVariants.filter((field) => !PRESENTATION_FIELD_KEYS.has(field.key));
  const presentationFields = fieldsWithVariants.filter((field) =>
    PRESENTATION_FIELD_KEYS.has(field.key),
  );
  const seo = (page.seoJson || {}) as Record<string, unknown>;
  const readOnly = !canWrite;
  const isFreeform = (page.layoutMode || 'flow') === 'freeform';

  const collapseButton = onCollapse ? (
    <BrandTooltip label="Collapse inspector" side="left">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onCollapse}
        aria-label="Collapse inspector"
      >
        <PanelRightClose className="size-3.5" />
      </Button>
    </BrandTooltip>
  ) : null;

  if (chromeRegion === 'header') {
    const header =
      ((page.site.globalRegionsJson as { header?: Record<string, unknown> } | null)?.header ||
        {}) as Record<string, unknown>;
    const patchHeader = (key: string, value: unknown) =>
      onHeaderRegionChange?.({ ...header, [key]: value });
    return (
      <aside className="flex min-h-0 w-full flex-col overflow-hidden border-t xl:w-[260px] xl:border-l xl:border-t-0">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-sm font-medium">Header</div>
          {collapseButton}
        </div>
        <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3', readOnly ? 'pointer-events-none opacity-70' : '')}>
          <p className="text-xs text-muted-foreground">
            Shared across every page on this site — edits apply immediately.
          </p>
          <MediaPickerField
            label="Logo"
            value={typeof header.logoUrl === 'string' ? header.logoUrl : ''}
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
              className="mt-1 h-8"
              disabled={readOnly}
              value={typeof header.tagline === 'string' ? header.tagline : ''}
              onChange={(e) => patchHeader('tagline', e.target.value)}
              placeholder="Optional short line"
            />
          </div>
          <div>
            <Label className="text-xs">Header CTA label</Label>
            <Input
              className="mt-1 h-8"
              disabled={readOnly}
              value={typeof header.ctaLabel === 'string' ? header.ctaLabel : ''}
              onChange={(e) => patchHeader('ctaLabel', e.target.value)}
              placeholder="e.g. Book now"
            />
          </div>
          <div>
            <Label className="text-xs">CTA action</Label>
            <Combobox
              size="sm"
              className="mt-1"
              disabled={readOnly}
              value={
                header.ctaAction === 'form_popup' || header.ctaAction === 'open_widget'
                  ? String(header.ctaAction)
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
          {header.ctaAction === 'form_popup' ? (
            <div>
              <Label className="text-xs">Form</Label>
              <Combobox
                size="sm"
                className="mt-1"
                disabled={readOnly || !forms.length}
                value={
                  typeof header.ctaFormKey === 'string' && header.ctaFormKey
                    ? header.ctaFormKey
                    : forms[0]?.key || 'contact'
                }
                onChange={(value) => patchHeader('ctaFormKey', value || forms[0]?.key || 'contact')}
                options={
                  forms.length
                    ? forms.map((form) => ({
                        value: form.key,
                        label: form.name,
                        description: form.key,
                      }))
                    : [{ value: 'contact', label: 'Contact (default)', description: 'contact' }]
                }
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {forms.length
                  ? 'Submissions go to Inbox via the Conversation widget.'
                  : 'Create a form under Digital Presence → Forms first.'}
              </p>
            </div>
          ) : header.ctaAction === 'open_widget' ? (
            <p className="text-[10px] text-muted-foreground">
              Opens the floating Conversation widget. Enable it under Integrations → Conversation
              widget.
            </p>
          ) : (
            <PageLinkField
              label="Header CTA link"
              dense
              siteId={page.site.id}
              disabled={readOnly}
              value={typeof header.ctaHref === 'string' ? header.ctaHref : ''}
              onChange={(href) => patchHeader('ctaHref', href)}
              placeholder="/contact"
            />
          )}
          <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
            <Label className="text-xs">Show navigation</Label>
            <Switch
              checked={header.showNav !== false}
              disabled={readOnly}
              onCheckedChange={(checked) => patchHeader('showNav', checked)}
            />
          </div>
          <MenuBuilder
            key="header-primary"
            compact
            focusMenuKey="primary"
            menusJson={page.site.menusJson}
            menuAssignmentsJson={page.site.menuAssignmentsJson}
            navigationJson={page.site.navigationJson}
            readOnly={readOnly}
            siteId={page.site.id}
            onChange={(next) => {
              if (onMenusChange) onMenusChange(next);
              else onNavigationChange?.(next.navigationJson);
            }}
          />
        </div>
      </aside>
    );
  }

  if (chromeRegion === 'footer') {
    const footer =
      ((page.site.globalRegionsJson as { footer?: Record<string, unknown> } | null)?.footer ||
        {}) as Record<string, unknown>;
    const patchFooter = (key: string, value: unknown) => {
      const next = { ...footer, [key]: value };
      if (key === 'note') onFooterNoteChange?.(String(value ?? ''));
      else onFooterRegionChange?.(next);
    };
    return (
      <aside className="flex min-h-0 w-full flex-col overflow-hidden border-t xl:w-[260px] xl:border-l xl:border-t-0">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-sm font-medium">Footer</div>
          {collapseButton}
        </div>
        <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3', readOnly ? 'pointer-events-none opacity-70' : '')}>
          <p className="text-xs text-muted-foreground">
            Shared across every page on this site — edits apply immediately to the footer.
          </p>
          <div>
            <Label className="text-xs">Footer note</Label>
            <Textarea
              className="mt-1"
              rows={3}
              disabled={readOnly}
              value={typeof footer.note === 'string' ? footer.note : ''}
              onChange={(e) => patchFooter('note', e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Secondary line</Label>
            <Input
              className="mt-1 h-8"
              disabled={readOnly}
              value={typeof footer.secondaryNote === 'string' ? footer.secondaryNote : ''}
              onChange={(e) => patchFooter('secondaryNote', e.target.value)}
              placeholder="Optional second line"
            />
          </div>
          <MenuBuilder
            key="footer-menu"
            compact
            focusMenuKey="footer"
            menusJson={page.site.menusJson}
            menuAssignmentsJson={page.site.menuAssignmentsJson}
            navigationJson={page.site.navigationJson}
            readOnly={readOnly}
            siteId={page.site.id}
            onChange={(next) => {
              if (onMenusChange) onMenusChange(next);
              else onNavigationChange?.(next.navigationJson);
            }}
          />
        </div>
      </aside>
    );
  }

  if (chromeRegion === 'announcement' || chromeRegion === 'cookie' || chromeRegion === 'sticky_cta') {
    return (
      <GlobalSlotInspector
        chromeRegion={chromeRegion}
        page={page}
        readOnly={readOnly}
        collapseButton={collapseButton}
        onSaveGlobalSlot={onSaveGlobalSlot}
      />
    );
  }

  if (!section) {
    const isHome = page.site.homePageId === page.id || page.site.homePage?.id === page.id;
    const isPublished = page.status === 'published';
    const previewUrl = previewRendererUrl(identity, page.path, null, page.site);
    const layoutHint =
      PAGE_LAYOUT_OPTIONS.find((row) => row.value === (page.layoutKey || 'default'))?.description ||
      '';

    return (
      <aside className="flex min-h-0 w-full flex-col overflow-hidden border-t xl:w-[280px] xl:border-l xl:border-t-0">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-sm font-medium">Page</div>
          {collapseButton}
        </div>
        <div
          className={
            readOnly
              ? 'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 pointer-events-none opacity-70'
              : 'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3'
          }
        >
          <div className="rounded-md border bg-muted/25 px-2.5 py-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              This panel is for <span className="font-medium text-foreground">this page only</span>.
              Colors, header/footer, menus, and site content width are under Site chrome.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge
                value={page.status || 'draft'}
                tone={isPublished ? 'success' : 'neutral'}
                label={isPublished ? 'Published' : 'Draft'}
                showIcon={false}
              />
              {isHome ? (
                <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
                  <Home className="size-3" />
                  Home page
                </span>
              ) : null}
            </div>
            {!isHome ? (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Set the site home in Website settings → General.
              </p>
            ) : null}
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                Preview live URL
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>

          {onTitleChange ? (
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                className="mt-1 h-8"
                value={page.title}
                disabled={readOnly}
                onChange={(e) => onTitleChange(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Shown in the builder and as the default browser / social title.
              </p>
            </div>
          ) : null}
          {onPathChange ? (
            <div>
              <Label className="text-xs">Path</Label>
              <Input
                className="mt-1 h-8"
                value={page.path}
                disabled={readOnly}
                onChange={(e) => onPathChange(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Public URL path on this site (e.g. <code className="text-[10px]">/</code> or{' '}
                <code className="text-[10px]">/trips</code>). Must be unique.
              </p>
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border px-2.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Layout
            </div>
            <div>
              <Label className="text-xs">Page style</Label>
              <Combobox
                size="sm"
                className="mt-1"
                disabled={readOnly || !onLayoutKeyChange}
                value={page.layoutKey || 'default'}
                onChange={(value) => onLayoutKeyChange?.(value)}
                options={PAGE_LAYOUT_OPTIONS.map((row) => ({
                  value: row.value,
                  label: row.label,
                  description: row.description,
                }))}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {layoutHint}. Adds a CSS class on the published page; it does not change content
                column width.
              </p>
            </div>
            {onLayoutModeChange ? (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/15 px-2.5 py-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <LayoutTemplate className="size-3.5" />
                    Freeform
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Off = stacked modules. On = place root sections freely on the canvas.
                  </p>
                </div>
                <Switch
                  checked={isFreeform}
                  disabled={readOnly}
                  onCheckedChange={(checked) => onLayoutModeChange(checked ? 'freeform' : 'flow')}
                />
              </div>
            ) : null}
            {onOpenSiteChrome ? (
              <button
                type="button"
                className="w-full rounded-md border border-dashed px-2.5 py-2 text-left transition-colors hover:bg-muted/40"
                onClick={() => onOpenSiteChrome('layout')}
              >
                <div className="text-[11px] font-medium">Site content width</div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Column max width, side padding, and section spacing apply to every page → Site
                  chrome → Main layout.
                </p>
              </button>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Site content width is under Site chrome → Main layout.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-md border px-2.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Chat
            </div>
            <p className="text-[10px] text-muted-foreground">
              Branding, placement, and URL targeting live under Settings → Inbox → Chat → Chatflows.
              Assign which chatflow this site uses in Website settings → Chat widget.
            </p>
            {onOpenWebsiteSettings ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start px-0 text-[11px] text-muted-foreground"
                onClick={() => onOpenWebsiteSettings('widget')}
              >
                Assign chatflow for this site…
              </Button>
            ) : null}
          </div>

          {(onOpenSiteChrome || onOpenWebsiteSettings) && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Related settings
              </div>
              <div className="grid gap-1">
                {onOpenSiteChrome ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2 px-2 text-xs"
                      onClick={() => onOpenSiteChrome('header')}
                    >
                      <Settings2 className="size-3.5 shrink-0 text-muted-foreground" />
                      Header, footer & colors
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2 px-2 text-xs"
                      onClick={() => onOpenSiteChrome('navigation')}
                    >
                      <Menu className="size-3.5 shrink-0 text-muted-foreground" />
                      Menus & navigation
                    </Button>
                  </>
                ) : null}
                {onOpenWebsiteSettings ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 justify-start gap-2 px-2 text-xs"
                    onClick={() => onOpenWebsiteSettings()}
                  >
                    <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                    Domain, theme, home & site SEO
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">SEO</div>
            <p className="mb-2.5 text-[10px] text-muted-foreground">
              Overrides for this page. Site-wide defaults (title suffix, default description) are in
              Website settings → SEO.
            </p>
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs">SEO title</Label>
                <Input
                  className="mt-1 h-8"
                  disabled={readOnly}
                  value={typeof seo.title === 'string' ? seo.title : ''}
                  onChange={(e) => onSeoChange({ ...seo, title: e.target.value })}
                  placeholder={page.title}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Optional. Falls back to the page title above.
                </p>
              </div>
              <div>
                <Label className="text-xs">Meta description</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  disabled={readOnly}
                  value={typeof seo.description === 'string' ? seo.description : ''}
                  onChange={(e) => onSeoChange({ ...seo, description: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">OG title</Label>
                <Input
                  className="mt-1 h-8"
                  disabled={readOnly}
                  value={typeof seo.ogTitle === 'string' ? seo.ogTitle : ''}
                  onChange={(e) => onSeoChange({ ...seo, ogTitle: e.target.value })}
                  placeholder={typeof seo.title === 'string' && seo.title ? seo.title : page.title}
                />
              </div>
              <div>
                <Label className="text-xs">OG description</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  disabled={readOnly}
                  value={typeof seo.ogDescription === 'string' ? seo.ogDescription : ''}
                  onChange={(e) => onSeoChange({ ...seo, ogDescription: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">OG image URL</Label>
                <Input
                  className="mt-1 h-8"
                  type="url"
                  disabled={readOnly}
                  value={typeof seo.ogImage === 'string' ? seo.ogImage : ''}
                  onChange={(e) => onSeoChange({ ...seo, ogImage: e.target.value })}
                />
              </div>
              <div className="rounded-md border px-2.5 py-2">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Advanced
                </div>
                <div className="space-y-2.5">
                  <div>
                    <Label className="text-xs">Canonical URL</Label>
                    <Input
                      className="mt-1 h-8"
                      type="url"
                      disabled={readOnly}
                      value={typeof seo.canonical === 'string' ? seo.canonical : ''}
                      onChange={(e) => onSeoChange({ ...seo, canonical: e.target.value })}
                      placeholder="Optional absolute URL"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium">Noindex</div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Ask search engines not to index this page
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(seo.noindex)}
                      disabled={readOnly}
                      onCheckedChange={(checked) => onSeoChange({ ...seo, noindex: checked })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Robots</Label>
                    <Input
                      className="mt-1 h-8"
                      disabled={readOnly}
                      value={typeof seo.robots === 'string' ? seo.robots : ''}
                      onChange={(e) => onSeoChange({ ...seo, robots: e.target.value })}
                      placeholder="e.g. nofollow"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const showFrame = isFreeform && !section.parentId;
  const frame = showFrame ? freeformFrameOf(section.propsJson, device || 'desktop') : null;
  const storedFrame = showFrame ? freeformFrameStored(section.propsJson) : null;
  const nestPath = ancestorChain(page.sections, section.clientId);
  const labelOf = (row: Section) => row.type;
  const stylePropsView = effectiveStyleProps(section.propsJson || {}, device);
  const componentRef = componentRefOf(section.propsJson || {});
  const themeTokens = (page.site.theme?.tokensJson || {}) as Record<string, unknown>;
  const onStyleFieldChange = (key: string, value: unknown) => {
    onPropsJsonChange(setStylePropForDevice(section.propsJson || {}, device, key, value));
  };
  const deviceLabel =
    device === 'widescreen'
      ? 'Extra wide'
      : device === 'desktop'
        ? 'Desktop'
        : device === 'tablet'
          ? 'Tablet'
          : 'Mobile';
  const isDesktopLike = !device || device === 'desktop' || device === 'widescreen';
  const boxWidth =
    stylePropsView.boxWidth === 'content' ||
    stylePropsView.boxWidth === 'wide' ||
    stylePropsView.boxWidth === 'full'
      ? String(stylePropsView.boxWidth)
      : 'full';
  const contentAlign =
    stylePropsView.contentAlign === 'left' ||
    stylePropsView.contentAlign === 'center' ||
    stylePropsView.contentAlign === 'right'
      ? String(stylePropsView.contentAlign)
      : 'left';

  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden border-t xl:w-[260px] xl:border-l xl:border-t-0">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1.5 sm:px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">
            {selectedModule?.name || section.type}
          </div>
          {nestPath.length ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-0.5 text-[10px] text-muted-foreground">
              <span>Page</span>
              {nestPath.map((ancestor) => (
                <span key={ancestor.clientId} className="inline-flex items-center gap-0.5">
                  <span aria-hidden>/</span>
                  <button
                    type="button"
                    className="truncate hover:underline"
                    onClick={() => onSelectSection?.(ancestor.clientId)}
                  >
                    {labelOf(ancestor)}
                  </button>
                </span>
              ))}
              <span className="inline-flex items-center gap-0.5">
                <span aria-hidden>/</span>
                <span className="truncate font-medium text-foreground">
                  {selectedModule?.name || section.type}
                </span>
              </span>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              {categoryLabel(selectedModule?.category || 'content')}
            </div>
          )}
        </div>
        {collapseButton}
      </div>

      <Tabs
        value={inspectorTab}
        onValueChange={(value) =>
          setInspectorTab(value === 'styles' ? 'styles' : value === 'data' ? 'data' : 'content')
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b px-2 py-1.5 sm:px-3">
          <TabsList className="grid h-8 w-full grid-cols-3">
            <TabsTrigger value="content" className="text-xs">
              Content
            </TabsTrigger>
            <TabsTrigger value="data" className="text-xs">
              Data
            </TabsTrigger>
            <TabsTrigger value="styles" className="text-xs">
              Styles
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="content"
          className={cn(
            'mt-0 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 sm:px-3',
            readOnly ? 'pointer-events-none opacity-70' : '',
          )}
        >
          {variants.length > 1 ? (
            <div>
              <Label className="text-xs">Variation</Label>
              <Combobox
                size="sm"
                className="mt-1"
                disabled={readOnly}
                value={String(section.propsJson.variant || defaultVariation(variants)?.key || '')}
                onChange={(value) => {
                  const next = variants.find((v) => v.key === value) || null;
                  const base = {
                    ...(selectedModule?.defaultPropsJson || {}),
                    ...section.propsJson,
                  };
                  const { frame, ...rest } = base;
                  onPropsJsonChange({
                    ...mergeVariationProps(rest, next),
                    ...(frame ? { frame } : {}),
                  });
                }}
                options={variants.map((v) => ({
                  value: v.key,
                  label: v.isDefault ? `${v.name} (default)` : v.name,
                }))}
              />
              {variants.find((v) => v.key === section.propsJson.variant)?.description ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {String(variants.find((v) => v.key === section.propsJson.variant)?.description)}
                </p>
              ) : null}
            </div>
          ) : null}
          {contentFields.length ? (
            <ModuleFieldEditors
              fields={contentFields}
              propsJson={section.propsJson}
              rendererKey={section.type}
              forms={forms}
              onChange={onPropChange}
              dense
              mediaContext={{ siteId: page.site.id, identity, site: page.site }}
            />
          ) : !fields.length ? (
            <div>
              <Label className="text-xs">Props JSON</Label>
              <Textarea
                className="mt-1"
                rows={10}
                disabled={readOnly}
                value={prettyJson(section.propsJson)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value || '{}');
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      onPropsJsonChange(parsed as Record<string, unknown>);
                    }
                  } catch {
                    // allow partial JSON while typing
                  }
                }}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No content fields — check Styles for layout options.</p>
          )}

          <div className="space-y-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">Component</div>
            {componentRef ? (
              <p className="text-[11px] text-muted-foreground">
                Linked to{' '}
                <span className="font-medium text-foreground">
                  {componentRef.name || componentRef.key}
                </span>
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={readOnly}
                onClick={onSaveAsComponent}
              >
                <LayoutTemplate className="mr-1.5 size-3.5" />
                {componentRef ? 'Save as new component' : 'Save as component'}
              </Button>
              {componentRef ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={readOnly || !onUpdateComponent}
                    onClick={onUpdateComponent}
                  >
                    Push updates to component
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={readOnly || !onResetFromComponent}
                    onClick={onResetFromComponent}
                  >
                    Reset from component
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={readOnly}
            onClick={onDelete}
          >
            Delete module
          </Button>
        </TabsContent>

        <TabsContent
          value="data"
          className={cn(
            'mt-0 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 sm:px-3',
            readOnly ? 'pointer-events-none opacity-70' : '',
          )}
        >
          {(() => {
            const props = section.propsJson || {};
            const ds =
              props.dataSource && typeof props.dataSource === 'object'
                ? (props.dataSource as Record<string, unknown>)
                : props.liveFrom === 'trips'
                  ? { source: 'trips', limit: 6 }
                  : {};
            const schedule =
              props.schedule && typeof props.schedule === 'object'
                ? (props.schedule as Record<string, unknown>)
                : {};
            const ab =
              props.ab && typeof props.ab === 'object' ? (props.ab as Record<string, unknown>) : {};
            const patchDs = (patch: Record<string, unknown>) => {
              const next = { ...ds, ...patch };
              const { liveFrom: _live, ...rest } = props;
              onPropsJsonChange({
                ...rest,
                dataSource: next.source ? next : undefined,
              });
            };
            return (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Data source</div>
                  <p className="text-[11px] text-muted-foreground">
                    Bind live Travel OS or CMS collection items into this section’s{' '}
                    <code>items</code>.
                  </p>
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Combobox
                      size="sm"
                      className="mt-1"
                      disabled={readOnly}
                      value={typeof ds.source === 'string' ? ds.source : ''}
                      onChange={(value) =>
                        patchDs({
                          source: value || undefined,
                          limit: typeof ds.limit === 'number' ? ds.limit : 6,
                        })
                      }
                      placeholder="None (static props)"
                      options={[
                        { value: '', label: 'None (static props)' },
                        ...dataSources.map((s) => ({
                          value: s.id,
                          label: s.label,
                          description: s.description,
                        })),
                      ]}
                    />
                  </div>
                  {ds.source ? (
                    <>
                      <div>
                        <Label className="text-xs">Limit</Label>
                        <Input
                          className="mt-1 h-8"
                          type="number"
                          min={1}
                          max={100}
                          disabled={readOnly}
                          value={typeof ds.limit === 'number' ? ds.limit : 6}
                          onChange={(e) =>
                            patchDs({ limit: Math.max(1, Number(e.target.value) || 6) })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Sort</Label>
                        <Combobox
                          size="sm"
                          className="mt-1"
                          disabled={readOnly}
                          value={
                            ds.sort && typeof ds.sort === 'object'
                              ? `${String((ds.sort as { field?: string }).field || 'updatedAt')}:${
                                  (ds.sort as { dir?: string }).dir || 'desc'
                                }`
                              : 'updatedAt:desc'
                          }
                          onChange={(value) => {
                            const [field, dir] = value.split(':');
                            patchDs({
                              sort: { field, dir: dir === 'asc' ? 'asc' : 'desc' },
                            });
                          }}
                          options={[
                            { value: 'updatedAt:desc', label: 'Updated (newest)' },
                            { value: 'updatedAt:asc', label: 'Updated (oldest)' },
                            { value: 'title:asc', label: 'Title A–Z' },
                            { value: 'title:desc', label: 'Title Z–A' },
                          ]}
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground">Insert variable</div>
                  <p className="text-[11px] text-muted-foreground">
                    Copies <code>{'{{ key }}'}</code> — paste into any text field.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {BUILTIN_VARIABLES.map((key) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px]"
                        disabled={readOnly}
                        onClick={() => {
                          void navigator.clipboard?.writeText(`{{ ${key} }}`);
                        }}
                      >
                        {key}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground">Schedule</div>
                  <ScheduleDateTimeFields
                    label="Publish at"
                    disabled={readOnly}
                    value={typeof schedule.publishAt === 'string' ? schedule.publishAt : undefined}
                    onChange={(publishAt) =>
                      onPropsJsonChange({
                        ...props,
                        schedule: { ...schedule, publishAt },
                      })
                    }
                  />
                  <ScheduleDateTimeFields
                    label="Unpublish at"
                    disabled={readOnly}
                    value={
                      typeof schedule.unpublishAt === 'string' ? schedule.unpublishAt : undefined
                    }
                    onChange={(unpublishAt) =>
                      onPropsJsonChange({
                        ...props,
                        schedule: { ...schedule, unpublishAt },
                      })
                    }
                  />
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground">Personalization</div>
                  <p className="text-[11px] text-muted-foreground">
                    Match visitor country / device / UTM via <code>props.rules</code> (JSON advanced).
                  </p>
                  <div>
                    <Label className="text-xs">Show only when country is</Label>
                    <Input
                      className="mt-1 h-8"
                      placeholder="IN, US"
                      disabled={readOnly}
                      value={(() => {
                        const rules = Array.isArray(props.rules) ? props.rules : [];
                        const rule = rules.find(
                          (r) =>
                            r &&
                            typeof r === 'object' &&
                            (r as { kind?: string }).kind === 'personalize',
                        ) as { when?: { countries?: string[] } } | undefined;
                        return (rule?.when?.countries || []).join(', ');
                      })()}
                      onChange={(e) => {
                        const countries = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const other = (Array.isArray(props.rules) ? props.rules : []).filter(
                          (r) =>
                            !(
                              r &&
                              typeof r === 'object' &&
                              (r as { kind?: string }).kind === 'personalize'
                            ),
                        );
                        onPropsJsonChange({
                          ...props,
                          rules: countries.length
                            ? [
                                ...other,
                                { kind: 'personalize', when: { countries } },
                              ]
                            : other,
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-muted-foreground">A/B test</div>
                    <Switch
                      checked={ab.enabled === true}
                      disabled={readOnly}
                      onCheckedChange={(checked) =>
                        onPropsJsonChange({
                          ...props,
                          ab: { ...ab, enabled: checked, trafficPercent: ab.trafficPercent ?? 50 },
                        })
                      }
                    />
                  </div>
                  {ab.enabled === true ? (
                    <>
                      <div>
                        <Label className="text-xs">Traffic to B (%)</Label>
                        <Input
                          className="mt-1 h-8"
                          type="number"
                          min={0}
                          max={100}
                          disabled={readOnly}
                          value={typeof ab.trafficPercent === 'number' ? ab.trafficPercent : 50}
                          onChange={(e) =>
                            onPropsJsonChange({
                              ...props,
                              ab: {
                                ...ab,
                                enabled: true,
                                trafficPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Variant B title override</Label>
                        <Input
                          className="mt-1 h-8"
                          disabled={readOnly}
                          value={
                            ab.variantB && typeof ab.variantB === 'object'
                              ? String((ab.variantB as { title?: string }).title || '')
                              : ''
                          }
                          onChange={(e) =>
                            onPropsJsonChange({
                              ...props,
                              ab: {
                                ...ab,
                                enabled: true,
                                variantB: {
                                  ...((ab.variantB as Record<string, unknown>) || {}),
                                  title: e.target.value,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent
          value="styles"
          className={cn(
            'mt-0 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2 sm:px-3',
            readOnly ? 'pointer-events-none opacity-70' : '',
          )}
        >
          {presentationFields.length ? (
            <ModuleFieldEditors
              fields={presentationFields}
              propsJson={section.propsJson}
              rendererKey={section.type}
              forms={forms}
              onChange={onPropChange}
              dense
            />
          ) : null}

          {showFrame && frame && storedFrame ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">Position &amp; size</div>
                {device && !isDesktopLike ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {deviceLabel} frame
                  </span>
                ) : null}
              </div>
              {device && !isDesktopLike ? (
                <p className="text-[11px] text-muted-foreground">
                  Edits apply to the {deviceLabel.toLowerCase()} override. Desktop position stays
                  unchanged.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">X</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    value={frame.x}
                    onChange={(e) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          x: Number(e.target.value) || 0,
                        }),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Y</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    value={frame.y}
                    onChange={(e) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          y: Number(e.target.value) || 0,
                        }),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Width</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    value={frame.w}
                    onChange={(e) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          w: Number(e.target.value) || 0,
                        }),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Height</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    value={frame.h}
                    onChange={(e) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          h: Number(e.target.value) || 0,
                        }),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Layer (z)</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    value={frame.z ?? 1}
                    onChange={(e) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          z: Number(e.target.value) || 0,
                        }),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Combobox
                    size="sm"
                    className="mt-1"
                    value={frame.unit || 'px'}
                    onChange={(value) =>
                      onPropChange(
                        'frame',
                        writeFreeformFrameForDevice(storedFrame, device || 'desktop', {
                          ...frame,
                          unit: value === '%' ? '%' : 'px',
                        }),
                      )
                    }
                    options={[
                      { value: 'px', label: 'px' },
                      { value: '%', label: '%' },
                    ]}
                  />
                </div>
              </div>
              {isDesktopLike && !storedFrame.mobile ? (
                <div>
                  <Label className="text-xs">Mobile scale (optional)</Label>
                  <Input
                    className="mt-1 h-8"
                    type="number"
                    step="0.05"
                    min={0.2}
                    max={1.5}
                    placeholder="e.g. 0.9"
                    value={storedFrame.mobileScale ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next =
                        raw === ''
                          ? { ...storedFrame, mobileScale: undefined }
                          : { ...storedFrame, mobileScale: Number(raw) || undefined };
                      onPropChange('frame', next);
                    }}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Scales desktop frame under 480px when no mobile override is set.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">Box &amp; position</div>
              {!isDesktopLike ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {deviceLabel}
                </span>
              ) : null}
            </div>
            <div>
              <Label className="text-[10px]">Box width</Label>
              <div className="mt-1 flex gap-0.5 rounded-md border p-0.5">
                {(
                  [
                    { value: 'content', label: 'Narrow' },
                    { value: 'wide', label: 'Wide' },
                    { value: 'full', label: 'Full' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={readOnly}
                    className={cn(
                      'flex-1 rounded px-1.5 py-1 text-[10px] font-medium',
                      boxWidth === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    onClick={() => onStyleFieldChange('boxWidth', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                How wide the module sits in the page column
              </p>
            </div>
            <div>
              <Label className="text-[10px]">Content position</Label>
              <div className="mt-1 flex gap-0.5 rounded-md border p-0.5">
                {(
                  [
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={readOnly}
                    className={cn(
                      'flex-1 rounded px-1.5 py-1 text-[10px] font-medium',
                      contentAlign === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    onClick={() => onStyleFieldChange('contentAlign', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Horizontal alignment when the box is narrower than the page
              </p>
            </div>
          </div>

          <StyleDesignPanel
            propsJson={stylePropsView}
            themeTokens={themeTokens}
            disabled={readOnly}
            deviceLabel={deviceLabel}
            showDeviceBadge={!isDesktopLike}
            onChange={onStyleFieldChange}
            onClearDevice={
              !isDesktopLike
                ? () =>
                    onPropsJsonChange(
                      clearResponsiveDevice(
                        section.propsJson || {},
                        device as 'tablet' | 'mobile',
                      ),
                    )
                : undefined
            }
            visibilitySlot={
              <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                <Label className="text-xs">Hide on {deviceLabel.toLowerCase()}</Label>
                <Switch
                  checked={stylePropsView.hidden === true}
                  disabled={readOnly}
                  onCheckedChange={(checked) => onStyleFieldChange('hidden', checked || undefined)}
                />
              </div>
            }
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function GlobalSlotInspector({
  chromeRegion,
  page,
  readOnly,
  collapseButton,
  onSaveGlobalSlot,
}: {
  chromeRegion: 'announcement' | 'cookie' | 'sticky_cta';
  page: BuilderPage;
  readOnly: boolean;
  collapseButton: ReactNode;
  onSaveGlobalSlot?: (
    slotKey: string,
    name: string,
    propsJson: Record<string, unknown>,
  ) => void | Promise<void>;
}) {
  const regions = (page.site.globalRegionsJson || {}) as Record<string, unknown>;
  const seed =
    chromeRegion === 'announcement'
      ? ((regions.announcement || {}) as Record<string, unknown>)
      : {};
  const [draft, setDraft] = useState({
    text: typeof seed.text === 'string' ? seed.text : '',
    href: typeof seed.href === 'string' ? seed.href : '',
    label: '',
  });
  useEffect(() => {
    const next =
      chromeRegion === 'announcement'
        ? ((regions.announcement || {}) as Record<string, unknown>)
        : {};
    setDraft({
      text: typeof next.text === 'string' ? next.text : '',
      href: typeof next.href === 'string' ? next.href : '',
      label: '',
    });
  }, [chromeRegion, page.site.id]);
  const title =
    chromeRegion === 'announcement'
      ? 'Announcement'
      : chromeRegion === 'cookie'
        ? 'Cookie banner'
        : 'Sticky CTA';
  return (
    <aside className="flex min-h-0 w-full flex-col overflow-hidden border-t xl:w-[260px] xl:border-l xl:border-t-0">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">{title}</div>
        {collapseButton}
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3',
          readOnly && 'pointer-events-none opacity-70',
        )}
      >
        <p className="text-xs text-muted-foreground">
          Global — shown on every page. Save to update site chrome.
        </p>
        {chromeRegion === 'sticky_cta' ? (
          <div>
            <Label className="text-xs">Button label</Label>
            <Input
              className="mt-1 h-8"
              disabled={readOnly}
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="Plan a trip"
            />
          </div>
        ) : (
          <div>
            <Label className="text-xs">Text</Label>
            <Textarea
              className="mt-1"
              rows={3}
              disabled={readOnly}
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            />
          </div>
        )}
        <div>
          <Label className="text-xs">Link</Label>
          <Input
            className="mt-1 h-8"
            disabled={readOnly}
            value={draft.href}
            onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
            placeholder="/contact"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={readOnly || !onSaveGlobalSlot}
          onClick={() =>
            void onSaveGlobalSlot?.(
              chromeRegion,
              title,
              chromeRegion === 'sticky_cta'
                ? { label: draft.label, href: draft.href || '/contact' }
                : { text: draft.text, href: draft.href },
            )
          }
        >
          Save global
        </Button>
      </div>
    </aside>
  );
}
