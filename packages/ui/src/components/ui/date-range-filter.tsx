import * as React from 'react';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronDown,
  History,
  Infinity as InfinityIcon,
  PencilLine,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  type DateRangePack,
  type DateRangeValue,
  dateRangePresetsForPack,
  formatDateRangeTriggerLabel,
  formatYmd,
  parseYmd,
  resolveDateRangePreset,
} from '../../lib/date-range-presets';

const PRESET_ICONS: Record<string, LucideIcon> = {
  today: Sun,
  this_week: CalendarDays,
  last_week: History,
  next_7: CalendarRange,
  next_30: CalendarClock,
  this_month: CalendarIcon,
  last_month: History,
  last_3_months: History,
  last_6_months: History,
  next_3_months: CalendarPlus,
  custom: PencilLine,
};
export type DateRangeFilterProps = {
  pack: DateRangePack;
  /** Shown before the trigger (e.g. Travel, Due). Omit for a label-free control. */
  dimensionLabel?: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  allowClear?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
};

export function DateRangeFilter({
  pack,
  dimensionLabel,
  value,
  onChange,
  allowClear = true,
  emptyLabel = 'All time',
  disabled,
  className,
  'data-testid': dataTestId,
}: DateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [customMode, setCustomMode] = React.useState(value.presetId === 'custom');
  const presets = dateRangePresetsForPack(pack);
  const triggerLabel = formatDateRangeTriggerLabel(value, pack, emptyLabel);
  const hasValue = Boolean(value.from || value.to || (value.presetId && value.presetId !== 'custom'));

  const selectedRange: DateRange | undefined = React.useMemo(() => {
    const from = parseYmd(value.from);
    const to = parseYmd(value.to);
    if (!from && !to) return undefined;
    return { from, to };
  }, [value.from, value.to]);

  function applyPreset(presetId: string) {
    if (presetId === 'custom') {
      setCustomMode(true);
      onChange({
        from: value.from,
        to: value.to,
        presetId: 'custom',
      });
      return;
    }
    setCustomMode(false);
    const range = resolveDateRangePreset(presetId, pack);
    onChange({ ...range, presetId });
    setOpen(false);
  }

  function applyCustomRange(range: DateRange | undefined) {
    const from = range?.from ? formatYmd(range.from) : null;
    const to = range?.to ? formatYmd(range.to) : range?.from ? formatYmd(range.from) : null;
    onChange({ from, to, presetId: 'custom' });
  }

  function clear() {
    setCustomMode(false);
    onChange({ from: null, to: null, presetId: null });
    setOpen(false);
  }

  const ariaName = dimensionLabel || emptyLabel;

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)} data-testid={dataTestId}>
      {dimensionLabel ? (
        <span className="whitespace-nowrap text-[length:var(--control-text-sm)] font-medium text-muted-foreground">
          {dimensionLabel}
        </span>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn('shrink-0 gap-1.5 font-normal', !hasValue && 'text-muted-foreground')}
            aria-label={`${ariaName}: ${triggerLabel}`}
          >
            <CalendarIcon className="size-[0.875em] shrink-0 opacity-70" />
            <span className="max-w-[11rem] truncate">{triggerLabel}</span>
            <ChevronDown className="size-[0.875em] shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0 text-[length:var(--control-text-sm)]"
          sideOffset={6}
        >
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-col gap-0.5 border-b p-1.5 sm:w-52 sm:border-b-0 sm:border-r">
              {presets.map((p) => {
                const selected =
                  value.presetId === p.id || (p.id === 'custom' && customMode);
                const Icon = PRESET_ICONS[p.id] ?? CalendarIcon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 rounded-md px-[var(--menu-item-px)] py-1.5 text-left text-[length:var(--control-text-sm)] font-normal hover:bg-muted',
                      selected && 'bg-primary/10 font-medium text-primary',
                    )}
                    onClick={() => applyPreset(p.id)}
                  >
                    <Icon
                      className={cn(
                        'size-3.5 shrink-0',
                        selected ? 'text-primary' : 'text-muted-foreground',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    {selected ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                );
              })}
              {allowClear ? (
                <button
                  type="button"
                  className={cn(
                    'mt-1 flex items-center gap-2 rounded-md px-[var(--menu-item-px)] py-1.5 text-left text-[length:var(--control-text-sm)] font-normal text-muted-foreground hover:bg-muted',
                    !hasValue && 'bg-primary/10 font-medium text-primary',
                  )}
                  onClick={clear}
                >
                  <InfinityIcon
                    className={cn(
                      'size-3.5 shrink-0',
                      !hasValue ? 'text-primary' : 'text-muted-foreground',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{emptyLabel}</span>
                  {!hasValue ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
                </button>
              ) : null}
            </div>
            {customMode || value.presetId === 'custom' ? (
              <div className="p-1.5">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={selectedRange}
                  defaultMonth={selectedRange?.from ?? selectedRange?.to ?? new Date()}
                  onSelect={applyCustomRange}
                />
                {value.from || value.to ? (
                  <p className="px-[var(--menu-item-px)] pb-1 text-[length:var(--control-text-sm)] text-muted-foreground">
                    {value.from && value.to
                      ? value.from === value.to
                        ? format(parseYmd(value.from)!, 'd MMM yyyy')
                        : `${format(parseYmd(value.from)!, 'd MMM yyyy')} → ${format(parseYmd(value.to)!, 'd MMM yyyy')}`
                      : value.from
                        ? `From ${value.from}`
                        : `Until ${value.to}`}
                  </p>
                ) : (
                  <p className="px-[var(--menu-item-px)] pb-1 text-[length:var(--control-text-sm)] text-muted-foreground">
                    Pick a start and end day.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {allowClear && hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-[var(--control-h-sm)] shrink-0 text-muted-foreground"
          aria-label={`Clear ${ariaName}`}
          onClick={clear}
        >
          <X className="size-[0.875em]" />
        </Button>
      ) : null}
    </div>
  );
}

export type { DateRangePack, DateRangeValue };
