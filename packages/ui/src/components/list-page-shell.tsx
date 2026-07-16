import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Full-viewport list layout matching the Leads table experience:
 * header stays put; DataTable fills remaining height and scrolls internally.
 *
 * Height leaves room for AppShell main bottom padding (pb-10 / md:pb-12).
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
        'relative flex min-h-0 flex-col',
        fill
          ? 'h-[calc(100dvh-5.5rem-2.5rem)] md:h-[calc(100dvh-3.5rem-3rem)]'
          : 'pb-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
