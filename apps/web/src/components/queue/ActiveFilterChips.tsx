import { X } from 'lucide-react';
import { Badge, Button, cn } from '@wayrune/ui';
import type { ActiveFilterChip } from '../../lib/queue/types';

export function ActiveFilterChips({
  chips,
  onClear,
  className,
}: {
  chips: ActiveFilterChip[];
  onClear?: () => void;
  className?: string;
}) {
  if (!chips.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant="secondary"
          className="gap-1 bg-primary-50 pr-1 text-primary-800"
        >
          {chip.label}
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-primary-100"
            aria-label={`Remove ${chip.label}`}
            onClick={chip.onRemove}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {onClear ? (
        <Button type="button" size="sm" variant="ghost" className="px-[var(--control-px-sm)]" onClick={onClear}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
