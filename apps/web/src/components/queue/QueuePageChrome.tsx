import type { ReactNode } from 'react';
import { ListPageShell, cn } from '@wayrune/ui';

/**
 * Canonical queue page chrome (Wayrune Queue Standard · frozen from Leads).
 * Slots only — domain owns filter defs, attention presets, and URL state.
 */
export function QueuePageChrome({
  viewToggle,
  attention,
  primaryActions,
  moreMenu,
  toolbar,
  chips,
  error,
  children,
  className,
}: {
  viewToggle?: ReactNode;
  attention?: ReactNode;
  primaryActions?: ReactNode;
  moreMenu?: ReactNode;
  toolbar?: ReactNode;
  chips?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasTopRow = Boolean(viewToggle || attention || primaryActions || moreMenu);

  return (
    <ListPageShell className={cn('gap-[var(--pad-after-topbar)]', className)}>
      <div className="flex shrink-0 flex-col gap-1">
        {hasTopRow ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {viewToggle}
            {attention ? <div className="min-w-0 flex-1">{attention}</div> : null}
            {primaryActions || moreMenu ? (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {primaryActions}
                {moreMenu}
              </div>
            ) : null}
          </div>
        ) : null}
        {error}
        {toolbar}
        {chips}
      </div>
      {children}
    </ListPageShell>
  );
}

export type QueueViewOption = {
  id: string;
  label: string;
  icon?: ReactNode;
};

/** Segmented Board / Table (or equivalent) control. */
export function QueueViewToggle({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: QueueViewOption[];
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-[var(--control-h-sm)] items-center rounded-md border border-border/60 p-0.5 glass-strong',
        className,
      )}
      role="group"
      aria-label="View"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded-sm px-[var(--control-px-sm)] text-[length:var(--control-text-sm)] font-medium transition-colors',
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
            aria-pressed={active}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Dense menu item classes for queue ⋯ / row action menus. */
export const QUEUE_MENU_ITEM_CLASS =
  'gap-2 py-1.5 !text-[length:var(--control-text-sm)] [&_svg]:!size-3.5';

/** Page-search field — same height as Filter/Display/date triggers; louder than GlobalSearch. */
export const QUEUE_PAGE_SEARCH_CLASS =
  'h-[var(--control-h-sm)] border-border/70 bg-card/90 pl-8 text-[length:var(--control-text-sm)] shadow-sm placeholder:text-muted-foreground/70';
