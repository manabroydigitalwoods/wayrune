import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type Header,
  type OnChangeFn,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Pagination } from './ui/pagination';
import { Skeleton } from './ui/skeleton';
import { EmptyState } from './empty-state';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Combobox } from './ui/combobox';
import { LegacyStorageKeys, localStorageKit } from '../storage';

export type DataTableFacet = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/** Page index (0-based) for a row id in pre-pagination order. */
export function dataTablePageIndexForRowId(
  rowIds: string[],
  targetId: string | null | undefined,
  pageSize: number,
): number | null {
  if (!targetId?.trim() || pageSize <= 0) return null;
  const idx = rowIds.indexOf(targetId);
  if (idx < 0) return null;
  return Math.floor(idx / pageSize);
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  facets,
  facetValues,
  onFacetChange,
  onClear,
  leading,
  trailing,
  showSearch = true,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  facets?: DataTableFacet[];
  facetValues?: Record<string, string>;
  onFacetChange?: (id: string, value: string) => void;
  onClear?: () => void;
  /** Controls rendered before the search field (e.g. record pickers). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** When false, omit the search field (parent owns URL `q=` search). */
  showSearch?: boolean;
  className?: string;
}) {
  const active = Object.entries(facetValues ?? {}).filter(([, v]) => v && v !== 'all');
  return (
    <div className={cn('mb-[var(--gap-page)] space-y-[var(--field-gap)]', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {leading ? (
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">{leading}</div>
        ) : null}
        {showSearch ? (
          <div className="relative min-w-[10rem] flex-1 basis-[12rem]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label="Search"
            />
          </div>
        ) : null}
        {facets?.map((facet) => (
          <Combobox
            key={facet.id}
            className="w-full sm:w-[12rem]"
            value={facetValues?.[facet.id] ?? 'all'}
            onChange={(value) => onFacetChange?.(facet.id, value)}
            placeholder={facet.label}
            searchPlaceholder={`Search ${facet.label.toLowerCase()}…`}
            options={[
              { value: 'all', label: `${facet.label}: All` },
              ...facet.options,
            ]}
          />
        ))}
        {(search || active.length > 0) && onClear && showSearch ? (
            <Button type="button" variant="ghost" size="sm" className="px-2.5" onClick={onClear}>
            <X className="mr-1.5 size-4" />
            Clear
          </Button>
        ) : null}
        {trailing ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{trailing}</div> : null}
      </div>
      {active.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {active.map(([id, value]) => {
            const facet = facets?.find((f) => f.id === id);
            const label = facet?.options.find((o) => o.value === value)?.label ?? value;
            return (
              <Badge key={id} variant="secondary" className="gap-1 bg-primary-50 text-primary-800">
                {facet?.label}: {label}
                <button
                  type="button"
                  className="ml-1"
                  onClick={() => onFacetChange?.(id, 'all')}
                  aria-label={`Remove ${facet?.label}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function columnLabel<TData>(column: Column<TData, unknown>) {
  const meta = column.columnDef.meta as { label?: string } | undefined;
  if (meta?.label) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === 'string') return header;
  return column.id;
}

function columnMeta(column: { columnDef: { meta?: unknown } }) {
  return (column.columnDef.meta as { fill?: boolean } | undefined) ?? {};
}

function resolveColumnVisibilityKey(key?: string) {
  if (!key) return undefined;
  return key === 'travel.leads.columns' ? 'leads.columns' : key;
}

/** Persist widths next to visibility: `leads.columns` → `leads.columns.sizing`. */
function resolveColumnSizingKey(visibilityKey?: string, sizingKey?: string) {
  if (sizingKey) return sizingKey;
  const base = resolveColumnVisibilityKey(visibilityKey);
  return base ? `${base}.sizing` : undefined;
}

function readStoredJson<T extends object>(key: string, fallback: T): T {
  const stored = localStorageKit.getJson<T>(key, { version: 1 });
  if (stored && typeof stored === 'object') return { ...fallback, ...stored };
  const raw = localStorageKit.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === 'object' && !('data' in parsed && 'v' in parsed)) {
      localStorageKit.setJson(key, parsed, { version: 1 });
      return { ...fallback, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function ColumnResizeHandle<TData, TValue>({ header }: { header: Header<TData, TValue> }) {
  if (!header.column.getCanResize() || columnMeta(header.column).fill) return null;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnLabel(header.column)} column`}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        header.column.resetSize();
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none select-none',
        'opacity-0 transition-opacity hover:opacity-100 group-hover/th:opacity-100',
        'after:absolute after:inset-y-1 after:right-0 after:w-px after:bg-border',
        'hover:after:bg-primary/70',
        header.column.getIsResizing() && 'opacity-100 after:bg-primary',
      )}
    />
  );
}

function columnWidthStyle(column: {
  id: string;
  getSize: () => number;
  columnDef: { size?: number; minSize?: number; maxSize?: number; meta?: unknown; enableResizing?: boolean };
}) {
  const size = column.getSize();
  if (columnMeta(column).fill) {
    // Take leftover space only — never force a preferred width that overflows the panel.
    return { width: 'auto' as const, minWidth: 0 };
  }
  // Actions rail: never let persisted sizing inflate the sticky column.
  if (column.id === 'actions') {
    const locked =
      column.columnDef.size ??
      column.columnDef.maxSize ??
      column.columnDef.minSize ??
      44;
    return { width: locked, minWidth: locked, maxWidth: locked };
  }
  if (column.columnDef.enableResizing === false) {
    const locked = column.columnDef.size ?? size;
    return {
      width: locked,
      minWidth: column.columnDef.minSize ?? locked,
      maxWidth: column.columnDef.maxSize ?? locked,
    };
  }
  return {
    width: size,
    minWidth: column.columnDef.minSize,
    maxWidth: column.columnDef.maxSize,
  };
}

/** Shared opaque header fill — theme tokens only (never primary-900: light in dark mode). */
const TABLE_HEAD_BG = 'bg-muted';

/** Sticky actions rail — same fill as thead so the header reads as one bar. */
function stickyActionsClass(kind: 'head' | 'cell', pinTop = false) {
  return cn(
    'sticky right-0 text-center align-middle !px-0.5',
    'border-l border-border/50',
    kind === 'head'
      ? cn(pinTop && 'top-0 z-40', 'z-30', TABLE_HEAD_BG)
      : cn(
          'z-20 bg-card',
          'group-hover/row:bg-muted/80 group-data-[state=selected]/row:bg-primary/10',
        ),
  );
}

function sanitizeColumnSizing(
  sizing: ColumnSizingState,
  cols: ColumnDef<any, any>[],
): ColumnSizingState {
  const byId = new Map<string, ColumnDef<any, any>>();
  for (const col of cols) {
    const id = col.id ?? (typeof (col as { accessorKey?: unknown }).accessorKey === 'string'
      ? String((col as { accessorKey: string }).accessorKey)
      : undefined);
    if (id) byId.set(id, col);
  }
  const next: ColumnSizingState = {};
  for (const [id, raw] of Object.entries(sizing)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    if (id === 'actions') continue;
    const def = byId.get(id);
    if (def?.enableResizing === false) continue;
    const min = def?.minSize ?? 88;
    const max = def?.maxSize ?? 900;
    next[id] = Math.min(max, Math.max(min, Math.round(raw)));
  }
  return next;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) {
    return (
      <span className={cn('text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
        {title}
      </span>
    );
  }

  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className={cn(
        'flex h-full w-full min-w-0 cursor-pointer items-center gap-1 bg-transparent text-left text-[length:var(--control-text-sm)] font-semibold uppercase tracking-wide text-muted-foreground',
        'hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset',
        sorted && 'text-foreground',
        className,
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {sorted === 'asc' ? (
        <ArrowUp className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : sorted === 'desc' ? (
        <ArrowDown className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
      )}
    </button>
  );
}

function ColumnsMenu<TData>({ table }: { table: TanstackTable<TData> }) {
  const hideable = table.getAllColumns().filter((column) => column.getCanHide());
  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Columns3 className="size-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1 text-[length:var(--control-text-sm)]">
        <DropdownMenuLabel className="px-[var(--menu-item-px)] text-[length:var(--control-text-sm)] font-medium">
          Toggle columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            className="py-1.5 text-[length:var(--control-text-sm)] font-normal capitalize"
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
            onSelect={(e) => e.preventDefault()}
          >
            {columnLabel(column)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  facets,
  defaultFacetValues,
  defaultColumnVisibility,
  columnVisibilityKey,
  columnSizingKey,
  sorting: sortingProp,
  onSortingChange,
  defaultSorting,
  loading,
  error,
  emptyTitle = 'No records',
  emptyDescription,
  emptyAction,
  emptyIcon,
  pageSize = 25,
  className,
  fillHeight = true,
  alignTop = false,
  wrapCells = false,
  leading,
  toolbar,
  showColumnsMenu = true,
  showSearch = true,
  getDataRowId,
  highlightedRowId = null,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  facets?: Array<DataTableFacet & { columnId: string }>;
  defaultFacetValues?: Record<string, string>;
  defaultColumnVisibility?: VisibilityState;
  /** When set, column visibility is read/written to localStorage under this key. */
  columnVisibilityKey?: string;
  /**
   * When set, column widths are persisted under this key.
   * Defaults to `${columnVisibilityKey}.sizing` when visibility key is set.
   */
  columnSizingKey?: string;
  /** Controlled sorting (e.g. URL query). When omitted, sorting is internal. */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Initial sorting when uncontrolled. */
  defaultSorting?: SortingState;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  pageSize?: number;
  className?: string;
  /** Grow to fill ListPageShell (default true). Set false for nested/tab tables. */
  fillHeight?: boolean;
  /** Top-align cell content (useful when cells have stacked controls). */
  alignTop?: boolean;
  /** Allow multi-line cell content (skips single-line truncate wrapper). */
  wrapCells?: boolean;
  /** Extra controls rendered before the search field. */
  leading?: React.ReactNode;
  /** Extra controls rendered beside search / Columns (e.g. primary actions). */
  toolbar?: React.ReactNode;
  /** Show the Columns visibility menu (default true). */
  showColumnsMenu?: boolean;
  /** Show the built-in search field (default true). */
  showSearch?: boolean;
  /** Stable id for each data row (`data-row-id` + highlight / scroll target). */
  getDataRowId?: (row: TData) => string | undefined;
  /** When set, jumps to that row’s page and scrolls/highlights it. */
  highlightedRowId?: string | null;
}) {
  const [uncontrolledSorting, setUncontrolledSorting] = React.useState<SortingState>(
    () => defaultSorting ?? [],
  );
  const sorting = sortingProp ?? uncontrolledSorting;
  const handleSortingChange = React.useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange?.(next);
      if (sortingProp === undefined) {
        setUncontrolledSorting(next);
      }
    },
    [onSortingChange, sorting, sortingProp],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const resolvedColumnKey = resolveColumnVisibilityKey(columnVisibilityKey);
  const resolvedSizingKey = resolveColumnSizingKey(columnVisibilityKey, columnSizingKey);

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    const defaults = defaultColumnVisibility ?? {};
    if (!resolvedColumnKey) return defaults;
    // One-time migration from pre-kit key
    if (columnVisibilityKey === 'leads.columns' || columnVisibilityKey === 'travel.leads.columns') {
      localStorageKit.migrateFrom(LegacyStorageKeys.leadsColumns, 'leads.columns');
    }
    return readStoredJson<VisibilityState>(resolvedColumnKey, defaults);
  });
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() => {
    if (!resolvedSizingKey) return {};
    return sanitizeColumnSizing(readStoredJson<ColumnSizingState>(resolvedSizingKey, {}), columns);
  });
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [facetValues, setFacetValues] = React.useState<Record<string, string>>(
    () => defaultFacetValues ?? {},
  );

  const onColumnVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (resolvedColumnKey) {
          localStorageKit.setJson(resolvedColumnKey, next, { version: 1 });
        }
        return next;
      });
    },
    [resolvedColumnKey],
  );

  const sizingPersistTimer = React.useRef<number | null>(null);
  const columnSizingRef = React.useRef(columnSizing);
  columnSizingRef.current = columnSizing;

  const onColumnSizingChange = React.useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((prev) => {
        const draft = typeof updater === 'function' ? updater(prev) : updater;
        const next = sanitizeColumnSizing(draft, columns);
        columnSizingRef.current = next;
        if (resolvedSizingKey) {
          if (sizingPersistTimer.current != null) {
            window.clearTimeout(sizingPersistTimer.current);
          }
          sizingPersistTimer.current = window.setTimeout(() => {
            localStorageKit.setJson(resolvedSizingKey, columnSizingRef.current, { version: 1 });
            sizingPersistTimer.current = null;
          }, 200);
        }
        return next;
      });
    },
    [resolvedSizingKey, columns],
  );

  React.useEffect(
    () => () => {
      if (sizingPersistTimer.current != null) {
        window.clearTimeout(sizingPersistTimer.current);
        if (resolvedSizingKey) {
          localStorageKit.setJson(resolvedSizingKey, columnSizingRef.current, { version: 1 });
        }
      }
    },
    [resolvedSizingKey],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, columnSizing, globalFilter },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange,
    onColumnSizingChange,
    onGlobalFilterChange: setGlobalFilter,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: getDataRowId
      ? (row, index) => getDataRowId(row)?.trim() || String(index)
      : undefined,
    initialState: { pagination: { pageSize } },
    defaultColumn: {
      size: 140,
      minSize: 88,
      maxSize: 900,
    },
    globalFilterFn: searchKey
      ? (row, _columnId, filterValue) => {
          const v = String(row.getValue(searchKey) ?? '').toLowerCase();
          return v.includes(String(filterValue).toLowerCase());
        }
      : 'includesString',
  });

  React.useEffect(() => {
    facets?.forEach((facet) => {
      const value = facetValues[facet.id];
      if (!value || value === 'all') {
        table.getColumn(facet.columnId)?.setFilterValue(undefined);
      } else {
        table.getColumn(facet.columnId)?.setFilterValue(value);
      }
    });
  }, [facetValues, facets, table]);

  const page = table.getState().pagination.pageIndex + 1;
  const total = table.getFilteredRowModel().rows.length;

  React.useEffect(() => {
    if (!highlightedRowId?.trim() || !getDataRowId) return;
    const size = table.getState().pagination.pageSize;
    const pageIndex = table.getState().pagination.pageIndex;
    const rowIds = table
      .getPrePaginationRowModel()
      .rows.map((row) => getDataRowId(row.original)?.trim() || '')
      .filter(Boolean);
    const nextPage = dataTablePageIndexForRowId(rowIds, highlightedRowId, size);
    if (nextPage != null && nextPage !== pageIndex) {
      table.setPageIndex(nextPage);
      return;
    }
    const targetId = highlightedRowId;
    const t = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-row-id="${CSS.escape(targetId)}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
    return () => window.clearTimeout(t);
  }, [highlightedRowId, getDataRowId, table, data, page]);

  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const visibleColumns = table.getVisibleLeafColumns();
  const hasFillColumn = visibleColumns.some((column) => columnMeta(column).fill);
  // Fill columns must shrink with the panel — do not sum their preferred size into minWidth
  // (that forced a horizontal scrollbar beside sidebars).
  const tableMinWidth = hasFillColumn
    ? undefined
    : visibleColumns.reduce((sum, column) => sum + column.getSize(), 0);
  const tableWidthStyle = tableMinWidth ? { minWidth: tableMinWidth } : undefined;
  const cellPadX = hasFillColumn ? 'px-1.5' : 'px-2.5';
  const renderColGroup = () => (
    <colgroup>
      {visibleColumns.map((column) => (
        <col key={column.id} style={columnWidthStyle(column)} />
      ))}
    </colgroup>
  );

  const renderHeaderGroups = (opts?: { pinHeader?: boolean }) =>
    table.getHeaderGroups().map((hg) => (
      <TableRow
        key={hg.id}
        className="border-0 bg-transparent hover:bg-transparent"
      >
        {hg.headers.map((header) => {
          const isActions = header.column.id === 'actions';
          const canSort = header.column.getCanSort();
          const headerDef = header.column.columnDef.header;
          const sortHeader =
            typeof headerDef === 'string' && headerDef.trim().length > 0 && canSort;
          return (
            <TableHead
              key={header.id}
              style={columnWidthStyle(header.column)}
              aria-label={isActions ? 'Actions' : undefined}
              className={cn(
                'group/th relative h-[var(--table-head-h)] py-0 align-middle text-[length:var(--control-text-sm)] text-muted-foreground',
                TABLE_HEAD_BG,
                isActions
                  ? stickyActionsClass('head', opts?.pinHeader)
                  : sortHeader
                    ? 'p-0'
                    : cellPadX,
                header.column.getIsResizing() && 'bg-muted',
              )}
            >
              {header.isPlaceholder
                ? null
                : isActions
                  ? null
                  : sortHeader
                    ? (
                        <DataTableColumnHeader
                          column={header.column}
                          title={headerDef}
                          className={cellPadX}
                        />
                      )
                    : (
                        flexRender(headerDef, header.getContext())
                      )}
              {!isActions ? <ColumnResizeHandle header={header} /> : null}
            </TableHead>
          );
        })}
      </TableRow>
    ));

  const renderBodyRows = (opts?: { denser?: boolean }) =>
    table.getRowModel().rows.map((row) => (
      <TableRow
        key={row.id}
        data-row-id={getDataRowId?.(row.original) || undefined}
        data-state={row.getIsSelected() && 'selected'}
        className={cn(
          'group/row border-border/60 transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/5',
          wrapCells ? 'h-auto' : 'h-[var(--table-row-h)]',
          highlightedRowId &&
            getDataRowId?.(row.original) === highlightedRowId &&
            'bg-amber-500/10 ring-1 ring-inset ring-amber-500/40',
        )}
      >
        {row.getVisibleCells().map((cell) => {
          const isActions = cell.column.id === 'actions';
          return (
            <TableCell
              key={cell.id}
              style={columnWidthStyle(cell.column)}
              className={cn(
                opts?.denser
                  ? 'py-[calc(var(--field-gap)+0.125rem)]'
                  : 'py-[var(--field-gap)]',
                'text-[length:var(--control-text)] leading-tight',
                !isActions && 'overflow-hidden',
                !isActions && cellPadX,
                alignTop && 'align-top',
                isActions ? stickyActionsClass('cell') : null,
              )}
            >
              {isActions ? (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              ) : (
                <div className={cn('min-w-0', !wrapCells && 'truncate')}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              )}
            </TableCell>
          );
        })}
      </TableRow>
    ));

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const showFilterBar =
    Boolean(leading) ||
    showSearch ||
    Boolean(facets?.length) ||
    Boolean(toolbar) ||
    showColumnsMenu;

  return (
    <div
      className={cn(
        'flex flex-col',
        fillHeight ? 'min-h-0 max-h-full flex-1' : undefined,
        className,
      )}
    >
      {showFilterBar ? (
        <FilterBar
          className="mb-2 shrink-0"
          search={globalFilter}
          onSearchChange={setGlobalFilter}
          searchPlaceholder={searchPlaceholder}
          facets={facets}
          facetValues={facetValues}
          onFacetChange={(id, value) => setFacetValues((prev) => ({ ...prev, [id]: value }))}
          onClear={() => {
            setGlobalFilter('');
            setFacetValues({});
          }}
          leading={leading}
          showSearch={showSearch}
          trailing={
            <>
              {toolbar}
              {showColumnsMenu ? <ColumnsMenu table={table} /> : null}
            </>
          }
        />
      ) : null}
      {loading && data.length === 0 ? (
        <div
          className={cn(
            'space-y-2 overflow-auto rounded-xl border border-border/60 p-3 glass',
            fillHeight && 'min-h-0 flex-1',
          )}
        >
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : !loading && table.getRowModel().rows.length === 0 ? (
        <div className={cn(fillHeight && 'min-h-0 flex-1 overflow-auto')}>
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            icon={emptyIcon as never}
          />
        </div>
      ) : (
        <>
          {fillHeight ? (
            <div
              ref={tableScrollRef}
              aria-busy={loading || undefined}
              className={cn(
                'min-h-0 flex-1 overflow-auto rounded-xl border border-border/60 glass transition-opacity duration-150',
                hasFillColumn && 'overflow-x-hidden',
                loading && 'pointer-events-none opacity-60',
              )}
            >
              <table
                className="w-full table-fixed caption-bottom text-[length:var(--control-text)]"
                style={tableWidthStyle}
              >
                {renderColGroup()}
                <TableHeader
                  className={cn(
                    'sticky top-0 z-30 border-b border-border/80',
                    TABLE_HEAD_BG,
                    '[&_tr]:border-0',
                  )}
                >
                  {renderHeaderGroups({ pinHeader: true })}
                </TableHeader>
                <TableBody>{renderBodyRows()}</TableBody>
              </table>
            </div>
          ) : (
            // Nested tables use page scroll. Fill columns fit the panel (no forced horizontal scroll).
            <div
              aria-busy={loading || undefined}
              className={cn(
                'rounded-xl border border-border/60 glass transition-opacity duration-150',
                hasFillColumn ? 'overflow-x-hidden' : 'overflow-x-auto',
                loading && 'pointer-events-none opacity-60',
              )}
            >
              <table
                className="w-full table-fixed caption-bottom text-[length:var(--control-text)]"
                style={tableWidthStyle}
              >
                {renderColGroup()}
                <TableHeader className={cn(TABLE_HEAD_BG, '[&_tr]:border-border/80')}>
                  {renderHeaderGroups()}
                </TableHeader>
                <TableBody>{renderBodyRows({ denser: true })}</TableBody>
              </table>
            </div>
          )}
          <div className="mt-2 shrink-0">
            <Pagination
              page={page}
              pageSize={table.getState().pagination.pageSize}
              total={total}
              onPageChange={(p) => table.setPageIndex(p - 1)}
            />
          </div>
        </>
      )}
    </div>
  );
}
