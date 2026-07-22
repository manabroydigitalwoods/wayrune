import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Vertical rhythm between page header and primary surface.
 * Prefer this over ad-hoc space-y-5 / gap-6 on agency pages.
 */
export function PageStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-[var(--gap-page)]', className)}>{children}</div>
  );
}

/**
 * Vertical rhythm between sibling sections (cards, panels, form blocks).
 */
export function SectionStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-[var(--gap-section)]', className)}>
      {children}
    </div>
  );
}
