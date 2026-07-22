import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@wayrune/ui';

/** Glass panel chrome shared by CRM detail columns and workspace overview cards. */
export const DETAIL_PANEL_SHELL = 'rounded-xl border p-3 glass md:p-3.5';

/** Desktop CRM grid: About | Activity | Associations */
export const DETAIL_CRM_GRID =
  'hidden min-h-0 flex-1 gap-[var(--gap-page)] lg:grid lg:grid-cols-[272px_minmax(0,1fr)_288px]';

/** Mobile stacked scroll for CRM detail */
export const DETAIL_CRM_STACK =
  'flex min-h-0 flex-1 flex-col gap-[var(--gap-page)] overflow-y-auto lg:hidden';

export function DetailPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(DETAIL_PANEL_SHELL, className)}>{children}</div>;
}

/** Viewport-locked detail page body (CRM grid or workspace tabs compose as children). */
export function DetailPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-[calc(100dvh-5.5rem)] min-h-0 flex-col gap-[var(--gap-page)] md:h-[calc(100dvh-3.5rem)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Right-aligned primary actions + overflow for detail pages. */
export function DetailActionStrip({
  children,
  className,
  leading,
}: {
  children: ReactNode;
  className?: string;
  /** Optional left-side content (usually empty — title lives in AppShell). */
  leading?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">{leading}</div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Collapsible panel wrapper for mobile About / Related sections. */
export function DetailMobileSection({
  title,
  open,
  onOpenChange,
  children,
  className,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DetailPanel className={className}>
      <button
        type="button"
        className="flex w-full items-center justify-between text-[length:var(--control-text)] font-semibold"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          className={cn('size-[0.875em] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? <div className="pt-2.5">{children}</div> : null}
    </DetailPanel>
  );
}
