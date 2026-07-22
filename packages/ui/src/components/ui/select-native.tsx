import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * @deprecated Prefer `Combobox` from `@wayrune/ui` for all new and existing forms.
 * Kept only as a temporary escape hatch — do not use in product UI.
 */
const SelectNative = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'SelectNative is deprecated — use Combobox from @wayrune/ui for branded dropdowns.',
      );
    }
    return (
      <select
        className={cn(
          'flex h-[var(--control-h)] w-full cursor-pointer rounded-lg border border-border/80 bg-card/85 px-[var(--control-px)] py-1 text-[length:var(--control-text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
SelectNative.displayName = 'SelectNative';

export { SelectNative };
