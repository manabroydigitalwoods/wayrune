import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './ui/button';
import { BrandTooltip } from './ui/tooltip';

const sizeMap = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
  xl: 'size-8',
} as const;

const toneMap = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

export function Icon({
  icon: Lucide,
  size = 'md',
  tone = 'default',
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof sizeMap;
  tone?: keyof typeof toneMap;
  className?: string;
}) {
  return <Lucide className={cn(sizeMap[size], toneMap[tone], className)} aria-hidden />;
}

export function IconButton({
  icon: Lucide,
  label,
  tooltip,
  tooltipSide = 'bottom',
  className,
  ...props
}: Omit<ButtonProps, 'children'> & {
  icon: LucideIcon;
  label: string;
  /** When set (or omitted defaults to label), shows a brand tooltip. Pass `false` to disable. */
  tooltip?: ReactNode | false;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const tip = tooltip === false ? null : tooltip === undefined ? label : tooltip;
  const button = (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={className}
      aria-label={label}
      {...props}
    >
      <Lucide className="size-4" />
    </Button>
  );
  return tip ? (
    <BrandTooltip label={tip} side={tooltipSide}>
      {button}
    </BrandTooltip>
  ) : (
    button
  );
}

export function SoftIcon({
  icon: Lucide,
  tone = 'primary',
  className,
}: {
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const bg = {
    primary: 'bg-primary-50 text-primary dark:bg-primary-900/40 dark:text-primary-100',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-destructive',
    info: 'bg-info-soft text-info',
  }[tone];
  return (
    <div className={cn('inline-flex size-8 items-center justify-center rounded-lg', bg, className)}>
      <Lucide className="size-4" aria-hidden />
    </div>
  );
}
