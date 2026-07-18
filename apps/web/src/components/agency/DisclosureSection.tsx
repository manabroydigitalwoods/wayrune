import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@wayrune/ui';

type DisclosureSectionProps = {
  title: string;
  description?: string;
  level?: 'secondary' | 'advanced';
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * Progressive disclosure wrapper — collapses advanced detail without hiding routes.
 */
export function DisclosureSection({
  title,
  description,
  level = 'advanced',
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
}: DisclosureSectionProps) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlled ? open : internalOpen;

  function toggle() {
    const next = !isOpen;
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className={cn('rounded-xl border border-border/60', className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start gap-2 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          ) : null}
          {level === 'advanced' ? (
            <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Advanced
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? <div className="border-t border-border/60 px-4 py-4">{children}</div> : null}
    </div>
  );
}
