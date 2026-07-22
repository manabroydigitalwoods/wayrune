import * as React from 'react';
import {
  addDays,
  addMonths,
  addYears,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import type { Matcher } from 'react-day-picker';

export type DatePickerProps = {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Stable selector for e2e / dogfood (e.g. hotel check-in). */
  'data-testid'?: string;
  /**
   * Month to open on when there is no value, or when the current value falls
   * outside `preferredRange` (e.g. trip start when service date is off-trip).
   */
  preferredMonth?: Date;
  /** Inclusive date window — when `value` is outside, open on `preferredMonth`. */
  preferredRange?: { start?: Date; end?: Date };
  /** Earliest selectable day (inclusive). */
  minDate?: Date;
  /** Latest selectable day (inclusive). */
  maxDate?: Date;
  /** Shorthand: disallow days before today. */
  disablePast?: boolean;
  /** Shorthand: disallow days after today. */
  disableFuture?: boolean;
  /** Show Today / Tomorrow shortcuts (default true). */
  showQuickDates?: boolean;
  /** Match Combobox / form density — `sm` uses `--control-h-sm`. */
  size?: 'default' | 'sm';
};

type DrillView = 'days' | 'months' | 'years';

function atLocalNoon(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function yearStart(date: Date) {
  return new Date(date.getFullYear(), 0, 1, 12, 0, 0, 0);
}

function resolveBounds(opts: {
  minDate?: Date;
  maxDate?: Date;
  disablePast?: boolean;
  disableFuture?: boolean;
}) {
  const today = startOfDay(new Date());
  let min = opts.minDate ? startOfDay(opts.minDate) : undefined;
  let max = opts.maxDate ? startOfDay(opts.maxDate) : undefined;
  if (opts.disablePast) {
    min = min ? (isAfter(min, today) ? min : today) : today;
  }
  if (opts.disableFuture) {
    max = max ? (isBefore(max, today) ? max : today) : today;
  }
  return { min, max, today };
}

function isDayAllowed(date: Date, min?: Date, max?: Date) {
  const day = startOfDay(date);
  if (min && isBefore(day, min)) return false;
  if (max && isAfter(day, max)) return false;
  return true;
}

function disabledMatchers(min?: Date, max?: Date): Matcher[] {
  const matchers: Matcher[] = [];
  if (min) matchers.push({ before: min });
  if (max) matchers.push({ after: max });
  return matchers;
}

function MonthGrid({
  month,
  min,
  max,
  onPick,
}: {
  month: Date;
  min?: Date;
  max?: Date;
  onPick: (next: Date) => void;
}) {
  const year = month.getFullYear();
  return (
    <div className="grid grid-cols-3 gap-1.5 p-1">
      {Array.from({ length: 12 }, (_, i) => {
        const candidate = new Date(year, i, 1, 12, 0, 0, 0);
        const monthEnd = new Date(year, i + 1, 0, 12, 0, 0, 0);
        const outOfRange =
          (min && isBefore(monthEnd, min)) || (max && isAfter(candidate, max));
        const selected = isSameMonth(candidate, month);
        return (
          <button
            key={i}
            type="button"
            disabled={outOfRange}
            aria-pressed={selected}
            onClick={() => onPick(candidate)}
            className={cn(
              'rounded-lg px-2 py-2.5 text-sm font-medium transition-colors',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-primary/15',
              outOfRange && 'pointer-events-none opacity-40',
            )}
          >
            {format(candidate, 'MMM')}
          </button>
        );
      })}
    </div>
  );
}

function YearGrid({
  month,
  min,
  max,
  onPick,
}: {
  month: Date;
  min?: Date;
  max?: Date;
  onPick: (next: Date) => void;
}) {
  const baseYear = month.getFullYear();
  const startYear = baseYear - (baseYear % 12);
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);

  return (
    <div className="grid grid-cols-3 gap-1.5 p-1">
      {years.map((y) => {
        const candidate = new Date(y, month.getMonth(), 1, 12, 0, 0, 0);
        const yearEnd = new Date(y, 11, 31, 12, 0, 0, 0);
        const yearBegin = new Date(y, 0, 1, 12, 0, 0, 0);
        const outOfRange =
          (min && isBefore(yearEnd, min)) || (max && isAfter(yearBegin, max));
        const selected = y === baseYear;
        return (
          <button
            key={y}
            type="button"
            disabled={outOfRange}
            aria-pressed={selected}
            onClick={() => onPick(candidate)}
            className={cn(
              'rounded-lg px-2 py-2.5 text-sm font-medium tabular-nums transition-colors',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-primary/15',
              outOfRange && 'pointer-events-none opacity-40',
            )}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
  preferredMonth,
  preferredRange,
  minDate,
  maxDate,
  disablePast,
  disableFuture,
  showQuickDates = true,
  size = 'default',
  'data-testid': dataTestId,
}: DatePickerProps) {
  const compact = size === 'sm';
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<DrillView>('days');
  const { min, max, today } = resolveBounds({
    minDate,
    maxDate,
    disablePast,
    disableFuture,
  });
  const tomorrow = addDays(today, 1);

  const [month, setMonth] = React.useState<Date>(() =>
    monthStart(value || preferredMonth || today),
  );

  function isOutsidePreferredRange(date: Date) {
    if (!preferredRange?.start && !preferredRange?.end) return false;
    const day = startOfDay(date).getTime();
    if (preferredRange.start && day < startOfDay(preferredRange.start).getTime()) {
      return true;
    }
    if (preferredRange.end && day > startOfDay(preferredRange.end).getTime()) {
      return true;
    }
    return false;
  }

  function monthToShowOnOpen() {
    if (value && !isOutsidePreferredRange(value)) {
      return monthStart(value);
    }
    if (preferredMonth) return monthStart(preferredMonth);
    if (value) return monthStart(value);
    return monthStart(today);
  }

  function select(date: Date | undefined) {
    if (date && !isDayAllowed(date, min, max)) return;
    onChange(date ? atLocalNoon(date) : undefined);
    if (date) setOpen(false);
  }

  function shift(delta: number) {
    if (view === 'days') setMonth((m) => addMonths(m, delta));
    else if (view === 'months') setMonth((m) => addYears(m, delta));
    else setMonth((m) => addYears(m, delta * 12));
  }

  function captionLabel() {
    if (view === 'years') {
      const startYear = month.getFullYear() - (month.getFullYear() % 12);
      return `${startYear} – ${startYear + 11}`;
    }
    if (view === 'months') return format(month, 'yyyy');
    return format(month, 'MMMM yyyy');
  }

  function onCaptionClick() {
    if (view === 'days') setView('months');
    else if (view === 'months') setView('years');
  }

  const todayAllowed = isDayAllowed(today, min, max);
  const tomorrowAllowed = isDayAllowed(tomorrow, min, max);
  const disabledDays = disabledMatchers(min, max);

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMonth(monthToShowOnOpen());
          setView('days');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
          disabled={disabled}
          data-testid={dataTestId}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon
            className={cn('shrink-0 opacity-70', compact ? 'size-3.5' : 'size-4')}
          />
          <span className="truncate">{value ? format(value, 'PPP') : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto space-y-2 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {showQuickDates ? (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            <Button
              type="button"
              size="sm"
              variant={value && isSameDay(value, today) ? 'default' : 'secondary'}
              className="h-7 rounded-full px-2.5 text-xs"
              disabled={!todayAllowed}
              onClick={() => select(today)}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={value && isSameDay(value, tomorrow) ? 'default' : 'secondary'}
              className="h-7 rounded-full px-2.5 text-xs"
              disabled={!tomorrowAllowed}
              onClick={() => select(tomorrow)}
            >
              Tomorrow
            </Button>
            {preferredMonth && isDayAllowed(preferredMonth, min, max) ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
                onClick={() => {
                  setMonth(monthStart(preferredMonth));
                  setView('days');
                  select(preferredMonth);
                }}
              >
                Trip start
              </Button>
            ) : null}
            {value ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 rounded-full px-2.5 text-xs text-muted-foreground"
                onClick={() => onChange(undefined)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : value ? (
          <div className="flex justify-end px-1 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
              onClick={() => onChange(undefined)}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-1 px-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={
              view === 'years' ? 'Previous years' : view === 'months' ? 'Previous year' : 'Previous month'
            }
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <button
            type="button"
            className={cn(
              'min-w-[9.5rem] rounded-lg px-2 py-1.5 text-sm font-semibold tracking-tight transition-colors',
              view === 'years'
                ? 'cursor-default'
                : 'hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
            aria-label={
              view === 'days'
                ? 'Choose month'
                : view === 'months'
                  ? 'Choose year'
                  : undefined
            }
            disabled={view === 'years'}
            onClick={onCaptionClick}
          >
            {captionLabel()}
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={
              view === 'years' ? 'Next years' : view === 'months' ? 'Next year' : 'Next month'
            }
            onClick={() => shift(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {view === 'days' ? (
          <Calendar
            mode="single"
            selected={value}
            onSelect={select}
            month={month}
            onMonthChange={setMonth}
            disabled={disabledDays.length ? disabledDays : undefined}
            startMonth={min ? monthStart(min) : undefined}
            endMonth={max ? monthStart(max) : undefined}
            hideNavigation
            classNames={{
              month_caption: 'hidden',
            }}
          />
        ) : null}

        {view === 'months' ? (
          <MonthGrid
            month={month}
            min={min}
            max={max}
            onPick={(next) => {
              setMonth(monthStart(next));
              setView('days');
            }}
          />
        ) : null}

        {view === 'years' ? (
          <YearGrid
            month={month}
            min={min}
            max={max}
            onPick={(next) => {
              setMonth(yearStart(next));
              setView('months');
            }}
          />
        ) : null}

        {disablePast || min || max ? (
          <p className="px-1 pb-0.5 text-[10px] text-muted-foreground">
            {disablePast && !disableFuture
              ? 'Past dates are not available here.'
              : disableFuture && !disablePast
                ? 'Future dates are not available here.'
                : min && max
                  ? `Allowed ${format(min, 'dd MMM yyyy')} – ${format(max, 'dd MMM yyyy')}.`
                  : min
                    ? `From ${format(min, 'dd MMM yyyy')} onward.`
                    : max
                      ? `Until ${format(max, 'dd MMM yyyy')}.`
                      : null}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
