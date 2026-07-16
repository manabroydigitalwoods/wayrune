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
import type { ComboboxOption } from './combobox';

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
}: {
  values: string[];
  selectedLabels?: Record<string, string>;
  onChange: (next: Array<{ value: string; label: string }>) => void;
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<ComboboxOption[]>([]);
  const [loading, setLoading] = React.useState(false);

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

  function toggle(option: ComboboxOption) {
    const exists = selected.some((s) => s.value === option.value);
    const next = exists
      ? selected.filter((s) => s.value !== option.value)
      : [...selected, { value: option.value, label: option.label }];
    onChange(next);
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

  return (
    <div className={cn('space-y-2', className)}>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
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
              selected.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate text-sm">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
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
                  const isSelected = values.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => toggle(option)}
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
