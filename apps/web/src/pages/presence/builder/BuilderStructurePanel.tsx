import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownRight, GripVertical, Lock, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { EmptyState, cn } from '@wayrune/ui';
import { childrenOf, isLayoutModule, layoutSlotKeysForSection, rootSections, structureSortableId } from './helpers';
import { HEADER_REGION_ID, FOOTER_REGION_ID, ANNOUNCEMENT_REGION_ID, COOKIE_REGION_ID, STICKY_CTA_REGION_ID } from './types';
import type { ModuleDef, Section } from './types';

function SortableSectionRow({
  section,
  label,
  depth,
  slotBadge,
  selected,
  onSelect,
  canWrite,
}: {
  section: Section;
  label: string;
  depth: number;
  slotBadge?: string | null;
  selected: boolean;
  onSelect: () => void;
  canWrite: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: structureSortableId(section.clientId),
    data: {
      kind: 'section',
      clientId: section.clientId,
      parentId: section.parentId ?? null,
      slotKey: section.slotKey ?? null,
      surface: 'structure',
    },
    disabled: !canWrite,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: depth * 14,
      }}
      className={cn(
        'flex items-stretch gap-0.5 rounded border',
        selected ? 'border-primary bg-primary/5' : 'border-border',
        isDragging ? 'opacity-70 shadow-sm' : '',
      )}
    >
      {depth > 0 ? (
        <div className="flex shrink-0 items-center pl-1 text-muted-foreground/50">
          <CornerDownRight className="size-3" />
        </div>
      ) : null}
      {canWrite ? (
        <button
          type="button"
          className="flex shrink-0 cursor-grab items-center px-1 text-muted-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      ) : (
        <div className="w-2" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 px-1.5 py-1.5 text-left"
        onClick={onSelect}
      >
        <div className="truncate text-sm font-medium leading-tight">{label}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {section.type}
          {slotBadge ? ` · ${slotBadge}` : ''}
        </div>
      </button>
    </div>
  );
}

function LockedRegionRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 rounded border border-dashed px-2 py-1.5 text-left text-muted-foreground transition',
        selected ? 'border-primary bg-primary/5 text-foreground' : 'hover:border-foreground/30',
      )}
    >
      <Lock className="size-3 shrink-0" />
      <div className="min-w-0">
        <div className={cn('text-xs font-medium', selected ? 'text-foreground' : 'text-foreground/80')}>{label}</div>
        <div className="truncate text-[10px]">{hint}</div>
      </div>
    </button>
  );
}

function flattenTree(sections: Section[]): Section[] {
  const out: Section[] = [];
  const visit = (parentClientId: string | null) => {
    const group = sections.filter((section) => (section.parentId || null) === parentClientId);
    for (const section of group) {
      out.push(section);
      if (isLayoutModule(section.type)) visit(section.clientId);
    }
  };
  visit(null);
  return out;
}

export function BuilderStructurePanel({
  sections,
  modules,
  selectedClientId,
  onSelect,
  onSelectChrome,
  onAddInside,
  onReorder,
  siteName,
  canWrite = true,
}: {
  sections: Section[];
  modules: ModuleDef[];
  selectedClientId: string | null;
  onSelect: (clientId: string | null) => void;
  onSelectChrome?: (region: 'header' | 'footer' | 'announcement' | 'cookie' | 'sticky_cta') => void;
  onAddInside?: (parentClientId: string, slotKey: string | null) => void;
  onReorder: (sections: Section[]) => void;
  siteName?: string;
  canWrite?: boolean;
}) {
  const labelFor = (section: Section) =>
    modules.find((module) => module.id === section.moduleDefinitionId)?.name ||
    modules.find((module) => module.rendererKey === section.type)?.name ||
    section.type;

  // Keep onReorder available for parent DnD; structure rows share SortableContext with canvas.
  void onReorder;

  const roots = rootSections(sections);
  const orderedForSort = flattenTree(sections).map((section) => structureSortableId(section.clientId));

  const renderNode = (section: Section, depth: number): ReactElement => {
    const isLayout = isLayoutModule(section.type);
    const slots = isLayout ? layoutSlotKeysForSection(section) : [];
    const isSlotted = slots.length > 0 && !(slots.length === 1 && slots[0] == null);
    const plainChildren = isLayout && !isSlotted ? childrenOf(sections, section.clientId) : [];
    const slottedChildren = isSlotted
      ? slots.flatMap((slot) => childrenOf(sections, section.clientId, slot))
      : [];

    return (
      <div key={section.clientId} className="space-y-1">
        <SortableSectionRow
          section={section}
          label={labelFor(section)}
          depth={depth}
          slotBadge={section.slotKey}
          selected={selectedClientId === section.clientId}
          canWrite={canWrite}
          onSelect={() => onSelect(section.clientId)}
        />
        {isLayout && canWrite && onAddInside ? (
          <div className="flex flex-wrap gap-1" style={{ marginLeft: (depth + 1) * 14 + 18 }}>
            {isSlotted ? (
              slots.map((slot, index) => (
                <button
                  key={String(slot)}
                  type="button"
                  className="flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  onClick={() => onAddInside(section.clientId, slot)}
                >
                  <Plus className="size-2.5" />
                  {slot === 'left' || slot === 'right'
                    ? slot[0]!.toUpperCase() + slot.slice(1)
                    : `Col ${index + 1}`}
                </button>
              ))
            ) : (
              <button
                type="button"
                className="flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                onClick={() => onAddInside(section.clientId, null)}
              >
                <Plus className="size-2.5" />
                Add inside
              </button>
            )}
          </div>
        ) : null}
        {isSlotted
          ? slottedChildren.map((child) => renderNode(child, depth + 1))
          : plainChildren.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-3 py-2">
        <div className="text-sm font-medium">Layers</div>
        <div className="text-[10px] text-muted-foreground">Global chrome · Page sections</div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Global
        </div>
        <LockedRegionRow
          label="Announcement"
          hint="Site-wide banner"
          selected={selectedClientId === ANNOUNCEMENT_REGION_ID}
          onSelect={() => onSelectChrome?.('announcement')}
        />
        <LockedRegionRow
          label="Header"
          hint={siteName ? `${siteName} · nav` : 'Shared navigation'}
          selected={selectedClientId === HEADER_REGION_ID}
          onSelect={() => onSelectChrome?.('header')}
        />
        <LockedRegionRow
          label="Footer"
          hint="Shared footer"
          selected={selectedClientId === FOOTER_REGION_ID}
          onSelect={() => onSelectChrome?.('footer')}
        />
        <LockedRegionRow
          label="Cookie banner"
          hint="Consent notice"
          selected={selectedClientId === COOKIE_REGION_ID}
          onSelect={() => onSelectChrome?.('cookie')}
        />
        <LockedRegionRow
          label="Sticky CTA"
          hint="Floating button"
          selected={selectedClientId === STICKY_CTA_REGION_ID}
          onSelect={() => onSelectChrome?.('sticky_cta')}
        />
        <div className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Page
        </div>
        <div className="px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Main
        </div>
        {!sections.length ? (
          <EmptyState
            title="No modules yet"
            description="Add a module from the library to start composing this page."
          />
        ) : (
          <SortableContext items={orderedForSort} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">{roots.map((section) => renderNode(section, 0))}</div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

export function reorderSectionsByIds(
  sections: Section[],
  activeId: string,
  overId: string,
): Section[] | null {
  const oldIndex = sections.findIndex((section) => section.clientId === activeId);
  const newIndex = sections.findIndex((section) => section.clientId === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;
  return arrayMove(sections, oldIndex, newIndex).map((section, index) => ({
    ...section,
    position: index,
  }));
}
