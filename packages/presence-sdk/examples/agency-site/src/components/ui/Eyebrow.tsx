import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('presence-eyebrow', className)}>{children}</p>;
}
