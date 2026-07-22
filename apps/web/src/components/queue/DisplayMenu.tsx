import {
  AlarmClock,
  Calendar,
  Columns3,
  Contact,
  Flag,
  GitBranch,
  Mail,
  Phone,
  SlidersHorizontal,
  Tag,
  TextCursorInput,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@wayrune/ui';

export type DisplayColumnOption = {
  id: string;
  label: string;
  visible: boolean;
  icon?: LucideIcon;
};

const COLUMN_ICONS: Record<string, LucideIcon> = {
  title: TextCursorInput,
  lead: TextCursorInput,
  contactName: Contact,
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

export function DisplayMenu({
  columns,
  onToggleColumn,
  className,
}: {
  columns: DisplayColumnOption[];
  onToggleColumn: (id: string, visible: boolean) => void;
  className?: string;
}) {
  if (!columns.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('shrink-0 gap-1.5 font-normal', className)}
        >
          <SlidersHorizontal className="size-[0.875em] shrink-0 opacity-70" />
          Display
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-1 text-[length:var(--control-text-sm)]"
      >
        <DropdownMenuLabel className="flex items-center gap-1.5 px-[var(--menu-item-px)] text-[length:var(--control-text-sm)] font-medium">
          <Columns3 className="size-3.5" />
          Visible columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => {
          const Icon = col.icon ?? COLUMN_ICONS[col.id];
          return (
            <DropdownMenuCheckboxItem
              key={col.id}
              className="gap-2 py-1.5 text-[length:var(--control-text-sm)] font-normal capitalize"
              checked={col.visible}
              onCheckedChange={(value) => onToggleColumn(col.id, Boolean(value))}
              onSelect={(e) => e.preventDefault()}
            >
              {Icon ? (
                <Icon className="!size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <span className="size-3.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{col.label}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
