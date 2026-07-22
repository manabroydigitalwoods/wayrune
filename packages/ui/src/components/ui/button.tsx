import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[var(--control-icon)] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-white/55 bg-white/40 backdrop-blur-md hover:bg-white/55 hover:text-foreground dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[var(--control-h)] px-4 py-2 text-[length:var(--control-text)]',
        sm: 'h-[var(--control-h-sm)] rounded-md px-3 text-[length:var(--control-text-sm)]',
        /** Dense controls for side panels / inline editors — matches Combobox/DatePicker `sm`. */
        xs: 'h-[var(--control-h-sm)] gap-1 rounded-md px-2.5 text-[length:var(--control-text-sm)]',
        lg: 'h-[var(--control-h-lg)] rounded-md px-6 text-[length:var(--control-text)]',
        // shrink-0: header flex + w-full search was crushing icon width into tall pills
        icon: 'size-[var(--control-h)] shrink-0 p-0',
        'icon-sm': 'size-[var(--control-h-sm)] shrink-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
