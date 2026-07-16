import * as React from 'react';
import { Clock3, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type Period = 'AM' | 'PM';

type Parts = {
  hour12: number;
  minute: number;
  period: Period;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseValue(value?: string | null): Parts | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour24) ||
    !Number.isInteger(minute) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const period: Period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

function toValue(parts: Parts): string {
  let hour24 = parts.hour12 % 12;
  if (parts.period === 'PM') hour24 += 12;
  return `${pad(hour24)}:${pad(parts.minute)}`;
}

function formatDisplay(value?: string | null) {
  const parts = parseValue(value);
  if (!parts) return null;
  return `${parts.hour12}:${pad(parts.minute)} ${parts.period}`;
}

function minuteOptions(step: number, current?: number | null) {
  const opts: number[] = [];
  for (let m = 0; m < 60; m += step) opts.push(m);
  if (current != null && !opts.includes(current)) {
    opts.push(current);
    opts.sort((a, b) => a - b);
  }
  return opts;
}

function scrollSelectedIntoView(container: HTMLElement | null) {
  if (!container) return;
  const selected = container.querySelector<HTMLElement>('[data-selected="true"]');
  if (!selected) return;
  const top =
    selected.offsetTop - container.clientHeight / 2 + selected.clientHeight / 2;
  container.scrollTop = Math.max(0, top);
}

function Column({
  label,
  children,
  listRef,
}: {
  label: string;
  children: React.ReactNode;
  listRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        ref={listRef}
        className="h-[168px] overflow-y-auto overscroll-contain rounded-xl border border-white/40 bg-white/25 p-1.5 [scrollbar-width:thin] dark:border-white/10 dark:bg-white/5"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5">{children}</div>
      </div>
    </div>
  );
}

function OptionButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-selected={selected || undefined}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full shrink-0 items-center justify-center rounded-lg text-sm tabular-nums transition-colors',
        selected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-foreground/85 hover:bg-primary/15 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  disabled,
  className,
  minuteStep = 5,
  id,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Minute increments in the picker (existing off-step values stay selectable). */
  minuteStep?: number;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseValue(value);
  const [draft, setDraft] = React.useState<Parts>(
    parsed ?? { hour12: 9, minute: 0, period: 'AM' },
  );
  const hourListRef = React.useRef<HTMLDivElement>(null);
  const minuteListRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(parsed ?? { hour12: 9, minute: 0, period: 'AM' });
    const frame = requestAnimationFrame(() => {
      scrollSelectedIntoView(hourListRef.current);
      scrollSelectedIntoView(minuteListRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, value]);

  const minutes = minuteOptions(minuteStep, draft.minute);
  const display = formatDisplay(value);

  function commit(next: Parts) {
    setDraft(next);
    onChange(toValue(next));
  }

  function clear() {
    onChange('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start font-normal tabular-nums',
            !display && 'text-muted-foreground',
            className,
          )}
        >
          <Clock3 className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{display || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] space-y-3 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <p className="text-sm font-medium tabular-nums text-foreground">
            {formatDisplay(toValue(draft)) || placeholder}
          </p>
          <p className="text-[11px] text-muted-foreground">Local time</p>
        </div>

        <div className="flex gap-2">
          <Column label="Hour" listRef={hourListRef}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
              <OptionButton
                key={hour}
                selected={draft.hour12 === hour}
                onClick={() => commit({ ...draft, hour12: hour })}
              >
                {pad(hour)}
              </OptionButton>
            ))}
          </Column>
          <Column label="Min" listRef={minuteListRef}>
            {minutes.map((minute) => (
              <OptionButton
                key={minute}
                selected={draft.minute === minute}
                onClick={() => commit({ ...draft, minute })}
              >
                {pad(minute)}
              </OptionButton>
            ))}
          </Column>
          <div className="flex w-[72px] shrink-0 flex-col">
            <div className="mb-1.5 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Period
            </div>
            <div className="flex h-[168px] flex-col justify-center gap-2 rounded-xl border border-white/40 bg-white/25 p-1.5 dark:border-white/10 dark:bg-white/5">
              {(['AM', 'PM'] as Period[]).map((period) => (
                <OptionButton
                  key={period}
                  selected={draft.period === period}
                  onClick={() => commit({ ...draft, period })}
                >
                  {period}
                </OptionButton>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={clear}
            disabled={!value}
          >
            <X className="size-3.5" />
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
