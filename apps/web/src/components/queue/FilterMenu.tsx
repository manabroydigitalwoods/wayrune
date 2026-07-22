import { useMemo, useState } from 'react';
import { Check, ChevronRight, Filter, Plus, Search, X, type LucideIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  cn,
} from '@wayrune/ui';
import type { QueueFilterDef } from '../../lib/queue/types';

function MenuIcon({ icon: Icon }: { icon?: LucideIcon }) {
  if (!Icon) return <span className="size-3.5 shrink-0" aria-hidden />;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

function MenuSearch({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative border-b border-border/50 px-2 py-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-[var(--control-h-sm)] border-0 bg-transparent pl-8 text-[length:var(--control-text-sm)] shadow-none focus-visible:ring-0"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function menuRowClass(active?: boolean) {
  return cn(
    'flex w-full select-none items-center gap-2 rounded-md px-[var(--menu-item-px)] py-1.5 text-left text-[length:var(--control-text-sm)] font-normal outline-none transition-colors',
    'hover:bg-muted focus-within:bg-muted',
    active && 'bg-muted',
  );
}

function FilterOptionsPanel({
  filter,
  onPicked,
}: {
  filter: QueueFilterDef;
  onPicked: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const options = useMemo(() => {
    if (!q) return filter.options;
    return filter.options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [filter.options, q]);

  return (
    <>
      <MenuSearch
        value={query}
        onChange={setQuery}
        placeholder={`Filter ${filter.label.toLowerCase()}…`}
      />
      <div className="max-h-[min(18rem,70vh)] overflow-y-auto overscroll-contain p-1">
        {filter.value ? (
          <>
            <button
              type="button"
              className={menuRowClass()}
              onClick={(e) => {
                e.preventDefault();
                filter.onSelect(null);
                onPicked();
              }}
            >
              <X className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">Clear {filter.label.toLowerCase()}</span>
            </button>
            <div className="my-1 h-px bg-border" />
          </>
        ) : null}
        {options.length === 0 ? (
          <p className="px-[var(--menu-item-px)] py-[var(--menu-item-py)] text-[length:var(--control-text-sm)] text-muted-foreground">
            No matches
          </p>
        ) : (
          options.map((opt) => {
            const selected = filter.value === opt.value;
            return (
              <div key={opt.value} className={menuRowClass(selected)}>
                <button
                  type="button"
                  aria-label={selected ? `Deselect ${opt.label}` : `Select ${opt.label}`}
                  aria-pressed={selected}
                  className={cn(
                    'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-transparent hover:border-primary/50',
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Checkbox: apply / toggle without closing the menu.
                    filter.onSelect(selected ? null : opt.value);
                  }}
                >
                  {selected ? <Check className="size-3" aria-hidden /> : null}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                  onClick={(e) => {
                    e.preventDefault();
                    // Row / label: select and close.
                    filter.onSelect(opt.value);
                    onPicked();
                  }}
                >
                  <MenuIcon icon={opt.icon} />
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.countLabel ? (
                    <span className="shrink-0 text-[length:var(--control-text-sm)] text-muted-foreground">
                      {opt.countLabel}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

export function FilterMenu({
  filters,
  className,
}: {
  filters: QueueFilterDef[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeCount = filters.filter((f) => f.value).length;
  const q = query.trim().toLowerCase();
  const visibleFilters = q
    ? filters.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.options.some((o) => o.label.toLowerCase().includes(q)),
      )
    : filters;

  const hovered = visibleFilters.find((f) => f.id === hoveredId) ?? null;

  if (!filters.length) return null;

  function closeMenu() {
    setOpen(false);
    setQuery('');
    setHoveredId(null);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setHoveredId(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('shrink-0 gap-1.5 font-normal', className)}
        >
          <Plus className="size-[0.875em] shrink-0 opacity-70" />
          <Filter className="size-[0.875em] shrink-0 opacity-70" />
          Filter
          {activeCount > 0 ? (
            <span className="ml-0.5 rounded-md bg-primary/15 px-1.5 py-px text-[length:var(--control-text-sm)] font-medium tabular-nums text-primary">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={cn(
          'relative w-56 overflow-visible p-0 text-[length:var(--control-text-sm)] shadow-xl',
          // Kill glass fill — transparent menus bleed board content underneath.
          '!bg-popover backdrop-blur-none [-webkit-backdrop-filter:none] [background-image:none] [background:hsl(var(--popover))]',
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseLeave={() => setHoveredId(null)}
      >
        <MenuSearch value={query} onChange={setQuery} placeholder="Add filter…" autoFocus />
        <div className="max-h-[min(20rem,70vh)] overflow-y-auto overscroll-contain p-1">
          {visibleFilters.length === 0 ? (
            <p className="px-[var(--menu-item-px)] py-[var(--menu-item-py)] text-[length:var(--control-text-sm)] text-muted-foreground">
              No filters match
            </p>
          ) : (
            visibleFilters.map((filter) => {
              const selectedOption = filter.value
                ? filter.options.find((o) => o.value === filter.value)
                : null;
              const active = hovered?.id === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={menuRowClass(active)}
                  onMouseEnter={() => setHoveredId(filter.id)}
                  onFocus={() => setHoveredId(filter.id)}
                >
                  <MenuIcon icon={filter.icon} />
                  <span className="min-w-0 flex-1 truncate">{filter.label}</span>
                  {selectedOption ? (
                    <span className="max-w-[5rem] truncate text-[length:var(--control-text-sm)] text-muted-foreground">
                      {selectedOption.label}
                    </span>
                  ) : null}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                </button>
              );
            })
          )}
        </div>

        {/* Opens to the LEFT only after hovering a filter row — not pre-opened */}
        {hovered ? (
          <div
            key={hovered.id}
            role="menu"
            aria-label={hovered.label}
            className={cn(
              'absolute right-full top-0 z-[320] mr-0 flex w-56 flex-col overflow-hidden',
              'rounded-xl border border-border text-popover-foreground shadow-2xl',
              'backdrop-blur-none [-webkit-backdrop-filter:none] [background:hsl(var(--popover))]',
            )}
            onMouseEnter={() => setHoveredId(hovered.id)}
          >
            <FilterOptionsPanel filter={hovered} onPicked={closeMenu} />
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
