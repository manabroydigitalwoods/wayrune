import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useNavigation } from './NavigationContext';

type LinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({ to, children, className, activeClassName, ...rest }: LinkProps) {
  const { navigate, isActive } = useNavigation();
  return (
    <a
      {...rest}
      href={to}
      className={cn(className, isActive(to) && activeClassName)}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
