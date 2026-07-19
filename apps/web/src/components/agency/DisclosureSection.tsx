import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@wayrune/ui';

type DisclosureSectionProps = {
  title: string;
  description?: string;
  /** secondary/none = no Advanced chip; advanced only when no statusLabel. */
  level?: 'secondary' | 'advanced' | 'none';
  /** Completeness / count chip (e.g. Complete, 3 active rates). Replaces Advanced. */
  statusLabel?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * Progressive disclosure wrapper — collapses detail without hiding routes.
 */
export function DisclosureSection({
  title,
  description,
  level = 'secondary',
  statusLabel,
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

  const chip =
    statusLabel?.trim() ||
    (level === 'advanced' ? 'Advanced' : null);

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
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {chip ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {chip}
              </span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </button>
      {isOpen ? <div className="border-t border-border/60 px-4 py-4">{children}</div> : null}
    </div>
  );
}
