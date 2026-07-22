import * as React from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

export type ComboboxOption = {
  value: string;
  label: string;
  /** Shorter label for the closed trigger (e.g. dial code only). */
  shortLabel?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional style for the option label (e.g. fontFamily preview). */
  labelStyle?: React.CSSProperties;
};

/** Async search may return resolved empty-state suggestions (e.g. Place typo assists). */
export type EntitySearchResult = {
  options: ComboboxOption[];
  emptySuggestions?: ComboboxOption[];
};

export type EntitySearchResponse = ComboboxOption[] | EntitySearchResult;

function normalizeEntitySearchResult(result: EntitySearchResponse): EntitySearchResult {
  if (Array.isArray(result)) return { options: result };
  return {
    options: result.options ?? [],
    emptySuggestions: result.emptySuggestions,
  };
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  disabled,
  className,
  loading,
  contentClassName,
  searchable,
  size = 'default',
  contentMatchTrigger = true,
  'aria-label': ariaLabel,
}: {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
  contentClassName?: string;
  /** When omitted, search shows only if there are more than 6 options. */
  searchable?: boolean;
  /** `sm` fits dense panels (inspectors); `default` is the standard form control. */
  size?: 'default' | 'sm';
  /** When false, the menu can be wider than the trigger (use contentClassName). */
  contentMatchTrigger?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  /** cmdk "selected" = keyboard/pointer highlight, not the committed value. */
  const [highlight, setHighlight] = React.useState('');
  const selected = options.find((o) => o.value === value);
  const SelectedIcon = selected?.icon ?? null;
  const showSearch = searchable ?? options.length > 6;
  const compact = size === 'sm';

  const optionCommandValue = React.useCallback(
    (option: ComboboxOption) => `${option.label} ${option.value}`,
    [],
  );

  const highlightForValue = React.useCallback(
    (nextValue?: string) => {
      const match = options.find((o) => o.value === nextValue);
      return match ? optionCommandValue(match) : '';
    },
    [optionCommandValue, options],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showSearch || !q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, showSearch]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Seed highlight on the committed value so the first row is not auto-focused.
    setHighlight(highlightForValue(value));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only when menu opens

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          size={compact ? 'sm' : 'default'}
          className={cn(
            // Match Input field chrome so forms stay visually consistent.
            'w-full justify-between gap-2 border-input bg-card/85 font-normal shadow-sm',
            'hover:bg-card hover:text-foreground dark:hover:bg-card/90',
            compact
              ? 'h-[var(--control-h-sm)] rounded-md px-[var(--control-px-sm)] text-[length:var(--control-text-sm)]'
              : 'h-[var(--control-h)] rounded-md px-[var(--control-px)] text-[length:var(--control-text)]',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {SelectedIcon ? (
              <SelectedIcon
                className={cn(
                  'shrink-0 text-muted-foreground',
                  compact ? 'size-3' : 'size-3.5',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'truncate',
                compact ? 'text-[length:var(--control-text-sm)]' : 'text-[length:var(--control-text)]',
              )}
              style={selected?.labelStyle}
            >
              {selected?.shortLabel ?? selected?.label ?? placeholder}
            </span>
          </span>
          {loading ? (
            <Loader2
              className={cn(
                'shrink-0 animate-spin text-muted-foreground',
                compact ? 'size-3.5' : 'size-4',
              )}
            />
          ) : (
            <ChevronDown
              className={cn(
                'shrink-0 text-muted-foreground transition-transform',
                compact ? 'size-3.5' : 'size-4',
                open && 'rotate-180',
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'overflow-hidden border-input bg-card p-0 shadow-md rounded-md',
          contentMatchTrigger
            ? 'max-w-[var(--radix-popover-trigger-width)] w-[var(--radix-popover-trigger-width)] min-w-0'
            : 'min-w-[var(--radix-popover-trigger-width)] w-auto max-w-none',
          contentClassName,
        )}
        style={
          contentMatchTrigger
            ? {
                width: 'var(--radix-popover-trigger-width)',
                minWidth: 'var(--radix-popover-trigger-width)',
                maxWidth: 'var(--radix-popover-trigger-width)',
              }
            : undefined
        }
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          // Keep focus usable inside nested dialogs; searchable menus still focus the input.
          if (!showSearch) e.preventDefault();
        }}
      >
        {/* Manual filter — cmdk auto-filter can leave visual gaps between scored items. */}
        <Command
          shouldFilter={false}
          value={highlight}
          onValueChange={setHighlight}
        >
          {showSearch ? (
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
              className={
                compact
                  ? 'h-[var(--control-h-sm)] py-[var(--field-gap-compact)] text-[length:var(--control-text-sm)]'
                  : undefined
              }
            />
          ) : null}
          <CommandList
            onMouseLeave={() => {
              // Don't leave highlight stuck on the last hovered row.
              setHighlight(highlightForValue(value));
            }}
          >
            {showSearch && filtered.length === 0 ? (
              <CommandEmpty
                className={
                  compact ? 'py-[var(--gap-page)] text-[length:var(--control-text-sm)]' : undefined
                }
              >
                {emptyText}
              </CommandEmpty>
            ) : null}
              <CommandGroup
                className={compact ? 'p-[var(--field-gap)] [&_[cmdk-group-items]]:gap-[var(--field-gap-compact)]' : undefined}
              >
              {filtered.map((option) => {
                const Icon = option.icon;
                const isSelected = value === option.value;
                return (
                  <CommandItem
                    key={option.value === '' ? '__empty' : option.value}
                    value={optionCommandValue(option)}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'cursor-pointer',
                      compact
                        ? 'gap-1.5 rounded-md px-[var(--menu-item-px)] py-[var(--field-gap)]'
                        : 'gap-2 py-[var(--menu-item-py)]',
                      isSelected && 'bg-primary/10 text-foreground',
                    )}
                  >
                    {Icon ? (
                      <Icon
                        className={cn(
                          'shrink-0',
                          compact ? 'size-3' : 'size-3.5',
                          isSelected ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'truncate font-medium leading-snug',
                          compact
                            ? 'text-[length:var(--control-text-sm)]'
                            : 'text-[length:var(--control-text)]',
                        )}
                        style={option.labelStyle}
                      >
                        {option.label}
                      </div>
                      {option.description ? (
                        <div
                          className={cn(
                            'mt-0.5 truncate text-muted-foreground',
                            compact
                              ? 'text-[length:var(--control-text-sm)]'
                              : 'text-[length:var(--control-text)]',
                          )}
                        >
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                    <Check
                      className={cn(
                        'shrink-0 text-primary',
                        compact ? 'size-3.5' : 'size-4',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EntityCombobox({
  value,
  onChange,
  onSearch,
  placeholder = 'Search…',
  emptyText = 'No matches',
  disabled,
  className,
  selectedLabel,
  onCreateNew,
  createNewLabel = 'Create new',
  clearable,
  size = 'default',
}: {
  value?: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  onSearch: (query: string) => Promise<EntitySearchResponse>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  selectedLabel?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  clearable?: boolean;
  /** Match Combobox / DatePicker density — `sm` uses `--control-h-sm`. */
  size?: 'default' | 'sm';
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [emptySuggestions, setEmptySuggestions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [label, setLabel] = React.useState(selectedLabel ?? '');
  const [highlight, setHighlight] = React.useState('');
  const compact = size === 'sm';

  React.useEffect(() => {
    if (selectedLabel) setLabel(selectedLabel);
    else if (!value) setLabel('');
  }, [selectedLabel, value]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    setHighlight(value || '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only when menu opens

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      onSearch(query)
        .then((items) => {
          if (cancelled) return;
          const normalized = normalizeEntitySearchResult(items);
          setOptions(normalized.options);
          setEmptySuggestions(normalized.emptySuggestions ?? []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, onSearch]);

  function triggerCreate() {
    setOpen(false);
    onCreateNew?.(query.trim());
  }

  function clearSelection(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setLabel('');
  }

  function pickSuggestion(option: ComboboxOption) {
    onChange(option.value, option);
    setLabel(option.label);
    setOpen(false);
  }

  const createLabel =
    query.trim().length > 0 ? `${createNewLabel}: “${query.trim()}”` : createNewLabel;

  const resolvedEmptyText =
    query.trim().length > 0 ? `No matches for “${query.trim()}”` : emptyText;

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          size={compact ? 'sm' : 'default'}
          disabled={disabled}
          className={cn(
            'w-full justify-between gap-2 rounded-md border-input bg-card/85 font-normal shadow-sm',
            'hover:bg-card hover:text-foreground dark:hover:bg-card/90',
            compact
              ? 'h-[var(--control-h-sm)] px-[var(--control-px-sm)] text-[length:var(--control-text-sm)]'
              : 'h-[var(--control-h)] px-[var(--control-px)] text-[length:var(--control-text)]',
            !label && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{label || placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && label ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={clearSelection}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    clearSelection(e as unknown as React.MouseEvent);
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-none overflow-hidden p-0 glass-strong"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        align="start"
        collisionPadding={16}
      >
        <Command shouldFilter={false} value={highlight} onValueChange={setHighlight}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList
            className="max-h-[min(22rem,50vh)]"
            onMouseLeave={() => {
              setHighlight(value || '');
            }}
          >
            {!loading && options.length === 0 ? (
              <div className="px-3 py-5 text-center text-[length:var(--control-text)] text-muted-foreground">
                <p>{emptySuggestions.length > 0 ? resolvedEmptyText : emptyText}</p>
                {emptySuggestions.length > 0 ? (
                  <div className="mt-3 space-y-2 text-left">
                    <p className="text-center text-sm font-semibold text-foreground">
                      Did you mean?
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {emptySuggestions.map((opt, index) => (
                        <Button
                          key={opt.value}
                          type="button"
                          variant={index === 0 ? 'default' : 'outline'}
                          size="sm"
                          className="h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left"
                          onClick={() => pickSuggestion(opt)}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{opt.label}</span>
                            {opt.description ? (
                              <span
                                className={cn(
                                  'mt-0.5 block text-[11px]',
                                  index === 0 ? 'text-primary-foreground/80' : 'text-muted-foreground',
                                )}
                              >
                                {opt.description}
                              </span>
                            ) : null}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {onCreateNew ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={triggerCreate}
                  >
                    <Plus className="size-4" />
                    {createLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value === option.value;
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option.value, option);
                      setLabel(option.label);
                      setOpen(false);
                    }}
                    className={cn('cursor-pointer', isSelected && 'bg-primary/10')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-normal text-[length:var(--control-text)] font-medium">
                        {option.label}
                      </div>
                      {option.description ? (
                        <div className="mt-0.5 whitespace-normal text-[length:var(--control-text-sm)] text-muted-foreground">
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                    <Check
                      className={cn(
                        'size-4 shrink-0 text-primary',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                );
              })}
              {onCreateNew && options.length > 0 ? (
                <CommandItem
                  value="__create__"
                  onSelect={triggerCreate}
                  className="rounded-lg font-medium text-primary"
                >
                  <Plus className="size-4" />
                  {createLabel}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
