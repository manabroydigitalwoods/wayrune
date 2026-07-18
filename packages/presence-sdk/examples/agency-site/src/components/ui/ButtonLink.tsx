import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export function ButtonLink({ href, children, variant = 'primary', className, ...rest }: ButtonLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      className={cn(
        variant === 'primary' && 'presence-btn',
        variant === 'ghost' &&
          'inline-flex rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white no-underline',
        className,
      )}
    >
      {children}
    </a>
  );
}
