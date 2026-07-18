import * as React from 'react';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

function atLocalNoon(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  className,
  /**
   * Month to open on when there is no value, or when the current value falls
   * outside `preferredRange` (e.g. trip start when service date is off-trip).
   */
  preferredMonth,
  /** Inclusive date window — when `value` is outside, open on `preferredMonth`. */
  preferredRange,
}: {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  preferredMonth?: Date;
  preferredRange?: { start?: Date; end?: Date };
}) {
  const [open, setOpen] = React.useState(false);
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const [month, setMonth] = React.useState<Date>(() =>
    startOfMonth(value || preferredMonth || today),
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
      return startOfMonth(value);
    }
    if (preferredMonth) return startOfMonth(preferredMonth);
    if (value) return startOfMonth(value);
    return startOfMonth(today);
  }

  function select(date: Date | undefined) {
    onChange(date ? atLocalNoon(date) : undefined);
    if (date) setOpen(false);
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMonth(monthToShowOnOpen());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{value ? format(value, 'PPP') : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto space-y-2 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-wrap gap-1.5 px-1 pt-1">
          <Button
            type="button"
            size="sm"
            variant={value && isSameDay(value, today) ? 'default' : 'secondary'}
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => select(today)}
          >
            Today
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value && isSameDay(value, tomorrow) ? 'default' : 'secondary'}
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => select(tomorrow)}
          >
            Tomorrow
          </Button>
          {preferredMonth ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
              onClick={() => {
                setMonth(startOfMonth(preferredMonth));
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
              onClick={() => {
                onChange(undefined);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <Calendar
          mode="single"
          selected={value}
          onSelect={select}
          month={month}
          onMonthChange={setMonth}
        />
      </PopoverContent>
    </Popover>
  );
}
