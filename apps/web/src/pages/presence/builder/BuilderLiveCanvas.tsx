import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BringToFront, ChevronRight, Copy, GripVertical, Pencil, Plus, SendToBack, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, BrandTooltip, cn } from '@wayrune/ui';
import {
  parsePresenceSiteLayout,
  presenceContentMaxPx,
  presenceFontGoogleFamily,
  type PresenceSiteLayout,
} from '@wayrune/contracts';
import { EXTRA_MODULES_LIVE_CSS, LiveSectionView, themeCssVars } from './LiveSectionView';
import { PresenceMenuIcon } from './PresenceMenuIcon';
import {
  ancestorChain,
  canvasSortableId,
  childrenOf,
  defaultBoxWidth,
  defaultContentAlign,
  freeformFrameOf,
  nudgeFreeformZ,
  rootSections,
  effectiveStyleProps,
} from './helpers';
import { FreeformFrameChrome } from './FreeformFrameChrome';
import { resolveMenuForLocation, resolveSiteMenus } from './menus';
import type { BuilderPage, DeviceMode, FormDef, FreeformFrame, ModuleDef, Section } from './types';
import { scopePresenceCss } from '../scopeCss';

/** Logical device widths — canvas keeps these even when side panels squeeze the viewport. */
export const DEVICE_WIDTH_PX: Record<DeviceMode, number> = {
  desktop: 1100,
  widescreen: 1440,
  tablet: 768,
  mobile: 390,
};

/** Resolve canvas frame width from device mode + site main layout. */
export function canvasWidthForDevice(
  device: DeviceMode,
  settingsJson?: Record<string, unknown> | null,
): number {
  const base = DEVICE_WIDTH_PX[device];
  if (device === 'mobile' || device === 'tablet') return base;
  const layout = parsePresenceSiteLayout(settingsJson);
  const contentPx = presenceContentMaxPx(layout.contentMax);
  if (contentPx == null) return base;
  return Math.max(base, contentPx);
}
/**
 * Scale the fixed-width canvas down to fit the available shell width.
 * Uses CSS `zoom` so layout/DnD coordinates stay aligned (unlike transform).
 */
function useCanvasFitScale(deviceWidthPx: number) {
  const shellRef = useRef<HTMLDivElement>(null);
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
      // Never upscale; floor so ultra-narrow panels stay readable.
      const next = Math.min(1, Math.max(0.45, available / deviceWidthPx));
      setScale((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(shell);
    return () => ro.disconnect();
  }, [deviceWidthPx]);

  return { shellRef, scale };
}

export const CANVAS_DROP_ID = 'canvas-drop';

type InsertTarget = {
  parentId: string | null;
  slotKey: string | null;
  index: number;
};

type NodeCommonProps = {
  allSections: Section[];
  forms: FormDef[];
  modules: ModuleDef[];
  themeTokens?: Record<string, unknown> | null;
  selectedClientId: string | null;
  selectedClientIds?: string[];
  canWrite: boolean;
  freeform: boolean;
  device: DeviceMode;
  onSelect: (clientId: string, opts?: { additive?: boolean }) => void;
  onDuplicate?: (clientId: string) => void;
  onDelete?: (clientId: string) => void;
  onAddAt?: (target: InsertTarget) => void;
  onPropChange?: (clientId: string, key: string, value: unknown) => void;
  onFrameChange?: (clientId: string, frame: FreeformFrame) => void;
  onFrameChangeCommit?: (clientId: string, frame: FreeformFrame, origin: FreeformFrame) => void;
  onNudgeZ?: (clientId: string, direction: 'forward' | 'back') => void;
};

/** Between-section / empty-slot “+” control (Elementor-style). */
function InsertAddButton({
  onClick,
  label = 'Add module',
  compact = false,
  placement = 'after',
}: {
  onClick: () => void;
  label?: string;
  compact?: boolean;
  placement?: 'before' | 'after';
}) {
  return (
    <div
      className={cn(
        'presence-insert-add',
        placement === 'before' ? 'presence-insert-add--before' : 'presence-insert-add--after',
        compact ? 'presence-insert-add--compact' : '',
      )}
    >
      <button
        type="button"
        className="presence-insert-add__btn"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
        title={label}
      >
        <Plus className="size-3.5" />
        {compact ? null : <span>Add</span>}
      </button>
    </div>
  );
}

/** Visible insertion guide between modules while dragging. */
function DropGuide({
  id,
  parentId,
  slotKey,
  index,
  label = 'Drop here',
}: {
  id: string;
  parentId: string | null;
  slotKey: string | null;
  index: number;
  label?: string;
}) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      kind: 'insert',
      parentId,
      slotKey,
      index,
    },
    disabled: !active,
  });

  if (!active) {
    return <div ref={setNodeRef} className="presence-drop-guide presence-drop-guide--idle" aria-hidden />;
  }

  return (
    <div
      ref={setNodeRef}
      className={cn('presence-drop-guide', isOver ? 'presence-drop-guide--active' : '')}
      aria-hidden={!isOver}
    >
      <div className="presence-drop-guide__line" />
      {isOver ? <div className="presence-drop-guide__label">{label}</div> : null}
    </div>
  );
}

function SlotDropZone({
  parentClientId,
  slotKey,
  ...rest
}: NodeCommonProps & { parentClientId: string; slotKey: string | null }) {
  const { active } = useDndContext();
  const children = childrenOf(rest.allSections, parentClientId, slotKey);
  const dropId = `slot:${parentClientId}:${slotKey || 'main'}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { kind: 'containerSlot', parentClientId, slotKey: slotKey || null },
  });
  const dragging = Boolean(active);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'presence-slot-dropzone',
        dragging ? 'presence-slot-dropzone--ready' : '',
        isOver ? 'presence-slot-dropzone--over' : '',
      )}
    >
      {dragging ? (
        <DropGuide
          id={`insert:${parentClientId || 'root'}:${slotKey || 'main'}:0`}
          parentId={parentClientId}
          slotKey={slotKey}
          index={0}
          label={slotKey ? `Drop in ${slotKey}` : 'Drop at top'}
        />
      ) : null}
      <SortableContext
        items={children.map((child) => canvasSortableId(child.clientId))}
        strategy={verticalListSortingStrategy}
      >
        <div className={cn(dragging ? 'space-y-1' : 'space-y-3')}>
          {children.map((child, index) => (
            <div key={child.clientId}>
              <SectionNode
                section={child}
                {...rest}
                insertBefore={
                  !dragging && rest.canWrite && rest.onAddAt
                    ? {
                        compact: true,
                        label: slotKey ? `Add to ${slotKey}` : 'Add module',
                        onClick: () =>
                          rest.onAddAt?.({ parentId: parentClientId, slotKey, index }),
                      }
                    : undefined
                }
                insertAfter={
                  !dragging && rest.canWrite && rest.onAddAt
                    ? {
                        compact: true,
                        label: 'Add module here',
                        onClick: () =>
                          rest.onAddAt?.({
                            parentId: parentClientId,
                            slotKey,
                            index: index + 1,
                          }),
                      }
                    : undefined
                }
              />
              {dragging ? (
                <DropGuide
                  id={`insert:${parentClientId || 'root'}:${slotKey || 'main'}:${index + 1}`}
                  parentId={parentClientId}
                  slotKey={slotKey}
                  index={index + 1}
                  label={slotKey ? `Drop in ${slotKey}` : 'Drop here'}
                />
              ) : null}
            </div>
          ))}
        </div>
      </SortableContext>
      {!children.length ? (
        <div className={cn('presence-slot-empty-hint', isOver ? 'presence-slot-empty-hint--over' : '')}>
          {isOver ? (
            'Release to drop'
          ) : rest.canWrite && rest.onAddAt ? (
            <button
              type="button"
              className="presence-slot-empty-cta"
              onClick={() => rest.onAddAt?.({ parentId: parentClientId, slotKey, index: 0 })}
            >
              <Plus className="size-3.5" />
              {slotKey ? `Add to ${slotKey}` : 'Add a module'}
            </button>
          ) : (
            'Drop a module here'
          )}
        </div>
      ) : null}
    </div>
  );
}

function SectionNode({
  section,
  allSections,
  forms,
  modules,
  themeTokens,
  selectedClientId,
  selectedClientIds,
  canWrite,
  freeform,
  device,
  onSelect,
  onDuplicate,
  onDelete,
  onAddAt,
  onPropChange,
  onFrameChange,
  onFrameChangeCommit,
  onNudgeZ,
  insertBefore,
  insertAfter,
}: NodeCommonProps & {
  section: Section;
  insertBefore?: { label: string; onClick: () => void; compact?: boolean };
  insertAfter?: { label: string; onClick: () => void; compact?: boolean };
}) {
  const { active } = useDndContext();
  const isRoot = !section.parentId;
  const sortable = useSortable({
    id: canvasSortableId(section.clientId),
    data: {
      kind: 'section',
      clientId: section.clientId,
      parentId: section.parentId ?? null,
      slotKey: section.slotKey ?? null,
      surface: 'canvas',
    },
    disabled: !canWrite || (freeform && isRoot),
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = sortable;
  const selected =
    selectedClientId === section.clientId ||
    Boolean(selectedClientIds?.includes(section.clientId));
  const label =
    modules.find((module) => module.id === section.moduleDefinitionId)?.name ||
    modules.find((module) => module.rendererKey === section.type)?.name ||
    section.type;
  const showToolbar = !active || selected;
  const props = section.propsJson || {};
  const effective = effectiveStyleProps(props, device);
  const boxWidth =
    effective.boxWidth === 'content' || effective.boxWidth === 'wide' || effective.boxWidth === 'full'
      ? effective.boxWidth
      : defaultBoxWidth(section.type);
  const contentAlign =
    effective.contentAlign === 'left' ||
    effective.contentAlign === 'center' ||
    effective.contentAlign === 'right'
      ? effective.contentAlign
      : defaultContentAlign(section.type);

  const siblingFrames =
    freeform && isRoot
      ? allSections
          .filter((row) => !row.parentId && row.clientId !== section.clientId)
          .map((row) => freeformFrameOf(row.propsJson || {}, device))
      : [];

  const content = (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      data-presence-client-id={section.clientId}
      className={cn(
        'presence-section-chrome group/section',
        `presence-section-chrome--align-${contentAlign}`,
        isDragging ? 'opacity-40' : '',
        selected ? 'presence-section-selected' : '',
        isOver && !isDragging ? 'presence-section-drop-target' : '',
      )}
    >
      <div className={cn('presence-section-frame', `presence-section-frame--${boxWidth}`)}>
        {insertBefore ? (
          <InsertAddButton
            placement="before"
            compact={insertBefore.compact}
            label={insertBefore.label}
            onClick={insertBefore.onClick}
          />
        ) : null}

        {isOver && !isDragging ? (
          <div className="presence-section-drop-badge" aria-hidden>
            Place here
          </div>
        ) : null}

        {showToolbar ? (
          <div className="presence-section-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="presence-section-toolbar__label">{label}</span>
            <div className="presence-section-toolbar__actions">
              {canWrite && !(freeform && isRoot) ? (
                <BrandTooltip label="Drag to reorder">
                  <button
                    type="button"
                    className="presence-section-toolbar__btn cursor-grab active:cursor-grabbing"
                    aria-label="Drag to reorder"
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                </BrandTooltip>
              ) : null}
              {canWrite && freeform && isRoot && onNudgeZ ? (
                <>
                  <BrandTooltip label="Bring forward">
                    <button
                      type="button"
                      className="presence-section-toolbar__btn"
                      aria-label="Bring forward"
                      onClick={() => onNudgeZ(section.clientId, 'forward')}
                    >
                      <BringToFront className="size-3.5" />
                    </button>
                  </BrandTooltip>
                  <BrandTooltip label="Send back">
                    <button
                      type="button"
                      className="presence-section-toolbar__btn"
                      aria-label="Send back"
                      onClick={() => onNudgeZ(section.clientId, 'back')}
                    >
                      <SendToBack className="size-3.5" />
                    </button>
                  </BrandTooltip>
                </>
              ) : null}
              <BrandTooltip label="Edit">
                <button
                  type="button"
                  className="presence-section-toolbar__btn"
                  aria-label="Edit module"
                  onClick={() => onSelect(section.clientId)}
                >
                  <Pencil className="size-3.5" />
                </button>
              </BrandTooltip>
              {canWrite && onDuplicate ? (
                <BrandTooltip label="Duplicate">
                  <button
                    type="button"
                    className="presence-section-toolbar__btn"
                    aria-label="Duplicate module"
                    onClick={() => onDuplicate(section.clientId)}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </BrandTooltip>
              ) : null}
              {canWrite && onDelete ? (
                <BrandTooltip label="Delete">
                  <button
                    type="button"
                    className="presence-section-toolbar__btn presence-section-toolbar__btn--danger"
                    aria-label="Delete module"
                    onClick={() => onDelete(section.clientId)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </BrandTooltip>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className="block w-full cursor-pointer text-left"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(section.clientId, { additive: e.shiftKey || e.metaKey || e.ctrlKey });
          }}
        >
          <LiveSectionView
            section={section}
            forms={forms}
            modules={modules}
            themeTokens={themeTokens}
            device={device}
            editable={selected && canWrite}
            onPropChange={
              onPropChange
                ? (key, value) => onPropChange(section.clientId, key, value)
                : undefined
            }
            renderSlot={(parentClientId, slotKey): ReactNode => (
              <SlotDropZone
                parentClientId={parentClientId}
                slotKey={slotKey}
                allSections={allSections}
                forms={forms}
                modules={modules}
                themeTokens={themeTokens}
                selectedClientId={selectedClientId}
                selectedClientIds={selectedClientIds}
                canWrite={canWrite}
                freeform={freeform}
                device={device}
                onSelect={onSelect}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onAddAt={onAddAt}
                onPropChange={onPropChange}
                onFrameChange={onFrameChange}
                onFrameChangeCommit={onFrameChangeCommit}
                onNudgeZ={onNudgeZ}
              />
            )}
          />
        </div>

        {insertAfter ? (
          <InsertAddButton
            placement="after"
            compact={insertAfter.compact}
            label={insertAfter.label}
            onClick={insertAfter.onClick}
          />
        ) : null}
      </div>
    </div>
  );

  if (freeform && isRoot) {
    const frame = freeformFrameOf(section.propsJson || {}, device);
    return (
      <FreeformFrameChrome
        frame={frame}
        selected={selected}
        canWrite={canWrite}
        siblingFrames={siblingFrames}
        onFrameChange={(next) => onFrameChange?.(section.clientId, next)}
        onFrameChangeCommit={(next, origin) =>
          onFrameChangeCommit?.(section.clientId, next, origin)
        }
      >
        {content}
      </FreeformFrameChrome>
    );
  }
  return content;
}

function RootSectionList(props: NodeCommonProps & { roots: Section[]; freeform: boolean }) {
  const { active } = useDndContext();
  const dragging = Boolean(active);
  const { roots, freeform, ...nodeProps } = props;

  return (
    <SortableContext
      items={roots.map((section) => canvasSortableId(section.clientId))}
      strategy={verticalListSortingStrategy}
    >
      <div className={cn('presence-root-list', freeform && 'presence-root-list--freeform')}>
        {dragging && !freeform ? (
          <DropGuide
            id="insert:root:main:0"
            parentId={null}
            slotKey={null}
            index={0}
            label="Drop at top of page"
          />
        ) : null}
        {roots.map((section, index) => (
          <div key={section.clientId} className="presence-root-item">
            <SectionNode
              section={section}
              freeform={freeform}
              {...nodeProps}
              insertBefore={
                !dragging && !freeform && nodeProps.canWrite && nodeProps.onAddAt
                  ? {
                      label: index === 0 ? 'Add section at top' : 'Add section here',
                      onClick: () =>
                        nodeProps.onAddAt?.({ parentId: null, slotKey: null, index }),
                    }
                  : undefined
              }
              insertAfter={
                !dragging && !freeform && nodeProps.canWrite && nodeProps.onAddAt
                  ? {
                      label: 'Add section here',
                      onClick: () =>
                        nodeProps.onAddAt?.({
                          parentId: null,
                          slotKey: null,
                          index: index + 1,
                        }),
                    }
                  : undefined
              }
            />
            {dragging && !freeform ? (
              <DropGuide
                id={`insert:root:main:${index + 1}`}
                parentId={null}
                slotKey={null}
                index={index + 1}
                label="Drop here"
              />
            ) : null}
          </div>
        ))}
      </div>
    </SortableContext>
  );
}

function SelectionBreadcrumb({
  page,
  modules,
  selectedClientId,
  onSelect,
  onClear,
}: {
  page: BuilderPage;
  modules: ModuleDef[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
  onClear: () => void;
}) {
  if (!selectedClientId) return null;
  const selected = page.sections.find((section) => section.clientId === selectedClientId);
  if (!selected) return null;
  const ancestors = ancestorChain(page.sections, selectedClientId);
  const labelOf = (section: Section) =>
    modules.find((module) => module.id === section.moduleDefinitionId)?.name ||
    modules.find((module) => module.rendererKey === section.type)?.name ||
    section.type;

  return (
    <nav className="presence-breadcrumb" aria-label="Module path">
      <button type="button" className="presence-breadcrumb__item" onClick={onClear}>
        Page
      </button>
      {[...ancestors, selected].map((section, index, list) => {
        const isLast = index === list.length - 1;
        return (
          <span key={section.clientId} className="presence-breadcrumb__segment">
            <ChevronRight className="presence-breadcrumb__sep" aria-hidden />
            {isLast ? (
              <span className="presence-breadcrumb__item presence-breadcrumb__item--current">
                {labelOf(section)}
              </span>
            ) : (
              <button
                type="button"
                className="presence-breadcrumb__item"
                onClick={() => onSelect(section.clientId)}
              >
                {labelOf(section)}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function BuilderLiveCanvas({
  page,
  forms,
  modules,
  device,
  selectedClientId,
  selectedClientIds,
  canWrite,
  tokenOverrides,
  layoutOverrides,
  onSelect,
  onClearSelection,
  onDuplicate,
  onDelete,
  onAddSection,
  onAddAt,
  onPropChange,
  onFrameChange,
  onFrameChangeCommit,
  onNudgeZ,
  onSelectChrome,
}: {
  page: BuilderPage;
  forms: FormDef[];
  modules: ModuleDef[];
  device: DeviceMode;
  selectedClientId: string | null;
  selectedClientIds?: string[];
  canWrite: boolean;
  /** Live token preview from Site Settings (not yet saved). */
  tokenOverrides?: Record<string, unknown> | null;
  /** Live main-layout preview from Site Settings (not yet saved). */
  layoutOverrides?: PresenceSiteLayout | null;
  onSelect: (clientId: string, opts?: { additive?: boolean }) => void;
  onClearSelection?: () => void;
  onDuplicate?: (clientId: string) => void;
  onDelete?: (clientId: string) => void;
  onAddSection?: () => void;
  onAddAt?: (target: InsertTarget) => void;
  onPropChange?: (clientId: string, key: string, value: unknown) => void;
  onFrameChange?: (clientId: string, frame: FreeformFrame) => void;
  onFrameChangeCommit?: (clientId: string, frame: FreeformFrame, origin: FreeformFrame) => void;
  onNudgeZ?: (clientId: string, direction: 'forward' | 'back') => void;
  onSelectChrome?: (region: 'header' | 'footer') => void;
}) {
  const themeTokens = useMemo(() => {
    const base = (tokenOverrides ||
      page.site.theme?.effectiveTokensJson ||
      page.site.theme?.tokensJson ||
      undefined) as Record<string, unknown> | null | undefined;
    if (tokenOverrides) return base;
    // Match publish: layer site designSystem on effective theme tokens.
    const designSystem = page.site.settingsJson?.designSystem;
    if (!designSystem || typeof designSystem !== 'object' || Array.isArray(designSystem)) {
      return base;
    }
    return { ...(base || {}), ...(designSystem as Record<string, unknown>) };
  }, [
    tokenOverrides,
    page.site.theme?.effectiveTokensJson,
    page.site.theme?.tokensJson,
    page.site.settingsJson,
  ]);
  const themeStyle = useMemo(() => themeCssVars(themeTokens), [themeTokens]);
  const packageCss = page.site.theme?.packageCss || '';
  const themeKey = page.site.theme?.key || '';
  const templateKey = page.site.template?.key || '';

  /** Same Google Fonts as public runtime so canvas typography matches published. */
  useEffect(() => {
    const display = typeof themeTokens?.fontDisplay === 'string' ? themeTokens.fontDisplay : '';
    const body = typeof themeTokens?.fontBody === 'string' ? themeTokens.fontBody : '';
    const families = [...new Set([presenceFontGoogleFamily(display), presenceFontGoogleFamily(body)])].filter(
      (name): name is string => Boolean(name),
    );
    if (!families.length) return;
    const href = `https://fonts.googleapis.com/css2?${families
      .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`)
      .join('&')}&display=swap`;
    const id = 'presence-live-canvas-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [themeTokens?.fontDisplay, themeTokens?.fontBody]);
  const brandName = page.site.brandName?.trim() || page.site.name;
  const { setNodeRef: setCanvasDropRef, isOver } = useDroppable({
    id: CANVAS_DROP_ID,
    data: { kind: 'canvas' },
  });
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const setCanvasRef = (node: HTMLDivElement | null) => {
    canvasScrollRef.current = node;
    setCanvasDropRef(node);
  };
  const freeform = page.layoutMode === 'freeform';
  const roots = useMemo(() => rootSections(page.sections), [page.sections]);
  const headerRegion =
    ((page.site.globalRegionsJson as { header?: Record<string, unknown> } | null)?.header ||
      {}) as Record<string, unknown>;
  const footerRegion =
    ((page.site.globalRegionsJson as { footer?: Record<string, unknown> } | null)?.footer ||
      {}) as Record<string, unknown>;
  const logoUrl = typeof headerRegion.logoUrl === 'string' ? headerRegion.logoUrl : '';
  const tagline = typeof headerRegion.tagline === 'string' ? headerRegion.tagline : '';
  const headerCtaLabel = typeof headerRegion.ctaLabel === 'string' ? headerRegion.ctaLabel : '';
  const headerCtaAction =
    headerRegion.ctaAction === 'form_popup' || headerRegion.ctaAction === 'open_widget'
      ? headerRegion.ctaAction
      : 'link';
  const headerCtaFormKey =
    typeof headerRegion.ctaFormKey === 'string' && headerRegion.ctaFormKey
      ? headerRegion.ctaFormKey
      : 'contact';
  const showNav = headerRegion.showNav !== false;
  const footerSecondary =
    typeof footerRegion.secondaryNote === 'string' ? footerRegion.secondaryNote : '';
  const headerSelected = selectedClientId === '__header__';
  const footerSelected = selectedClientId === '__footer__';
  const siteMenus = resolveSiteMenus({
    menusJson: page.site.menusJson,
    menuAssignmentsJson: page.site.menuAssignmentsJson,
    navigationJson: page.site.navigationJson,
  });
  const primaryMenuItems = resolveMenuForLocation(
    siteMenus.menusJson,
    siteMenus.menuAssignmentsJson,
    'primary',
  );
  const footerMenuItems = resolveMenuForLocation(
    siteMenus.menusJson,
    siteMenus.menuAssignmentsJson,
    'footer',
  );

  const siteLayout = useMemo(() => {
    if (layoutOverrides) return layoutOverrides;
    return parsePresenceSiteLayout(page.site.settingsJson);
  }, [layoutOverrides, page.site.settingsJson]);
  const deviceWidthPx = canvasWidthForDevice(
    device,
    layoutOverrides
      ? ({ layout: layoutOverrides } as Record<string, unknown>)
      : page.site.settingsJson,
  );
  const { shellRef, scale } = useCanvasFitScale(deviceWidthPx);

  // Layers panel / inspector selection → bring the matching canvas block into view.
  useEffect(() => {
    if (!selectedClientId) return;
    const root = canvasScrollRef.current;
    if (!root) return;
    const safeId =
      typeof globalThis.CSS?.escape === 'function'
        ? globalThis.CSS.escape(selectedClientId)
        : selectedClientId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const target = root.querySelector(`[data-presence-client-id="${safeId}"]`);
    if (!(target instanceof HTMLElement)) return;

    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visible =
      Math.min(targetRect.bottom, rootRect.bottom) - Math.max(targetRect.top, rootRect.top);
    const mostlyVisible = visible >= Math.min(targetRect.height, rootRect.height) * 0.55;
    if (mostlyVisible) return;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  }, [selectedClientId]);

  const canvasStyle: CSSProperties = {
    ...themeStyle,
    ['--presence-max' as string]: siteLayout.contentMax,
    ['--presence-gutter' as string]: siteLayout.gutter,
    ['--presence-section-gap' as string]: siteLayout.sectionGap,
    ['--section-gap' as string]: siteLayout.sectionGap,
    ['--max' as string]: siteLayout.contentMax,
    ['--gutter' as string]: siteLayout.gutter,
    width: deviceWidthPx,
    maxWidth: deviceWidthPx,
    // Fit into the squeezed middle column without reflowing the page layout.
    zoom: scale < 0.999 ? scale : undefined,
    fontFamily: 'var(--font-body, var(--presence-font-body))',
    color: 'var(--fg, var(--presence-fg))',
    lineHeight: 1.6,
    // Keep theme styles from leaking into ERP chrome (and ERP from leaking in).
    contain: 'style layout',
    isolation: 'isolate',
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/25">
      <div
        ref={shellRef}
        className="relative flex min-h-0 flex-1 justify-center overflow-auto p-2 sm:p-3"
      >
        <div
          ref={setCanvasRef}
          className={cn(
            // Grow with page content; outer shell scrolls. overflow-x clipped in LIVE_CANVAS_CSS.
            'presence-live relative flex min-h-full shrink-0 flex-col rounded-md border shadow-sm transition-[width] duration-200',
            themeKey ? `theme-${themeKey}` : '',
            templateKey ? `template-${templateKey}` : '',
            isOver ? 'presence-live--drop-over' : '',
          )}
          style={canvasStyle}
          data-presence-canvas="1"
          data-presence-scale={scale < 0.999 ? scale.toFixed(3) : undefined}
          onClickCapture={(e) => {
            // Edit canvas: module HTML includes real <a href> (dest cards, CTAs, etc.).
            // Block navigation so clicks select/edit instead of leaving the builder SPA.
            const el = e.target;
            if (!(el instanceof Element)) return;
            const anchor = el.closest('a[href]');
            if (!anchor || !e.currentTarget.contains(anchor)) return;
            e.preventDefault();
          }}
          onAuxClickCapture={(e) => {
            const el = e.target;
            if (!(el instanceof Element)) return;
            const anchor = el.closest('a[href]');
            if (!anchor || !e.currentTarget.contains(anchor)) return;
            e.preventDefault();
          }}
        >
          <style>{LIVE_CANVAS_CSS}</style>
          {packageCss ? <style>{scopePresenceCss(packageCss, '.presence-live')}</style> : null}
          {isOver ? (
            <div className="presence-canvas-drop-banner" aria-live="polite">
              Drop to add at the end of the page
            </div>
          ) : null}
          <SelectionBreadcrumb
            page={page}
            modules={modules}
            selectedClientId={selectedClientId}
            onSelect={onSelect}
            onClear={() => onClearSelection?.()}
          />
          <header
            data-presence-client-id="__header__"
            className={cn(
              'presence-header',
              headerSelected ? 'presence-chrome-selected' : '',
              onSelectChrome ? 'presence-chrome-clickable' : '',
            )}
            onClick={(e) => {
              if (!onSelectChrome) return;
              e.stopPropagation();
              onSelectChrome('header');
            }}
          >
            <div className="presence-brand">
              {logoUrl ? <img className="presence-brand-logo" src={logoUrl} alt="" /> : null}
              <span className="presence-brand-text">{brandName}</span>
              {tagline ? <span className="presence-brand-tagline">{tagline}</span> : null}
            </div>
            {showNav ? (
              <nav className="presence-nav">
                {primaryMenuItems.map((item) => (
                  <span key={item.id} className="presence-nav-item">
                    <span className="presence-nav-link">
                      <PresenceMenuIcon icon={item.icon} className="presence-nav-icon" />
                      {item.label}
                    </span>
                    {item.children?.length ? (
                      <span className="presence-nav-children">
                        {item.children.map((child) => (
                          <span key={child.id} className="presence-nav-link presence-nav-link--child">
                            <PresenceMenuIcon icon={child.icon} className="presence-nav-icon" />
                            {child.label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                ))}
              </nav>
            ) : (
              <div />
            )}
            {headerCtaLabel ? (
              <span
                className="presence-header-cta"
                title={
                  headerCtaAction === 'form_popup'
                    ? `Opens form: ${headerCtaFormKey}`
                    : headerCtaAction === 'open_widget'
                      ? 'Opens chat widget'
                      : undefined
                }
              >
                {headerCtaLabel}
              </span>
            ) : null}
          </header>

          <div
            className={cn(
              'presence-main',
              freeform ? 'presence-freeform-stage' : '',
            )}
          >
            <RootSectionList
              roots={roots}
              allSections={page.sections}
              forms={forms}
              modules={modules}
              themeTokens={
                tokenOverrides ||
                page.site.theme?.effectiveTokensJson ||
                page.site.theme?.tokensJson ||
                undefined
              }
              selectedClientId={selectedClientId}
              selectedClientIds={selectedClientIds}
              canWrite={canWrite}
              freeform={freeform}
              device={device}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onAddAt={onAddAt}
              onPropChange={onPropChange}
              onFrameChange={onFrameChange}
              onFrameChangeCommit={onFrameChangeCommit}
              onNudgeZ={onNudgeZ}
            />
            {!roots.length ? (
              <div
                className={cn(
                  'rounded-lg border border-dashed px-4 py-10 text-center text-sm text-[color:var(--presence-muted)]',
                  isOver ? 'presence-empty-drop-over' : '',
                )}
              >
                {canWrite ? (
                  isOver ? (
                    'Release to add this module'
                  ) : (
                    <div className="space-y-3">
                      <p>Drag a module here or add a section to start building.</p>
                      {onAddAt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onAddAt({ parentId: null, slotKey: null, index: 0 })}
                        >
                          <Plus className="mr-1.5 size-3.5" />
                          Add section
                        </Button>
                      ) : null}
                    </div>
                  )
                ) : (
                  'No modules on this page yet.'
                )}
              </div>
            ) : null}
          </div>

          <footer
            data-presence-client-id="__footer__"
            className={cn(
              'presence-footer',
              footerSelected ? 'presence-chrome-selected' : '',
              onSelectChrome ? 'presence-chrome-clickable' : '',
            )}
            onClick={(e) => {
              if (!onSelectChrome) return;
              e.stopPropagation();
              onSelectChrome('footer');
            }}
          >
            <div>
              {typeof footerRegion.note === 'string' && footerRegion.note
                ? footerRegion.note
                : brandName}
            </div>
            {footerSecondary ? <div className="presence-footer-secondary">{footerSecondary}</div> : null}
            {footerMenuItems.length ? (
              <nav className="presence-footer-nav">
                {footerMenuItems.flatMap((item) => [
                  <span key={item.id} className="presence-footer-link">
                    <PresenceMenuIcon icon={item.icon} className="presence-nav-icon" />
                    {item.label}
                  </span>,
                  ...(item.children || []).map((child) => (
                    <span key={child.id} className="presence-footer-link">
                      <PresenceMenuIcon icon={child.icon} className="presence-nav-icon" />
                      {child.label}
                    </span>
                  )),
                ])}
              </nav>
            ) : null}
          </footer>
        </div>
      </div>

      {scale < 0.999 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            Fit {Math.round(scale * 100)}% · {deviceWidthPx}px canvas
          </span>
        </div>
      ) : null}

      {onAddSection && canWrite ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <Button
            type="button"
            size="sm"
            className="pointer-events-auto h-8 shadow-md"
            onClick={onAddSection}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add section
          </Button>
        </div>
      ) : null}
    </main>
  );
}

const LIVE_CANVAS_CSS = `
.presence-live {
  background:
    radial-gradient(1200px 480px at 10% -10%, color-mix(in srgb, var(--presence-primary) 16%, transparent), transparent 60%),
    radial-gradient(900px 420px at 100% 0%, color-mix(in srgb, var(--presence-accent) 12%, transparent), transparent 55%),
    var(--presence-bg);
  /* Clip sideways overflow; vertical scroll lives on the outer canvas shell. */
  overflow-x:hidden;
  overflow-y:visible;
}
/* Links are decorative in edit mode — navigation is blocked in JS. */
.presence-live a[href] { cursor: pointer; }
.presence-header {
  display:flex; align-items:center; justify-content:space-between; gap:1rem;
  padding:1rem max(var(--presence-gutter, 1rem), calc((100% - min(var(--presence-max, 1100px), 100%)) / 2));
  border-bottom:1px solid var(--presence-border);
  background: color-mix(in srgb, var(--presence-surface) 88%, transparent);
  /* Sticky above idle page content; active section chrome can rise above for toolbars. */
  position:sticky; top:0; z-index:20;
}
.presence-brand {
  font-family: var(--presence-font-display);
  font-size:1.2rem; font-weight:700; letter-spacing:-0.02em;
  display:inline-flex; align-items:center; gap:.55rem; min-width:0;
}
.presence-brand-logo { height:1.75rem; width:auto; object-fit:contain; border-radius:4px; }
.presence-brand-text { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.presence-brand-tagline { font-size:.7rem; font-weight:560; color:var(--presence-muted); letter-spacing:0; }
.presence-header-cta {
  display:inline-flex; align-items:center; padding:.4rem .75rem; border-radius:calc(var(--presence-radius) - 4px);
  background:var(--presence-primary); color:#fff; font-size:.8rem; font-weight:650; white-space:nowrap;
}
.presence-header-cta-hint { opacity:.8; font-weight:560; font-size:.68rem; }
.presence-chrome-clickable { cursor:pointer; }
.presence-chrome-clickable:hover { outline:2px dashed color-mix(in srgb, var(--presence-primary) 45%, transparent); outline-offset:-2px; }
.presence-chrome-selected { outline:2px solid var(--presence-primary); outline-offset:-2px; }
.presence-nav { display:flex; flex-wrap:wrap; gap:.75rem; align-items:flex-start; }
.presence-nav-item { display:inline-flex; flex-direction:column; gap:.2rem; }
.presence-nav-link { display:inline-flex; align-items:center; gap:.35rem; font-size:.85rem; color:var(--presence-muted); font-weight:560; }
.presence-nav-link--child { font-size:.75rem; opacity:.85; }
.presence-nav-icon { width:0.95em; height:0.95em; }
.presence-nav-children { display:flex; flex-direction:column; gap:.1rem; padding-left:.35rem; border-left:1px solid var(--presence-border); }
.presence-footer-nav { display:flex; flex-wrap:wrap; gap:.5rem .85rem; margin-top:.5rem; }
.presence-footer-link { display:inline-flex; align-items:center; gap:.3rem; font-size:.78rem; color:var(--presence-muted); }
.presence-main {
  flex:1;
  position:relative;
  /* Same centered site column as header/footer and the live public site. */
  padding:1.25rem max(var(--presence-gutter, 1rem), calc((100% - min(var(--presence-max, 1100px), 100%)) / 2)) 4.5rem;
}
/* Page-wide rhythm: one --section-gap between every root module (matches published). */
.presence-main .presence-root-list:not(.presence-root-list--freeform) {
  display:flex;
  flex-direction:column;
  gap: var(--section-gap, var(--presence-section-gap, 2.75rem));
}
.presence-root-list--freeform {
  position:relative;
  min-height:inherit;
}
.presence-root-item { width:100%; min-width:0; }
.presence-section-shell { width:100%; display:block; }
.presence-section-shell--align-left,
.presence-section-shell--align-center,
.presence-section-shell--align-right { display:block; }
.presence-section-inner { width:100%; min-width:0; }
.presence-section-shell--content .presence-section-inner,
.presence-section-shell--wide .presence-section-inner,
.presence-section-shell--full .presence-section-inner { max-width:none; }
.presence-section-chrome {
  width:100%;
  display:flex;
  position:relative;
  box-sizing:border-box;
}
.presence-section-chrome:hover,
.presence-section-selected,
.presence-section-chrome:focus-within {
  /* Above sticky header so guide toolbar / + Add are not covered. */
  z-index:30;
}
/* Align narrow boxes inside the centered column (full-width fills the column). */
.presence-section-chrome--align-left { justify-content:flex-start; }
.presence-section-chrome--align-center { justify-content:center; }
.presence-section-chrome--align-right { justify-content:flex-end; }
.presence-section-frame {
  position:relative;
  width:100%;
  max-width:100%;
  min-width:0;
  overflow:visible;
  /* Match module radius so selection ring hugs rounded heroes (avoids corner bleed). */
  border-radius:calc(var(--presence-radius) + 6px);
  transition:box-shadow .12s ease;
}
.presence-section-frame--content { max-width:480px; }
.presence-section-frame--wide { max-width:720px; }
/* Full = fill the centered site column (column width comes from .presence-main padding). */
.presence-section-frame--full { max-width:100%; }
/*
 * Invisible bridges extend hover toward outside chrome (toolbar sits above the frame).
 * pointer-events only while hovered/selected so + Add in the gap stays clickable.
 */
.presence-section-frame::before,
.presence-section-frame::after {
  content:'';
  position:absolute;
  left:-8px;
  right:-8px;
  pointer-events:none;
  z-index:1;
}
.presence-section-frame::before {
  bottom:100%;
  height:2.75rem;
}
.presence-section-frame::after {
  top:100%;
  height:1.5rem;
}
.presence-section-chrome:hover > .presence-section-frame::before,
.presence-section-selected > .presence-section-frame::before,
.presence-section-chrome:focus-within > .presence-section-frame::before {
  pointer-events:auto;
}
/* Square selection / hover ring. */
.presence-section-chrome:hover:not(.presence-section-selected):not(.presence-section-drop-target):not(:has(.presence-section-chrome:hover)) > .presence-section-frame {
  box-shadow:
    0 0 0 1.5px color-mix(in srgb, var(--presence-primary) 85%, #38bdf8),
    0 0 0 4px color-mix(in srgb, var(--presence-primary) 14%, transparent);
}
.presence-section-selected > .presence-section-frame {
  box-shadow:
    0 0 0 2px var(--presence-primary),
    0 0 0 5px color-mix(in srgb, var(--presence-primary) 16%, transparent);
}
.presence-section-toolbar {
  position:absolute; top:0; right:0.25rem; left:auto; z-index:30;
  display:flex; align-items:center; gap:0.35rem;
  opacity:0; pointer-events:none;
  transform:translateY(calc(-100% - 4px));
  transition:opacity .12s ease;
}
.presence-section-toolbar::after {
  /* Extra grab strip under the toolbar toward the module edge. */
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:100%;
  height:10px;
}
.presence-section-chrome:hover:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-section-toolbar,
.presence-section-selected:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-section-toolbar,
.presence-section-chrome:focus-within:not(:has(.presence-section-chrome:focus-within)) > .presence-section-frame > .presence-section-toolbar {
  opacity:1; pointer-events:auto;
}
.presence-section-toolbar__label {
  max-width:9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  padding:0.15rem 0.5rem; border-radius:0.35rem;
  font-size:0.65rem; font-weight:700; letter-spacing:0.02em;
  color:#fff; background:var(--presence-primary);
  box-shadow:0 6px 16px color-mix(in srgb, var(--presence-primary) 28%, transparent);
}
.presence-section-toolbar__actions {
  display:flex; align-items:center; gap:1px;
  padding:2px; border-radius:0.45rem;
  background:color-mix(in srgb, #0f172a 92%, transparent);
  box-shadow:0 8px 22px rgba(15,23,42,.22);
}
.presence-section-toolbar__btn {
  display:inline-flex; align-items:center; justify-content:center;
  width:1.65rem; height:1.65rem; border:0; border-radius:0.3rem;
  color:#e2e8f0; background:transparent; cursor:pointer;
}
.presence-section-toolbar__btn:hover { background:rgba(255,255,255,.12); color:#fff; }
.presence-section-toolbar__btn--danger:hover { background:#b91c1c; color:#fff; }


.presence-freeform-stage { position:relative; min-height:640px; }
.presence-freeform-frame {
  box-sizing:border-box; min-width:80px; min-height:80px;
  overflow:visible; height:auto;
}
.presence-freeform-frame--writable.presence-freeform-frame--selected { cursor:move; }
/* Above sticky header while guide chrome is active (inline z-index is the resting order). */
.presence-freeform-frame:has(.presence-section-chrome:hover),
.presence-freeform-frame:has(.presence-section-selected),
.presence-freeform-frame:has(.presence-section-chrome:focus-within) {
  z-index:30 !important;
}
.presence-freeform-guide {
  position:absolute; pointer-events:none; z-index:9999;
  background: color-mix(in srgb, #0ea5e9 70%, transparent);
}
.presence-freeform-guide--x { top:-2000px; bottom:-2000px; width:1px; }
.presence-freeform-guide--y { left:-2000px; right:-2000px; height:1px; }
.presence-freeform-handle {
  position:absolute; z-index:30; width:10px; height:10px;
  border:2px solid var(--presence-primary); background:#fff; border-radius:2px;
  box-shadow:0 1px 4px rgba(15,23,42,.2);
  opacity:0; pointer-events:none;
  transition:opacity .12s ease;
}
.presence-freeform-frame--selected:hover .presence-freeform-handle,
.presence-freeform-frame--selected .presence-freeform-handle:hover,
.presence-freeform-frame--selected:has(.presence-freeform-handle:active) .presence-freeform-handle {
  opacity:1; pointer-events:auto;
}
.presence-freeform-handle--n { top:-5px; left:50%; transform:translateX(-50%); cursor:ns-resize; }
.presence-freeform-handle--s { bottom:-5px; left:50%; transform:translateX(-50%); cursor:ns-resize; }
.presence-freeform-handle--e { right:-5px; top:50%; transform:translateY(-50%); cursor:ew-resize; }
.presence-freeform-handle--w { left:-5px; top:50%; transform:translateY(-50%); cursor:ew-resize; }
.presence-freeform-handle--ne { top:-5px; right:-5px; cursor:nesw-resize; }
.presence-freeform-handle--nw { top:-5px; left:-5px; cursor:nwse-resize; }
.presence-freeform-handle--se { bottom:-5px; right:-5px; cursor:nwse-resize; }
.presence-freeform-handle--sw { bottom:-5px; left:-5px; cursor:nesw-resize; }
.presence-footer {
  padding:1.25rem max(var(--presence-gutter, 1rem), calc((100% - min(var(--presence-max, 1100px), 100%)) / 2));
  text-align:center; color:var(--presence-muted); font-size:.85rem;
  border-top:1px solid var(--presence-border);
}
.presence-footer-secondary { margin-top:.35rem; font-size:.75rem; opacity:.85; }
/* Public-runtime type + chrome (shared with presence-runtime publicCss / theme packages). */
.presence-live .eyebrow,
.presence-live .presence-eyebrow {
  display:inline-flex; align-items:center; gap:.5rem;
  margin:0 0 .85rem; padding:.28rem .7rem;
  border-radius:999px; font-size:.72rem; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase;
  color:var(--primary);
  background:color-mix(in srgb, var(--primary) 12%, var(--surface));
}
.presence-live .section-title,
.presence-live .presence-title {
  font-family:var(--font-display);
  font-size:clamp(1.55rem, 3vw, 2.15rem);
  line-height:1.15; letter-spacing:-0.03em;
  margin:0 0 .75rem;
}
.presence-live .section-lead,
.presence-live .presence-lead {
  margin:0 0 1.5rem; color:var(--muted); max-width:42rem; font-size:1.05rem;
}
.presence-live .btn,
.presence-live .presence-btn,
.presence-live .btn-secondary,
.presence-live .presence-btn-secondary {
  display:inline-flex; align-items:center; justify-content:center;
  padding:.78rem 1.25rem;
  border-radius:calc(var(--radius) - 4px);
  text-decoration:none; cursor:pointer; font:inherit; font-weight:650; letter-spacing:-0.01em;
  transition:transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.presence-live .btn,
.presence-live .presence-btn {
  background:var(--primary); color:#fff; border:none;
  box-shadow:0 10px 24px color-mix(in srgb, var(--primary) 28%, transparent);
}
.presence-live .btn:hover,
.presence-live .presence-btn:hover { transform:translateY(-1px); }
.presence-live .btn-secondary,
.presence-live .presence-btn-secondary {
  background:transparent; color:var(--fg);
  padding:.78rem 1.15rem; border:1px solid var(--border); font-weight:600;
}
.presence-live .hero-actions { display:flex; flex-wrap:wrap; gap:.75rem; margin-top:1.5rem; }
.presence-live .hero {
  position:relative;
  /* Clip ::after glow so it cannot expand document / canvas scroll width. */
  overflow:hidden;
  padding:clamp(2.5rem, 6vw, 4.5rem) clamp(1.25rem, 4vw, 3rem);
  border-radius:calc(var(--radius) + 6px);
  /* Styles panel textColor → --presence-section-color on the section shell */
  color:var(--presence-section-color, #fff);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--hero-from) 92%, #000) 0%, var(--hero-to) 100%);
  /* When set, Styles panel background replaces the default gradient */
  background:var(--presence-section-bg);
  box-shadow:var(--shadow, 0 18px 50px rgba(15,23,42,.08));
  isolation:isolate;
}
.presence-live .hero::after {
  content:""; position:absolute; inset:auto -20% -40% auto; width:55%; height:70%;
  background:radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%);
  pointer-events:none; z-index:0;
}
.presence-live .hero > * { position:relative; z-index:1; }
.presence-live .hero .eyebrow,
.presence-live .hero .presence-eyebrow {
  color:var(--presence-section-color, #fff);
  background:color-mix(in srgb, var(--presence-section-color, #fff) 14%, transparent);
}
.presence-live .hero h1 {
  font-family:var(--font-display);
  font-size:clamp(2.2rem, 6vw, 3.6rem);
  line-height:1.05; letter-spacing:-0.04em;
  margin:0 0 .9rem; max-width:14ch;
  color:inherit;
}
.presence-live .hero p {
  margin:0; max-width:36rem; font-size:1.12rem;
  color:color-mix(in srgb, var(--presence-section-color, #fff) 86%, transparent);
}
.presence-live .hero .btn,
.presence-live .hero .presence-btn { background:#fff; color:var(--hero-from); box-shadow:none; }
.presence-live .hero .btn-secondary,
.presence-live .hero .presence-btn-secondary {
  color:var(--presence-section-color, #fff);
  border-color:color-mix(in srgb, var(--presence-section-color, #fff) 35%, transparent);
}
.presence-live .hero-variant-minimal {
  background:var(--presence-section-bg, var(--surface));
  color:var(--presence-section-color, var(--fg));
  border:1px solid var(--border); box-shadow:none;
}
.presence-live .hero-variant-minimal::after { display:none; }
.presence-live .hero-variant-minimal .eyebrow,
.presence-live .hero-variant-minimal .presence-eyebrow {
  color:var(--presence-section-color, var(--primary));
  background:color-mix(in srgb, var(--presence-section-color, var(--primary)) 12%, var(--surface));
}
.presence-live .hero-variant-minimal h1 { max-width:18ch; }
.presence-live .hero-variant-minimal p {
  color:color-mix(in srgb, var(--presence-section-color, var(--muted)) 100%, transparent);
}
.presence-live .hero-variant-minimal .btn,
.presence-live .hero-variant-minimal .presence-btn { background:var(--primary); color:#fff; }
.presence-live .hero-variant-minimal .btn-secondary,
.presence-live .hero-variant-minimal .presence-btn-secondary { color:var(--presence-section-color, var(--fg)); border-color:var(--border); }
.presence-live .hero-variant-split {
  display:grid; gap:1.5rem;
  background:
    linear-gradient(160deg, var(--surface) 0 48%, transparent 48%),
    linear-gradient(135deg, var(--hero-from), var(--hero-to));
  background:var(--presence-section-bg);
  color:var(--presence-section-color, var(--fg));
}
.presence-live .hero-variant-split::after { display:none; }
.presence-live .hero-variant-split .hero-copy { padding-right:1rem; }
.presence-live .hero-variant-split .eyebrow,
.presence-live .hero-variant-split .presence-eyebrow {
  color:var(--primary); background:color-mix(in srgb, var(--primary) 12%, var(--surface));
}
.presence-live .hero-variant-split p { color:var(--muted); }
.presence-live .hero-variant-split .btn,
.presence-live .hero-variant-split .presence-btn { background:var(--primary); color:#fff; }
.presence-live .hero-variant-split .btn-secondary,
.presence-live .hero-variant-split .presence-btn-secondary { color:var(--fg); border-color:var(--border); }
@media (min-width:820px) {
  .presence-live .hero-variant-split { grid-template-columns:1.1fr .9fr; align-items:end; }
}
.presence-live .hero-variant-immersive {
  min-height:min(72vh, 560px); display:flex; align-items:flex-end;
  padding:clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 3vw, 2rem);
  border-radius:calc(var(--radius) + 6px);
}
.presence-live .hero-variant-immersive .hero-copy { max-width:38rem; }
/* Theme-key chrome (same hooks as public body.theme-*) */
.presence-live.theme-portfolio_ink .hero-variant-minimal h1 { max-width:22ch; }
.presence-live.theme-hospitality_luxe .presence-brand { letter-spacing:0.04em; text-transform:uppercase; font-size:1.05rem; }
.presence-live.theme-homestay_hearth .hero { border-radius:28px; }
.presence-prose {
  padding:1.25rem; border-radius:var(--presence-radius); background:var(--presence-surface);
  border:1px solid var(--presence-border);
}
.presence-prose p { margin:0 0 .85rem; color:color-mix(in srgb, var(--presence-fg) 88%, var(--presence-muted)); }
.presence-prose p:last-child { margin-bottom:0; }
.presence-gallery { display:grid; gap:.65rem; grid-template-columns:repeat(2,minmax(0,1fr)); }
@media (min-width:720px) {
  .presence-gallery { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .presence-gallery-item:first-child { grid-column:span 2; grid-row:span 2; }
}
.presence-gallery-item {
  margin:0; overflow:hidden; border-radius:calc(var(--presence-radius) - 2px);
  border:1px solid var(--presence-border); aspect-ratio:4/3; background:var(--presence-surface-muted);
}
.presence-gallery-item img { width:100%; height:100%; object-fit:cover; display:block; }
.presence-gallery-empty {
  grid-column:1 / -1; border:1px dashed var(--presence-border); border-radius:var(--presence-radius);
  padding:1.25rem; text-align:center; color:var(--presence-muted); font-size:.85rem;
  min-height:4.5rem; display:flex; align-items:center; justify-content:center;
}
.presence-quote-grid { display:grid; gap:.75rem; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
.presence-quote {
  margin:0; padding:1rem 1.1rem; border-radius:var(--presence-radius);
  background:var(--presence-surface); border:1px solid var(--presence-border);
}
.presence-quote p {
  margin:0 0 .75rem; font-family:var(--presence-font-display); font-size:1.05rem; line-height:1.35;
}
.presence-quote cite { color:var(--presence-muted); font-style:normal; font-size:.85rem; font-weight:600; }
.presence-faq-list { display:grid; gap:.55rem; }
.presence-faq-item {
  padding:.85rem 1rem; border-radius:var(--presence-radius); background:var(--presence-surface);
  border:1px solid var(--presence-border);
}
.presence-cta-band {
  text-align:center; padding:2rem 1.5rem; border-radius:calc(var(--presence-radius) + 2px); color:#fff;
  background: linear-gradient(135deg, var(--presence-primary), var(--presence-hero-to));
}
.presence-cta-band .presence-eyebrow,
.presence-cta-band .eyebrow { color:#fff; background:rgba(255,255,255,.14); }
.presence-cta-band .presence-title, .presence-cta-band .presence-lead,
.presence-cta-band .section-title, .presence-cta-band .section-lead { color:#fff; }
.presence-cta-band .presence-lead,
.presence-cta-band .section-lead { margin-inline:auto; }
.presence-cta-band .presence-btn,
.presence-cta-band .btn { background:#fff; color:var(--hero-from); box-shadow:none; }
.presence-cta-card {
  text-align:center; padding:1.5rem; border-radius:var(--presence-radius);
  background:var(--presence-surface); border:1px solid var(--presence-border);
}
.presence-form {
  width:100%; padding:1.35rem; border-radius:var(--presence-radius);
  background:var(--presence-surface); border:1px solid var(--presence-border);
  box-shadow:0 12px 28px color-mix(in srgb, var(--presence-fg) 6%, transparent);
}
.presence-form-fields label { display:block; font-size:.82rem; font-weight:600; margin: .75rem 0 .3rem; }
.presence-form-fields input, .presence-form-fields textarea {
  width:100%; padding:.6rem .75rem; border-radius:calc(var(--presence-radius) - 4px);
  border:1px solid color-mix(in srgb, var(--presence-border) 80%, #94a3b8);
  background:color-mix(in srgb, var(--presence-surface) 92%, var(--presence-bg));
  font:inherit; color:var(--presence-fg);
}
.presence-form-fields .presence-btn,
.presence-form-fields .btn { margin-top:1rem; width:100%; }
.presence-container {
  display:flex; flex-direction:column; gap:.85rem; padding:1rem; border-radius:var(--presence-radius);
  border:1px dashed var(--presence-border); background:color-mix(in srgb, var(--presence-surface) 55%, transparent);
}
.presence-container-empty {
  flex:1; display:flex; align-items:center; justify-content:center;
  min-height:8rem; box-sizing:border-box;
  border:1px dashed var(--presence-border); border-radius:calc(var(--presence-radius) - 4px);
  padding:1.25rem; text-align:center; color:var(--presence-muted); font-size:.82rem;
}
.presence-two-col, .presence-columns { display:grid; gap:1rem; align-items:stretch; }
.presence-two-col { grid-template-columns:1fr 1fr; }
@media (max-width:640px) {
  .presence-two-col, .presence-columns { grid-template-columns:1fr !important; }
}
.presence-two-col-slot {
  display:flex; flex-direction:column; gap:.75rem;
  min-height:8rem; height:100%;
}
.presence-slot-dropzone {
  border-radius:calc(var(--presence-radius) - 4px);
  transition:background .15s ease, outline .15s ease;
  flex:1; display:flex; flex-direction:column; min-height:100%;
}
.presence-slot-dropzone--over { outline:2px dashed var(--presence-primary); outline-offset:4px; background:color-mix(in srgb, var(--presence-primary) 6%, transparent); }
.presence-slot-empty-hint {
  flex:1; display:flex; align-items:center; justify-content:center;
  min-height:8rem; width:100%; box-sizing:border-box;
  border:1px dashed var(--presence-border); border-radius:calc(var(--presence-radius) - 4px);
  padding:.85rem; text-align:center; color:var(--presence-muted); font-size:.78rem;
}
.presence-dynamic-wrap { min-height:2rem; }
.presence-dynamic-fallback {
  padding:1.25rem; border-radius:var(--presence-radius); border:1px dashed var(--presence-border);
  background:color-mix(in srgb, var(--presence-surface) 70%, transparent);
}
.presence-dynamic-fallback-title { font-weight:600; }
.presence-dynamic-fallback-error { margin-top:.35rem; font-size:.8rem; color:#b91c1c; }
.presence-live--drop-over {
  outline:2px solid color-mix(in srgb, var(--presence-primary) 55%, transparent);
  outline-offset:2px;
  box-shadow:0 0 0 6px color-mix(in srgb, var(--presence-primary) 12%, transparent);
}
.presence-canvas-drop-banner {
  position:sticky; top:0; z-index:12;
  padding:.45rem .75rem; text-align:center; font-size:.78rem; font-weight:650;
  color:#fff; background:var(--presence-primary);
}
.presence-empty-drop-over {
  border-color:var(--presence-primary) !important;
  background:color-mix(in srgb, var(--presence-primary) 8%, transparent);
  color:var(--presence-fg) !important;
}
.presence-drop-guide {
  position:relative; height:12px; margin:2px 0;
  display:flex; align-items:center; justify-content:center;
  transition:height .12s ease;
}
.presence-drop-guide--idle { height:0; margin:0; overflow:hidden; pointer-events:none; }
.presence-drop-guide__line {
  width:100%; height:2px; border-radius:999px;
  background:color-mix(in srgb, var(--presence-primary) 28%, transparent);
  opacity:.35; transition:opacity .12s ease, height .12s ease, background .12s ease;
}
.presence-drop-guide--active {
  height:28px; margin:4px 0;
}
.presence-drop-guide--active .presence-drop-guide__line {
  height:3px; opacity:1;
  background:var(--presence-primary);
  box-shadow:0 0 0 4px color-mix(in srgb, var(--presence-primary) 18%, transparent);
}
.presence-drop-guide__label {
  position:absolute; z-index:2;
  padding:.15rem .55rem; border-radius:999px;
  font-size:.68rem; font-weight:700; letter-spacing:.02em;
  color:#fff; background:var(--presence-primary);
  box-shadow:0 6px 16px color-mix(in srgb, var(--presence-primary) 35%, transparent);
  pointer-events:none; white-space:nowrap;
}
.presence-section-drop-target .presence-section-frame {
  box-shadow:
    0 0 0 2px var(--presence-primary),
    0 0 0 6px color-mix(in srgb, var(--presence-primary) 14%, transparent);
  background:color-mix(in srgb, var(--presence-primary) 5%, transparent);
}
.presence-section-drop-badge {
  position:absolute; top:.35rem; right:.5rem; z-index:11;
  padding:.15rem .5rem; border-radius:999px;
  font-size:.65rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:#fff; background:var(--presence-primary);
  pointer-events:none;
}
.presence-slot-dropzone--ready {
  outline:1px dashed color-mix(in srgb, var(--presence-primary) 35%, transparent);
  outline-offset:2px;
  min-height:2.5rem;
}
.presence-slot-empty-hint--over {
  border-color:var(--presence-primary);
  color:var(--presence-primary);
  background:color-mix(in srgb, var(--presence-primary) 8%, transparent);
  font-weight:650;
}
.presence-insert-add {
  position:absolute;
  left:0;
  right:0;
  /* Above section content + bridges so + Add receives clicks. */
  z-index:40;
  display:flex;
  justify-content:center;
  align-items:center;
  height:0;
  margin:0;
  opacity:0;
  /* Strip stays non-interactive; only the button accepts clicks. */
  pointer-events:none;
  transition:opacity .12s ease;
}
.presence-insert-add--before { top:0; }
.presence-insert-add--after { bottom:0; }
/* Only the hovered/selected module shows its own top/bottom Add controls. */
.presence-section-chrome:hover:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-insert-add,
.presence-section-selected:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-insert-add,
.presence-section-chrome:focus-within:not(:has(.presence-section-chrome:focus-within)) > .presence-section-frame > .presence-insert-add {
  opacity:1;
}
.presence-section-chrome:hover:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-insert-add > .presence-insert-add__btn,
.presence-section-selected:not(:has(.presence-section-chrome:hover)) > .presence-section-frame > .presence-insert-add > .presence-insert-add__btn,
.presence-section-chrome:focus-within:not(:has(.presence-section-chrome:focus-within)) > .presence-section-frame > .presence-insert-add > .presence-insert-add__btn {
  pointer-events:auto;
}
.presence-insert-add--compact { height:0; }
.presence-insert-add__btn {
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%, -50%);
  display:inline-flex;
  align-items:center;
  gap:.3rem;
  /* Larger hit area than the visible pill. */
  padding:.4rem .85rem;
  min-height:1.85rem;
  border-radius:999px;
  border:1px solid var(--presence-border);
  background:var(--presence-surface);
  color:var(--presence-muted);
  font-size:.68rem;
  font-weight:700;
  letter-spacing:.02em;
  cursor:pointer;
  box-shadow:0 4px 12px color-mix(in srgb, var(--presence-fg) 8%, transparent);
  white-space:nowrap;
  pointer-events:none;
  z-index:41;
}
.presence-insert-add__btn:hover {
  color:var(--presence-primary); border-color:color-mix(in srgb, var(--presence-primary) 45%, var(--presence-border));
  background:color-mix(in srgb, var(--presence-primary) 8%, var(--presence-surface));
}
.presence-insert-add__btn:focus-visible {
  outline:2px solid var(--presence-primary);
  outline-offset:2px;
}
.presence-slot-empty-cta {
  display:inline-flex; align-items:center; gap:.35rem;
  padding:.35rem .7rem; border-radius:999px; border:1px dashed var(--presence-border);
  background:transparent; color:inherit; font:inherit; cursor:pointer;
}
.presence-slot-empty-cta:hover {
  border-color:var(--presence-primary); color:var(--presence-primary);
  background:color-mix(in srgb, var(--presence-primary) 6%, transparent);
}
.presence-breadcrumb {
  display:flex; flex-wrap:wrap; align-items:center; gap:.15rem;
  padding:.45rem .85rem; border-bottom:1px solid var(--presence-border);
  background:color-mix(in srgb, var(--presence-surface) 92%, transparent);
}
.presence-breadcrumb__segment { display:inline-flex; align-items:center; gap:.15rem; min-width:0; }
.presence-breadcrumb__sep { width:.85rem; height:.85rem; color:var(--presence-muted); flex-shrink:0; }
.presence-breadcrumb__item {
  max-width:10rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  border:0; background:transparent; padding:.1rem .35rem; border-radius:.3rem;
  font-size:.72rem; font-weight:600; color:var(--presence-muted); cursor:pointer;
}
button.presence-breadcrumb__item:hover { color:var(--presence-fg); background:color-mix(in srgb, var(--presence-fg) 6%, transparent); }
.presence-breadcrumb__item--current { color:var(--presence-fg); cursor:default; }
.presence-inline-edit {
  outline:none; border-radius:.2rem;
  transition:box-shadow .12s ease, background .12s ease;
}
.presence-inline-edit:hover {
  box-shadow:0 0 0 2px color-mix(in srgb, var(--presence-primary) 35%, transparent);
  background:color-mix(in srgb, var(--presence-primary) 6%, transparent);
}
.presence-inline-edit--active {
  box-shadow:0 0 0 2px var(--presence-primary);
  background:color-mix(in srgb, var(--presence-primary) 8%, transparent);
  cursor:text;
}
.presence-inline-edit--placeholder { opacity:.55; font-style:italic; }

/* Layout helpers for shared extra-module HTML (typography comes from shared .eyebrow/.btn/.section-title). */
.presence-extra-module .form-card {
  width:100%; padding:1.35rem; border-radius:var(--presence-radius);
  background:var(--presence-surface); border:1px solid var(--presence-border);
}
.presence-extra-module .form-card label { display:block; font-size:.82rem; font-weight:600; margin:.75rem 0 .3rem; }
.presence-extra-module .form-card input, .presence-extra-module .form-card textarea {
  width:100%; padding:.6rem .75rem; border-radius:calc(var(--presence-radius) - 4px);
  border:1px solid color-mix(in srgb, var(--presence-border) 80%, #94a3b8);
  background:color-mix(in srgb, var(--presence-surface) 92%, var(--presence-bg));
  font:inherit; color:var(--presence-fg);
}
.presence-extra-module .form-card .btn { margin-top:1rem; width:100%; }
` + EXTRA_MODULES_LIVE_CSS;

