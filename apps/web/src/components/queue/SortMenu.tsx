import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  Contact,
  Flag,
  GitBranch,
  Mail,
  Phone,
  Tag,
  TextCursorInput,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@wayrune/ui';

export type SortMenuOption = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

export type SortMenuValue = {
  sort?: string;
  dir?: 'asc' | 'desc';
};

const COLUMN_ICONS: Record<string, LucideIcon> = {
  title: TextCursorInput,
  contact: Contact,
  email: Mail,
  phone: Phone,
  stage: GitBranch,
  priority: Flag,
  source: Tag,
  owner: UserRound,
  createdAt: Calendar,
  followUp: AlarmClock,
};

function menuRowClass(active?: boolean, disabled?: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-[var(--menu-item-px)] py-1.5 text-left text-[length:var(--control-text-sm)] font-normal outline-none transition-colors',
    'hover:bg-muted focus-visible:bg-muted',
    active && 'bg-muted',
    disabled && 'pointer-events-none opacity-40',
  );
}

export function SortMenu({
  options,
  value,
  onChange,
  className,
}: {
  options: SortMenuOption[];
  value: SortMenuValue;
  onChange: (next: SortMenuValue) => void;
  className?: string;
}) {
  if (!options.length) return null;

  const active = options.find((o) => o.id === value.sort);
  const dir = value.dir === 'desc' ? 'desc' : 'asc';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('shrink-0 gap-1.5 font-normal', className)}
        >
          <ArrowUpDown className="size-[0.875em] shrink-0 opacity-70" />
          Sort
          {active ? (
            <span className="ml-0.5 inline-flex max-w-[7rem] items-center gap-0.5 truncate rounded-md bg-primary/15 px-1.5 py-px text-[length:var(--control-text-sm)] font-medium text-primary">
              <span className="truncate">{active.label}</span>
              {dir === 'desc' ? (
                <ArrowDown className="size-3 shrink-0" aria-hidden />
              ) : (
                <ArrowUp className="size-3 shrink-0" aria-hidden />
              )}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-1 text-[length:var(--control-text-sm)]"
      >
        <DropdownMenuLabel className="px-[var(--menu-item-px)] text-[length:var(--control-text-sm)] font-medium">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain">
          {options.map((opt) => {
            const selected = value.sort === opt.id;
            const Icon = opt.icon ?? COLUMN_ICONS[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                className={menuRowClass(selected)}
                onClick={() =>
                  onChange({
                    sort: opt.id,
                    dir: value.sort === opt.id ? dir : 'asc',
                  })
                }
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {selected ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                </span>
                {Icon ? (
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-[var(--menu-item-px)] text-[length:var(--control-text-sm)] font-medium">
          Direction
        </DropdownMenuLabel>
        <button
          type="button"
          disabled={!value.sort}
          className={menuRowClass(Boolean(value.sort) && dir === 'asc', !value.sort)}
          onClick={() => value.sort && onChange({ sort: value.sort, dir: 'asc' })}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {value.sort && dir === 'asc' ? (
              <Check className="size-3.5 text-primary" aria-hidden />
            ) : null}
          </span>
          <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Ascending</span>
        </button>
        <button
          type="button"
          disabled={!value.sort}
          className={menuRowClass(Boolean(value.sort) && dir === 'desc', !value.sort)}
          onClick={() => value.sort && onChange({ sort: value.sort, dir: 'desc' })}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {value.sort && dir === 'desc' ? (
              <Check className="size-3.5 text-primary" aria-hidden />
            ) : null}
          </span>
          <ArrowDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Descending</span>
        </button>
        {value.sort ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className={cn(menuRowClass(), 'text-muted-foreground hover:text-foreground')}
              onClick={() => onChange({ sort: undefined, dir: undefined })}
            >
              Clear sort
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
