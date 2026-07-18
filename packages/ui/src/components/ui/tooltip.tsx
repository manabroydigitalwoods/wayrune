import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipArrow = TooltipPrimitive.Arrow;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    /** Show the brand arrow pointing at the trigger. Defaults to true. */
    showArrow?: boolean;
  }
>(({ className, sideOffset = 6, showArrow = true, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Match popovers/menus so light + dark themes stay consistent.
        'z-[250] overflow-visible rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md glass-strong tooltip-content-animate',
        className,
      )}
      {...props}
    >
      {children}
      {showArrow ? (
        <TooltipArrow className="fill-[hsl(var(--popover))]" width={10} height={5} />
      ) : null}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * One-line branded tooltip for icon buttons and compact controls.
 * Requires a TooltipProvider ancestor (mounted at app root).
 */
function BrandTooltip({
  label,
  children,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  delayDuration = 200,
  disabled = false,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactElement;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['align'];
  sideOffset?: number;
  delayDuration?: number;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled || label == null || label === false || label === '') {
    return children;
  }

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipArrow, BrandTooltip };
