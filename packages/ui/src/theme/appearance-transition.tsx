import { cn } from '../lib/utils';
import { PageBootMark } from '../components/page-boot-mark';

/** Full-viewport veil while appearance tokens recompute — prevents mid-frame glitches. */
export function AppearanceTransitionOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'fixed inset-0 z-[10000] flex items-center justify-center appearance-transition-veil',
        'bg-[hsl(var(--atmosphere-base))]',
      )}
    >
      <PageBootMark />
    </div>
  );
}
