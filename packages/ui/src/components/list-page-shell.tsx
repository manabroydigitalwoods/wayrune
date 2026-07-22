import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Full-viewport list layout: page chrome stays fixed; DataTable (or board)
 * fills remaining height and scrolls internally — no document scroll.
 *
 * Fill mode uses `.list-page-fill` to occupy the main content box and cancel
 * AppShell’s bottom padding (so lists aren’t left with an empty gutter).
 * Set `fill={false}` for card/scroll pages that should grow with content.
 */
export function ListPageShell({
  children,
  className,
  fill = true,
}: {
  children: ReactNode;
  className?: string;
  /** When true (default), lock height for internal table scroll. */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-col gap-[var(--gap-page)]',
        fill ? 'list-page-fill min-h-0 overflow-hidden' : null,
        className,
      )}
    >
      {children}
    </div>
  );
}
