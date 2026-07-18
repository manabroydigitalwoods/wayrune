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
  className?: string;
}) {
  const active = Object.entries(facetValues ?? {}).filter(([, v]) => v && v !== 'all');
  return (
    <div className={cn('mb-3 space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {leading ? (
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">{leading}</div>
        ) : null}
        <div className="relative min-w-[10rem] flex-1 basis-[12rem]">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-sm"
            aria-label="Search"
          />
        </div>
        {facets?.map((facet) => (
          <Combobox
            key={facet.id}
            className="h-8 w-full sm:w-[11.5rem]"
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
        {(search || active.length > 0) && onClear ? (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onClear}>
            <X className="mr-1 size-3.5" />
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

function columnWidthStyle(column: {
  getSize: () => number;
  columnDef: { minSize?: number; maxSize?: number; meta?: unknown };
}) {
  const size = column.getSize();
  if (columnMeta(column).fill) {
    // Take leftover space only — never force a preferred width that overflows the panel.
    return { width: 'auto' as const, minWidth: 0 };
  }
  const locked = column.columnDef.maxSize ?? size;
  return {
    width: size,
    minWidth: column.columnDef.minSize ?? size,
    maxWidth: locked,
  };
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
    return <span className={cn('text-xs font-semibold uppercase tracking-wide', className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className={cn(
        '-ml-1.5 inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        'hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="size-3.5 opacity-80" aria-hidden />
      ) : sorted === 'desc' ? (
        <ArrowDown className="size-3.5 opacity-80" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
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
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
          <Columns3 className="size-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            className="capitalize"
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
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    const defaults = defaultColumnVisibility ?? {};
    if (!columnVisibilityKey) return defaults;
    // One-time migration from pre-kit key
    if (columnVisibilityKey === 'leads.columns' || columnVisibilityKey === 'travel.leads.columns') {
      localStorageKit.migrateFrom(LegacyStorageKeys.leadsColumns, 'leads.columns');
    }
    const key =
      columnVisibilityKey === 'travel.leads.columns' ? 'leads.columns' : columnVisibilityKey;
    const stored = localStorageKit.getJson<VisibilityState>(key, { version: 1 });
    if (!stored || typeof stored !== 'object') {
      // Legacy raw JSON without envelope
      const raw = localStorageKit.getItem(key);
      if (!raw) return defaults;
      try {
        const parsed = JSON.parse(raw) as VisibilityState;
        if (parsed && typeof parsed === 'object' && !('data' in parsed && 'v' in parsed)) {
          localStorageKit.setJson(key, parsed, { version: 1 });
          return { ...defaults, ...parsed };
        }
      } catch {
        return defaults;
      }
      return defaults;
    }
    return { ...defaults, ...stored };
  });
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [facetValues, setFacetValues] = React.useState<Record<string, string>>(
    () => defaultFacetValues ?? {},
  );

  const resolvedColumnKey =
    columnVisibilityKey === 'travel.leads.columns' ? 'leads.columns' : columnVisibilityKey;

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

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
  const headerScrollRef = React.useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement | null>(null);
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

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div
      className={cn(
        'flex flex-col',
        fillHeight ? 'min-h-0 flex-1' : undefined,
        className,
      )}
    >
      <FilterBar
        className="mb-3 shrink-0"
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
        trailing={
          <>
            {toolbar}
            {showColumnsMenu ? <ColumnsMenu table={table} /> : null}
          </>
        }
      />
      {loading ? (
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
      ) : table.getRowModel().rows.length === 0 ? (
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 glass">
              {/* Header stays outside the scrollport so the scrollbar starts below it */}
              <div
                ref={headerScrollRef}
                className={cn(
                  'shrink-0 overflow-y-hidden border-b border-border/80 bg-muted/50 dark:bg-primary-900/30',
                  hasFillColumn
                    ? 'overflow-x-hidden'
                    : 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )}
                onScroll={(e) => {
                  if (bodyScrollRef.current) {
                    bodyScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
              >
                <table
                  className="w-full table-fixed caption-bottom text-[13px]"
                  style={tableWidthStyle}
                >
                  {renderColGroup()}
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow
                        key={hg.id}
                        className="border-0 bg-transparent hover:bg-transparent"
                      >
                        {hg.headers.map((header) => {
                          const isActions = header.column.id === 'actions';
                          const canSort = header.column.getCanSort();
                          const headerDef = header.column.columnDef.header;
                          return (
                            <TableHead
                              key={header.id}
                              style={columnWidthStyle(header.column)}
                              className={cn(
                                'h-8 overflow-hidden py-0 text-[11px]',
                                cellPadX,
                                isActions && 'text-right',
                              )}
                            >
                              {header.isPlaceholder
                                ? null
                                : typeof headerDef === 'string' && canSort
                                  ? (
                                      <DataTableColumnHeader
                                        column={header.column}
                                        title={headerDef}
                                      />
                                    )
                                  : (
                                      flexRender(headerDef, header.getContext())
                                    )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                </table>
              </div>
              <div
                ref={bodyScrollRef}
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto',
                  hasFillColumn ? 'overflow-x-hidden' : 'overflow-x-auto',
                )}
                onScroll={(e) => {
                  if (headerScrollRef.current) {
                    headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
              >
                <table
                  className="w-full table-fixed caption-bottom text-[13px]"
                  style={tableWidthStyle}
                >
                  {renderColGroup()}
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}
                        className={cn(
                          'border-border/60 transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/5',
                          wrapCells ? 'h-auto' : 'h-9',
                        )}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isActions = cell.column.id === 'actions';
                          return (
                            <TableCell
                              key={cell.id}
                              style={columnWidthStyle(cell.column)}
                              className={cn(
                                'overflow-hidden py-1 text-[13px] leading-tight',
                                cellPadX,
                                alignTop && 'align-top',
                                isActions && 'text-right',
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
                    ))}
                  </TableBody>
                </table>
              </div>
            </div>
          ) : (
            // Nested tables use page scroll. Fill columns fit the panel (no forced horizontal scroll).
            <div
              className={cn(
                'rounded-xl border border-border/60 glass',
                hasFillColumn ? 'overflow-x-hidden' : 'overflow-x-auto',
              )}
            >
              <table
                className="w-full table-fixed caption-bottom text-[13px]"
                style={tableWidthStyle}
              >
                {renderColGroup()}
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow
                      key={hg.id}
                      className="border-0 bg-muted/50 hover:bg-muted/50 dark:bg-primary-900/30 dark:hover:bg-primary-900/30"
                    >
                      {hg.headers.map((header) => {
                        const isActions = header.column.id === 'actions';
                        const canSort = header.column.getCanSort();
                        const headerDef = header.column.columnDef.header;
                        return (
                          <TableHead
                            key={header.id}
                            style={columnWidthStyle(header.column)}
                            className={cn(
                              'h-8 overflow-hidden py-0 text-[11px]',
                              cellPadX,
                              isActions && 'text-right',
                            )}
                          >
                            {header.isPlaceholder
                              ? null
                              : typeof headerDef === 'string' && canSort
                                ? (
                                    <DataTableColumnHeader
                                      column={header.column}
                                      title={headerDef}
                                    />
                                  )
                                : (
                                    flexRender(headerDef, header.getContext())
                                  )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(
                        'border-border/60 transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/5',
                        wrapCells ? 'h-auto' : 'h-9',
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const isActions = cell.column.id === 'actions';
                        return (
                          <TableCell
                            key={cell.id}
                            style={columnWidthStyle(cell.column)}
                            className={cn(
                              'overflow-hidden py-1.5 text-[13px] leading-tight',
                              cellPadX,
                              alignTop ? 'align-top' : undefined,
                              isActions && 'text-right',
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
                  ))}
                </TableBody>
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
