import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { EmptyState, Input, Label, RecordSheet, Textarea, toastError, toastSuccess, StorageKeys, usePersistentState, cn, BrandTooltip, Button } from '@wayrune/ui';
import type { PresenceSiteLayout } from '@wayrune/contracts';
import { ArrowLeft, ListTree, PanelRightOpen, Plus, Settings } from 'lucide-react';
import { api } from '../../../api';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { presencePagesPath } from '../../../lib/agencyRoutes';
import { BuilderChrome } from './BuilderChrome';
import { BuilderInspector } from './BuilderInspector';
import { BuilderLiveCanvas, CANVAS_DROP_ID, canvasWidthForDevice } from './BuilderLiveCanvas';
import { BuilderModuleLibrary, DraggableSavedComponentRow } from './BuilderModuleLibrary';
import { BuilderSiteSettingsDialog, type SiteChromeSection } from './BuilderSiteSettingsDialog';
import { BuilderStructurePanel } from './BuilderStructurePanel';
import { SiteSettingsDialog } from '../SiteSettingsDialog';
import {
  DEFAULT_FREEFORM_FRAME,
  collectSubtree,
  defaultLayoutSlotKey,
  defaultModuleProps,
  ensureSectionClientIds,
  freeformFrameOf,
  freeformFrameStored,
  writeFreeformFrameForDevice,
  isDescendantOf,
  isLayoutModule,
  moveSectionInTree,
  newClientId,
  normalizePath,
  nudgeFreeformZ,
  parseSectionClientId,
  previewRendererUrl,
  reconcileSectionClientIds,
  remapSubtreeForInsert,
  rootSections,
  serializeSubtreeForComponent,
  snapshotPage,
} from './helpers';
import {
  ANNOUNCEMENT_REGION_ID,
  COOKIE_REGION_ID,
  FOOTER_REGION_ID,
  HEADER_REGION_ID,
  STICKY_CTA_REGION_ID,
  type BuilderPage,
  type ChromeRegion,
  type DeviceMode,
  type FormDef,
  type FreeformFrame,
  type Identity,
  type ModuleDef,
  type Section,
} from './types';
import {
  asModuleVariations,
  defaultVariation,
  mergeVariationProps,
} from '../catalogMeta';

type PagePayload = Omit<BuilderPage, 'sections'> & {
  sections: Array<Omit<Section, 'clientId'> & { clientId?: string }>;
  updatedAt?: string;
};

type LeftPanel = 'contents' | 'modules' | 'settings';

type BuilderUiPrefs = {
  leftPanel: LeftPanel;
  leftDrawerOpen: boolean;
  inspectorOpen: boolean;
  device: DeviceMode;
};

const DEFAULT_BUILDER_UI: BuilderUiPrefs = {
  leftPanel: 'contents',
  leftDrawerOpen: false,
  inspectorOpen: true,
  device: 'desktop',
};

const LEFT_PANELS = new Set<LeftPanel>(['contents', 'modules', 'settings']);
const DEVICES = new Set<DeviceMode>(['desktop', 'widescreen', 'tablet', 'mobile']);
const MAX_HISTORY = 50;

type PageHistorySnapshot = {
  title: string;
  path: string;
  layoutKey: string | null;
  layoutMode: 'flow' | 'freeform';
  seoJson: Record<string, unknown>;
  sections: Section[];
};

function snapshotHistory(page: BuilderPage): PageHistorySnapshot {
  return JSON.parse(
    JSON.stringify({
      title: page.title,
      path: page.path,
      layoutKey: page.layoutKey ?? null,
      layoutMode: (page.layoutMode || 'flow') as 'flow' | 'freeform',
      seoJson: page.seoJson || {},
      sections: page.sections,
    }),
  );
}

function applyHistory(current: BuilderPage, snap: PageHistorySnapshot): BuilderPage {
  return {
    ...current,
    title: snap.title,
    path: snap.path,
    layoutKey: snap.layoutKey,
    layoutMode: snap.layoutMode,
    seoJson: snap.seoJson,
    sections: snap.sections,
  };
}

function normalizeBuilderUi(raw: Partial<BuilderUiPrefs> | null | undefined): BuilderUiPrefs {
  return {
    leftPanel: raw?.leftPanel && LEFT_PANELS.has(raw.leftPanel) ? raw.leftPanel : DEFAULT_BUILDER_UI.leftPanel,
    leftDrawerOpen:
      typeof raw?.leftDrawerOpen === 'boolean' ? raw.leftDrawerOpen : DEFAULT_BUILDER_UI.leftDrawerOpen,
    inspectorOpen:
      typeof raw?.inspectorOpen === 'boolean' ? raw.inspectorOpen : DEFAULT_BUILDER_UI.inspectorOpen,
    device: raw?.device && DEVICES.has(raw.device) ? raw.device : DEFAULT_BUILDER_UI.device,
  };
}

const RAIL: Array<{ id: LeftPanel; label: string; icon: typeof ListTree }> = [
  { id: 'contents', label: 'Page contents', icon: ListTree },
  { id: 'modules', label: 'Add modules', icon: Plus },
  { id: 'settings', label: 'Site chrome', icon: Settings },
];

/** Preview iframe that keeps the device width and scales down when panels squeeze the column. */
function PreviewFitFrame({
  device,
  previewUrl,
  previewVersion,
  settingsJson,
}: {
  device: DeviceMode;
  previewUrl: string;
  previewVersion: string | number;
  settingsJson?: Record<string, unknown> | null;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const deviceWidthPx = canvasWidthForDevice(device, settingsJson);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const styles = getComputedStyle(shell);
      const padX =
        (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
      const available = Math.max(0, shell.clientWidth - padX);
      if (available <= 0 || deviceWidthPx <= 0) {
        setScale(1);
        return;
      }
      const next = Math.min(1, Math.max(0.45, available / deviceWidthPx));
      setScale((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(shell);
    return () => ro.disconnect();
  }, [deviceWidthPx]);

  const framed = device === 'tablet' || device === 'mobile';

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div
        ref={shellRef}
        className={cn(
          'relative flex min-h-0 flex-1 justify-center overflow-auto',
          framed ? 'bg-muted/30 p-3 sm:p-4' : 'p-2 sm:p-3',
        )}
      >
        <iframe
          key={String(previewVersion)}
          title="Page preview"
          src={previewUrl}
          className={cn(
            'h-full shrink-0 bg-white transition-[width] duration-200',
            framed ? 'min-h-[70vh] rounded-md border shadow-sm' : 'border-0',
          )}
          style={{
            width: deviceWidthPx,
            maxWidth: deviceWidthPx,
            zoom: scale < 0.999 ? scale : undefined,
          }}
        />
      </div>
      {scale < 0.999 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            Fit {Math.round(scale * 100)}% · {deviceWidthPx}px
          </span>
        </div>
      ) : null}
    </main>
  );
}

export function PresencePageBuilder({
  orgId,
  pageId,
  canWrite,
}: {
  orgId: string;
  pageId: string;
  canWrite: boolean;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [chromeSaving, setChromeSaving] = useState(false);
  const [saveAck, setSaveAck] = useState(false);
  const [page, setPage] = useState<BuilderPage | null>(null);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [forms, setForms] = useState<FormDef[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [previewVersion, setPreviewVersion] = useState<string | number>(Date.now());
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [savedPath, setSavedPath] = useState('/');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [insertTarget, setInsertTarget] = useState<{
    parentId: string | null;
    slotKey: string | null;
    index: number | null;
  }>({
    parentId: null,
    slotKey: null,
    index: null,
  });
  const clipboardRef = useRef<Section[] | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateForm, setTemplateForm] = useState({ key: '', name: '', category: 'page', description: '' });
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [componentSaving, setComponentSaving] = useState(false);
  const [componentForm, setComponentForm] = useState({ key: '', name: '' });
  const [components, setComponents] = useState<
    Array<{ id: string; key: string; name: string; category: string; structureJson?: unknown; updatedAt?: string }>
  >([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [siteChromeSection, setSiteChromeSection] = useState<SiteChromeSection>('colors');
  const [websiteSettingsOpen, setWebsiteSettingsOpen] = useState(false);
  const [websiteSettingsTab, setWebsiteSettingsTab] = useState<
    'general' | 'seo' | 'widget' | undefined
  >(undefined);
  const [websiteThemes, setWebsiteThemes] = useState<Array<{ id: string; key: string; name: string }>>(
    [],
  );
  const [previewTokens, setPreviewTokens] = useState<Record<string, string> | null>(null);
  const [previewLayout, setPreviewLayout] = useState<PresenceSiteLayout | null>(null);
  const [builderUi, setBuilderUi] = usePersistentState<BuilderUiPrefs>(
    StorageKeys.presence.builderUi,
    DEFAULT_BUILDER_UI,
    { version: 2 },
  );
  const { leftPanel, leftDrawerOpen, inspectorOpen, device } = normalizeBuilderUi(builderUi);
  const patchBuilderUi = useCallback((patch: Partial<BuilderUiPrefs>) => {
    setBuilderUi((prev) => ({ ...normalizeBuilderUi(prev), ...patch }));
  }, [setBuilderUi]);
  const setLeftDrawerOpen = (next: boolean) => patchBuilderUi({ leftDrawerOpen: next });
  const setInspectorOpen = (next: boolean) => patchBuilderUi({ inspectorOpen: next });
  const setDevice = (next: DeviceMode) => patchBuilderUi({ device: next });

  useEffect(() => {
    if (!websiteSettingsOpen) return;
    void api<Array<{ id: string; key: string; name: string }>>('/presence/themes')
      .then((rows) => setWebsiteThemes(rows || []))
      .catch(() => setWebsiteThemes([]));
  }, [websiteSettingsOpen]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosave = useRef(true);
  const saveGeneration = useRef(0);
  const saveInFlight = useRef(false);
  const pendingSave = useRef(false);
  const pageRef = useRef<BuilderPage | null>(null);
  const selectedClientIdRef = useRef<string | null>(null);
  const historyRef = useRef<PageHistorySnapshot[]>([]);
  const redoRef = useRef<PageHistorySnapshot[]>([]);

  pageRef.current = page;
  selectedClientIdRef.current = selectedClientId;

  const flashSaved = useCallback(() => {
    setSaveAck(true);
    if (saveAckTimer.current) clearTimeout(saveAckTimer.current);
    saveAckTimer.current = setTimeout(() => setSaveAck(false), 2200);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const builderCollisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    const rank = (id: string | number) => {
      const value = String(id);
      if (value.startsWith('insert:')) return 0;
      if (value.startsWith('slot:')) return 1;
      if (value.startsWith('canvas:')) return 2;
      if (value.startsWith('structure:')) return 3;
      if (value === 'canvas-drop') return 9;
      return 5;
    };
    if (pointerHits.length) {
      return [...pointerHits].sort((a, b) => rank(a.id) - rank(b.id));
    }
    const centerHits = closestCenter(args).filter((hit) => String(hit.id) !== 'canvas-drop');
    if (centerHits.length) {
      return [...centerHits].sort((a, b) => rank(a.id) - rank(b.id));
    }
    return closestCenter(args);
  };

  useDocumentTitle(page ? `${page.title} · Page builder` : 'Page builder');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const dirty = Boolean(page && savedSnapshot && snapshotPage(page) !== savedSnapshot);
  const chromeRegion: ChromeRegion | null =
    selectedClientId === HEADER_REGION_ID
      ? 'header'
      : selectedClientId === FOOTER_REGION_ID
        ? 'footer'
        : selectedClientId === ANNOUNCEMENT_REGION_ID
          ? 'announcement'
          : selectedClientId === COOKIE_REGION_ID
            ? 'cookie'
            : selectedClientId === STICKY_CTA_REGION_ID
              ? 'sticky_cta'
              : null;

  const selectedIndex = useMemo(() => {
    if (!page || !selectedClientId || chromeRegion) return -1;
    return page.sections.findIndex((section) => section.clientId === selectedClientId);
  }, [page, selectedClientId, chromeRegion]);

  const currentSection = selectedIndex >= 0 && page ? page.sections[selectedIndex] || null : null;
  const selectedModule = currentSection
    ? modules.find((module) => module.id === currentSection.moduleDefinitionId) ||
      modules.find((module) => module.key === currentSection.type) ||
      modules.find((module) => module.rendererKey === currentSection.type) ||
      null
    : null;

  const canUndo = useMemo(() => historyRef.current.length > 0, [historyTick]);
  const canRedo = useMemo(() => redoRef.current.length > 0, [historyTick]);

  const hydratePage = useCallback((payload: PagePayload) => {
    const sections = ensureSectionClientIds(payload.sections || []);
    const next: BuilderPage = { ...payload, sections };
    setPage(next);
    setSavedSnapshot(snapshotPage(next));
    setSavedPath(normalizePath(next.path));
    setPreviewVersion(payload.updatedAt || Date.now());
    historyRef.current = [];
    redoRef.current = [];
    setHistoryTick((t) => t + 1);
    setSelectedClientId((prev) => {
      if (prev === HEADER_REGION_ID || prev === FOOTER_REGION_ID) return prev;
      if (prev && sections.some((section) => section.clientId === prev || section.id === prev)) {
        const match = sections.find((section) => section.clientId === prev || section.id === prev);
        return match?.clientId || sections[0]?.clientId || null;
      }
      return sections[0]?.clientId || null;
    });
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError('');
        const [pageRes, modulesRes, formsRes, identityRes, templatesRes] = await Promise.all([
          api<PagePayload>(`/presence/pages/${pageId}`),
          api<ModuleDef[]>('/presence/modules'),
          api<FormDef[]>('/presence/forms'),
          api<Identity>('/presence/identity'),
          api<
            Array<{ id: string; key: string; name: string; category: string; structureJson?: unknown; updatedAt?: string }>
          >('/presence/page-templates'),
        ]);
        if (cancelled) return;
        setModules(modulesRes);
        setForms(formsRes);
        setIdentity(identityRes);
        setComponents(templatesRes.filter((row) => row.category === 'component'));
        skipAutosave.current = true;
        hydratePage(pageRes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load builder');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, hydratePage]);

  const exitBuilder = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Leave the page builder?')) return;
    navigate(presencePagesPath(orgId));
  }, [dirty, navigate, orgId]);

  /** All content-mutating page edits should flow through here so undo/redo stays in sync. */
  const updatePage = useCallback((updater: (prev: BuilderPage) => BuilderPage) => {
    const prev = pageRef.current;
    if (!prev) return;
    historyRef.current.push(snapshotHistory(prev));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
    setHistoryTick((t) => t + 1);
    setPage((current) => (current ? updater(current) : current));
  }, []);

  const undo = useCallback(() => {
    if (!canWrite) return;
    const current = pageRef.current;
    const previous = historyRef.current.pop();
    if (!previous || !current) return;
    redoRef.current.push(snapshotHistory(current));
    if (redoRef.current.length > MAX_HISTORY) redoRef.current.shift();
    setHistoryTick((t) => t + 1);
    setPage((p) => (p ? applyHistory(p, previous) : p));
  }, [canWrite]);

  const redo = useCallback(() => {
    if (!canWrite) return;
    const current = pageRef.current;
    const next = redoRef.current.pop();
    if (!next || !current) return;
    historyRef.current.push(snapshotHistory(current));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    setHistoryTick((t) => t + 1);
    setPage((p) => (p ? applyHistory(p, next) : p));
  }, [canWrite]);

  const saveBuilder = useCallback(
    async (opts?: { silent?: boolean }) => {
      const current = pageRef.current;
      if (!current || !canWrite) return;
      if (saveInFlight.current) {
        pendingSave.current = true;
        return;
      }

      const generation = ++saveGeneration.current;
      const requestSnapshot = snapshotPage(current);
      const previousSelection = selectedClientIdRef.current;
      const requestSections = current.sections.map((section, index) => ({
        id: section.id || null,
        clientId: section.clientId,
        type: section.type,
        moduleDefinitionId: section.moduleDefinitionId || null,
        parentId: section.parentId || null,
        slotKey: section.slotKey || null,
        propsJson: section.propsJson,
        position: index,
      }));

      saveInFlight.current = true;
      setSaving(true);
      try {
        const saved = await api<PagePayload>(`/presence/pages/${current.id}/builder`, {
          method: 'PUT',
          body: JSON.stringify({
            title: current.title,
            path: normalizePath(current.path),
            layoutKey: current.layoutKey || null,
            layoutMode: current.layoutMode || 'flow',
            seoJson: current.seoJson || {},
            draftJson: {
              updatedFrom: 'builder',
              sections: requestSections,
            },
            sections: requestSections,
          }),
        });

        if (generation !== saveGeneration.current) return;

        const live = pageRef.current;
        const liveSnapshot = live ? snapshotPage(live) : '';
        const localChangedDuringSave = Boolean(live && liveSnapshot !== requestSnapshot);

        skipAutosave.current = true;
        const serverIdToClientId = reconcileSectionClientIds(requestSections, saved.sections || []);
        const sections = ensureSectionClientIds(
          (saved.sections || []).map((section) => ({
            ...section,
            clientId: (section.id && serverIdToClientId.get(section.id)) || section.id || newClientId(),
          })),
        ).map((section) => ({
          ...section,
          parentId: section.parentId ? serverIdToClientId.get(section.parentId) || section.parentId : null,
        }));

        if (localChangedDuringSave && live) {
          // Keep local edits; only sync server ids onto matching client rows.
          const mergedSections = live.sections.map((local) => {
            const server = sections.find((row) => row.clientId === local.clientId);
            return server ? { ...local, id: server.id || local.id } : local;
          });
          setPage({ ...live, sections: mergedSections, updatedAt: saved.updatedAt });
          setSavedPath(normalizePath(saved.path));
          setPreviewVersion(saved.updatedAt || Date.now());
          pendingSave.current = true;
        } else {
          const next: BuilderPage = { ...saved, sections };
          setPage(next);
          setSavedSnapshot(snapshotPage(next));
          setSavedPath(normalizePath(next.path));
          setPreviewVersion(saved.updatedAt || Date.now());
          if (previousSelection === HEADER_REGION_ID || previousSelection === FOOTER_REGION_ID) {
            setSelectedClientId(previousSelection);
          } else if (previousSelection) {
            const stillThere = sections.find((section) => section.clientId === previousSelection);
            setSelectedClientId(stillThere?.clientId || sections[0]?.clientId || null);
          }
        }

        flashSaved();
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Failed to save builder');
      } finally {
        saveInFlight.current = false;
        setSaving(false);
        if (pendingSave.current) {
          pendingSave.current = false;
          void saveBuilder({ silent: true });
        }
      }
    },
    [canWrite, flashSaved],
  );

  useEffect(() => {
    if (!page || !canWrite || loading) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (!dirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveBuilder({ silent: true });
    }, 800);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [page, canWrite, loading, dirty, saveBuilder]);

  /** Debounced PATCH of shared site chrome (header nav / footer) — not part of page undo history. */
  const updateSiteChrome = useCallback(
    (patch: {
      navigationJson?: Array<Record<string, unknown>>;
      menusJson?: Record<string, unknown>;
      menuAssignmentsJson?: Record<string, unknown>;
      globalRegionsJson?: Record<string, unknown>;
    }) => {
      if (!canWrite) return;
      setPage((prev) => (prev ? { ...prev, site: { ...prev.site, ...patch } } : prev));
      if (chromeSaveTimer.current) clearTimeout(chromeSaveTimer.current);
      chromeSaveTimer.current = setTimeout(() => {
        const current = pageRef.current;
        if (!current) return;
        setChromeSaving(true);
        void api(`/presence/sites/${current.site.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            navigationJson: current.site.navigationJson || [],
            menusJson: current.site.menusJson || undefined,
            menuAssignmentsJson: current.site.menuAssignmentsJson || undefined,
            globalRegionsJson: current.site.globalRegionsJson || {},
          }),
        })
          .then(() => flashSaved())
          .catch((e) => toastError(e instanceof Error ? e.message : 'Failed to update site chrome'))
          .finally(() => setChromeSaving(false));
      }, 600);
    },
    [canWrite, flashSaved],
  );

  const onNavigationChange = useCallback(
    (entries: Array<Record<string, unknown>>) => updateSiteChrome({ navigationJson: entries }),
    [updateSiteChrome],
  );

  const onMenusChange = useCallback(
    (next: {
      menusJson: Record<string, unknown>;
      menuAssignmentsJson: Record<string, unknown>;
      navigationJson: Array<{ label: string; path: string }>;
    }) => {
      updateSiteChrome({
        menusJson: next.menusJson,
        menuAssignmentsJson: next.menuAssignmentsJson,
        navigationJson: next.navigationJson,
      });
    },
    [updateSiteChrome],
  );

  const onFooterNoteChange = useCallback(
    (note: string) => {
      const current = pageRef.current;
      const globalRegions = (current?.site.globalRegionsJson as Record<string, unknown>) || {};
      const footer = (globalRegions.footer as Record<string, unknown>) || {};
      updateSiteChrome({ globalRegionsJson: { ...globalRegions, footer: { ...footer, note } } });
    },
    [updateSiteChrome],
  );

  const onHeaderRegionChange = useCallback(
    (header: Record<string, unknown>) => {
      const current = pageRef.current;
      const globalRegions = (current?.site.globalRegionsJson as Record<string, unknown>) || {};
      updateSiteChrome({ globalRegionsJson: { ...globalRegions, header } });
    },
    [updateSiteChrome],
  );

  const onFooterRegionChange = useCallback(
    (footer: Record<string, unknown>) => {
      const current = pageRef.current;
      const globalRegions = (current?.site.globalRegionsJson as Record<string, unknown>) || {};
      updateSiteChrome({ globalRegionsJson: { ...globalRegions, footer } });
    },
    [updateSiteChrome],
  );

  const onSelectChrome = useCallback(
    (region: ChromeRegion) => {
      const id =
        region === 'header'
          ? HEADER_REGION_ID
          : region === 'footer'
            ? FOOTER_REGION_ID
            : region === 'announcement'
              ? ANNOUNCEMENT_REGION_ID
              : region === 'cookie'
                ? COOKIE_REGION_ID
                : STICKY_CTA_REGION_ID;
      setSelectedClientId(id);
      patchBuilderUi({ inspectorOpen: true });
    },
    [patchBuilderUi],
  );

  const saveGlobalSlot = useCallback(
    async (slotKey: string, name: string, propsJson: Record<string, unknown>) => {
      const siteId = pageRef.current?.siteId;
      if (!siteId || !canWrite) return;
      try {
        await api(`/presence/sites/${siteId}/global-sections/${slotKey}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            type: 'rich_text',
            propsJson,
            enabled: true,
          }),
        });
        if (slotKey === 'announcement') {
          const globalRegions =
            (pageRef.current?.site.globalRegionsJson as Record<string, unknown>) || {};
          updateSiteChrome({
            globalRegionsJson: { ...globalRegions, announcement: propsJson },
          });
        }
        toastSuccess('Global section saved');
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Failed to save global section');
      }
    },
    [canWrite, updateSiteChrome],
  );

  const onLayoutModeChange = useCallback(
    (mode: 'flow' | 'freeform') => {
      if (!canWrite) return;
      updatePage((prev) => ({ ...prev, layoutMode: mode }));
    },
    [canWrite, updatePage],
  );

  const insertModuleAt = useCallback(
    (moduleDef: ModuleDef, parentId: string | null, slotKey: string | null, targetIndex: number) => {
      if (!canWrite) return;
      const current = pageRef.current;
      const isFreeform = !parentId && (current?.layoutMode || 'flow') === 'freeform';
      const rootCount = current ? rootSections(current.sections).length : 0;
      const baseProps =
        Object.keys(moduleDef.defaultPropsJson || {}).length > 0
          ? moduleDef.defaultPropsJson
          : defaultModuleProps(moduleDef.rendererKey, forms);
      const picked = defaultVariation(asModuleVariations(moduleDef.variantsJson));
      const nextSection: Section = {
        clientId: newClientId(),
        type: moduleDef.key,
        moduleDefinitionId: moduleDef.id,
        parentId,
        slotKey,
        propsJson: {
          ...mergeVariationProps(baseProps, picked),
          ...(isFreeform
            ? { frame: { ...DEFAULT_FREEFORM_FRAME, y: DEFAULT_FREEFORM_FRAME.y + rootCount * 48 } }
            : {}),
        },
        position: 0,
      };
      updatePage((prev) => ({
        ...prev,
        sections: moveSectionInTree([...prev.sections, nextSection], nextSection.clientId, parentId, slotKey, targetIndex),
      }));
      setSelectedClientId(nextSection.clientId);
      patchBuilderUi({ inspectorOpen: true });
    },
    [canWrite, forms, patchBuilderUi, updatePage],
  );

  const groupCount = useCallback(
    (parentId: string | null, slotKey: string | null) => {
      const sections = pageRef.current?.sections || [];
      return sections.filter(
        (section) => (section.parentId || null) === (parentId || null) && (section.slotKey || null) === (slotKey || null),
      ).length;
    },
    [],
  );

  const addModule = (moduleDef: ModuleDef) => {
    const { parentId, slotKey, index } = insertTarget;
    const targetIndex = index == null ? groupCount(parentId, slotKey) : index;
    insertModuleAt(moduleDef, parentId, slotKey, targetIndex);
    setInsertTarget({ parentId: null, slotKey: null, index: null });
  };

  const openModulesPanel = useCallback(
    (parentId: string | null = null, slotKey: string | null = null, index: number | null = null) => {
      setInsertTarget({ parentId, slotKey, index });
      patchBuilderUi({ leftPanel: 'modules', leftDrawerOpen: true });
    },
    [patchBuilderUi],
  );

  const collectDescendantIds = (sections: Section[], clientId: string): string[] => {
    const direct = sections.filter((section) => section.parentId === clientId).map((section) => section.clientId);
    return direct.concat(direct.flatMap((id) => collectDescendantIds(sections, id)));
  };

  const deleteCurrentSection = () => {
    if (!canWrite || !page || !currentSection) return;
    deleteSectionByClientId(currentSection.clientId);
  };

  const deleteSectionByClientId = (clientId: string) => {
    if (!canWrite || !page) return;
    const idsToRemove = new Set([clientId, ...collectDescendantIds(page.sections, clientId)]);
    updatePage((prev) => ({
      ...prev,
      sections: prev.sections
        .filter((section) => !idsToRemove.has(section.clientId))
        .map((section, index) => ({ ...section, position: index })),
    }));
    setSelectedClientId((prev) => (prev && idsToRemove.has(prev) ? null : prev));
  };

  const duplicateSectionByClientId = (clientId: string) => {
    if (!canWrite || !page) return;
    const source = page.sections.find((section) => section.clientId === clientId);
    if (!source) return;

    const idMap = new Map<string, string>();
    const queue = [clientId];
    while (queue.length) {
      const id = queue.shift()!;
      if (idMap.has(id)) continue;
      idMap.set(id, newClientId());
      for (const child of page.sections) {
        if (child.parentId === id) queue.push(child.clientId);
      }
    }

    const clones: Section[] = [];
    for (const [oldId, newId] of idMap) {
      const row = page.sections.find((section) => section.clientId === oldId);
      if (!row) continue;
      clones.push({
        ...row,
        id: undefined,
        clientId: newId,
        parentId:
          oldId === clientId
            ? row.parentId || null
            : row.parentId
              ? idMap.get(row.parentId) || null
              : null,
        propsJson: JSON.parse(JSON.stringify(row.propsJson || {})),
      });
    }

    updatePage((prev) => {
      const siblings = prev.sections.filter(
        (section) =>
          (section.parentId || null) === (source.parentId || null) &&
          (section.slotKey || null) === (source.slotKey || null),
      );
      const siblingIndex = siblings.findIndex((section) => section.clientId === clientId);
      const rootClone = clones.find((section) => section.clientId === idMap.get(clientId));
      if (!rootClone) return prev;
      const withoutClones = [...prev.sections];
      const withClones = [...withoutClones, ...clones];
      return {
        ...prev,
        sections: moveSectionInTree(
          withClones,
          rootClone.clientId,
          source.parentId || null,
          source.slotKey || null,
          siblingIndex < 0 ? siblings.length : siblingIndex + 1,
        ),
      };
    });
    setSelectedClientId(idMap.get(clientId) || null);
    patchBuilderUi({ inspectorOpen: true });
  };

  const copySectionByClientId = useCallback(
    (clientId: string) => {
      const current = pageRef.current;
      if (!current) return;
      const subtree = collectSubtree(current.sections, clientId);
      if (!subtree.length) return;
      clipboardRef.current = JSON.parse(JSON.stringify(subtree));
      toastSuccess('Module copied');
    },
    [],
  );

  const pasteClipboard = useCallback(() => {
    if (!canWrite) return;
    const clip = clipboardRef.current;
    const current = pageRef.current;
    if (!clip?.length || !current) return;

    const rootOld = clip.find(
      (section) => !section.parentId || !clip.some((row) => row.clientId === section.parentId),
    );
    if (!rootOld) return;

    const selectedId = selectedClientIdRef.current;
    const selected =
      selectedId && selectedId !== HEADER_REGION_ID && selectedId !== FOOTER_REGION_ID
        ? current.sections.find((section) => section.clientId === selectedId)
        : null;

    let parentId: string | null = null;
    let slotKey: string | null = null;
    let targetIndex = rootSections(current.sections).length;

    if (selected && isLayoutModule(selected.type)) {
      parentId = selected.clientId;
      slotKey = defaultLayoutSlotKey(selected.type, selected.propsJson);
      targetIndex = current.sections.filter(
        (section) =>
          (section.parentId || null) === parentId && (section.slotKey || null) === slotKey,
      ).length;
    } else if (selected) {
      parentId = selected.parentId || null;
      slotKey = selected.slotKey || null;
      const siblings = current.sections.filter(
        (section) =>
          (section.parentId || null) === parentId && (section.slotKey || null) === slotKey,
      );
      const idx = siblings.findIndex((section) => section.clientId === selected.clientId);
      targetIndex = idx < 0 ? siblings.length : idx + 1;
    }

    const idMap = new Map<string, string>();
    for (const row of clip) idMap.set(row.clientId, newClientId());

    const clones: Section[] = clip.map((row) => ({
      ...row,
      id: undefined,
      clientId: idMap.get(row.clientId)!,
      parentId:
        row.clientId === rootOld.clientId
          ? parentId
          : row.parentId
            ? idMap.get(row.parentId) || null
            : null,
      slotKey: row.clientId === rootOld.clientId ? slotKey : row.slotKey || null,
      propsJson: JSON.parse(JSON.stringify(row.propsJson || {})),
    }));

    const rootNewId = idMap.get(rootOld.clientId)!;
    updatePage((prev) => ({
      ...prev,
      sections: moveSectionInTree(
        [...prev.sections, ...clones],
        rootNewId,
        parentId,
        slotKey,
        targetIndex,
      ),
    }));
    setSelectedClientId(rootNewId);
    patchBuilderUi({ inspectorOpen: true });
    toastSuccess('Module pasted');
  }, [canWrite, patchBuilderUi, updatePage]);

  const onSelectClientId = useCallback(
    (clientId: string, opts?: { additive?: boolean }) => {
      if (opts?.additive) {
        setSelectedClientIds((prev) => {
          const next = prev.includes(clientId)
            ? prev.filter((id) => id !== clientId)
            : [...prev, clientId];
          setSelectedClientId(clientId);
          return next.length ? next : [clientId];
        });
      } else {
        setSelectedClientId(clientId);
        setSelectedClientIds([clientId]);
      }
      patchBuilderUi({ inspectorOpen: true });
    },
    [patchBuilderUi],
  );

  const onFrameChangeCommit = useCallback(
    (clientId: string, frame: FreeformFrame, origin: FreeformFrame) => {
      if (!canWrite) return;
      const dx = frame.x - origin.x;
      const dy = frame.y - origin.y;
      const multi = selectedClientIds.includes(clientId) && selectedClientIds.length > 1;
      const deviceMode = device;
      updatePage((prev) => ({
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.clientId === clientId) {
            const stored = freeformFrameStored(section.propsJson || {});
            return {
              ...section,
              propsJson: {
                ...section.propsJson,
                frame: writeFreeformFrameForDevice(stored, deviceMode, frame),
              },
            };
          }
          if (multi && selectedClientIds.includes(section.clientId) && !section.parentId) {
            const stored = freeformFrameStored(section.propsJson || {});
            const current = freeformFrameOf(section.propsJson || {}, deviceMode);
            const moved = { ...current, x: current.x + dx, y: current.y + dy, unit: 'px' as const };
            return {
              ...section,
              propsJson: {
                ...section.propsJson,
                frame: writeFreeformFrameForDevice(stored, deviceMode, moved),
              },
            };
          }
          return section;
        }),
      }));
    },
    [canWrite, selectedClientIds, updatePage, device],
  );

  const onNudgeZ = useCallback(
    (clientId: string, direction: 'forward' | 'back') => {
      if (!canWrite) return;
      updatePage((prev) => ({
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.clientId !== clientId) return section;
          const stored = freeformFrameStored(section.propsJson || {});
          const current = freeformFrameOf(section.propsJson || {}, device);
          return {
            ...section,
            propsJson: {
              ...section.propsJson,
              frame: writeFreeformFrameForDevice(
                stored,
                device,
                nudgeFreeformZ(current, direction),
              ),
            },
          };
        }),
      }));
    },
    [canWrite, updatePage, device],
  );

  const onCanvasPropChange = useCallback(
    (clientId: string, key: string, value: unknown) => {
      if (!canWrite) return;
      updatePage((prev) => ({
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.clientId !== clientId) return section;
          if (key === 'frame' && value && typeof value === 'object') {
            const stored = freeformFrameStored(section.propsJson || {});
            return {
              ...section,
              propsJson: {
                ...section.propsJson,
                frame: writeFreeformFrameForDevice(stored, device, value as FreeformFrame),
              },
            };
          }
          return { ...section, propsJson: { ...section.propsJson, [key]: value } };
        }),
      }));
    },
    [canWrite, updatePage, device],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return Boolean(target.closest('[contenteditable="true"]'));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const editing = isEditableTarget(event.target);

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveBuilder();
        return;
      }
      if (!editing && meta && event.key.toLowerCase() === 'd') {
        const selected = selectedClientIdRef.current;
        if (selected && selected !== HEADER_REGION_ID && selected !== FOOTER_REGION_ID) {
          event.preventDefault();
          duplicateSectionByClientId(selected);
        }
        return;
      }
      if (!editing && meta && event.key.toLowerCase() === 'c') {
        const selected = selectedClientIdRef.current;
        if (selected && selected !== HEADER_REGION_ID && selected !== FOOTER_REGION_ID) {
          event.preventDefault();
          copySectionByClientId(selected);
        }
        return;
      }
      if (!editing && meta && event.key.toLowerCase() === 'v') {
        if (clipboardRef.current?.length) {
          event.preventDefault();
          pasteClipboard();
        }
        return;
      }
      if (
        !editing &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedClientIdRef.current &&
        selectedClientIdRef.current !== HEADER_REGION_ID &&
        selectedClientIdRef.current !== FOOTER_REGION_ID
      ) {
        event.preventDefault();
        deleteSectionByClientId(selectedClientIdRef.current);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedClientIdRef.current) {
          setSelectedClientId(null);
          return;
        }
        exitBuilder();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveBuilder, exitBuilder, undo, redo, copySectionByClientId, pasteClipboard]);

  const publish = async () => {
    if (!page) return;
    try {
      if (dirty) await saveBuilder({ silent: true });
      await api(`/presence/pages/${page.id}/publish`, { method: 'POST' });
      await api(`/presence/sites/${page.siteId}/publish`, { method: 'POST', body: '{}' });
      toastSuccess('Page and website published');
      setPreviewVersion(Date.now());
      setPage((prev) => (prev ? { ...prev, status: 'published' } : prev));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Publish failed');
    }
  };

  const openTemplateDialog = () => {
    if (!page) return;
    setTemplateForm({ key: '', name: `${page.title} template`, category: 'page', description: '' });
    setTemplateDialogOpen(true);
  };

  const submitTemplateDialog = async () => {
    if (!page) return;
    if (!templateForm.key.trim() || !templateForm.name.trim()) {
      toastError('Key and name are required');
      return;
    }
    setTemplateSaving(true);
    try {
      if (dirty) await saveBuilder({ silent: true });
      await api(`/presence/pages/${page.id}/save-as-template`, {
        method: 'POST',
        body: JSON.stringify({
          key: templateForm.key.trim(),
          name: templateForm.name.trim(),
          category: templateForm.category.trim() || 'page',
          description: templateForm.description.trim() || null,
        }),
      });
      toastSuccess('Saved as a page template');
      setTemplateDialogOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const refreshComponents = useCallback(async () => {
    try {
      const templates = await api<
        Array<{ id: string; key: string; name: string; category: string; structureJson?: unknown; updatedAt?: string }>
      >('/presence/page-templates');
      setComponents(templates.filter((row) => row.category === 'component'));
    } catch {
      // non-blocking
    }
  }, []);

  const openComponentDialog = () => {
    if (!currentSection) return;
    const label =
      selectedModule?.name || currentSection.type;
    setComponentForm({
      key: `${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'component',
      name: `${label} component`,
    });
    setComponentDialogOpen(true);
  };

  const submitComponentDialog = async () => {
    if (!page || !currentSection) return;
    if (!componentForm.key.trim() || !componentForm.name.trim()) {
      toastError('Key and name are required');
      return;
    }
    setComponentSaving(true);
    try {
      const sections = serializeSubtreeForComponent(page.sections, currentSection.clientId);
      const saved = await api<{ id: string; key: string; name: string; updatedAt?: string }>(
        '/presence/page-templates',
        {
          method: 'PUT',
          body: JSON.stringify({
            key: componentForm.key.trim(),
            name: componentForm.name.trim(),
            category: 'component',
            structureJson: { sections, rootClientId: sections[0]?.clientId || 'c0' },
          }),
        },
      );
      updatePage((prev) => ({
        ...prev,
        sections: prev.sections.map((section) =>
          section.clientId === currentSection.clientId
            ? {
                ...section,
                propsJson: {
                  ...section.propsJson,
                  componentRef: {
                    templateId: saved.id,
                    key: saved.key,
                    name: saved.name,
                    version: saved.updatedAt || new Date().toISOString(),
                  },
                },
              }
            : section,
        ),
      }));
      await refreshComponents();
      toastSuccess('Saved as component');
      setComponentDialogOpen(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to save component');
    } finally {
      setComponentSaving(false);
    }
  };

  const pushComponentUpdate = async () => {
    if (!page || !currentSection) return;
    const ref = (currentSection.propsJson || {}).componentRef as
      | { templateId?: string; key?: string; name?: string }
      | undefined;
    if (!ref?.key) return;
    try {
      const sections = serializeSubtreeForComponent(page.sections, currentSection.clientId);
      const saved = await api<{ id: string; key: string; name: string; updatedAt?: string }>(
        '/presence/page-templates',
        {
          method: 'PUT',
          body: JSON.stringify({
            key: ref.key,
            name: ref.name || ref.key,
            category: 'component',
            structureJson: { sections, rootClientId: sections[0]?.clientId || 'c0' },
          }),
        },
      );
      updatePage((prev) => ({
        ...prev,
        sections: prev.sections.map((section) =>
          section.clientId === currentSection.clientId
            ? {
                ...section,
                propsJson: {
                  ...section.propsJson,
                  componentRef: {
                    templateId: saved.id,
                    key: saved.key,
                    name: saved.name,
                    version: saved.updatedAt || new Date().toISOString(),
                  },
                },
              }
            : section,
        ),
      }));
      await refreshComponents();
      toastSuccess('Component definition updated');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Failed to update component');
    }
  };

  const resetFromComponent = () => {
    if (!page || !currentSection || !canWrite) return;
    const ref = (currentSection.propsJson || {}).componentRef as
      | { templateId?: string; key?: string }
      | undefined;
    const template = components.find(
      (row) => row.id === ref?.templateId || (ref?.key && row.key === ref.key),
    );
    if (!template) {
      toastError('Component definition not found');
      return;
    }
    const structure = (template.structureJson || {}) as { sections?: Section[] };
    const sourceSections = Array.isArray(structure.sections) ? structure.sections : [];
    if (!sourceSections.length) {
      toastError('Component has no sections');
      return;
    }
    const rootOld = sourceSections.find((row) => !row.parentId) || sourceSections[0]!;
    const parentId = currentSection.parentId || null;
    const slotKey = currentSection.slotKey || null;
    const siblings = page.sections.filter(
      (section) =>
        (section.parentId || null) === parentId && (section.slotKey || null) === slotKey,
    );
    const siblingIndex = siblings.findIndex((section) => section.clientId === currentSection.clientId);
    const remapped = remapSubtreeForInsert(sourceSections, rootOld.clientId, parentId, slotKey);
    const insertedRoot =
      remapped.find(
        (section) =>
          (section.parentId || null) === parentId && (section.slotKey || null) === slotKey,
      ) || remapped[0]!;
    const withRef = remapped.map((section) =>
      section.clientId === insertedRoot.clientId
        ? {
            ...section,
            propsJson: {
              ...section.propsJson,
              componentRef: {
                templateId: template.id,
                key: template.key,
                name: template.name,
                version: template.updatedAt || new Date().toISOString(),
              },
            },
          }
        : section,
    );

    const removeIds = new Set(collectSubtree(page.sections, currentSection.clientId).map((s) => s.clientId));
    updatePage((prev) => {
      const remaining = prev.sections.filter((section) => !removeIds.has(section.clientId));
      return {
        ...prev,
        sections: moveSectionInTree(
          [...remaining, ...withRef],
          insertedRoot.clientId,
          parentId,
          slotKey,
          siblingIndex < 0 ? siblings.length : siblingIndex,
        ),
      };
    });
    setSelectedClientId(insertedRoot.clientId);
    toastSuccess('Reset from component');
  };

  const insertComponent = (
    template: {
      id: string;
      key: string;
      name: string;
      structureJson?: unknown;
      updatedAt?: string;
    },
    dropTarget?: { parentId: string | null; slotKey: string | null; index: number },
  ) => {
    if (!canWrite || !page) return;
    const structure = (template.structureJson || {}) as { sections?: Section[] };
    const sourceSections = Array.isArray(structure.sections) ? structure.sections : [];
    if (!sourceSections.length) {
      toastError('Component is empty');
      return;
    }
    const rootOld = sourceSections.find((row) => !row.parentId) || sourceSections[0]!;
    const parentId = dropTarget ? dropTarget.parentId : insertTarget.parentId;
    const slotKey = dropTarget ? dropTarget.slotKey : insertTarget.slotKey;
    const index = dropTarget ? dropTarget.index : insertTarget.index;
    const targetIndex = index == null ? groupCount(parentId, slotKey) : index;
    const remapped = remapSubtreeForInsert(sourceSections, rootOld.clientId, parentId, slotKey);
    const insertedRoot = remapped.find((s) => (s.parentId || null) === parentId) || remapped[0]!;
    const isFreeform = !parentId && (page.layoutMode || 'flow') === 'freeform';
    const rootCount = rootSections(page.sections).length;
    const withRef = remapped.map((section) => {
      if (section.clientId !== insertedRoot.clientId) return section;
      return {
        ...section,
        propsJson: {
          ...section.propsJson,
          ...(isFreeform && !section.propsJson?.frame
            ? { frame: { ...DEFAULT_FREEFORM_FRAME, y: DEFAULT_FREEFORM_FRAME.y + rootCount * 48 } }
            : {}),
          componentRef: {
            templateId: template.id,
            key: template.key,
            name: template.name,
            version: template.updatedAt || new Date().toISOString(),
          },
        },
      };
    });
    updatePage((prev) => ({
      ...prev,
      sections: moveSectionInTree(
        [...prev.sections, ...withRef],
        insertedRoot.clientId,
        parentId,
        slotKey,
        targetIndex,
      ),
    }));
    setSelectedClientId(insertedRoot.clientId);
    setInsertTarget({ parentId: null, slotKey: null, index: null });
    patchBuilderUi({ inspectorOpen: true });
    toastSuccess(`Added ${template.name}`);
  };

  const previewUrl = page ? previewRendererUrl(identity, savedPath || page.path, previewVersion) : null;

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const onDragCancel = () => {
    setActiveDragId(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    if (!canWrite || !page) return;
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { kind?: string; clientId?: string; moduleId?: string; componentId?: string }
      | undefined;

    // Prefer precise insert/slot targets when the canvas wrapper also collides.
    const preferredId =
      event.collisions?.find((hit) => String(hit.id).startsWith('insert:'))?.id ||
      event.collisions?.find((hit) => String(hit.id).startsWith('slot:'))?.id ||
      event.collisions?.find((hit) => String(hit.id).startsWith('canvas:'))?.id ||
      event.collisions?.find((hit) => String(hit.id) !== 'canvas-drop')?.id ||
      over.id;
    const preferredCollision = event.collisions?.find((hit) => hit.id === preferredId);
    const overData = (
      preferredCollision?.data?.droppableContainer?.data.current ||
      over.data.current
    ) as
      | {
          kind?: string;
          clientId?: string;
          parentClientId?: string;
          parentId?: string | null;
          slotKey?: string | null;
          index?: number;
        }
      | undefined;

    const findSection = (clientId: string) => page.sections.find((section) => section.clientId === clientId) || null;
    const overClientId = overData?.clientId || parseSectionClientId(preferredId);
    const activeClientId = activeData?.clientId || parseSectionClientId(active.id);

    const resolveDropTarget = (): { parentId: string | null; slotKey: string | null; index: number } => {
      if (overData?.kind === 'insert' && typeof overData.index === 'number') {
        return {
          parentId: overData.parentId ?? null,
          slotKey: overData.slotKey ?? null,
          index: overData.index,
        };
      }
      if (overData?.kind === 'containerSlot' && overData.parentClientId) {
        const siblings = page.sections.filter(
          (section) =>
            section.parentId === overData.parentClientId && (section.slotKey || null) === (overData.slotKey || null),
        );
        return { parentId: overData.parentClientId, slotKey: overData.slotKey ?? null, index: siblings.length };
      }
      if ((overData?.kind === 'section' || overClientId) && overClientId) {
        const overSection = findSection(overClientId);
        if (overSection) {
          if (isLayoutModule(overSection.type)) {
            const slot = defaultLayoutSlotKey(overSection.type, overSection.propsJson);
            const siblings = page.sections.filter(
              (section) => section.parentId === overSection.clientId && (section.slotKey || null) === slot,
            );
            return { parentId: overSection.clientId, slotKey: slot, index: siblings.length };
          }
          const group = page.sections.filter(
            (section) =>
              (section.parentId || null) === (overSection.parentId || null) &&
              (section.slotKey || null) === (overSection.slotKey || null),
          );
          const idx = group.findIndex((section) => section.clientId === overSection.clientId);
          const translated = active.rect.current.translated;
          const overRect = over.rect;
          const dropAfter =
            Boolean(translated && overRect) &&
            String(over.id) === String(preferredId) &&
            (translated!.top + translated!.height / 2 > overRect.top + overRect.height / 2);
          return {
            parentId: overSection.parentId || null,
            slotKey: overSection.slotKey || null,
            index: idx < 0 ? group.length : dropAfter ? idx + 1 : idx,
          };
        }
      }
      const roots = rootSections(page.sections);
      return { parentId: null, slotKey: null, index: roots.length };
    };

    if (activeData?.kind === 'module' && activeData.moduleId) {
      const moduleDef = modules.find((row) => row.id === activeData.moduleId);
      if (!moduleDef) return;
      const target = resolveDropTarget();
      insertModuleAt(moduleDef, target.parentId, target.slotKey, target.index);
      return;
    }

    if (activeData?.kind === 'savedComponent' && activeData.componentId) {
      const template = components.find((row) => row.id === activeData.componentId);
      if (!template) return;
      const target = resolveDropTarget();
      insertComponent(template, target);
      return;
    }

    if ((activeData?.kind === 'section' || activeClientId) && activeClientId) {
      const activeSection = findSection(activeClientId);
      if (!activeSection) return;
      const target = resolveDropTarget();
      if (target.parentId === activeClientId) return;
      if (target.parentId && isDescendantOf(page.sections, activeClientId, target.parentId)) return;
      const unchanged =
        (activeSection.parentId || null) === target.parentId &&
        (activeSection.slotKey || null) === target.slotKey;
      const group = page.sections.filter(
        (section) =>
          (section.parentId || null) === target.parentId && (section.slotKey || null) === target.slotKey,
      );
      const currentIdx = group.findIndex((section) => section.clientId === activeClientId);
      if (unchanged && currentIdx === target.index) return;

      updatePage((prev) => ({
        ...prev,
        sections: moveSectionInTree(prev.sections, activeClientId, target.parentId, target.slotKey, target.index),
      }));
    }
  };

  const activeModule =
    activeDragId && String(activeDragId).startsWith('module:')
      ? modules.find((row) => `module:${row.id}` === activeDragId)
      : null;
  const activeSavedComponent =
    activeDragId && String(activeDragId).startsWith('saved-component:')
      ? components.find((row) => `saved-component:${row.id}` === activeDragId)
      : null;
  const activeSectionClientId = activeDragId ? parseSectionClientId(activeDragId) : null;
  const activeSection =
    activeSectionClientId && page
      ? page.sections.find((section) => section.clientId === activeSectionClientId) || null
      : null;
  const activeSectionLabel = activeSection
    ? modules.find((module) => module.id === activeSection.moduleDefinitionId)?.name ||
      modules.find((module) => module.key === activeSection.type)?.name ||
      modules.find((module) => module.rendererKey === activeSection.type)?.name ||
      activeSection.type
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-background">
      <BuilderChrome
        title={page?.title || 'Page builder'}
        siteName={page?.site.name || (loading ? 'Loading…' : '—')}
        status={page?.status}
        dirty={dirty}
        saving={saving || chromeSaving}
        saveAck={saveAck}
        canWrite={canWrite}
        device={device}
        previewUrl={previewUrl}
        previewMode={previewMode}
        layoutMode={page?.layoutMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSaveAsTemplate={page ? openTemplateDialog : undefined}
        onDeviceChange={setDevice}
        onPreviewModeChange={(next) => {
          if (next && dirty) {
            void saveBuilder({ silent: true }).then(() => setPreviewMode(true));
            return;
          }
          setPreviewMode(next);
        }}
        onBack={exitBuilder}
        onSave={() => void saveBuilder()}
        onPublish={() => void publish()}
      />

      {loading || !page ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {error || 'Loading page builder…'}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <EmptyState title="Page builder" description={error} />
          <Button variant="outline" onClick={exitBuilder}>
            <ArrowLeft className="mr-2 size-4" />
            Back to pages
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={builderCollisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div
            className={cn(
              'grid min-h-0 flex-1 overflow-hidden',
              previewMode
                ? 'grid-cols-1'
                : 'grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)_auto]',
            )}
          >
            {!previewMode ? (
            <aside className="flex min-h-0 overflow-hidden border-b xl:border-b-0 xl:border-r">
              <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r bg-muted/20 py-1.5">
                {RAIL.map((item) => {
                  const active =
                    item.id === 'settings'
                      ? siteSettingsOpen
                      : leftDrawerOpen && leftPanel === item.id;
                  return (
                    <BrandTooltip key={item.id} label={item.label} side="right">
                      <Button
                        type="button"
                        size="icon"
                        variant={active ? 'secondary' : 'ghost'}
                        className="size-8"
                        aria-label={item.label}
                        aria-pressed={active}
                        onClick={() => {
                          if (item.id === 'settings') {
                            setSiteChromeSection('colors');
                            setSiteSettingsOpen(true);
                            return;
                          }
                          if (item.id === 'modules') setInsertTarget({ parentId: null, slotKey: null, index: null });
                          if (leftPanel === item.id && leftDrawerOpen) {
                            setLeftDrawerOpen(false);
                            return;
                          }
                          patchBuilderUi({ leftPanel: item.id, leftDrawerOpen: true });
                        }}
                      >
                        <item.icon className="size-3.5" />
                      </Button>
                    </BrandTooltip>
                  );
                })}
              </div>
              {leftDrawerOpen && leftPanel !== 'settings' ? (
                <div className="flex min-h-0 w-[220px] flex-col overflow-hidden">
                  {leftPanel === 'contents' ? (
                    <BuilderStructurePanel
                      sections={page.sections}
                      modules={modules}
                      selectedClientId={selectedClientId}
                      siteName={page.site.name}
                      canWrite={canWrite}
                      onSelect={(id) => {
                        if (id) onSelectClientId(id);
                        else {
                          setSelectedClientId(null);
                          setSelectedClientIds([]);
                        }
                        if (id) {
                          patchBuilderUi({ leftPanel: 'contents', inspectorOpen: true });
                        }
                      }}
                      onSelectChrome={onSelectChrome}
                      onAddInside={(parentClientId, slotKey) => openModulesPanel(parentClientId, slotKey)}
                      onReorder={(sections) => updatePage((prev) => ({ ...prev, sections }))}
                    />
                  ) : null}
                  {leftPanel === 'modules' ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      {insertTarget.parentId || insertTarget.index != null ? (
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-primary/5 px-3 py-1.5 text-[11px] text-primary">
                          <span>
                            {insertTarget.parentId
                              ? `Adding inside container${insertTarget.slotKey ? ` · ${insertTarget.slotKey}` : ''}`
                              : insertTarget.index === 0
                                ? 'Adding at top of page'
                                : 'Adding at selected position'}
                          </span>
                          <button
                            type="button"
                            className="font-medium underline"
                            onClick={() => setInsertTarget({ parentId: null, slotKey: null, index: null })}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <BuilderModuleLibrary
                        modules={modules}
                        fillHeight
                        canDrag={canWrite}
                        onAdd={(moduleDef) => {
                          addModule(moduleDef);
                        }}
                      />
                      {components.length ? (
                        <div className="shrink-0 border-t">
                          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Saved components
                          </div>
                          <p className="px-3 pb-1 text-[10px] text-muted-foreground">
                            Drag onto the canvas or click to insert
                          </p>
                          <div className="max-h-40 space-y-1 overflow-y-auto px-2 pb-2">
                            {components.map((component) => (
                              <DraggableSavedComponentRow
                                key={component.id}
                                component={component}
                                canDrag={canWrite}
                                onAdd={() => insertComponent(component)}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
            ) : null}

            {previewMode && previewUrl ? (
              <PreviewFitFrame
                device={device}
                previewUrl={previewUrl}
                previewVersion={previewVersion}
                settingsJson={page?.site.settingsJson}
              />
            ) : (
              <BuilderLiveCanvas
                page={page}
                forms={forms}
                modules={modules}
                device={device}
                selectedClientId={selectedClientId}
                selectedClientIds={selectedClientIds}
                canWrite={canWrite}
                tokenOverrides={previewTokens}
                layoutOverrides={previewLayout}
                onSelect={onSelectClientId}
                onClearSelection={() => {
                  setSelectedClientId(null);
                  setSelectedClientIds([]);
                }}
                onDuplicate={duplicateSectionByClientId}
                onDelete={deleteSectionByClientId}
                onAddSection={() => openModulesPanel(null, null)}
                onAddAt={({ parentId, slotKey, index }) => openModulesPanel(parentId, slotKey, index)}
                onPropChange={onCanvasPropChange}
                onFrameChange={(clientId, frame) => onCanvasPropChange(clientId, 'frame', frame)}
                onFrameChangeCommit={onFrameChangeCommit}
                onNudgeZ={onNudgeZ}
                onSelectChrome={onSelectChrome}
              />
            )}

            {inspectorOpen && !previewMode ? (
              <BuilderInspector
                page={page}
                canWrite={canWrite}
                chromeRegion={chromeRegion}
                device={device}
                section={leftPanel === 'settings' ? null : currentSection}
                selectedModule={leftPanel === 'settings' ? null : selectedModule}
                forms={forms}
                onCollapse={() => setInspectorOpen(false)}
                onDelete={deleteCurrentSection}
                onSaveGlobalSlot={saveGlobalSlot}
                onPropChange={(key, value) => {
                  if (!canWrite || selectedIndex < 0) return;
                  updatePage((prev) => ({
                    ...prev,
                    sections: prev.sections.map((section, index) =>
                      index === selectedIndex
                        ? { ...section, propsJson: { ...section.propsJson, [key]: value } }
                        : section,
                    ),
                  }));
                }}
                onPropsJsonChange={(propsJson) => {
                  if (!canWrite || selectedIndex < 0) return;
                  updatePage((prev) => ({
                    ...prev,
                    sections: prev.sections.map((section, index) =>
                      index === selectedIndex ? { ...section, propsJson } : section,
                    ),
                  }));
                }}
                onSeoChange={(seoJson) => {
                  if (!canWrite) return;
                  updatePage((prev) => ({ ...prev, seoJson }));
                }}
                onTitleChange={(title) => {
                  if (!canWrite) return;
                  updatePage((prev) => ({ ...prev, title }));
                }}
                onPathChange={(path) => {
                  if (!canWrite) return;
                  updatePage((prev) => ({ ...prev, path }));
                }}
                onLayoutKeyChange={(layoutKey) => {
                  if (!canWrite) return;
                  updatePage((prev) => ({ ...prev, layoutKey }));
                }}
                onLayoutModeChange={onLayoutModeChange}
                onNavigationChange={onNavigationChange}
                onMenusChange={onMenusChange}
                onFooterNoteChange={onFooterNoteChange}
                onFooterRegionChange={onFooterRegionChange}
                onHeaderRegionChange={onHeaderRegionChange}
                onSelectSection={onSelectClientId}
                onSaveAsComponent={openComponentDialog}
                onUpdateComponent={() => void pushComponentUpdate()}
                onResetFromComponent={resetFromComponent}
                identity={identity}
                onOpenSiteChrome={(section) => {
                  setSiteChromeSection(section || 'colors');
                  setSiteSettingsOpen(true);
                }}
                onOpenWebsiteSettings={(tab) => {
                  setWebsiteSettingsTab(tab);
                  setWebsiteSettingsOpen(true);
                }}
              />
            ) : previewMode ? null : (
              <aside className="flex shrink-0 flex-col items-center border-t bg-muted/20 py-1.5 xl:w-11 xl:border-l xl:border-t-0">
                <BrandTooltip label="Open inspector" side="left">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Open inspector"
                    onClick={() => setInspectorOpen(true)}
                  >
                    <PanelRightOpen className="size-3.5" />
                  </Button>
                </BrandTooltip>
              </aside>
            )}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeModule ? (
              <div className="rounded-md border border-primary/40 bg-background px-3 py-2 text-sm shadow-xl ring-2 ring-primary/20">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Adding module
                </div>
                <div className="font-medium">{activeModule.name}</div>
              </div>
            ) : activeSavedComponent ? (
              <div className="rounded-md border border-primary/40 bg-background px-3 py-2 text-sm shadow-xl ring-2 ring-primary/20">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Adding component
                </div>
                <div className="font-medium">{activeSavedComponent.name}</div>
              </div>
            ) : activeSectionLabel ? (
              <div className="rounded-md border border-primary/40 bg-background px-3 py-2 text-sm shadow-xl ring-2 ring-primary/20">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Moving
                </div>
                <div className="font-medium">{activeSectionLabel}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <RecordSheet
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        title="Save as page template"
        description="Reuse this page's layout and content when creating new pages."
        onSubmit={() => void submitTemplateDialog()}
        submitLabel="Save template"
        submitting={templateSaving}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Template key</Label>
            <Input
              className="mt-1"
              value={templateForm.key}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, key: e.target.value }))}
              placeholder="e.g. landing_v2"
            />
          </div>
          <div>
            <Label className="text-xs">Template name</Label>
            <Input
              className="mt-1"
              value={templateForm.name}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Input
              className="mt-1"
              value={templateForm.category}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, category: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={templateForm.description}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </div>
      </RecordSheet>

      <RecordSheet
        open={componentDialogOpen}
        onOpenChange={setComponentDialogOpen}
        title="Save as component"
        description="Reusable synced block you can insert on any page. Push updates later to refresh the definition."
        onSubmit={() => void submitComponentDialog()}
        submitLabel="Save component"
        submitting={componentSaving}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Component key</Label>
            <Input
              className="mt-1"
              value={componentForm.key}
              onChange={(e) => setComponentForm((prev) => ({ ...prev, key: e.target.value }))}
              placeholder="e.g. cta_band"
            />
          </div>
          <div>
            <Label className="text-xs">Component name</Label>
            <Input
              className="mt-1"
              value={componentForm.name}
              onChange={(e) => setComponentForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
        </div>
      </RecordSheet>

      {page ? (
        <BuilderSiteSettingsDialog
          open={siteSettingsOpen}
          onOpenChange={(open) => {
            setSiteSettingsOpen(open);
            if (!open) setSiteChromeSection('colors');
          }}
          page={page}
          canWrite={canWrite}
          identity={identity}
          forms={forms}
          initialSection={siteChromeSection}
          onTokensPreview={setPreviewTokens}
          onLayoutPreview={setPreviewLayout}
          onOpenWebsiteSettings={() => {
            setWebsiteSettingsTab(undefined);
            setWebsiteSettingsOpen(true);
          }}
          onApplied={(next) => {
            setPreviewTokens(null);
            setPreviewLayout(null);
            updatePage(() => next);
            flashSaved();
          }}
        />
      ) : null}

      {page ? (
        <SiteSettingsDialog
          open={websiteSettingsOpen}
          onOpenChange={(open) => {
            setWebsiteSettingsOpen(open);
            if (!open) setWebsiteSettingsTab(undefined);
          }}
          site={page.site}
          themes={websiteThemes}
          identity={identity}
          canWrite={canWrite}
          initialTab={websiteSettingsTab}
          onSaved={() => {
            void api<PagePayload>(`/presence/pages/${pageId}`)
              .then((payload) => {
                skipAutosave.current = true;
                hydratePage(payload);
              })
              .catch((e) => toastError(e instanceof Error ? e.message : 'Failed to refresh page'));
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
