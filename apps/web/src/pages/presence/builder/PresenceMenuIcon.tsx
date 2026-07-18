import type { CSSProperties } from 'react';
import { presenceMenuIconDef } from '@wayrune/contracts';
import { cn } from '@wayrune/ui';

/** Theme-safe menu icon (stroke + currentColor). */
export function PresenceMenuIcon({
  icon,
  className,
  style,
}: {
  icon?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const def = presenceMenuIconDef(icon);
  if (!def) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: def.paths }}
    />
  );
}
