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
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
};

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
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const selected = options.find((o) => o.value === value);
  const SelectedIcon = selected?.icon ?? null;
  const showSearch = searchable ?? options.length > 6;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showSearch || !q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.description ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, showSearch]);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between gap-2 rounded-xl px-3 font-normal glass',
            'hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {SelectedIcon ? (
              <SelectedIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            <span className="truncate text-sm">{selected?.label ?? placeholder}</span>
          </span>
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-[var(--radix-popover-trigger-width)] max-w-none overflow-hidden p-0 glass-strong',
          contentClassName,
        )}
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        align="start"
      >
        {/* Manual filter — cmdk auto-filter can leave visual gaps between scored items. */}
        <Command shouldFilter={false}>
          {showSearch ? (
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
          ) : null}
          <CommandList>
            {showSearch && filtered.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : null}
            <CommandGroup>
              {filtered.map((option) => {
                const Icon = option.icon;
                const isSelected = value === option.value;
                return (
                  <CommandItem
                    key={option.value === '' ? '__empty' : option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'cursor-pointer',
                      isSelected && 'bg-primary/10 text-foreground data-[selected=true]:bg-primary/15',
                    )}
                  >
                    {Icon ? (
                      <Icon
                        className={cn(
                          'size-3.5 shrink-0',
                          isSelected ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-snug">
                        {option.label}
                      </div>
                      {option.description ? (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
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
}: {
  value?: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  selectedLabel?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [label, setLabel] = React.useState(selectedLabel ?? '');

  React.useEffect(() => {
    if (selectedLabel) setLabel(selectedLabel);
    if (!selectedLabel && !value) setLabel('');
  }, [selectedLabel, value]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      onSearch(query)
        .then((items) => {
          if (!cancelled) setOptions(items);
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

  const createLabel =
    query.trim().length > 0 ? `${createNewLabel}: “${query.trim()}”` : createNewLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between gap-2 rounded-xl px-3 font-normal glass',
            'hover:bg-white/50 dark:hover:bg-white/10',
            !label && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-sm">{label || placeholder}</span>
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
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {!loading && options.length === 0 ? (
              <div className="px-3 py-5 text-center text-sm text-muted-foreground">
                <p>{emptyText}</p>
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
                    className={cn(
                      'cursor-pointer',
                      isSelected && 'bg-primary/10',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-normal text-sm font-medium">{option.label}</div>
                      {option.description ? (
                        <div className="mt-0.5 whitespace-normal text-xs text-muted-foreground">
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
