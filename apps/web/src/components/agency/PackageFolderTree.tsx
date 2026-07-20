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
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import {
  buildFolderTree,
  computeFolderDropRename,
  FOLDER_TREE_ROOT_ID,
  type FolderTreeNode,
} from '../../lib/quoteTemplateFolder';

type PackageFolderTreeProps = {
  folders: string[];
  selectedPath: string;
  canWrite: boolean;
  onSelect: (path: string) => void;
  /** Move via existing rename-folder API. */
  onMove: (fromFolder: string, toFolder: string) => void | Promise<void>;
  /** Optional node actions (shown when selected). */
  onRename?: (path: string) => void;
  onRemoveEmpty?: (path: string) => void;
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
  isEmptyFolder,
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
  isEmptyFolder?: (path: string) => boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${node.path}`,
    data: { path: node.path },
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
        {hasKids ? (
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
      </div>
      {hasKids && open
        ? node.children.map((child) => (
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
              isEmptyFolder={isEmptyFolder}
            />
          ))
        : null}
    </div>
  );
}

export function PackageFolderTree({
  folders,
  selectedPath,
  canWrite,
  onSelect,
  onMove,
  onRename,
  onRemoveEmpty,
  isEmptyFolder,
  footer,
}: PackageFolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
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

  const onDragEnd = (event: DragEndEvent) => {
    if (!canWrite) return;
    const fromPath = String(
      (event.active.data.current as { path?: string } | undefined)?.path || '',
    );
    const overId = event.over?.id != null ? String(event.over.id) : '';
    if (!fromPath || !overId) return;
    const dropOnFolder =
      overId === FOLDER_TREE_ROOT_ID
        ? ''
        : overId.startsWith('folder:')
          ? overId.slice('folder:'.length)
          : '';
    if (overId !== FOLDER_TREE_ROOT_ID && !overId.startsWith('folder:')) return;
    const payload = computeFolderDropRename({
      fromFolder: fromPath,
      dropOnFolder,
    });
    if (!payload) return;
    void onMove(payload.fromFolder, payload.toFolder);
  };

  if (!tree.length) {
    return footer ? <div className="space-y-1">{footer}</div> : null;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <DroppableRoot
        selected={!selectedPath.trim()}
        onSelect={() => onSelect('')}
      >
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
            isEmptyFolder={isEmptyFolder}
          />
        ))}
      </DroppableRoot>
      {footer}
    </DndContext>
  );
}
