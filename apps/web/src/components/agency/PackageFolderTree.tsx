import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, ChevronUp, FileText, Folder } from 'lucide-react';
import {
  buildFolderTree,
  computeFolderDropRename,
  computeTemplateDropFolder,
  FOLDER_TREE_ROOT_ID,
  moveSiblingId,
  templatesExactInFolder,
  type FolderTreeNode,
  type PackageTreeTemplate,
} from '../../lib/quoteTemplateFolder';

type PackageFolderTreeProps = {
  folders: string[];
  selectedPath: string;
  canWrite: boolean;
  onSelect: (path: string) => void;
  /** Move folder via existing rename-folder API. */
  onMove: (fromFolder: string, toFolder: string) => void | Promise<void>;
  /** Optional packages shown under matching folders (drag onto folder/root). */
  templates?: PackageTreeTemplate[];
  /** Saved sibling order from org settings (folder → ids). */
  siblingOrder?: Record<string, string[]>;
  onMoveTemplate?: (
    templateId: string,
    folder: string | null,
  ) => void | Promise<void>;
  /** Persist new sibling order under a folder. */
  onReorderTemplates?: (
    folder: string | null,
    orderedIds: string[],
  ) => void | Promise<void>;
  /** Optional node actions (shown when selected). */
  onRename?: (path: string) => void;
  onRemoveEmpty?: (path: string) => void;
  /** Soft-delete packages under folder + drop path from index. */
  onCascadeDelete?: (path: string) => void;
  isEmptyFolder?: (path: string) => boolean;
  footer?: ReactNode;
};

function DroppableRoot({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: FOLDER_TREE_ROOT_ID });
  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? 'rounded border border-primary/40 bg-primary/5 p-1'
          : 'rounded border border-transparent p-1'
      }
    >
      <button
        type="button"
        className={
          selected
            ? 'mb-0.5 w-full rounded bg-muted px-1.5 py-0.5 text-left text-[10px] font-medium text-foreground'
            : 'mb-0.5 w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:bg-muted/80'
        }
        onClick={onSelect}
      >
        All folders
      </button>
      {children}
    </div>
  );
}

function TemplateTreeRow({
  template,
  depth,
  canWrite,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  template: PackageTreeTemplate;
  depth: number;
  canWrite: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `template:${template.id}`,
    data: {
      kind: 'template' as const,
      templateId: template.id,
      folder: template.folder ?? null,
    },
    disabled: !canWrite,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex items-center gap-1 rounded py-0.5 pr-1 text-[10px] text-muted-foreground',
        isDragging ? 'opacity-40' : 'hover:bg-muted/60',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: `${16 + depth * 12}px` }}
    >
      <span
        className={[
          'flex min-w-0 flex-1 items-center gap-1',
          canWrite ? 'cursor-grab active:cursor-grabbing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...(canWrite ? { ...listeners, ...attributes } : {})}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium text-foreground/80">
          {template.name}
        </span>
      </span>
      {canWrite && onMoveUp && onMoveDown ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
            disabled={!canMoveUp}
            aria-label={`Move ${template.name} up`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
            disabled={!canMoveDown}
            aria-label={`Move ${template.name} down`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </span>
      ) : null}
    </div>
  );
}

function FolderTreeRow({
  node,
  depth,
  selectedPath,
  canWrite,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onRemoveEmpty,
  onCascadeDelete,
  isEmptyFolder,
  templates,
  siblingOrder,
  onReorderTemplates,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedPath: string;
  canWrite: boolean;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRename?: (path: string) => void;
  onRemoveEmpty?: (path: string) => void;
  onCascadeDelete?: (path: string) => void;
  isEmptyFolder?: (path: string) => boolean;
  templates: PackageTreeTemplate[];
  siblingOrder?: Record<string, string[]>;
  onReorderTemplates?: (
    folder: string | null,
    orderedIds: string[],
  ) => void | Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${node.path}`,
    data: { kind: 'folder' as const, path: node.path },
    disabled: !canWrite,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder:${node.path}`,
    data: { path: node.path },
  });
  const setNodeRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const selected =
    selectedPath.trim().toLowerCase() === node.path.toLowerCase();
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.path.toLowerCase());
  const empty = isEmptyFolder?.(node.path) ?? false;
  const inFolder = templatesExactInFolder(templates, node.path, siblingOrder);
  const showBody = hasKids || inFolder.length > 0;

  const reorder = (templateId: string, direction: 'up' | 'down') => {
    if (!onReorderTemplates) return;
    const next = moveSiblingId({
      orderedIds: inFolder.map((t) => t.id),
      templateId,
      direction,
    });
    if (!next) return;
    void onReorderTemplates(node.path, next);
  };

  return (
    <div>
      <div
        ref={setNodeRef}
        className={[
          'flex items-center gap-0.5 rounded py-0.5 pr-1 text-[10px]',
          isDragging ? 'opacity-40' : '',
          isOver ? 'bg-primary/15 ring-1 ring-primary/30' : '',
          selected ? 'bg-primary/10' : 'hover:bg-muted/60',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `${4 + depth * 12}px` }}
      >
        {showBody ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={() => onToggle(node.path)}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}
        <button
          type="button"
          className={[
            'flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 text-left font-medium',
            selected ? 'text-primary' : 'text-foreground',
            canWrite ? 'cursor-grab active:cursor-grabbing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelect(node.path)}
          {...(canWrite ? { ...listeners, ...attributes } : {})}
        >
          <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.label}</span>
        </button>
        {selected && canWrite && onRename ? (
          <button
            type="button"
            className="shrink-0 rounded border border-border/60 px-1 py-px text-muted-foreground hover:bg-muted"
            onClick={() => onRename(node.path)}
          >
            Rename
          </button>
        ) : null}
        {selected && canWrite && empty && onRemoveEmpty ? (
          <button
            type="button"
            className="shrink-0 rounded border border-border/60 px-1 py-px text-muted-foreground hover:bg-muted"
            onClick={() => onRemoveEmpty(node.path)}
          >
            Remove
          </button>
        ) : null}
        {selected && canWrite && !empty && onCascadeDelete ? (
          <button
            type="button"
            className="shrink-0 rounded border border-border/60 px-1 py-px text-destructive/80 hover:bg-muted"
            onClick={() => onCascadeDelete(node.path)}
          >
            Delete…
          </button>
        ) : null}
      </div>
      {showBody && open ? (
        <>
          {inFolder.map((t, idx) => (
            <TemplateTreeRow
              key={t.id}
              template={t}
              depth={depth + 1}
              canWrite={canWrite}
              canMoveUp={idx > 0}
              canMoveDown={idx < inFolder.length - 1}
              onMoveUp={
                onReorderTemplates ? () => reorder(t.id, 'up') : undefined
              }
              onMoveDown={
                onReorderTemplates ? () => reorder(t.id, 'down') : undefined
              }
            />
          ))}
          {node.children.map((child) => (
            <FolderTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              canWrite={canWrite}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onRename={onRename}
              onRemoveEmpty={onRemoveEmpty}
              onCascadeDelete={onCascadeDelete}
              isEmptyFolder={isEmptyFolder}
              templates={templates}
              siblingOrder={siblingOrder}
              onReorderTemplates={onReorderTemplates}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function PackageFolderTree({
  folders,
  selectedPath,
  canWrite,
  onSelect,
  onMove,
  templates = [],
  siblingOrder,
  onMoveTemplate,
  onReorderTemplates,
  onRename,
  onRemoveEmpty,
  onCascadeDelete,
  isEmptyFolder,
  footer,
}: PackageFolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const rootTemplates = useMemo(
    () => templatesExactInFolder(templates, '', siblingOrder),
    [templates, siblingOrder],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const toggle = (path: string) => {
    const key = path.toLowerCase();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reorderRoot = (templateId: string, direction: 'up' | 'down') => {
    if (!onReorderTemplates) return;
    const next = moveSiblingId({
      orderedIds: rootTemplates.map((t) => t.id),
      templateId,
      direction,
    });
    if (!next) return;
    void onReorderTemplates(null, next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!canWrite) return;
    const overId = event.over?.id != null ? String(event.over.id) : '';
    if (!overId) return;
    if (overId !== FOLDER_TREE_ROOT_ID && !overId.startsWith('folder:')) return;
    const dropOnFolder =
      overId === FOLDER_TREE_ROOT_ID
        ? ''
        : overId.slice('folder:'.length);

    const data = event.active.data.current as
      | { kind?: string; path?: string; templateId?: string; folder?: string | null }
      | undefined;
    if (data?.kind === 'template' && data.templateId && onMoveTemplate) {
      const next = computeTemplateDropFolder({
        currentFolder: data.folder,
        dropOnFolder,
      });
      if (next === undefined) return;
      void onMoveTemplate(data.templateId, next);
      return;
    }

    const fromPath = String(data?.path || '');
    if (!fromPath) return;
    const payload = computeFolderDropRename({
      fromFolder: fromPath,
      dropOnFolder,
    });
    if (!payload) return;
    void onMove(payload.fromFolder, payload.toFolder);
  };

  if (!tree.length && !rootTemplates.length) {
    return footer ? <div className="space-y-1">{footer}</div> : null;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <DroppableRoot
        selected={!selectedPath.trim()}
        onSelect={() => onSelect('')}
      >
        {rootTemplates.map((t, idx) => (
          <TemplateTreeRow
            key={t.id}
            template={t}
            depth={0}
            canWrite={canWrite}
            canMoveUp={idx > 0}
            canMoveDown={idx < rootTemplates.length - 1}
            onMoveUp={
              onReorderTemplates ? () => reorderRoot(t.id, 'up') : undefined
            }
            onMoveDown={
              onReorderTemplates ? () => reorderRoot(t.id, 'down') : undefined
            }
          />
        ))}
        {tree.map((node) => (
          <FolderTreeRow
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            canWrite={canWrite}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelect}
            onRename={onRename}
            onRemoveEmpty={onRemoveEmpty}
            onCascadeDelete={onCascadeDelete}
            isEmptyFolder={isEmptyFolder}
            templates={templates}
            siblingOrder={siblingOrder}
            onReorderTemplates={onReorderTemplates}
          />
        ))}
      </DroppableRoot>
      {footer}
    </DndContext>
  );
}
