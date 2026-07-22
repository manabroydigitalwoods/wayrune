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
        'inline-flex size-[var(--control-h-sm)] cursor-pointer items-center justify-center rounded-lg text-[length:var(--control-text-sm)] transition-colors',
        'hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        modifiers.selected &&
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        modifiers.today && !modifiers.selected && 'border border-primary/50 text-primary',
        modifiers.outside && 'text-muted-foreground/50 opacity-50',
        modifiers.disabled &&
          'pointer-events-none text-muted-foreground/40 line-through opacity-35 hover:bg-transparent',
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
      className={cn('p-[var(--field-gap)] text-foreground', className)}
      style={
        {
          '--rdp-accent-color': 'hsl(var(--primary))',
          '--rdp-accent-background-color': 'hsl(var(--primary) / 0.15)',
          '--rdp-today-color': 'hsl(var(--primary))',
          '--rdp-day-height': 'var(--control-h)',
          '--rdp-day-width': 'var(--control-h)',
          '--rdp-day_button-height': 'var(--control-h-sm)',
          '--rdp-day_button-width': 'var(--control-h-sm)',
          '--rdp-day_button-border-radius': '0.5rem',
          '--rdp-nav_button-height': 'var(--control-h-sm)',
          '--rdp-nav_button-width': 'var(--control-h-sm)',
          '--rdp-selected-border': '2px solid transparent',
        } as React.CSSProperties
      }
      classNames={{
        root: 'rdp-root',
        months: 'relative flex flex-col',
        month: 'space-y-[var(--gap-section)]',
        // Caption sits under nav visually; ignore pointer events so month arrows receive clicks.
        month_caption:
          'relative flex h-[var(--control-h)] items-center justify-center px-9 pointer-events-none',
        caption_label: 'text-[length:var(--control-text)] font-semibold tracking-tight',
        nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between px-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-[var(--control-h-sm)] pointer-events-auto text-foreground hover:bg-primary/15 hover:text-foreground',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-[var(--control-h-sm)] pointer-events-auto text-foreground hover:bg-primary/15 hover:text-foreground',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'flex size-[var(--control-h-sm)] items-center justify-center text-[length:var(--control-text-sm)] font-medium uppercase tracking-wide text-muted-foreground',
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
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('size-4', chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn('size-4', chevronClassName)} {...chevronProps} />
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
