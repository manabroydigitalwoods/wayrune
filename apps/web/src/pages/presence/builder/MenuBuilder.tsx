import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Outdent,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { BrandTooltip, Button, Combobox, Input, Label, Switch, cn } from '@wayrune/ui';
import { PageLinkField } from './PageLinkField';
import { MenuIconPicker } from './MenuIconPicker';
import { PresenceMenuIcon } from './PresenceMenuIcon';
import {
  DEFAULT_MENU_LOCATIONS,
  menuKeySlug,
  resolveSiteMenus,
  type PresenceMenu,
  type PresenceMenuAssignments,
  type PresenceMenuItem,
  type PresenceMenusJson,
} from './menus';

type MenuLocation = { key: string; label: string; description?: string };

function newItemId(): string {
  return `mi_${Math.random().toString(36).slice(2, 10)}`;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  return arrayMove(list, from, to);
}

function blankLabel(label: string | undefined) {
  const t = (label || '').trim();
  return !t || t === 'New link' || t === 'Child link';
}

function itemSummary(item: PresenceMenuItem) {
  const label = item.label?.trim() || 'Untitled';
  const path = item.path?.trim() || '/';
  const childCount = item.children?.length ?? 0;
  return { label, path, childCount };
}

function menuSortableId(id: string) {
  return `menu-item:${id}`;
}

function parseMenuSortableId(id: string | number): string | null {
  const raw = String(id);
  return raw.startsWith('menu-item:') ? raw.slice('menu-item:'.length) : null;
}

function SortableMenuRow({
  item,
  index,
  total,
  expanded,
  readOnly,
  dropIndicator,
  onToggleExpand,
  onMove,
  onNest,
  onRemove,
  children,
}: {
  item: PresenceMenuItem;
  index: number;
  total: number;
  expanded: boolean;
  readOnly: boolean;
  dropIndicator: 'before' | 'after' | null;
  onToggleExpand: () => void;
  onMove: (from: number, to: number) => void;
  onNest: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const summary = itemSummary(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: menuSortableId(item.id),
      disabled: readOnly,
      data: { kind: 'menu-item', itemId: item.id, index },
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'relative rounded-lg border bg-background transition-shadow',
        isDragging && 'z-20 opacity-40 shadow-md ring-1 ring-primary/25',
        isOver && !isDragging && 'border-primary/40',
      )}
    >
      {dropIndicator === 'before' ? (
        <div
          className="pointer-events-none absolute inset-x-2 top-0 z-30 h-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
          aria-hidden
        />
      ) : null}
      {dropIndicator === 'after' ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-0 z-30 h-0.5 translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
          aria-hidden
        />
      ) : null}

      <div className="flex items-center gap-0.5 px-1 py-1 sm:px-1.5">
        {!readOnly ? (
          <BrandTooltip label="Drag to reorder" side="left">
            <button
              type="button"
              className={cn(
                'inline-flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground',
                'hover:bg-muted hover:text-foreground active:cursor-grabbing',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              )}
              aria-label={`Drag to reorder ${summary.label}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          </BrandTooltip>
        ) : (
          <div className="w-2 shrink-0" />
        )}

        <button
          type="button"
          className="min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/50"
          onClick={onToggleExpand}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {item.icon ? (
              <PresenceMenuIcon icon={item.icon} className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{summary.label}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {summary.path}
                {summary.childCount ? ` · ${summary.childCount} submenu` : ''}
              </div>
            </div>
          </div>
        </button>

        {!readOnly ? (
          <div className="flex shrink-0 items-center">
            <BrandTooltip label="Move up">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
                aria-label="Move up"
              >
                <ChevronUp className="size-3.5" />
              </Button>
            </BrandTooltip>
            <BrandTooltip label="Move down">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={index >= total - 1}
                onClick={() => onMove(index, index + 1)}
                aria-label="Move down"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </BrandTooltip>
            {index > 0 && !summary.childCount ? (
              <BrandTooltip label="Nest under previous">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={onNest}
                  aria-label="Nest under previous"
                >
                  <CornerDownRight className="size-3.5" />
                </Button>
              </BrandTooltip>
            ) : null}
            <BrandTooltip label={expanded ? 'Collapse' : 'Edit'}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={onToggleExpand}
                aria-label={expanded ? 'Collapse' : 'Edit'}
              >
                <Pencil className="size-3.5" />
              </Button>
            </BrandTooltip>
            <BrandTooltip label="Remove link">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${summary.label}`}
                onClick={onRemove}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </BrandTooltip>
          </div>
        ) : (
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onToggleExpand}>
            <Pencil className="size-3.5" />
          </Button>
        )}
      </div>

      {expanded ? children : null}
    </div>
  );
}

function MenuDragPreview({ item }: { item: PresenceMenuItem }) {
  const summary = itemSummary(item);
  return (
    <div className="flex w-[min(18rem,80vw)] items-center gap-2 rounded-lg border border-primary/40 bg-background px-2.5 py-2 shadow-lg ring-1 ring-primary/15">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{summary.label}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{summary.path}</div>
      </div>
    </div>
  );
}

export function MenuBuilder({
  menusJson,
  menuAssignmentsJson,
  navigationJson,
  readOnly,
  siteId,
  locations,
  focusMenuKey,
  compact,
  onChange,
}: {
  menusJson?: unknown;
  menuAssignmentsJson?: unknown;
  navigationJson?: unknown;
  readOnly: boolean;
  siteId: string;
  locations?: MenuLocation[];
  focusMenuKey?: string;
  compact?: boolean;
  onChange: (next: {
    menusJson: PresenceMenusJson;
    menuAssignmentsJson: PresenceMenuAssignments;
    navigationJson: Array<{ label: string; path: string }>;
  }) => void;
}) {
  const resolved = useMemo(
    () =>
      resolveSiteMenus({
        menusJson,
        menuAssignmentsJson,
        navigationJson,
      }),
    [menusJson, menuAssignmentsJson, navigationJson],
  );

  const menuKeys = Object.keys(resolved.menusJson);
  const [selectedKey, setSelectedKey] = useState(
    () => focusMenuKey || (menuKeys.includes('primary') ? 'primary' : menuKeys[0] || 'primary'),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [newMenuName, setNewMenuName] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid stealing clicks from edit / expand buttons.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const locationList = locations?.length
    ? locations
    : DEFAULT_MENU_LOCATIONS.map((row) => ({ ...row }));

  const selected: PresenceMenu =
    resolved.menusJson[selectedKey] ||
    resolved.menusJson.primary || {
      id: selectedKey,
      name: selectedKey,
      items: [],
    };

  const sortableIds = selected.items.map((item) => menuSortableId(item.id));
  const activeItem = activeId
    ? selected.items.find((item) => item.id === activeId) || null
    : null;

  const emit = (
    menus: PresenceMenusJson,
    assignments: PresenceMenuAssignments = resolved.menuAssignmentsJson,
  ) => {
    const next = resolveSiteMenus({
      menusJson: menus,
      menuAssignmentsJson: assignments,
      navigationJson: resolved.navigationJson,
    });
    onChange(next);
  };

  const patchSelectedItems = (items: PresenceMenuItem[]) => {
    emit({
      ...resolved.menusJson,
      [selectedKey]: { ...selected, items },
    });
  };

  const updateItem = (index: number, patch: Partial<PresenceMenuItem>) => {
    patchSelectedItems(
      selected.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        if ('icon' in patch && !patch.icon) {
          const { icon: _removed, ...rest } = next;
          return rest;
        }
        return next;
      }),
    );
  };

  const updateChild = (
    parentIndex: number,
    childIndex: number,
    patch: Partial<PresenceMenuItem>,
  ) => {
    patchSelectedItems(
      selected.items.map((item, i) => {
        if (i !== parentIndex) return item;
        const children = [...(item.children || [])];
        const merged = { ...children[childIndex]!, ...patch };
        if ('icon' in patch && !patch.icon) {
          const { icon: _removed, ...rest } = merged;
          children[childIndex] = rest;
        } else {
          children[childIndex] = merged;
        }
        return { ...item, children };
      }),
    );
  };

  const nestAsChild = (index: number) => {
    if (index <= 0) return;
    const items = [...selected.items];
    const child = items[index]!;
    const parent = items[index - 1]!;
    if (child.children?.length) return;
    items.splice(index, 1);
    items[index - 1] = {
      ...parent,
      children: [...(parent.children || []), { ...child, children: undefined }],
    };
    patchSelectedItems(items);
    setExpandedId(items[index - 1]!.id);
  };

  const unnestChild = (parentIndex: number, childIndex: number) => {
    const items = [...selected.items];
    const parent = items[parentIndex]!;
    const children = [...(parent.children || [])];
    const [child] = children.splice(childIndex, 1);
    items[parentIndex] = {
      ...parent,
      children: children.length ? children : undefined,
    };
    items.splice(parentIndex + 1, 0, child!);
    patchSelectedItems(items);
    setExpandedId(child!.id);
  };

  const addLink = () => {
    const id = newItemId();
    patchSelectedItems([
      ...selected.items,
      { id, label: 'New link', path: '/', type: 'custom' },
    ]);
    setExpandedId(id);
  };

  const createMenu = () => {
    const name = newMenuName.trim();
    if (!name) return;
    let key = menuKeySlug(name);
    if (resolved.menusJson[key]) key = `${key}_${Date.now().toString(36).slice(-3)}`;
    emit({
      ...resolved.menusJson,
      [key]: { id: key, name, items: [] },
    });
    setSelectedKey(key);
    setNewMenuName('');
    setShowNewMenu(false);
    setExpandedId(null);
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = parseMenuSortableId(event.active.id);
    if (!id) return;
    setActiveId(id);
    setOverId(id);
    setExpandedId(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const id = event.over ? parseMenuSortableId(event.over.id) : null;
    setOverId(id);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const fromId = parseMenuSortableId(event.active.id);
    const toId = event.over ? parseMenuSortableId(event.over.id) : null;
    setActiveId(null);
    setOverId(null);
    if (!fromId || !toId || fromId === toId) return;
    const from = selected.items.findIndex((item) => item.id === fromId);
    const to = selected.items.findIndex((item) => item.id === toId);
    if (from < 0 || to < 0) return;
    patchSelectedItems(moveItem(selected.items, from, to));
  };

  const onDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  const dropIndicatorFor = (itemId: string): 'before' | 'after' | null => {
    if (!activeId || !overId || activeId === itemId || overId !== itemId) return null;
    const from = selected.items.findIndex((item) => item.id === activeId);
    const to = selected.items.findIndex((item) => item.id === itemId);
    if (from < 0 || to < 0) return null;
    return from < to ? 'after' : 'before';
  };

  const list = (
    <div className="space-y-1.5">
      {selected.items.map((item, index) => {
        const expanded = expandedId === item.id;
        return (
          <SortableMenuRow
            key={item.id}
            item={item}
            index={index}
            total={selected.items.length}
            expanded={expanded}
            readOnly={readOnly}
            dropIndicator={dropIndicatorFor(item.id)}
            onToggleExpand={() => setExpandedId(expanded ? null : item.id)}
            onMove={(from, to) => patchSelectedItems(moveItem(selected.items, from, to))}
            onNest={() => nestAsChild(index)}
            onRemove={() => {
              patchSelectedItems(selected.items.filter((_, i) => i !== index));
              if (expandedId === item.id) setExpandedId(null);
            }}
          >
            <div className="space-y-3 border-t border-border/60 px-3 py-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Label</Label>
                <Input
                  className="mt-1 h-8"
                  placeholder="Link label"
                  value={item.label}
                  disabled={readOnly}
                  onChange={(e) => updateItem(index, { label: e.target.value })}
                />
              </div>

              <PageLinkField
                label="Destination"
                dense
                siteId={siteId}
                disabled={readOnly}
                value={item.path}
                placeholder="/"
                onPagePicked={(page) => {
                  updateItem(index, {
                    path: page.path,
                    type: 'page',
                    ...(blankLabel(item.label) ? { label: page.title } : {}),
                  });
                }}
                onChange={(path) =>
                  updateItem(index, {
                    path,
                    type: path.startsWith('/') && !/^https?:/i.test(path) ? 'page' : 'custom',
                  })
                }
              />

              <MenuIconPicker
                value={item.icon}
                disabled={readOnly}
                onChange={(icon) => updateItem(index, { icon })}
              />

              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] text-muted-foreground">Open in new tab</Label>
                <Switch
                  checked={item.openInNewTab === true}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    updateItem(index, { openInNewTab: checked || undefined })
                  }
                />
              </div>

              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/15 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Submenu
                </div>
                {(item.children || []).map((child, childIndex) => {
                  const childSummary = itemSummary(child);
                  return (
                    <div
                      key={child.id}
                      className="rounded-md border border-border/50 bg-background px-2 py-1.5"
                    >
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{childSummary.label}</div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {childSummary.path}
                          </div>
                        </div>
                        {!readOnly ? (
                          <>
                            <BrandTooltip label="Move to top level">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                aria-label="Move to top level"
                                onClick={() => unnestChild(index, childIndex)}
                              >
                                <Outdent className="size-3.5" />
                              </Button>
                            </BrandTooltip>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                const children = (item.children || []).filter(
                                  (_, i) => i !== childIndex,
                                );
                                updateItem(index, {
                                  children: children.length ? children : undefined,
                                });
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                        <Input
                          className="h-8"
                          placeholder="Child label"
                          value={child.label}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateChild(index, childIndex, { label: e.target.value })
                          }
                        />
                        <PageLinkField
                          dense
                          siteId={siteId}
                          disabled={readOnly}
                          value={child.path}
                          placeholder="/"
                          onPagePicked={(page) => {
                            updateChild(index, childIndex, {
                              path: page.path,
                              type: 'page',
                              ...(blankLabel(child.label) ? { label: page.title } : {}),
                            });
                          }}
                          onChange={(path) =>
                            updateChild(index, childIndex, {
                              path,
                              type:
                                path.startsWith('/') && !/^https?:/i.test(path)
                                  ? 'page'
                                  : 'custom',
                            })
                          }
                        />
                        <MenuIconPicker
                          value={child.icon}
                          disabled={readOnly}
                          onChange={(icon) => updateChild(index, childIndex, { icon })}
                        />
                      </div>
                    </div>
                  );
                })}
                {!readOnly ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full justify-start text-[11px] text-muted-foreground"
                    onClick={() =>
                      updateItem(index, {
                        children: [
                          ...(item.children || []),
                          { id: newItemId(), label: 'Child link', path: '/', type: 'custom' },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 size-3" />
                    Add submenu link
                  </Button>
                ) : null}
              </div>
            </div>
          </SortableMenuRow>
        );
      })}

      {!selected.items.length ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No links in this menu yet.</p>
          {!readOnly ? (
            <Button type="button" size="sm" className="mt-3 h-8" onClick={addLink}>
              <Plus className="mr-1 size-3.5" />
              Add first link
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {!compact ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {menuKeys.map((key) => {
              const active = selectedKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(key);
                    setExpandedId(null);
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {resolved.menusJson[key]?.name || key}
                </button>
              );
            })}
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setShowNewMenu((v) => !v)}
              >
                <Plus className="mr-1 size-3.5" />
                Menu
              </Button>
            ) : null}
          </div>

          {showNewMenu && !readOnly ? (
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder="New menu name"
                value={newMenuName}
                onChange={(e) => setNewMenuName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createMenu();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0"
                disabled={!newMenuName.trim()}
                onClick={createMenu}
              >
                Create
              </Button>
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Where this menu appears
            </div>
            <div className="space-y-2">
              {locationList.map((loc) => (
                <div key={loc.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">{loc.label}</div>
                    {loc.description ? (
                      <div className="text-[11px] text-muted-foreground">{loc.description}</div>
                    ) : null}
                  </div>
                  <Combobox
                    className="h-8 w-[10rem] shrink-0"
                    disabled={readOnly}
                    value={resolved.menuAssignmentsJson[loc.key] || ''}
                    onChange={(value) => {
                      const next = { ...resolved.menuAssignmentsJson };
                      if (value) next[loc.key] = value;
                      else delete next[loc.key];
                      emit(resolved.menusJson, next);
                    }}
                    options={[
                      { value: '', label: '— None —' },
                      ...menuKeys.map((key) => ({
                        value: key,
                        label: resolved.menusJson[key]?.name || key,
                      })),
                    ]}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{selected.name}</div>
          <p className="text-[11px] text-muted-foreground">
            {selected.items.length
              ? `${selected.items.length} link${selected.items.length === 1 ? '' : 's'} · drag handle to reorder`
              : 'No links yet'}
          </p>
        </div>
        <Button type="button" size="sm" className="h-8" disabled={readOnly} onClick={addLink}>
          <Plus className="mr-1 size-3.5" />
          Add link
        </Button>
      </div>

      {readOnly ? (
        list
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 160, easing: 'ease' }}>
            {activeItem ? <MenuDragPreview item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
