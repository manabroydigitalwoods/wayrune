import * as React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & { inputSize?: 'default' | 'sm' }
>(({ className, type, inputSize = 'default', ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex w-full rounded-md border border-input bg-card/85 py-1 shadow-sm transition-[color,box-shadow,border-color] file:border-0 file:bg-transparent file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/40',
      inputSize === 'sm'
        ? 'h-[var(--control-h-sm)] px-[var(--control-px-sm)] text-[length:var(--control-text-sm)] file:text-[length:var(--control-text-sm)]'
        : 'h-[var(--control-h)] px-[var(--control-px)] text-[length:var(--control-text)] file:text-[length:var(--control-text)]',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
