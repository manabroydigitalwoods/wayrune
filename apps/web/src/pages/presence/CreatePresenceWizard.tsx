import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  LayoutTemplate,
  Search,
  Sparkles,
} from 'lucide-react';
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
  cn,
} from '@wayrune/ui';
import { ThemeCard, themeDescription, type ThemeCardModel } from './ThemeCard';
import { asSuggestMeta, scoreSuggestMatch } from './catalogMeta';

export type WizardSiteTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string | null;
  suggestJson?: Record<string, unknown> | null;
  recommendedThemeKeysJson?: string[] | null;
};

export type WizardPageTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string | null;
  suggestJson?: Record<string, unknown> | null;
};

export type WizardSite = {
  id: string;
  name: string;
};

type CreateMode = 'site' | 'page';
type SiteStep = 1 | 2 | 3;
type ThemeFilter = 'all' | 'full' | 'look';

const SITE_STEPS: Array<{ id: SiteStep; label: string }> = [
  { id: 1, label: 'Basics' },
  { id: 2, label: 'Theme' },
  { id: 3, label: 'Review' },
];

function StepIndicator({ current }: { current: SiteStep }) {
  return (
    <ol className="flex items-center gap-2">
      {SITE_STEPS.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border border-border text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" /> : step.id}
              </span>
              <span
                className={cn(
                  'truncate text-xs font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < SITE_STEPS.length - 1 ? (
              <div className={cn('h-px flex-1', done ? 'bg-primary/50' : 'bg-border')} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StarterTemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: WizardSiteTemplate | WizardPageTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full gap-3 rounded-lg border p-3 text-left transition',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/25'
          : 'border-border/80 hover:border-primary/35 hover:bg-muted/30',
      )}
      onClick={onSelect}
    >
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-gradient-to-br from-muted to-background">
        <LayoutTemplate className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{template.name}</div>
        <div className="text-[11px] capitalize text-muted-foreground">
          {template.category.replace(/_/g, ' ')}
        </div>
        {template.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        ) : null}
      </div>
      {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

export function CreatePresenceWizard({
  open,
  onOpenChange,
  mode,
  onModeChange: _onModeChange,
  canWrite,
  saving,
  themes,
  siteTemplates,
  pageTemplates,
  sites,
  orgKind,
  siteName,
  onSiteNameChange,
  siteKind,
  onSiteKindChange,
  themeId,
  onThemeIdChange,
  siteTemplateId,
  onSiteTemplateIdChange,
  pageSiteId,
  onPageSiteIdChange,
  pageTemplateId,
  onPageTemplateIdChange,
  pageTitle,
  onPageTitleChange,
  pagePath,
  onPagePathChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
  canWrite: boolean;
  saving: boolean;
  themes: ThemeCardModel[];
  siteTemplates: WizardSiteTemplate[];
  pageTemplates: WizardPageTemplate[];
  sites: WizardSite[];
  orgKind?: string | null;
  siteName: string;
  onSiteNameChange: (v: string) => void;
  siteKind: string;
  onSiteKindChange: (v: string) => void;
  themeId: string;
  onThemeIdChange: (v: string) => void;
  siteTemplateId: string;
  onSiteTemplateIdChange: (v: string) => void;
  pageSiteId: string;
  onPageSiteIdChange: (v: string) => void;
  pageTemplateId: string;
  onPageTemplateIdChange: (v: string) => void;
  pageTitle: string;
  onPageTitleChange: (v: string) => void;
  pagePath: string;
  onPagePathChange: (v: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [siteStep, setSiteStep] = useState<SiteStep>(1);
  const [themeQuery, setThemeQuery] = useState('');
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>('all');
  const [starterQuery, setStarterQuery] = useState('');
  const [starterOpen, setStarterOpen] = useState(false);
  const [pageQuery, setPageQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setSiteStep(1);
      setThemeQuery('');
      setThemeFilter('all');
      setStarterQuery('');
      setStarterOpen(false);
      setPageQuery('');
    }
  }, [open]);

  useEffect(() => {
    setSiteStep(1);
    setStarterOpen(false);
  }, [mode]);

  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === themeId) || null,
    [themes, themeId],
  );

  const selectedStarter = useMemo(
    () => siteTemplates.find((t) => t.id === siteTemplateId) || null,
    [siteTemplates, siteTemplateId],
  );

  const rankedThemes = useMemo(() => {
    const ctx = { orgKind, siteKind };
    return [...themes].sort((a, b) => {
      const scoreDiff =
        scoreSuggestMatch(asSuggestMeta(b.suggestJson), ctx) -
        scoreSuggestMatch(asSuggestMeta(a.suggestJson), ctx);
      if (scoreDiff !== 0) return scoreDiff;
      if (Boolean(b.hasFullSite) !== Boolean(a.hasFullSite)) {
        return b.hasFullSite ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [themes, orgKind, siteKind]);

  const filteredThemes = useMemo(() => {
    const q = themeQuery.trim().toLowerCase();
    return rankedThemes.filter((theme) => {
      if (themeFilter === 'full' && !theme.hasFullSite) return false;
      if (themeFilter === 'look' && theme.hasFullSite) return false;
      if (!q) return true;
      return (
        theme.name.toLowerCase().includes(q) ||
        theme.key.toLowerCase().includes(q) ||
        (themeDescription(theme) || '').toLowerCase().includes(q)
      );
    });
  }, [rankedThemes, themeQuery, themeFilter]);

  const rankedStarters = useMemo(() => {
    const themeKey = selectedTheme?.key || null;
    return [...siteTemplates].sort((a, b) => {
      let scoreA = scoreSuggestMatch(asSuggestMeta(a.suggestJson), {
        orgKind,
        siteKind,
        themeKey,
      });
      let scoreB = scoreSuggestMatch(asSuggestMeta(b.suggestJson), {
        orgKind,
        siteKind,
        themeKey,
      });
      if (themeKey) {
        if (a.recommendedThemeKeysJson?.includes(themeKey)) scoreA += 30;
        if (b.recommendedThemeKeysJson?.includes(themeKey)) scoreB += 30;
      }
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.name.localeCompare(b.name);
    });
  }, [siteTemplates, orgKind, siteKind, selectedTheme?.key]);

  const filteredStarters = useMemo(() => {
    const q = starterQuery.trim().toLowerCase();
    if (!q) return rankedStarters;
    return rankedStarters.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [rankedStarters, starterQuery]);

  const filteredPageTemplates = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    if (!q) return pageTemplates;
    return pageTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q),
    );
  }, [pageTemplates, pageQuery]);

  const siteStepValid =
    siteStep === 1
      ? siteName.trim().length > 0
      : siteStep === 2
        ? Boolean(themeId)
        : Boolean(themeId) && siteName.trim().length > 0;

  const pageValid =
    Boolean(pageSiteId) && pageTitle.trim().length > 0 && pagePath.trim().startsWith('/');

  const useThemePages = Boolean(selectedTheme?.hasFullSite) && !siteTemplateId;

  const handleSiteNext = () => {
    if (siteStep === 1 && siteStepValid) setSiteStep(2);
    else if (siteStep === 2 && siteStepValid) setSiteStep(3);
  };

  const handleFormSubmit = (event: FormEvent) => {
    if (mode === 'site' && siteStep < 3) {
      event.preventDefault();
      handleSiteNext();
      return;
    }
    onSubmit(event);
  };

  const sheetTitle =
    mode === 'site'
      ? siteStep === 1
        ? 'Create a website'
        : siteStep === 2
          ? 'Choose a theme'
          : 'Review and create'
      : 'Add a page';

  const sheetDescription =
    mode === 'site'
      ? siteStep === 1
        ? 'Name your site and pick how it will be used.'
        : siteStep === 2
          ? 'Themes include colors, chrome, and often a full multi-page layout.'
          : 'Confirm details. You can customize menus and pages after creation.'
      : 'Add a page to an existing site using a starter layout.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[min(92vh,800px)] flex-col gap-0 overflow-hidden p-0',
          mode === 'site' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{sheetTitle}</DialogTitle>
          <DialogDescription>{sheetDescription}</DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleFormSubmit}>
          <DialogBody className="space-y-5">
        {mode === 'site' ? (
          <>
            <StepIndicator current={siteStep} />

            {siteStep === 1 ? (
              <div className="space-y-4 rounded-lg border bg-card/40 p-4">
                <div>
                  <Label htmlFor="site-name">Website name</Label>
                  <Input
                    id="site-name"
                    className="mt-1.5"
                    placeholder="e.g. Demo Travel Agency"
                    value={siteName}
                    onChange={(e) => onSiteNameChange(e.target.value)}
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Shown in the header and Digital Presence hub. You can change it later.
                  </p>
                </div>
                <div>
                  <Label>Site type</Label>
                  <Combobox
                    className="mt-1.5"
                    value={siteKind}
                    onChange={onSiteKindChange}
                    options={[
                      {
                        value: 'marketing',
                        label: 'Marketing',
                        description: 'Multi-page public site',
                      },
                      {
                        value: 'landing',
                        label: 'Landing',
                        description: 'Focused campaign page',
                      },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            {siteStep === 2 ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search themes…"
                      value={themeQuery}
                      onChange={(e) => setThemeQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {(
                      [
                        ['all', 'All'],
                        ['full', 'Full sites'],
                        ['look', 'Look only'],
                      ] as const
                    ).map(([key, label]) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={themeFilter === key ? 'default' : 'outline'}
                        className="h-8"
                        onClick={() => setThemeFilter(key)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid items-stretch gap-3 sm:grid-cols-2">
                  {filteredThemes.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      selectable
                      compact
                      selected={themeId === theme.id}
                      onSelect={() => {
                        onThemeIdChange(theme.id);
                        if (theme.hasFullSite) onSiteTemplateIdChange('');
                      }}
                    />
                  ))}
                </div>
                {!filteredThemes.length ? (
                  <p className="text-sm text-muted-foreground">No themes match your search.</p>
                ) : null}
              </div>
            ) : null}

            {siteStep === 3 ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-card/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" />
                    What will be created
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Website</dt>
                      <dd className="font-medium">{siteName.trim() || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Type</dt>
                      <dd className="font-medium capitalize">{siteKind}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Theme</dt>
                      <dd className="font-medium">{selectedTheme?.name || '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Pages</dt>
                      <dd className="text-sm">
                        {siteTemplateId && selectedStarter ? (
                          <>
                            Starter layout: <span className="font-medium">{selectedStarter.name}</span>
                          </>
                        ) : selectedTheme?.hasFullSite ? (
                          <>
                            Theme&apos;s built-in site
                            {selectedTheme.defaultSitePageCount
                              ? ` (${selectedTheme.defaultSitePageCount} pages + navigation)`
                              : ' with navigation'}
                          </>
                        ) : (
                          'Blank home page — add pages in the builder'
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
                    onClick={() => setStarterOpen((v) => !v)}
                  >
                    <span>Use a starter layout instead (optional)</span>
                    <ChevronDown
                      className={cn('size-4 shrink-0 transition', starterOpen ? 'rotate-180' : '')}
                    />
                  </button>
                  {starterOpen ? (
                    <div className="space-y-3 border-t px-4 pb-4 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Starters replace the theme&apos;s default pages. The theme still controls
                        colors and header/footer chrome.
                      </p>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-8"
                          placeholder="Search starters…"
                          value={starterQuery}
                          onChange={(e) => setStarterQuery(e.target.value)}
                        />
                      </div>
                      {siteTemplateId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onSiteTemplateIdChange('')}
                        >
                          Clear — use theme pages
                        </Button>
                      ) : null}
                      <div className="grid max-h-64 gap-2 overflow-y-auto">
                        {filteredStarters.map((template) => (
                          <StarterTemplateCard
                            key={template.id}
                            template={template}
                            selected={siteTemplateId === template.id}
                            onSelect={() => onSiteTemplateIdChange(template.id)}
                          />
                        ))}
                      </div>
                      {!filteredStarters.length ? (
                        <p className="text-xs text-muted-foreground">No starters match.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {useThemePages ? (
                  <p className="text-xs text-muted-foreground">
                    After creation, open any page → Site chrome → <strong>Menus</strong> to edit
                    header and footer navigation.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-card/40 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Website</Label>
                <Combobox
                  className="mt-1.5"
                  value={pageSiteId}
                  onChange={onPageSiteIdChange}
                  placeholder="Select website…"
                  options={sites.map((site) => ({ value: site.id, label: site.name }))}
                />
              </div>
              <div>
                <Label>Page title</Label>
                <Input
                  className="mt-1.5"
                  value={pageTitle}
                  onChange={(e) => onPageTitleChange(e.target.value)}
                />
              </div>
              <div>
                <Label>URL path</Label>
                <Input
                  className="mt-1.5 font-mono text-sm"
                  value={pagePath}
                  onChange={(e) => onPagePathChange(e.target.value)}
                  placeholder="/about"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search page templates…"
                  value={pageQuery}
                  onChange={(e) => setPageQuery(e.target.value)}
                />
              </div>
              <div className="grid max-h-[min(48vh,440px)] gap-2 overflow-y-auto">
                {filteredPageTemplates.map((template) => (
                  <StarterTemplateCard
                    key={template.id}
                    template={template}
                    selected={pageTemplateId === template.id}
                    onSelect={() => onPageTemplateIdChange(template.id)}
                  />
                ))}
              </div>
              {!filteredPageTemplates.length ? (
                <p className="text-sm text-muted-foreground">No templates match.</p>
              ) : null}
            </div>
          </div>
        )}

          </DialogBody>
          <DialogFooter className="shrink-0">
            <div className="mr-auto">
              {mode === 'site' && siteStep > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSiteStep((s) => (s > 1 ? ((s - 1) as SiteStep) : s))}
                >
                  <ArrowLeft className="mr-1 size-3.5" />
                  Back
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              )}
            </div>
            {mode === 'site' && siteStep < 3 ? (
              <Button type="submit" disabled={!canWrite || !siteStepValid}>
                Continue
                <ArrowRight className="ml-1 size-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  !canWrite ||
                  saving ||
                  (mode === 'site' ? !siteStepValid : !pageValid || !pageTemplateId)
                }
              >
                {saving
                  ? 'Creating…'
                  : mode === 'site'
                    ? 'Create website'
                    : 'Create page'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
