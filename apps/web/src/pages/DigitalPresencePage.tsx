import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Download,
  ExternalLink,
  FileText,
  FormInput,
  Globe,
  ImageIcon,
  LayoutTemplate,
  Library,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Paintbrush2,
  PanelsTopLeft,
  Plus,
  Puzzle,
  Rocket,
  Settings2,
  Store,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react';
import {
  Button,
  Combobox,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  ListPageShell,
  PageHeader,
  RecordSheet,
  StatusBadge,
  StorageKeys,
  SuggestionChips,
  Textarea,
  cn,
  formatDateTime,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { Can } from '../components/Can';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  presenceMarketplacePath,
  presenceModulesPath,
  orgPortalRef,
  presencePageEditorPath,
  presencePagesPath,
  presenceThemesPath,
  presenceFormsPath,
  presenceDomainsPath,
  presenceAssetsPath,
  presenceCollectionsPath,
  settingsInboxChatflowsPath,
} from '../lib/agencyRoutes';
import { CAP } from '../lib/capabilities';
import { usePermissions } from '../lib/permissions';
import { PresencePageBuilder } from './presence/builder/PresencePageBuilder';
import {
  previewRendererUrl,
  publicPageUrl,
  normalizePath,
  siteHostLabel,
  sitePublicUrl,
  themeStarterPreviewUrl,
} from './presence/builder/helpers';
import type { Identity, ModuleDef, Site } from './presence/builder/types';
import { CreatePresenceWizard } from './presence/CreatePresenceWizard';
import { ThemeCard } from './presence/ThemeCard';
import { ThemePackageUploadDialog } from './presence/ThemePackageUploadDialog';
import { ComponentCard } from './presence/ComponentCard';
import {
  PRESENCE_CATEGORY_ORDER,
  asSuggestMeta,
  categoryLabel,
  scoreSuggestMatch,
} from './presence/catalogMeta';
import { ComponentPackageUploadDialog } from './presence/ComponentPackageUploadDialog';
import { SiteSettingsDialog } from './presence/SiteSettingsDialog';
import { CollectionsPanel } from './presence/CollectionsPanel';
import { FormsPanel } from './presence/FormsPanel';
import { AssetsPanel } from './presence/AssetsPanel';
import { PresenceCommandPalette } from './presence/PresenceCommandPalette';

/** Marketplace UI is built but hidden until we ship sharing across orgs. */
const PRESENCE_MARKETPLACE_ENABLED = false;

type Theme = {
  id: string;
  key: string;
  name: string;
  status: string;
  isSystem: boolean;
  tokensJson: Record<string, unknown>;
  effectiveTokensJson?: Record<string, unknown> | null;
  parentThemeId?: string | null;
  parentKey?: string | null;
  parentName?: string | null;
  packageFormat?: string | null;
  packageCss?: string | null;
  schemaJson?: Record<string, unknown> | null;
  tokensSchemaJson?: Record<string, unknown> | null;
  previewUrl?: string | null;
  previewAssetsJson?: Record<string, unknown> | null;
  suggestJson?: Record<string, unknown> | null;
  hasFullSite?: boolean;
  defaultSiteTemplateKey?: string | null;
  defaultSitePageCount?: number;
};

type SiteTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string | null;
  recommendedThemeKeysJson?: string[] | null;
  suggestJson?: Record<string, unknown> | null;
};

type PageTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  layoutKey?: string | null;
  description?: string | null;
  suggestJson?: Record<string, unknown> | null;
};

type PageRow = {
  id: string;
  title: string;
  path: string;
  status: string;
  updatedAt: string;
  publishedAt?: string | null;
  layoutKey?: string | null;
  template?: { id: string; key: string; name: string } | null;
  site: {
    id: string;
    name: string;
    isPrimary: boolean;
    primaryDomain?: string | null;
    platformSlug?: string | null;
    platformHost?: string | null;
    theme?: { name: string } | null;
  };
  _count?: { sections: number };
  searchText?: string;
};

type CreateMode = 'site' | 'page';
type PageView = 'all' | 'drafts' | 'published' | 'recent';

type AssetVersion = {
  id: string;
  assetType: string;
  assetId: string;
  version: number;
  status: string;
  changelog?: string | null;
  createdAt: string;
};

type MarketplaceListing = {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string | null;
  priceTier: string;
  status: string;
  sourceAssetVersion?: { id: string; assetType: string; version: number } | null;
};

export function DigitalPresencePage() {
  useDocumentTitle('Websites');
  const { me } = useAuth();
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.orgSettingsWrite);
  const navigate = useNavigate();
  const location = useLocation();
  const { orgRef: orgId, pageId, siteId } = useParams<{ orgRef: string; pageId?: string; siteId?: string }>();

  const isBuilder = location.pathname.includes('/builder');
  const isThemes = location.pathname.includes('/themes');
  const isModules = location.pathname.includes('/modules');
  const isForms = location.pathname.includes('/forms');
  const isWidgets = location.pathname.includes('/widgets');
  const isDomains = location.pathname.includes('/domains');
  const isAssets = location.pathname.includes('/assets');
  const isCollections = location.pathname.includes('/collections');
  const isMarketplace = location.pathname.includes('/marketplace');
  const isSite = location.pathname.includes('/sites/');
  const pageView =
    (new URLSearchParams(location.search).get('view') as PageView) || 'all';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [siteTemplates, setSiteTemplates] = useState<SiteTemplate[]>([]);
  const [pageTemplates, setPageTemplates] = useState<PageTemplate[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('site');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteKind, setNewSiteKind] = useState('marketing');
  const [newThemeId, setNewThemeId] = useState('');
  const [newSiteTemplateId, setNewSiteTemplateId] = useState('');
  const [newPageSiteId, setNewPageSiteId] = useState('');
  const [newPageTemplateId, setNewPageTemplateId] = useState('');
  const [newPageTitle, setNewPageTitle] = useState('New page');
  const [newPagePath, setNewPagePath] = useState('/new-page');

  const [versionsAssetId, setVersionsAssetId] = useState('');
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [changelog, setChangelog] = useState('');
  const [publishingVersion, setPublishingVersion] = useState(false);

  const [moduleVersionsAssetId, setModuleVersionsAssetId] = useState('');
  const [moduleVersions, setModuleVersions] = useState<AssetVersion[]>([]);
  const [moduleVersionsLoading, setModuleVersionsLoading] = useState(false);
  const [moduleChangelog, setModuleChangelog] = useState('');
  const [publishingModuleVersion, setPublishingModuleVersion] = useState(false);

  const [forms, setForms] = useState<
    Array<{
      id: string;
      key: string;
      name: string;
      ingestMode: string;
      isActive: boolean;
      fieldsJson?: unknown[];
    }>
  >([]);
  const [assetFiles, setAssetFiles] = useState<
    Array<{ id: string; originalName: string; mimeType?: string | null; createdAt: string }>
  >([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [installingListingId, setInstallingListingId] = useState<string | null>(null);
  const [listingDialogOpen, setListingDialogOpen] = useState(false);
  const [listingSourceType, setListingSourceType] = useState<'theme' | 'module'>('theme');
  const [listingForm, setListingForm] = useState({ key: '', name: '', category: 'general', description: '' });
  const [listingVersionId, setListingVersionId] = useState<string | null>(null);
  const [listingSaving, setListingSaving] = useState(false);
  const [themeUploadOpen, setThemeUploadOpen] = useState(false);
  const [componentUploadOpen, setComponentUploadOpen] = useState(false);
  const [deleteThemeTarget, setDeleteThemeTarget] = useState<Theme | null>(null);
  const [deleteComponentTarget, setDeleteComponentTarget] = useState<ModuleDef | null>(null);
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<string>('all');
  const [moduleSearch, setModuleSearch] = useState('');
  const [deletingAsset, setDeletingAsset] = useState(false);
  const [deletePageTarget, setDeletePageTarget] = useState<PageRow | null>(null);
  const [deletingPage, setDeletingPage] = useState(false);
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [siteSettingsTarget, setSiteSettingsTarget] = useState<Site | null>(null);

  const canonicalOrgRef = me ? orgPortalRef(me.organization) : null;

  const refresh = useCallback(async () => {
    const [id, th, mod, st, pt, si, pg, fm] = await Promise.all([
      api<Identity>('/presence/identity'),
      api<Theme[]>('/presence/themes'),
      api<ModuleDef[]>('/presence/modules'),
      api<SiteTemplate[]>('/presence/site-templates'),
      api<PageTemplate[]>('/presence/page-templates'),
      api<Site[]>('/presence/sites'),
      api<PageRow[]>('/presence/pages'),
      api<
        Array<{
          id: string;
          key: string;
          name: string;
          ingestMode: string;
          isActive: boolean;
          fieldsJson?: unknown[];
        }>
      >('/presence/forms').catch(() => []),
    ]);
    setIdentity(id);
    setThemes(th);
    setModules(mod);
    setSiteTemplates(st);
    setPageTemplates(pt);
    setSites(si);
    setPages(pg);
    setForms(fm || []);
    setNewThemeId((v) => {
      if (v) return v;
      const orgKind = me?.organization.kind || null;
      const ranked = [...th].sort(
        (a, b) =>
          scoreSuggestMatch(asSuggestMeta(b.suggestJson), { orgKind, siteKind: 'marketing' }) -
          scoreSuggestMatch(asSuggestMeta(a.suggestJson), { orgKind, siteKind: 'marketing' }),
      );
      return ranked.find((t) => t.hasFullSite)?.id || ranked[0]?.id || '';
    });
    setNewSiteTemplateId((v) => v || '');
    setNewPageSiteId((v) => v || si[0]?.id || '');
    setNewPageTemplateId((v) => v || pt[0]?.id || '');
  }, [me?.organization.kind]);

  useEffect(() => {
    if (isBuilder) return;
    if (!me || !orgId) return;
    void (async () => {
      try {
        setLoading(true);
        setError('');
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load presence workspace');
      } finally {
        setLoading(false);
      }
    })();
  }, [me?.organization.id, orgId, refresh, isBuilder]);

  const primarySite = useMemo(
    () => sites.find((site) => site.isPrimary) || sites[0] || null,
    [sites],
  );

  const selectedSiteIdFromUrl = useMemo(
    () => new URLSearchParams(location.search).get('site') || '',
    [location.search],
  );

  const selectedSite = useMemo(() => {
    if (selectedSiteIdFromUrl) {
      const match = sites.find((site) => site.id === selectedSiteIdFromUrl);
      if (match) return match;
    }
    return primarySite;
  }, [sites, selectedSiteIdFromUrl, primarySite]);

  const selectSite = useCallback(
    (siteId: string) => {
      if (!orgId) return;
      const qs = new URLSearchParams(location.search);
      qs.set('site', siteId);
      navigate(`${presencePagesPath(orgId)}?${qs.toString()}`, { replace: true });
    },
    [orgId, location.search, navigate],
  );

  const openSiteSettings = useCallback((site: Site) => {
    setSiteSettingsTarget(site);
    setSiteSettingsOpen(true);
  }, []);

  useEffect(() => {
    if (!orgId || isBuilder || isSite) return;
    const qs = new URLSearchParams(location.search);
    if (qs.get('settings') !== '1') return;
    const siteIdForSettings = qs.get('site') || selectedSiteIdFromUrl;
    const site = sites.find((s) => s.id === siteIdForSettings) || selectedSite;
    if (!site) return;
    openSiteSettings(site);
    qs.delete('settings');
    const next = qs.toString();
    navigate(`${presencePagesPath(orgId)}${next ? `?${next}` : ''}`, { replace: true });
  }, [
    orgId,
    isBuilder,
    isSite,
    location.search,
    sites,
    selectedSiteIdFromUrl,
    selectedSite,
    openSiteSettings,
    navigate,
  ]);

  const sitePageCount = useCallback(
    (siteId: string) =>
      sites.find((site) => site.id === siteId)?._count?.pages ??
      pages.filter((page) => page.site.id === siteId).length,
    [sites, pages],
  );

  const ownedThemes = useMemo(() => themes.filter((theme) => !theme.isSystem), [themes]);
  const ownedModules = useMemo(() => modules.filter((module) => !module.isSystem), [modules]);

  const filteredModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    return modules.filter((mod) => {
      if (moduleCategoryFilter !== 'all' && mod.category !== moduleCategoryFilter) return false;
      if (!q) return true;
      return (
        mod.name.toLowerCase().includes(q) ||
        mod.key.toLowerCase().includes(q) ||
        mod.category.toLowerCase().includes(q) ||
        mod.rendererKey.toLowerCase().includes(q)
      );
    });
  }, [modules, moduleCategoryFilter, moduleSearch]);

  const modulesByCategory = useMemo(() => {
    const map = new Map<string, ModuleDef[]>();
    for (const mod of filteredModules) {
      const key = mod.category || 'content';
      const list = map.get(key) || [];
      list.push(mod);
      map.set(key, list);
    }
    const order = [...PRESENCE_CATEGORY_ORDER] as string[];
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0]);
    });
  }, [filteredModules]);

  useEffect(() => {
    setVersionsAssetId((v) => (v && ownedThemes.some((t) => t.id === v) ? v : ownedThemes[0]?.id || ''));
  }, [ownedThemes]);

  useEffect(() => {
    setModuleVersionsAssetId((v) => (v && ownedModules.some((m) => m.id === v) ? v : ownedModules[0]?.id || ''));
  }, [ownedModules]);

  const loadVersions = useCallback(
    async (assetType: 'theme' | 'module', assetId: string) => {
      if (!assetId) {
        if (assetType === 'theme') setVersions([]);
        else setModuleVersions([]);
        return;
      }
      const setLoadingFlag = assetType === 'theme' ? setVersionsLoading : setModuleVersionsLoading;
      const setRows = assetType === 'theme' ? setVersions : setModuleVersions;
      setLoadingFlag(true);
      try {
        const rows = await api<AssetVersion[]>(`/presence/versions/${assetType}/${assetId}`);
        setRows(rows);
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Failed to load versions');
      } finally {
        setLoadingFlag(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isThemes || !versionsAssetId) return;
    void loadVersions('theme', versionsAssetId);
  }, [isThemes, versionsAssetId, loadVersions]);

  useEffect(() => {
    if (!isModules || !moduleVersionsAssetId) return;
    void loadVersions('module', moduleVersionsAssetId);
  }, [isModules, moduleVersionsAssetId, loadVersions]);

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      const rows = await api<MarketplaceListing[]>('/presence/marketplace');
      setMarketplaceListings(rows);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to load marketplace');
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMarketplace) return;
    void loadMarketplace();
  }, [isMarketplace, loadMarketplace]);

  useEffect(() => {
    if (!isAssets) return;
    const siteId = selectedSite?.id || primarySite?.id || sites[0]?.id;
    if (!siteId) {
      setAssetFiles([]);
      return;
    }
    setAssetsLoading(true);
    api<Array<{ id: string; originalName: string; mimeType?: string | null; createdAt: string }>>(
      `/files?entityType=${encodeURIComponent('presence_site')}&entityId=${encodeURIComponent(siteId)}`,
    )
      .then((rows) => setAssetFiles(rows || []))
      .catch(() => setAssetFiles([]))
      .finally(() => setAssetsLoading(false));
  }, [isAssets, selectedSite?.id, primarySite?.id, sites]);

  const tableRows = useMemo(() => {
    const scoped = selectedSite
      ? pages.filter((page) => page.site.id === selectedSite.id)
      : pages;
    return scoped.map((page) => ({
      ...page,
      searchText: [
        page.title,
        page.path,
        page.template?.name,
        page.status,
        publicPageUrl(identity, page.path),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }));
  }, [pages, identity, selectedSite]);

  const draftCount = useMemo(
    () => tableRows.filter((page) => page.status === 'draft').length,
    [tableRows],
  );
  const publishedCount = useMemo(
    () => tableRows.filter((page) => page.status === 'published').length,
    [tableRows],
  );
  const recentCount = useMemo(() => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return tableRows.filter(
      (page) =>
        page.status === 'published' && now - new Date(page.updatedAt).getTime() < week,
    ).length;
  }, [tableRows]);

  const tableData = useMemo(() => {
    if (pageView !== 'recent') return tableRows;
    const week = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return tableRows.filter(
      (page) =>
        page.status === 'published' && now - new Date(page.updatedAt).getTime() < week,
    );
  }, [tableRows, pageView]);

  const defaultStatusFacet =
    pageView === 'drafts'
      ? { status: 'draft' }
      : pageView === 'published'
        ? { status: 'published' }
        : undefined;

  const setPageView = (view: PageView) => {
    if (!orgId) return;
    const qs = view === 'all' ? '' : `?view=${view}`;
    navigate(`${presencePagesPath(orgId)}${qs}`, { replace: true });
  };

  const openCreateWizard = (mode?: CreateMode, preferredThemeId?: string) => {
    const nextMode = mode || (sites.length ? 'page' : 'site');
    setCreateMode(nextMode);
    if (nextMode === 'page') {
      setNewPageSiteId(selectedSite?.id || primarySite?.id || sites[0]?.id || '');
    }
    if (nextMode === 'site') {
      const orgKind = me?.organization.kind || null;
      const ranked = [...themes].sort((a, b) => {
        const ctx = { orgKind, siteKind: newSiteKind };
        const scoreDiff =
          scoreSuggestMatch(asSuggestMeta(b.suggestJson), ctx) -
          scoreSuggestMatch(asSuggestMeta(a.suggestJson), ctx);
        if (scoreDiff !== 0) return scoreDiff;
        if (Boolean(b.hasFullSite) !== Boolean(a.hasFullSite)) {
          return b.hasFullSite ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
      const fromClick = preferredThemeId
        ? themes.find((t) => t.id === preferredThemeId)
        : null;
      const preferred =
        fromClick ||
        ranked.find((t) => t.hasFullSite) ||
        ranked[0] ||
        themes[0] ||
        null;
      if (preferred) {
        setNewThemeId(preferred.id);
        setNewSiteTemplateId('');
      }
    }
    setWizardOpen(true);
  };

  const isSiteHomePage = useCallback(
    (page: PageRow) => {
      const site = sites.find((s) => s.id === page.site.id);
      if (site?.homePageId === page.id) return true;
      return page.path === '/';
    },
    [sites],
  );

  const pageColumns = useMemo<ColumnDef<PageRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Page',
        meta: { label: 'Page' },
        enableHiding: false,
        size: 220,
        minSize: 160,
        cell: ({ row }) => {
          const page = row.original;
          const host = siteHostLabel(identity, page.site);
          const pageUrl = host
            ? `https://${host}${page.path === '/' ? '' : page.path}`
            : null;
          return (
            <Link
              className="block min-w-0"
              to={presencePageEditorPath(orgId || '', page.id)}
            >
              <div className="font-medium text-primary hover:underline">{page.title}</div>
              {pageUrl ? (
                <div className="truncate font-mono text-[11px] text-muted-foreground">{pageUrl}</div>
              ) : (
                <div className="text-xs text-muted-foreground">No URL preview</div>
              )}
            </Link>
          );
        },
      },
      {
        id: 'searchText',
        accessorKey: 'searchText',
        header: 'Search',
        meta: { label: 'Search' },
        enableHiding: true,
      },
      {
        id: 'modules',
        header: 'Sections',
        meta: { label: 'Sections' },
        size: 100,
        minSize: 80,
        accessorFn: (row) => row._count?.sections ?? 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original._count?.sections ?? 0}
          </span>
        ),
      },
      {
        id: 'template',
        header: 'Template',
        meta: { label: 'Template' },
        size: 140,
        minSize: 110,
        accessorFn: (row) => row.template?.name || 'Blank',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.template?.name || 'Blank'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <StatusBadge value={row.original.status} label={row.original.status} />
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        meta: { label: 'Updated' },
        size: 160,
        minSize: 130,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 44,
        minSize: 44,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const page = row.original;
          const liveUrl = sitePublicUrl(identity, page.site, page.path);
          const previewUrl = previewRendererUrl(identity, page.path, null, page.site);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Page actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="max-w-[12rem] truncate text-xs font-medium normal-case tracking-normal text-foreground">
                  {page.title}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate(presencePageEditorPath(orgId || '', page.id))}
                >
                  <FileText />
                  Edit in builder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const site = sites.find((s) => s.id === page.site.id);
                    if (site) openSiteSettings(site);
                  }}
                >
                  <Settings2 />
                  Website settings
                </DropdownMenuItem>
                {previewUrl ? (
                  <DropdownMenuItem asChild>
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      <PanelsTopLeft />
                      Preview draft
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {liveUrl ? (
                  <DropdownMenuItem asChild>
                    <a href={liveUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Open live page
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {canWrite && !isSiteHomePage(page) ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeletePageTarget(page)}
                    >
                      <Trash2 />
                      Remove page
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [navigate, orgId, identity, openSiteSettings, sites, canWrite, isSiteHomePage],
  );

  const createFromWizard = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (createMode === 'site') {
        const selectedTheme = themes.find((t) => t.id === newThemeId);
        const useThemeSite =
          Boolean(selectedTheme?.hasFullSite) && !newSiteTemplateId;
        const created = useThemeSite
          ? await api<{ id: string; pages?: Array<{ id: string }> }>('/presence/sites/from-theme', {
              method: 'POST',
              body: JSON.stringify({
                name: newSiteName,
                kind: newSiteKind,
                themeId: newThemeId,
              }),
            })
          : await api<{ id: string; pages?: Array<{ id: string }> }>(
              '/presence/sites/from-template',
              {
                method: 'POST',
                body: JSON.stringify({
                  name: newSiteName,
                  kind: newSiteKind,
                  themeId: newThemeId,
                  siteTemplateId: newSiteTemplateId,
                }),
              },
            );
        await refresh();
        setWizardOpen(false);
        navigate(`${presencePagesPath(orgId || '')}?site=${created.id}`);
        toastSuccess(
          useThemeSite ? 'Website created from theme' : 'Website created from starter',
        );
      } else {
        const page = await api<{ id: string }>('/presence/pages/from-template', {
          method: 'POST',
          body: JSON.stringify({
            siteId: newPageSiteId,
            pageTemplateId: newPageTemplateId,
            title: newPageTitle,
            path: normalizePath(newPagePath),
          }),
        });
        await refresh();
        setWizardOpen(false);
        navigate(presencePageEditorPath(orgId || '', page.id));
        toastSuccess('Page created from template');
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Create flow failed');
    } finally {
      setSaving(false);
    }
  };

  const setActiveTheme = async (themeId: string, siteId?: string) => {
    const targetId = siteId || selectedSite?.id || primarySite?.id;
    const target = sites.find((s) => s.id === targetId) || selectedSite || primarySite;
    if (!target) {
      toastError('Create a website first before applying a theme');
      return;
    }
    setSaving(true);
    try {
      await api(`/presence/sites/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ themeId }),
      });
      await refresh();
      toastSuccess(`Theme applied to ${target.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to apply theme');
    } finally {
      setSaving(false);
    }
  };

  const cloneTheme = async (theme: Theme) => {
    setSaving(true);
    try {
      await api(`/presence/themes/${theme.id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ key: `${theme.key}-copy`, name: `${theme.name} (copy)` }),
      });
      await refresh();
      toastSuccess('Theme duplicated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to duplicate theme');
    } finally {
      setSaving(false);
    }
  };

  const createChildTheme = async (theme: Theme) => {
    setSaving(true);
    try {
      await api(`/presence/themes/${theme.id}/create-child`, {
        method: 'POST',
        body: JSON.stringify({
          key: `${theme.key}-child`,
          name: `${theme.name} (child)`,
        }),
      });
      await refresh();
      toastSuccess('Child theme created — customize tokens without changing the parent');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create child theme');
    } finally {
      setSaving(false);
    }
  };

  const exportThemePackage = async (theme: Theme) => {
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';
      const res = await fetch(`${apiBase}/presence/themes/${theme.id}/export`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${theme.key}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('Theme package downloaded');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to export theme');
    }
  };

  const exportSiteAsTheme = async (siteId: string, siteName: string) => {
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';
      const res = await fetch(`${apiBase}/presence/sites/${siteId}/export-theme`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${siteName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'site'}-theme.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('Full theme package downloaded');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to export theme');
    }
  };

  const deleteTheme = async () => {
    if (!deleteThemeTarget) return;
    setDeletingAsset(true);
    try {
      await api(`/presence/themes/${deleteThemeTarget.id}`, { method: 'DELETE' });
      setDeleteThemeTarget(null);
      await refresh();
      toastSuccess('Theme deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete theme');
    } finally {
      setDeletingAsset(false);
    }
  };

  const deleteComponent = async () => {
    if (!deleteComponentTarget) return;
    setDeletingAsset(true);
    try {
      await api(`/presence/modules/${deleteComponentTarget.id}`, { method: 'DELETE' });
      setDeleteComponentTarget(null);
      await refresh();
      toastSuccess('Component deleted');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to delete component');
    } finally {
      setDeletingAsset(false);
    }
  };

  const deletePage = async () => {
    if (!deletePageTarget) return;
    setDeletingPage(true);
    try {
      await api(`/presence/pages/${deletePageTarget.id}`, { method: 'DELETE' });
      setDeletePageTarget(null);
      await refresh();
      toastSuccess('Page removed');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to remove page');
    } finally {
      setDeletingPage(false);
    }
  };

  const publishThemeVersion = async () => {
    if (!versionsAssetId) return;
    setPublishingVersion(true);
    try {
      await api('/presence/versions/publish', {
        method: 'POST',
        body: JSON.stringify({ assetType: 'theme', assetId: versionsAssetId, changelog: changelog || undefined }),
      });
      setChangelog('');
      await loadVersions('theme', versionsAssetId);
      toastSuccess('Theme version published');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to publish version');
    } finally {
      setPublishingVersion(false);
    }
  };

  const publishModuleVersionFn = async () => {
    if (!moduleVersionsAssetId) return;
    setPublishingModuleVersion(true);
    try {
      await api('/presence/versions/publish', {
        method: 'POST',
        body: JSON.stringify({
          assetType: 'module',
          assetId: moduleVersionsAssetId,
          changelog: moduleChangelog || undefined,
        }),
      });
      setModuleChangelog('');
      await loadVersions('module', moduleVersionsAssetId);
      toastSuccess('Module version published');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to publish version');
    } finally {
      setPublishingModuleVersion(false);
    }
  };

  const openListingDialog = (
    sourceType: 'theme' | 'module',
    assetId?: string,
    versionId?: string | null,
  ) => {
    setListingSourceType(sourceType);
    const id =
      assetId ||
      (sourceType === 'theme' ? versionsAssetId : moduleVersionsAssetId);
    if (sourceType === 'theme' && assetId) setVersionsAssetId(assetId);
    if (sourceType === 'module' && assetId) setModuleVersionsAssetId(assetId);
    const asset =
      sourceType === 'theme'
        ? ownedThemes.find((t) => t.id === id)
        : ownedModules.find((m) => m.id === id);
    const rows = sourceType === 'theme' ? versions : moduleVersions;
    setListingVersionId(versionId || rows[0]?.id || null);
    setListingForm({
      key: asset ? `${asset.key}-listing` : '',
      name: asset ? asset.name : '',
      category: sourceType === 'theme' ? 'theme' : 'component',
      description: '',
    });
    setListingDialogOpen(true);
  };

  /** Publish a fresh version then open the marketplace listing dialog. */
  const listAssetOnMarketplace = async (
    sourceType: 'theme' | 'module',
    assetId: string,
  ) => {
    if (!canWrite) return;
    if (sourceType === 'theme') setVersionsAssetId(assetId);
    else setModuleVersionsAssetId(assetId);

    const publishing =
      sourceType === 'theme' ? setPublishingVersion : setPublishingModuleVersion;
    publishing(true);
    try {
      const published = await api<AssetVersion>('/presence/versions/publish', {
        method: 'POST',
        body: JSON.stringify({
          assetType: sourceType,
          assetId,
        }),
      });
      await loadVersions(sourceType, assetId);
      openListingDialog(sourceType, assetId, published.id);
      toastSuccess(
        sourceType === 'theme'
          ? 'Theme version ready — complete the listing'
          : 'Component version ready — complete the listing',
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to prepare marketplace listing');
    } finally {
      publishing(false);
    }
  };

  const submitListingDialog = async () => {
    const rows = listingSourceType === 'theme' ? versions : moduleVersions;
    const latest = listingVersionId
      ? rows.find((v) => v.id === listingVersionId) || { id: listingVersionId }
      : rows[0];
    if (!latest?.id) {
      toastError('Publish a version before listing on the marketplace');
      return;
    }
    if (!listingForm.key.trim() || !listingForm.name.trim()) {
      toastError('Key and name are required');
      return;
    }
    setListingSaving(true);
    try {
      await api('/presence/marketplace', {
        method: 'POST',
        body: JSON.stringify({
          sourceAssetVersionId: latest.id,
          key: listingForm.key.trim(),
          name: listingForm.name.trim(),
          category: listingForm.category || undefined,
          description: listingForm.description || undefined,
          status: 'published',
        }),
      });
      toastSuccess('Listed on marketplace');
      setListingDialogOpen(false);
      setListingVersionId(null);
      await loadMarketplace();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to create listing');
    } finally {
      setListingSaving(false);
    }
  };

  const installListing = async (listing: MarketplaceListing) => {
    setInstallingListingId(listing.id);
    try {
      await api('/presence/marketplace/install', {
        method: 'POST',
        body: JSON.stringify({ listingId: listing.id }),
      });
      await refresh();
      toastSuccess(`Installed "${listing.name}"`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to install listing');
    } finally {
      setInstallingListingId(null);
    }
  };

  if (!me) return <Navigate to="/login" replace />;
  if (!orgId) return <Navigate to={presencePagesPath(canonicalOrgRef || me.organization.id)} replace />;
  if (isWidgets) {
    return <Navigate to={settingsInboxChatflowsPath(orgId)} replace />;
  }

  if (isBuilder) {
    if (!pageId) return <Navigate to={presencePagesPath(orgId)} replace />;
    return <PresencePageBuilder orgId={orgId} pageId={pageId} canWrite={canWrite} />;
  }

  if (isSite && siteId) {
    const qs = new URLSearchParams();
    qs.set('site', siteId);
    qs.set('settings', '1');
    return <Navigate to={`${presencePagesPath(orgId)}?${qs.toString()}`} replace />;
  }

  const navItems = [
    { key: 'pages', label: 'Websites', href: presencePagesPath(orgId), icon: Globe },
    { key: 'themes', label: 'Themes', href: presenceThemesPath(orgId), icon: Paintbrush2 },
    { key: 'modules', label: 'Components', href: presenceModulesPath(orgId), icon: Puzzle },
    { key: 'forms', label: 'Forms', href: presenceFormsPath(orgId), icon: FormInput },
    { key: 'chatflows', label: 'Chatflows', href: settingsInboxChatflowsPath(orgId), icon: MessageCircle },
    { key: 'collections', label: 'Collections', href: presenceCollectionsPath(orgId), icon: Library },
    { key: 'domains', label: 'Domains', href: presenceDomainsPath(orgId), icon: Link2 },
    { key: 'assets', label: 'Assets', href: presenceAssetsPath(orgId), icon: ImageIcon },
    ...(PRESENCE_MARKETPLACE_ENABLED
      ? [{ key: 'marketplace', label: 'Marketplace', href: presenceMarketplacePath(orgId), icon: Store }]
      : []),
  ];

  if (PRESENCE_MARKETPLACE_ENABLED === false && isMarketplace) {
    return <Navigate to={presenceThemesPath(orgId)} replace />;
  }

  const collectionsSiteId =
    new URLSearchParams(location.search).get('site') ||
    sites.find((s) => s.isPrimary)?.id ||
    sites[0]?.id ||
    null;

  const isPagesIndex =
    !isThemes &&
    !isModules &&
    !isForms &&
    !isWidgets &&
    !isDomains &&
    !isAssets &&
    !isCollections &&
    !isMarketplace &&
    !isSite;
  const publicHomeUrl = publicPageUrl(identity, '/');
  const previewHomeUrl = previewRendererUrl(identity, '/');

  const pageTitle = isForms
    ? 'Forms'
    : isWidgets
      ? 'Widgets'
    : isDomains
      ? 'Domains'
      : isAssets
        ? 'Assets'
        : isCollections
          ? 'Collections'
          : isThemes
            ? 'Themes'
            : isModules
              ? 'Components'
              : isMarketplace
                ? 'Marketplace'
                : 'Websites';

  const pageSubtitle = isPagesIndex
    ? 'Your websites first — then pages within each site.'
    : isThemes
      ? 'Theme catalog and custom brand themes.'
      : isModules
        ? 'Component library for page sections.'
        : isForms
          ? 'Lead-capture forms → CRM inquiries. Edit fields and ingest mode here.'
          : isWidgets
            ? 'Chat widgets for Presence sites and external embeds. Inbox shows which widget sent each message.'
          : isDomains
            ? 'Platform hosts and custom domains for each website.'
            : isAssets
              ? 'Upload images for websites; use them from the builder media picker.'
              : isCollections
                ? 'CMS content as data sources and auto listing/detail routes.'
                : isMarketplace
                  ? 'Discover and install themes and components shared across organizations.'
                  : 'Your websites first — then pages within each site.';

  return (
      <ListPageShell>
        <PresenceCommandPalette orgId={orgId} />
        <PageHeader
          title={pageTitle}
          subtitle={pageSubtitle}
          icon={Globe}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border p-1 glass-strong">
                {navItems.map((item) => {
                  const active =
                    (item.key === 'pages' && isPagesIndex) ||
                    (item.key === 'themes' && isThemes) ||
                    (item.key === 'modules' && isModules) ||
                    (item.key === 'forms' && isForms) ||
                    (item.key === 'widgets' && isWidgets) ||
                    (item.key === 'collections' && isCollections) ||
                    (item.key === 'domains' && isDomains) ||
                    (item.key === 'assets' && isAssets) ||
                    (item.key === 'marketplace' && isMarketplace);
                  return (
                    <Button
                      key={item.key}
                      size="sm"
                      variant={active ? 'secondary' : 'ghost'}
                      onClick={() => navigate(item.href)}
                    >
                      <item.icon className="mr-1.5 size-3.5" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
              <Can anyOf={CAP.orgSettingsWrite}>
                {!sites.length && isPagesIndex ? (
                  <Button onClick={() => openCreateWizard('site')}>
                    <Plus className="mr-2 size-4" />
                    Create website
                  </Button>
                ) : null}
              </Can>
            </div>
          }
        />
        {loading ? <div className="text-sm text-muted-foreground">Loading presence workspace...</div> : null}
        {error ? <EmptyState title="Presence workspace" description={error} /> : null}

        {!loading && !error && isPagesIndex ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {sites.length ? (
              <>
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Websites
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        ({sites.length})
                      </span>
                    </h2>
                    <Can anyOf={CAP.orgSettingsWrite}>
                      <Button size="sm" variant="outline" onClick={() => openCreateWizard('site')}>
                        <Globe className="mr-1.5 size-3.5" />
                        New website
                      </Button>
                    </Can>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sites.map((site) => {
                      const active = selectedSite?.id === site.id;
                      const count = sitePageCount(site.id);
                      const host = siteHostLabel(identity, site);
                      return (
                        <button
                          key={site.id}
                          type="button"
                          className={cn(
                            'inline-flex max-w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition',
                            active
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border/70 bg-card/40 hover:border-primary/35 hover:bg-card/60',
                          )}
                          onClick={() => selectSite(site.id)}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium">{site.name}</span>
                            {site.isPrimary ? (
                              <StatusBadge value="primary" label="Primary" tone="success" />
                            ) : null}
                            <span className="text-xs text-muted-foreground">{count} pg</span>
                          </div>
                          {host ? (
                            <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
                              {host}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">No URL preview</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {selectedSite ? (
                  <>
                    <section className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{selectedSite.name}</h3>
                          {selectedSite.isPrimary ? (
                            <StatusBadge value="primary" label="Primary" tone="success" />
                          ) : null}
                          <StatusBadge value={selectedSite.status} label={selectedSite.status} />
                        </div>
                        {(() => {
                          const url = sitePublicUrl(identity, selectedSite);
                          const host = siteHostLabel(identity, selectedSite);
                          if (url && host) {
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 truncate font-mono text-[11px] text-primary hover:underline"
                              >
                                {host}
                                <ExternalLink className="size-3 shrink-0" />
                              </a>
                            );
                          }
                          if (host) {
                            return (
                              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                {host}
                              </p>
                            );
                          }
                          return (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              No domain — set one in settings
                            </p>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSiteSettings(selectedSite)}
                        >
                          <Settings2 className="mr-1.5 size-3.5" />
                          Website settings
                        </Button>
                        <Can anyOf={CAP.orgSettingsWrite}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void exportSiteAsTheme(selectedSite.id, selectedSite.name)}
                          >
                            <Download className="mr-1.5 size-3.5" />
                            Export
                          </Button>
                        </Can>
                        {sitePublicUrl(identity, selectedSite) ? (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={previewRendererUrl(identity, '/', null, selectedSite) || '#'}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <PanelsTopLeft className="mr-1.5 size-3.5" />
                              Preview
                            </a>
                          </Button>
                        ) : null}
                        <Can anyOf={CAP.orgSettingsWrite}>
                          <Button size="sm" onClick={() => openCreateWizard('page')}>
                            <Plus className="mr-1.5 size-3.5" />
                            New page
                          </Button>
                        </Can>
                      </div>
                    </section>

                    <section className="flex min-h-0 flex-1 flex-col gap-2">
                      <h2 className="text-sm font-semibold tracking-tight">Pages</h2>
                      <SuggestionChips
                        aria-label="Page views"
                        allowDeselect={false}
                        className="shrink-0"
                        value={pageView}
                        onChange={(value) => setPageView((value as PageView) || 'all')}
                        options={[
                          { value: 'all', label: `All (${tableRows.length})` },
                          { value: 'drafts', label: `Drafts (${draftCount})` },
                          { value: 'published', label: `Published (${publishedCount})` },
                          { value: 'recent', label: `Recent (${recentCount})` },
                        ]}
                      />
                      <DataTable
                        key={`presence-pages-${selectedSite.id}-${pageView}`}
                        columns={pageColumns}
                        data={tableData}
                        loading={loading}
                        error={error || undefined}
                        pageSize={25}
                        searchKey="searchText"
                        searchPlaceholder="Search pages in this site…"
                        columnVisibilityKey={StorageKeys.presence.columns}
                        defaultColumnVisibility={{ searchText: false, template: false }}
                        defaultFacetValues={defaultStatusFacet}
                        facets={[
                          {
                            id: 'status',
                            columnId: 'status',
                            label: 'Status',
                            options: [
                              { value: 'draft', label: 'Draft' },
                              { value: 'published', label: 'Published' },
                            ],
                          },
                        ]}
                        emptyTitle="No pages in this site"
                        emptyDescription={
                          pageView === 'drafts'
                            ? 'Draft pages will show up here as you create them.'
                            : 'Add a page to this website from a starter layout.'
                        }
                        emptyIcon={FileText}
                        emptyAction={
                          <Can anyOf={CAP.orgSettingsWrite}>
                            <Button onClick={() => openCreateWizard('page')}>
                              <Plus className="size-4" />
                              New page
                            </Button>
                          </Can>
                        }
                      />
                    </section>
                  </>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={LayoutTemplate}
                title="No website yet"
                description="Create a website from a theme — most themes include ready-made pages and navigation."
                action={
                  canWrite ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button onClick={() => openCreateWizard('site')}>
                        <WandSparkles className="mr-2 size-4" />
                        Create your first site
                      </Button>
                      <Button variant="outline" onClick={() => setThemeUploadOpen(true)}>
                        <Upload className="mr-2 size-4" />
                        Upload theme
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : null}

        {!loading && !error && isThemes ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-2xl text-xs text-muted-foreground">
                {sites.length
                  ? (
                    <>
                      Themes are per website. Click <span className="text-foreground">Apply</span> and
                      choose which site should use the look — other sites keep theirs.
                    </>
                  )
                  : (
                    <>
                      Browse the theme catalog below. Create a website to start with a theme’s
                      pages and colors, or upload a custom theme ZIP.
                    </>
                  )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {!sites.length && canWrite ? (
                  <Button type="button" size="sm" onClick={() => openCreateWizard('site')}>
                    <WandSparkles className="mr-1.5 size-3.5" />
                    Create website
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={sites.length ? 'default' : 'outline'}
                  disabled={!canWrite}
                  onClick={() => setThemeUploadOpen(true)}
                >
                  <Upload className="mr-1.5 size-3.5" />
                  Upload theme ZIP
                </Button>
              </div>
            </div>

            {themes.length ? (
              <div className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {themes.map((theme) => {
                  const usedSites = sites.filter((s) => s.theme?.id === theme.id);
                  const usedOnLabels = usedSites.map((s) => s.name);
                  return (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      active={usedSites.length > 0}
                      usedOnLabels={usedOnLabels}
                      applySites={sites.map((s) => ({
                        id: s.id,
                        name: s.name,
                        isPrimary: s.isPrimary,
                        themeId: s.theme?.id || null,
                      }))}
                      preferredSiteId={primarySite?.id || sites[0]?.id}
                      applying={saving}
                      canWrite={canWrite}
                      previewUrl={
                        usedSites[0]
                          ? previewRendererUrl(identity, '/', null, usedSites[0])
                          : theme.hasFullSite
                            ? themeStarterPreviewUrl(theme.id)
                            : null
                      }
                      onApply={(siteId) => setActiveTheme(theme.id, siteId)}
                      onCreateWebsite={
                        !sites.length && canWrite
                          ? () => openCreateWizard('site', theme.id)
                          : undefined
                      }
                      onClone={() => void cloneTheme(theme)}
                      onCreateChild={() => void createChildTheme(theme)}
                      onExport={() => void exportThemePackage(theme)}
                      onDelete={
                        !theme.isSystem && canWrite
                          ? () => setDeleteThemeTarget(theme)
                          : undefined
                      }
                      onListMarketplace={
                        PRESENCE_MARKETPLACE_ENABLED && !theme.isSystem && canWrite
                          ? () => void listAssetOnMarketplace('theme', theme.id)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Paintbrush2}
                title="No themes yet"
                description="Upload a theme ZIP or wait for the system catalog to load."
                action={
                  canWrite ? (
                    <Button onClick={() => setThemeUploadOpen(true)}>
                      <Upload className="mr-2 size-4" />
                      Upload theme ZIP
                    </Button>
                  ) : undefined
                }
              />
            )}

            {PRESENCE_MARKETPLACE_ENABLED ? (
            <div className="rounded-lg border p-3">
              <div className="mb-2.5 text-sm font-medium">Versions &amp; marketplace</div>
              {ownedThemes.length ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Theme</Label>
                      <Combobox
                        className="h-8"
                        value={versionsAssetId}
                        onChange={setVersionsAssetId}
                        options={ownedThemes.map((theme) => ({
                          value: theme.id,
                          label: theme.name,
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Changelog</Label>
                      <Input
                        className="h-8"
                        value={changelog}
                        onChange={(e) => setChangelog(e.target.value)}
                        placeholder="Optional note"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={!canWrite || publishingVersion}
                        onClick={() => void publishThemeVersion()}
                      >
                        <Rocket className="mr-1.5 size-3.5" />
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!canWrite || !versions.length}
                        onClick={() => openListingDialog('theme')}
                      >
                        <Store className="mr-1.5 size-3.5" />
                        List
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-auto">
                    {versionsLoading ? (
                      <div className="text-xs text-muted-foreground">Loading…</div>
                    ) : versions.length ? (
                      versions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                        >
                          <span className="font-medium">v{v.version}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {v.changelog || '—'}
                          </span>
                          <StatusBadge value={v.status} label={v.status} />
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">No versions yet.</div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Upload a theme ZIP, then use ⋯ → List on marketplace on the card.
                </p>
              )}
            </div>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && isModules ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-2xl text-xs text-muted-foreground">
                Building blocks for page sections. System components ship with Presence; custom ones
                install from a built ZIP package only.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!canWrite}
                onClick={() => setComponentUploadOpen(true)}
              >
                <Upload className="mr-1.5 size-3.5" />
                Upload component ZIP
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="h-9 max-w-xs"
                placeholder="Search components…"
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={moduleCategoryFilter === 'all' ? 'default' : 'outline'}
                  className="h-8"
                  onClick={() => setModuleCategoryFilter('all')}
                >
                  All
                </Button>
                {PRESENCE_CATEGORY_ORDER.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={moduleCategoryFilter === cat ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => setModuleCategoryFilter(cat)}
                  >
                    {categoryLabel(cat)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {modulesByCategory.map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {categoryLabel(category)}
                    <span className="ml-1.5 font-normal normal-case">({items.length})</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((mod) => (
                      <ComponentCard
                        key={mod.id}
                        component={mod}
                        canWrite={canWrite}
                        onListMarketplace={
                          PRESENCE_MARKETPLACE_ENABLED && !mod.isSystem && canWrite
                            ? () => void listAssetOnMarketplace('module', mod.id)
                            : undefined
                        }
                        onDelete={
                          !mod.isSystem && canWrite
                            ? () => setDeleteComponentTarget(mod)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              {!modulesByCategory.length ? (
                <p className="text-sm text-muted-foreground">No components match this filter.</p>
              ) : null}
            </div>

            {PRESENCE_MARKETPLACE_ENABLED ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="font-medium">Versions &amp; marketplace</div>
                {ownedModules.length ? (
                  <>
                    <Label>Module</Label>
                    <Combobox
                      value={moduleVersionsAssetId}
                      onChange={setModuleVersionsAssetId}
                      options={ownedModules.map((module) => ({
                        value: module.id,
                        label: module.name,
                      }))}
                    />
                    <Label>Changelog (optional)</Label>
                    <Input
                      value={moduleChangelog}
                      onChange={(e) => setModuleChangelog(e.target.value)}
                      placeholder="What changed in this version?"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!canWrite || publishingModuleVersion}
                        onClick={() => void publishModuleVersionFn()}
                      >
                        <Rocket className="mr-1.5 size-3.5" />
                        Publish version
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canWrite || !moduleVersions.length}
                        onClick={() => openListingDialog('module')}
                      >
                        <Store className="mr-1.5 size-3.5" />
                        List on marketplace
                      </Button>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {moduleVersionsLoading ? (
                        <div className="text-xs text-muted-foreground">Loading versions…</div>
                      ) : moduleVersions.length ? (
                        moduleVersions.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs"
                          >
                            <span className="font-medium">v{v.version}</span>
                            <span className="truncate text-muted-foreground">
                              {v.changelog || '—'}
                            </span>
                            <StatusBadge value={v.status} label={v.status} />
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground">No versions published yet.</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Upload a component ZIP to publish versions.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && isForms ? (
          <FormsPanel
            forms={forms.map((f) => ({
              ...f,
              fieldsJson: f.fieldsJson ?? [],
            }))}
            canWrite={canWrite}
            onChanged={() => void refresh()}
          />
        ) : null}

        {!loading && !error && isCollections ? (
          <CollectionsPanel
            siteId={collectionsSiteId}
            sites={sites.map((s) => ({ id: s.id, name: s.name }))}
            canWrite={canWrite}
            onSiteChange={(id) => {
              const qs = new URLSearchParams(location.search);
              qs.set('site', id);
              navigate(`${presenceCollectionsPath(orgId)}?${qs.toString()}`);
            }}
          />
        ) : null}

        {!loading && !error && isDomains ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Each website has a platform host. Connect a custom domain in settings when ready.
            </p>
            {sites.length ? (
              <div className="space-y-2">
                {sites.map((site) => {
                  const host = siteHostLabel(identity, site);
                  const url = sitePublicUrl(identity, site);
                  return (
                    <div
                      key={site.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{site.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {host || '—'}
                          {site.primaryDomain ? ` · custom: ${site.primaryDomain}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {url ? (
                          <Button size="sm" variant="outline" className="h-8" asChild>
                            <a href={url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1 size-3.5" />
                              Open
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => openSiteSettings(site)}
                        >
                          <Settings2 className="mr-1 size-3.5" />
                          Website settings
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Link2}
                title="No websites yet"
                description="Create a website to get a platform host."
              />
            )}
          </div>
        ) : null}

        {!loading && !error && isAssets ? (
          <AssetsPanel
            identity={identity}
            sites={sites}
            selectedSiteId={selectedSite?.id || primarySite?.id || sites[0]?.id || null}
            files={assetFiles}
            loading={assetsLoading}
            canWrite={canWrite}
            onSiteChange={(id) => {
              const qs = new URLSearchParams(location.search);
              qs.set('site', id);
              navigate(`${presenceAssetsPath(orgId)}?${qs.toString()}`);
            }}
            onRefresh={() => {
              const siteId = selectedSite?.id || primarySite?.id || sites[0]?.id;
              if (!siteId) return;
              setAssetsLoading(true);
              api<
                Array<{ id: string; originalName: string; mimeType?: string | null; createdAt: string }>
              >(
                `/files?entityType=${encodeURIComponent('presence_site')}&entityId=${encodeURIComponent(siteId)}`,
              )
                .then((rows) => setAssetFiles(rows || []))
                .catch(() => setAssetFiles([]))
                .finally(() => setAssetsLoading(false));
            }}
            onUploaded={(file) =>
              setAssetFiles((prev) => [file, ...prev.filter((f) => f.id !== file.id)])
            }
          />
        ) : null}

        {!loading && !error && PRESENCE_MARKETPLACE_ENABLED && isMarketplace ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="max-w-2xl text-xs text-muted-foreground">
                Install shared <span className="text-foreground">themes</span> and{' '}
                <span className="text-foreground">components</span>. List your own from the Themes or
                Components tab (⋯ → List on marketplace).
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void loadMarketplace()}
              >
                Refresh
              </Button>
            </div>
            {marketplaceLoading ? (
              <div className="text-sm text-muted-foreground">Loading marketplace…</div>
            ) : marketplaceListings.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {marketplaceListings.map((listing) => {
                  const assetType = listing.sourceAssetVersion?.assetType;
                  const kindLabel =
                    assetType === 'module'
                      ? 'Component'
                      : assetType === 'theme'
                        ? 'Theme'
                        : listing.category || 'Asset';
                  return (
                    <div key={listing.id} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{listing.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {kindLabel}
                            {listing.sourceAssetVersion
                              ? ` · v${listing.sourceAssetVersion.version}`
                              : ''}
                            {listing.category ? ` · ${listing.category}` : ''}
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {kindLabel}
                        </span>
                      </div>
                      {listing.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{listing.description}</p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] uppercase text-muted-foreground">
                          {listing.priceTier}
                        </span>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={!canWrite || installingListingId === listing.id}
                          onClick={() => void installListing(listing)}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          Install
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Store}
                title="No marketplace listings yet"
                description="On Themes or Components, open ⋯ on a custom item and choose List on marketplace."
              />
            )}
          </div>
        ) : null}

        <CreatePresenceWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          mode={createMode}
          onModeChange={setCreateMode}
          canWrite={canWrite}
          saving={saving}
          themes={themes}
          siteTemplates={siteTemplates}
          pageTemplates={pageTemplates}
          sites={sites}
          orgKind={me?.organization.kind}
          siteName={newSiteName}
          onSiteNameChange={setNewSiteName}
          siteKind={newSiteKind}
          onSiteKindChange={setNewSiteKind}
          themeId={newThemeId}
          onThemeIdChange={setNewThemeId}
          siteTemplateId={newSiteTemplateId}
          onSiteTemplateIdChange={setNewSiteTemplateId}
          pageSiteId={newPageSiteId}
          onPageSiteIdChange={setNewPageSiteId}
          pageTemplateId={newPageTemplateId}
          onPageTemplateIdChange={setNewPageTemplateId}
          pageTitle={newPageTitle}
          onPageTitleChange={setNewPageTitle}
          pagePath={newPagePath}
          onPagePathChange={setNewPagePath}
          onSubmit={createFromWizard}
        />

        <SiteSettingsDialog
          open={siteSettingsOpen}
          onOpenChange={(open) => {
            setSiteSettingsOpen(open);
            if (!open) setSiteSettingsTarget(null);
          }}
          site={
            siteSettingsTarget
              ? sites.find((s) => s.id === siteSettingsTarget.id) || siteSettingsTarget
              : null
          }
          themes={themes}
          identity={identity}
          canWrite={canWrite}
          onSaved={() => void refresh()}
        />

        <ThemePackageUploadDialog
          open={themeUploadOpen}
          onOpenChange={setThemeUploadOpen}
          onInstalled={async () => {
            await refresh();
            toastSuccess('Theme package installed');
          }}
        />

        <ComponentPackageUploadDialog
          open={componentUploadOpen}
          onOpenChange={setComponentUploadOpen}
          onInstalled={async () => {
            await refresh();
            toastSuccess('Component package installed');
          }}
        />

        <ConfirmDialog
          open={Boolean(deletePageTarget)}
          onOpenChange={(open) => !open && setDeletePageTarget(null)}
          title="Remove page?"
          description={
            deletePageTarget
              ? `Permanently remove “${deletePageTarget.title}” and all of its sections. This cannot be undone.`
              : undefined
          }
          confirmLabel="Remove"
          destructive
          loading={deletingPage}
          onConfirm={() => void deletePage()}
        />

        <ConfirmDialog
          open={Boolean(deleteThemeTarget)}
          onOpenChange={(open) => !open && setDeleteThemeTarget(null)}
          title="Delete theme?"
          description={
            deleteThemeTarget
              ? `Permanently delete “${deleteThemeTarget.name}”. Sites using it must switch themes first. Child themes (if any) will be detached.`
              : undefined
          }
          confirmLabel="Delete"
          destructive
          loading={deletingAsset}
          onConfirm={() => void deleteTheme()}
        />

        <ConfirmDialog
          open={Boolean(deleteComponentTarget)}
          onOpenChange={(open) => !open && setDeleteComponentTarget(null)}
          title="Delete component?"
          description={
            deleteComponentTarget
              ? `Permanently delete “${deleteComponentTarget.name}”. Sections using it will keep their content but lose the linked definition.`
              : undefined
          }
          confirmLabel="Delete"
          destructive
          loading={deletingAsset}
          onConfirm={() => void deleteComponent()}
        />

        {PRESENCE_MARKETPLACE_ENABLED ? (
        <RecordSheet
          open={listingDialogOpen}
          onOpenChange={setListingDialogOpen}
          title="List on marketplace"
          description={`Share this ${listingSourceType === 'module' ? 'component' : 'theme'} with other organizations. A published version is attached automatically.`}
          onSubmit={() => void submitListingDialog()}
          submitLabel="Publish listing"
          submitting={listingSaving}
        >
          <div className="space-y-3">
            <Label>Key</Label>
            <Input value={listingForm.key} onChange={(e) => setListingForm({ ...listingForm, key: e.target.value })} />
            <Label>Name</Label>
            <Input value={listingForm.name} onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })} />
            <Label>Category</Label>
            <Combobox
              value={listingForm.category}
              onChange={(category) => setListingForm({ ...listingForm, category })}
              options={[
                { value: 'theme', label: 'Theme' },
                { value: 'component', label: 'Component' },
                { value: 'general', label: 'General' },
              ]}
            />
            <Label>Description</Label>
            <Textarea rows={3} value={listingForm.description} onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })} />
          </div>
        </RecordSheet>
        ) : null}
      </ListPageShell>
  );
}
