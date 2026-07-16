import * as React from 'react';
import { DayPicker, type DayButtonProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDayButton({ className, modifiers, day: _day, ...props }: DayButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-sm transition-colors',
        'hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        modifiers.selected &&
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        modifiers.today && !modifiers.selected && 'border border-primary/50 text-primary',
        modifiers.outside && 'opacity-40',
        modifiers.disabled && 'pointer-events-none opacity-40',
        className,
      )}
    />
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3 text-foreground', className)}
      style={
        {
          '--rdp-accent-color': 'hsl(var(--primary))',
          '--rdp-accent-background-color': 'hsl(var(--primary) / 0.15)',
          '--rdp-today-color': 'hsl(var(--primary))',
          '--rdp-day-height': '2.25rem',
          '--rdp-day-width': '2.25rem',
          '--rdp-day_button-height': '2rem',
          '--rdp-day_button-width': '2rem',
          '--rdp-day_button-border-radius': '0.5rem',
          '--rdp-nav_button-height': '2rem',
          '--rdp-nav_button-width': '2rem',
          '--rdp-selected-border': '2px solid transparent',
        } as React.CSSProperties
      }
      classNames={{
        root: 'rdp-root',
        months: 'relative flex flex-col',
        month: 'space-y-3',
        month_caption: 'relative flex h-9 items-center justify-center px-9',
        caption_label: 'text-sm font-semibold tracking-tight',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between px-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-8 text-foreground hover:bg-primary/15 hover:text-foreground',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-8 text-foreground hover:bg-primary/15 hover:text-foreground',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'flex size-8 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'relative p-0 text-center',
        day_button: '',
        selected: '',
        today: '',
        outside: '',
        disabled: '',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
