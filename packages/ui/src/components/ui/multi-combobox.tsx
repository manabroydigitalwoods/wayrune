import * as React from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import type { ComboboxOption, EntitySearchResponse } from './combobox';

function normalizeEntitySearchResult(result: EntitySearchResponse): {
  options: ComboboxOption[];
  emptySuggestions?: ComboboxOption[];
} {
  if (Array.isArray(result)) return { options: result };
  return {
    options: result.options ?? [],
    emptySuggestions: result.emptySuggestions,
  };
}

export function MultiEntityCombobox({
  values,
  selectedLabels,
  onChange,
  onSearch,
  placeholder = 'Search…',
  emptyText = 'No matches',
  disabled,
  className,
  onCreateNew,
  createNewLabel = 'Add new',
  size = 'default',
  clearQueryOnSelect = true,
  listMaxHeightClassName = 'max-h-[min(22rem,50vh)]',
  header,
}: {
  values: string[];
  selectedLabels?: Record<string, string>;
  onChange: (next: Array<{ value: string; label: string }>) => void;
  onSearch: (query: string) => Promise<EntitySearchResponse>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  /** Match Combobox / DatePicker density — `sm` uses `--control-h-sm`. */
  size?: 'default' | 'sm';
  /** Clear search after adding a value (keeps popover open). */
  clearQueryOnSelect?: boolean;
  listMaxHeightClassName?: string;
  /** Optional sticky header above the search (e.g. purpose tabs). */
  header?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [emptySuggestions, setEmptySuggestions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const compact = size === 'sm';

  const selected = React.useMemo(
    () =>
      values.map((value) => ({
        value,
        label: selectedLabels?.[value] || value,
      })),
    [values, selectedLabels],
  );

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

  function toggle(option: ComboboxOption) {
    const exists = selected.some((s) => s.value === option.value);
    const next = exists
      ? selected.filter((s) => s.value !== option.value)
      : [...selected, { value: option.value, label: option.label }];
    onChange(next);
    if (!exists && clearQueryOnSelect) {
      setQuery('');
    }
  }

  function remove(value: string) {
    onChange(selected.filter((s) => s.value !== value));
  }

  function triggerCreate() {
    setOpen(false);
    onCreateNew?.(query.trim());
  }

  const createLabel =
    query.trim().length > 0 ? `${createNewLabel}: “${query.trim()}”` : createNewLabel;

  const resolvedEmptyText =
    query.trim().length > 0 ? `No matches for “${query.trim()}”` : emptyText;

  function pickSuggestion(option: ComboboxOption) {
    toggle(option);
  }

  return (
    <div className={cn('space-y-[var(--field-gap)]', className)}>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-[var(--field-gap)]">
          {selected.map((s) => (
            <Badge key={s.value} variant="secondary" className="gap-1 pr-1">
              {s.label}
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-muted"
                aria-label={`Remove ${s.label}`}
                onClick={() => remove(s.value)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
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
              selected.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown
              className={cn(
                'size-[var(--control-icon)] shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="max-w-none overflow-hidden p-0 glass-strong"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          align="start"
          collisionPadding={16}
        >
          {header ? (
            <div className="sticky top-0 z-10 border-b border-border/60 bg-popover px-2 py-1.5">
              {header}
            </div>
          ) : null}
          <Command shouldFilter={false}>
            <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            <CommandList className={listMaxHeightClassName}>
              {!loading && options.length === 0 ? (
                <div className="px-[var(--control-px)] py-[var(--gap-section)] text-center text-[length:var(--control-text)] text-muted-foreground">
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
                                    index === 0
                                      ? 'text-primary-foreground/80'
                                      : 'text-muted-foreground',
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
                  const isSelected = values.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => toggle(option)}
                      className={cn('cursor-pointer', isSelected && 'bg-primary/10')}
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
                    className="rounded-lg text-primary"
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
    </div>
  );
}
